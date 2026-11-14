"""
Account and subscription emails, to a business's team and to the platform
admin.

Who gets what
-------------
Business (owner + active admins / managers):
  welcome                 a new business is created
  subscription_reminder   7, 3, 1 days before the trial / plan ends, on the
                          day, and 3 and 7 days after (daily cron)
  payment_received        any payment confirmed (receipt)
  payment_failed          a mobile money / card payment didn't go through
  plan_extended           the platform admin extends the plan
  account_status_changed  the platform admin suspends, blocks or reactivates

A person's own account:
  staff_added             they've been added to a business
  password_reset          they asked to reset a forgotten password
  password_changed        their password was changed (by them or an admin)

Platform admin (Platform Settings → support email + every super admin):
  new_business            someone signs up or adds a business
  payment_received        a mobile money / card payment came in
  subscriptions_summary   daily: trials / plans ending soon or just ended
  (manual payment claims: apps/billing/notifications.py)

Sending never blocks or fails the request that triggered it: messages go
out on a background thread, and an SMTP failure is only logged.
"""
import logging
import threading
from html import escape

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)

BUSINESS_ROLES = ('admin', 'manager')


# ---------------------------------------------------------------------------
# Recipients
# ---------------------------------------------------------------------------
def _dedupe(emails):
    seen, result = set(), []
    for e in emails:
        e = (e or '').strip()
        if e and e.lower() not in seen:
            seen.add(e.lower())
            result.append(e)
    return result


def business_recipients(tenant):
    """The owner's email plus every active owner / admin / manager's email."""
    from apps.accounts.models import Membership

    emails = [tenant.owner_email]
    emails += Membership.objects.filter(
        Q(is_owner=True) | Q(role__in=BUSINESS_ROLES),
        tenant=tenant, is_active=True, user__is_active=True,
    ).values_list('user__email', flat=True)
    return _dedupe(emails)


def platform_admin_recipients():
    """Platform Settings → support email, plus every active super admin."""
    from apps.accounts.models import User
    from apps.tenants.models import PlatformSetting

    emails = [PlatformSetting.load().support_email]
    emails += User.objects.filter(role='super', is_active=True).values_list('email', flat=True)
    return _dedupe(emails)


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------
def _link(path):
    return f"{settings.FRONTEND_URL.rstrip('/')}/{path.lstrip('/')}"


def _html(paragraphs, button):
    body = ''.join(
        f'<p style="margin:0 0 14px;line-height:1.5;">{escape(p).replace(chr(10), "<br>")}</p>'
        for p in paragraphs
    )
    if button:
        label, url = button
        body += (
            f'<p style="margin:22px 0;"><a href="{escape(url)}" style="background:#1e40af;'
            f'color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none;'
            f'font-weight:bold;">{escape(label)}</a></p>'
        )
    return (
        '<html><body style="font-family:Arial,sans-serif;color:#111;max-width:600px;margin:auto;">'
        f'{body}<p style="color:#888;font-size:12px;margin-top:30px;">Business Manager</p>'
        '</body></html>'
    )


def _deliver(message, subject):
    try:
        message.send(fail_silently=False)
    except Exception as e:   # SMTP not configured, network, ...
        logger.warning('Email "%s" not sent: %s', subject, e)


def send(subject, paragraphs, recipients, button=None):
    """
    Send a short email made of `paragraphs` (and an optional
    (label, url) button) to each recipient separately, so team members
    don't see each other's addresses.
    """
    recipients = _dedupe(recipients)
    if not recipients:
        return
    text = '\n\n'.join(paragraphs)
    if button:
        text += f'\n\n{button[0]}: {button[1]}'
    text += '\n\n— Business Manager'
    html = _html(paragraphs, button)

    messages = []
    for to in recipients:
        m = EmailMultiAlternatives(subject, text, settings.DEFAULT_FROM_EMAIL, [to])
        m.attach_alternative(html, 'text/html')
        messages.append(m)

    def run():
        for m in messages:
            _deliver(m, subject)

    # The test mail backend is in-memory: send inline so tests can see it.
    if settings.EMAIL_BACKEND.endswith('locmem.EmailBackend'):
        run()
    else:
        threading.Thread(target=run, name='send-email').start()


def _date(dt):
    return timezone.localtime(dt).strftime('%d %b %Y') if dt else '—'


def _what(tenant):
    return 'free trial' if tenant.plan == 'trial' else 'subscription'


# ---------------------------------------------------------------------------
# Business lifecycle
# ---------------------------------------------------------------------------
def welcome(tenant, owner):
    name = owner.get_full_name() or owner.username
    paras = [
        f'Hello {name},',
        f'Welcome to Business Manager! {tenant.name} is set up and ready to use.',
    ]
    if tenant.plan == 'trial':
        paras.append(
            f'Your free trial runs until {_date(tenant.trial_ends_at)}, with every '
            f'feature for your type of business. No payment is needed until then.'
        )
    paras.append(
        'To get started:\n'
        '• Add your products and opening stock under Inventory\n'
        '• Invite your staff under Users and give each one a role\n'
        '• Record your first sale\n'
        'Every morning you and your managers will get a summary of yesterday\'s '
        'sales, profit and stock alerts by email.'
    )
    paras.append(f'Your username is: {owner.username}')
    send(f'Welcome to Business Manager, {tenant.name}!', paras,
         [owner.email, tenant.owner_email], button=('Open your dashboard', _link('/dashboard')))


def new_business(tenant, owner):
    """Tell the platform admin someone registered a business."""
    bt = tenant.business_type.name if tenant.business_type else '—'
    send(
        f'New business registered: {tenant.name}',
        [
            f'{tenant.name} has just registered.',
            f'Type:      {bt}\n'
            f'Owner:     {tenant.owner_name or owner.get_full_name() or owner.username}\n'
            f'Email:     {tenant.owner_email or owner.email or "—"}\n'
            f'Phone:     {tenant.owner_phone or "—"}\n'
            f'Plan:      {tenant.plan} (ends {_date(tenant.access_ends_at)})',
        ],
        platform_admin_recipients(),
        button=('View businesses', _link('/tenants')),
    )


def subscription_reminder(tenant, days_left):
    """
    days_left > 0: ends in N days; 0: ends today; < 0: ended N days ago.
    Returns the subject (for logging).
    """
    what = _what(tenant)
    ends = _date(tenant.access_ends_at)
    if days_left > 0:
        subject = f'Your {what} for {tenant.name} ends in {days_left} day{"s" if days_left != 1 else ""}'
        paras = [
            f'Your {what} for {tenant.name} ends on {ends}.',
            'Choose a plan and pay with Mobile Money or card to keep working without interruption.',
        ]
    elif days_left == 0:
        subject = f'Your {what} for {tenant.name} ends today'
        paras = [
            f'Your {what} for {tenant.name} ends today.',
            'After today your team can still sign in and view records, but nobody '
            'can record sales, stock or expenses until you pay.',
        ]
    else:
        ago = -days_left
        subject = f'{tenant.name} is read-only — your {what} ended {ago} days ago'
        paras = [
            f'Your {what} for {tenant.name} ended on {ends}.',
            'Your records are safe, but your team can\'t record sales, stock or '
            'expenses until you renew.',
        ]
    send(subject, ['Hello,'] + paras, business_recipients(tenant),
         button=('Choose a plan', _link('/subscription')))
    return subject


def _payer(payment):
    """The team member who made the payment (not a platform admin recording it)."""
    u = payment.created_by
    return u.email if u and u.role != 'super' else ''


def payment_received(payment, notify_platform=True):
    tenant, plan = payment.tenant, payment.plan
    money = f'{payment.currency} {payment.amount:,.0f}'
    ref = payment.provider_tx_id or payment.tx_ref
    send(
        f'Payment received — {tenant.name} is on {plan.name} until {_date(payment.period_end)}',
        [
            'Hello,',
            f'Thank you! We have received your payment of {money}.',
            f'Business:      {tenant.name}\n'
            f'Plan:          {plan.name} ({payment.billing_cycle})\n'
            f'Paid via:      {payment.get_provider_display()}\n'
            f'Reference:     {ref}\n'
            f'Date:          {_date(payment.paid_at)}\n'
            f'Active until:  {_date(payment.period_end)}',
        ],
        business_recipients(tenant) + [_payer(payment)],
        button=('View subscription', _link('/subscription')),
    )
    if notify_platform:
        send(
            f'Payment received: {tenant.name} — {money}',
            [
                f'{tenant.name} paid {money} for {plan.name} ({payment.billing_cycle}) '
                f'via {payment.get_provider_display()}.',
                f'Reference: {ref}\nActive until: {_date(payment.period_end)}',
            ],
            platform_admin_recipients(),
        )


def payment_failed(payment):
    tenant = payment.tenant
    money = f'{payment.currency} {payment.amount:,.0f}'
    send(
        f'Your payment for {tenant.name} did not go through',
        [
            'Hello,',
            f'Your {payment.get_provider_display()} payment of {money} for the '
            f'{payment.plan.name} plan was not completed.',
            f'Reason: {payment.note or "not given by the payment provider"}',
            'No money was taken for this attempt. You can try again at any time.',
        ],
        business_recipients(tenant) + [_payer(payment)],
        button=('Try again', _link('/subscription')),
    )


def plan_extended(tenant, days):
    send(
        f'{tenant.name}: your {_what(tenant)} has been extended',
        [
            'Hello,',
            f'Your {_what(tenant)} for {tenant.name} has been extended by {days} days. '
            f'It now runs until {_date(tenant.access_ends_at)}.',
        ],
        business_recipients(tenant),
        button=('Open your dashboard', _link('/dashboard')),
    )


_STATUS_TEXT = {
    'suspend': ('has been suspended',
                'Your team can no longer sign in to this business.'),
    'block': ('has been blocked',
              'Your team can no longer sign in to this business.'),
    'activate': ('is active again', 'Your team can sign in and work as usual.'),
    'unblock': ('is active again', 'Your team can sign in and work as usual.'),
}


def account_status_changed(tenant, action):
    if action not in _STATUS_TEXT:
        return
    from apps.tenants.models import PlatformSetting

    headline, detail = _STATUS_TEXT[action]
    paras = ['Hello,', f'Your Business Manager account for {tenant.name} {headline}.', detail]
    if action in ('suspend', 'block'):
        platform = PlatformSetting.load()
        contact = ' or '.join(c for c in (platform.support_phone, platform.support_email) if c)
        if contact:
            paras.append(f'If you have questions, contact us on {contact}.')
    send(f'{tenant.name} {headline}', paras, business_recipients(tenant))


# ---------------------------------------------------------------------------
# A person's own account
# ---------------------------------------------------------------------------
def _role_label(role):
    from apps.accounts.models import User
    return dict(User.ROLE_CHOICES).get(role, role)


def staff_added(user, tenant, role, added_by=None):
    """Tell someone they've been given an account in a business."""
    who = (added_by.get_full_name() or added_by.username) if added_by else 'Your administrator'
    send(
        f"You've been added to {tenant.name} on Business Manager",
        [
            f'Hello {user.get_full_name() or user.username},',
            f'{who} has added you to {tenant.name} as {_role_label(role)}.',
            f'Your username is: {user.username}\n'
            'Your password is the one your administrator set for you. You can choose '
            'your own at any time with "Forgot password?" on the sign-in page.',
        ],
        [user.email],
        button=('Sign in', _link('/login')),
    )


def password_reset(user, link, valid_hours):
    send(
        'Reset your Business Manager password',
        [
            f'Hello {user.get_full_name() or user.username},',
            f'Someone asked to reset the password for the account "{user.username}". '
            f'If it was you, use the button below to choose a new one. '
            f'The link works once and expires in {valid_hours} hours.',
            "If you didn't ask for this, ignore this email: your password stays the same.",
        ],
        [user.email],
        button=('Choose a new password', link),
    )


def password_changed(user, by=None):
    if by is not None and by.pk != user.pk:
        how = f'{by.get_full_name() or by.username} changed the password for your account "{user.username}".'
    else:
        how = f'The password for your account "{user.username}" was just changed.'
    send(
        'Your Business Manager password was changed',
        [
            f'Hello {user.get_full_name() or user.username},',
            how,
            "If this wasn't you or someone you expected, reset your password now "
            'and tell your administrator.',
        ],
        [user.email],
        button=('Reset password', _link('/forgot-password')),
    )


# ---------------------------------------------------------------------------
# Platform admin: daily subscriptions overview
# ---------------------------------------------------------------------------
def subscriptions_summary(tenants, today, window_days=7):
    """
    One email listing businesses whose trial / plan ends within
    `window_days`, and those whose ended in the last `window_days`.
    Sends nothing if there's nothing to report. Returns the row count.
    """
    ending, ended = [], []
    for t in tenants:
        end = t.access_ends_at
        if end is None:
            continue
        days = (timezone.localtime(end).date() - today).days
        if 0 <= days <= window_days:
            ending.append((days, t))
        elif -window_days <= days < 0:
            ended.append((-days, t))
    if not (ending or ended):
        return 0

    ending.sort(key=lambda x: x[0])
    ended.sort(key=lambda x: x[0])

    def row(t, when):
        return (f'• {t.name} ({_what(t)}, {t.owner_email or "no email"}, '
                f'{t.owner_phone or "no phone"}) — {when}')

    paras = []
    if ending:
        paras.append(f'Ending in the next {window_days} days ({len(ending)}):\n' + '\n'.join(
            row(t, 'today' if d == 0 else f'in {d} day{"s" if d != 1 else ""}')
            for d, t in ending))
    if ended:
        paras.append(f'Ended in the last {window_days} days, not yet renewed ({len(ended)}):\n'
                     + '\n'.join(row(t, f'{d} day{"s" if d != 1 else ""} ago') for d, t in ended))
    send(
        f'Subscriptions: {len(ending)} ending soon, {len(ended)} recently ended',
        paras, platform_admin_recipients(), button=('View businesses', _link('/tenants')),
    )
    return len(ending) + len(ended)


__all__ = [
    'business_recipients', 'platform_admin_recipients', 'send',
    'welcome', 'new_business', 'subscription_reminder', 'payment_received',
    'payment_failed', 'plan_extended', 'account_status_changed',
    'subscriptions_summary', 'staff_added', 'password_reset', 'password_changed',
]
