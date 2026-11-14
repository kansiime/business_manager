"""
Daily email digest for each business: yesterday's sales and profit,
month-to-date totals, what's selling, what isn't, stock that has expired or
is about to, low stock and money owed.

Sent every morning by the Render cron job:
  python manage.py send_daily_digest
"""
from datetime import timedelta
from decimal import Decimal
from html import escape

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db.models import DecimalField, ExpressionWrapper, F, Max, Sum
from django.utils import timezone

from apps.accounts.models import GarageSettings
from apps.debts.models import Debt
from apps.expenses.models import Expense
from apps.inventory.models import Product
from apps.sales.models import Sale, SaleItem

EXPIRY_WARNING_DAYS = 30      # warn about stock expiring within this many days
EXPIRY_URGENT_DAYS = 7        # ...and mark it urgent inside this many
NOT_MOVING_DAYS = 30          # stock with no sale in this many days isn't moving
LIST_LIMIT = 10               # rows per section in the email

_money = DecimalField(max_digits=18, decimal_places=2)
_REVENUE = ExpressionWrapper(F('quantity') * F('unit_price'), output_field=_money)
_COST = ExpressionWrapper(F('quantity') * F('cost_price'), output_field=_money)


# ---------------------------------------------------------------------------
# Figures
# ---------------------------------------------------------------------------
def _money_summary(tenant, start, end):
    """Sales, profit and expenses for the dates start..end inclusive."""
    sales = Sale.all_objects.filter(
        tenant=tenant, created_at__date__gte=start, created_at__date__lte=end,
    )
    items = SaleItem.objects.filter(sale__in=sales).aggregate(
        revenue=Sum(_REVENUE), cost=Sum(_COST),
    )
    revenue = items['revenue'] or Decimal('0')
    gross = revenue - (items['cost'] or Decimal('0'))
    expenses = Expense.all_objects.filter(
        tenant=tenant, expense_date__gte=start, expense_date__lte=end,
    ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
    return {
        'sales': sales.aggregate(t=Sum('total_amount'))['t'] or Decimal('0'),
        'count': sales.count(),
        'gross_profit': gross,
        'expenses': expenses,
        'net_profit': gross - expenses,
    }


def _best_sellers(tenant, start, end):
    return list(
        SaleItem.objects.filter(
            sale__tenant=tenant,
            sale__created_at__date__gte=start,
            sale__created_at__date__lte=end,
        )
        .values('product__name')
        .annotate(qty=Sum('quantity'), revenue=Sum(_REVENUE))
        .order_by('-qty')[:5]
    )


def _stock_alerts(tenant, today):
    in_stock = Product.all_objects.filter(tenant=tenant, quantity__gt=0)

    expired = list(
        in_stock.filter(expiry_date__lt=today).order_by('expiry_date')
    )
    expiring = list(
        in_stock.filter(
            expiry_date__gte=today,
            expiry_date__lte=today + timedelta(days=EXPIRY_WARNING_DAYS),
        ).order_by('expiry_date')
    )

    # Not moving: in stock, no sale for NOT_MOVING_DAYS, and old enough to
    # have had the chance (a product added yesterday isn't "not moving").
    cutoff = timezone.now() - timedelta(days=NOT_MOVING_DAYS)
    last_sold = dict(
        SaleItem.objects.filter(sale__tenant=tenant)
        .values('product_id')
        .annotate(last=Max('sale__created_at'))
        .values_list('product_id', 'last')
    )
    not_moving = []
    for p in in_stock.filter(created_at__lt=cutoff):
        last = last_sold.get(p.id)
        if last is None or last < cutoff:
            p.last_sold = last
            p.idle_days = (timezone.now() - (last or p.created_at)).days
            not_moving.append(p)
    not_moving.sort(key=lambda p: p.stock_value, reverse=True)

    low_stock = list(
        Product.all_objects.filter(tenant=tenant, quantity__lte=F('reorder_level'))
        .order_by('quantity')
    )

    for p in expired + expiring:
        p.days_left = (p.expiry_date - today).days

    return {
        'expired': expired,
        'expiring': expiring,
        'not_moving': not_moving,
        'low_stock': low_stock,
        'expired_value': sum((p.stock_value for p in expired), Decimal('0')),
        'expiring_value': sum((p.stock_value for p in expiring), Decimal('0')),
        'not_moving_value': sum((p.stock_value for p in not_moving), Decimal('0')),
    }


def build_digest(tenant, day):
    month_start = day.replace(day=1)
    receivable = sum(
        (d.balance for d in Debt.all_objects.filter(
            tenant=tenant, debt_type='receivable',
        ).exclude(status='paid')),
        Decimal('0'),
    )
    shop = GarageSettings.all_objects.filter(tenant=tenant).first()
    return {
        'day': day,
        'business_name': (shop.name if shop and shop.name != 'My Business' else None)
                         or tenant.name,
        'currency': shop.currency_symbol if shop else 'UGX',
        'yesterday': _money_summary(tenant, day, day),
        'month': _money_summary(tenant, month_start, day),
        'best_day': _best_sellers(tenant, day, day),
        'best_week': _best_sellers(tenant, day - timedelta(days=6), day),
        'receivable': receivable,
        **_stock_alerts(tenant, day + timedelta(days=1)),
    }


def digest_recipients(tenant):
    """The owner's email plus every active admin / manager with an email."""
    from apps.tenants.emails import business_recipients
    return business_recipients(tenant)


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------
def _subject(d):
    flags = []
    if d['expired']:
        flags.append(f"{len(d['expired'])} expired")
    urgent = [p for p in d['expiring'] if p.days_left <= EXPIRY_URGENT_DAYS]
    if urgent:
        flags.append(f'{len(urgent)} expiring this week')
    if d['low_stock']:
        flags.append(f"{len(d['low_stock'])} low on stock")
    head = f"⚠ {', '.join(flags)} · " if flags else ''
    return f"[{d['business_name']}] {head}Daily summary {d['day'].strftime('%d %b %Y')}"


def _expiry_text(p):
    if p.days_left < 0:
        return f'expired {-p.days_left} day(s) ago'
    if p.days_left == 0:
        return 'expires today'
    return f'expires in {p.days_left} day(s)'


def render_text(d):
    c = d['currency']
    y, m = d['yesterday'], d['month']
    out = [
        f"{d['business_name']} — daily summary for {d['day'].strftime('%A %d %b %Y')}",
        '',
        'YESTERDAY',
        f"  Sales:        {c} {y['sales']:,.0f} ({y['count']} sales)",
        f"  Gross profit: {c} {y['gross_profit']:,.0f}",
        f"  Expenses:     {c} {y['expenses']:,.0f}",
        f"  Net profit:   {c} {y['net_profit']:,.0f}",
        '',
        'THIS MONTH SO FAR',
        f"  Sales: {c} {m['sales']:,.0f} · Net profit: {c} {m['net_profit']:,.0f}",
    ]

    def section(title, rows, fmt):
        if rows:
            out.extend(['', title])
            out.extend(f'  • {fmt(r)}' for r in rows[:LIST_LIMIT])
            if len(rows) > LIST_LIMIT:
                out.append(f'  …and {len(rows) - LIST_LIMIT} more')

    section(f"EXPIRED — still in stock ({c} {d['expired_value']:,.0f})", d['expired'],
            lambda p: f'{p.name}: {p.quantity} left, {_expiry_text(p)}')
    section(f"EXPIRING WITHIN {EXPIRY_WARNING_DAYS} DAYS ({c} {d['expiring_value']:,.0f})",
            d['expiring'], lambda p: f'{p.name}: {p.quantity} left, {_expiry_text(p)}')
    section('LOW STOCK', d['low_stock'],
            lambda p: f'{p.name}: {p.quantity} left (reorder at {p.reorder_level})')
    section('BEST SELLERS YESTERDAY', d['best_day'],
            lambda r: f"{r['product__name']}: {r['qty']} sold")
    section('BEST SELLERS — LAST 7 DAYS', d['best_week'],
            lambda r: f"{r['product__name']}: {r['qty']} sold")
    section(f"NOT MOVING — no sale in {NOT_MOVING_DAYS}+ days "
            f"({c} {d['not_moving_value']:,.0f} tied up)", d['not_moving'],
            lambda p: f'{p.name}: {p.quantity} in stock, '
                      f'{"never sold" if p.last_sold is None else f"last sold {p.idle_days} days ago"}')

    out += ['', f"Owed to you: {c} {d['receivable']:,.0f}", '',
            '— Sent by Business Manager']
    return '\n'.join(out)


def render_html(d):
    c = escape(d['currency'])
    y, m = d['yesterday'], d['month']
    e = lambda s: escape(str(s))  # noqa: E731

    def tile(label, value, bg, fg, sub=''):
        return (
            f'<td style="padding:12px;background:{bg};vertical-align:top;">'
            f'<div style="font-size:11px;color:{fg};text-transform:uppercase;">{label}</div>'
            f'<div style="font-size:20px;font-weight:bold;">{c} {value:,.0f}</div>'
            f'<div style="font-size:12px;color:#666;">{sub}</div></td>'
        )

    def section(title, color, rows, fmt, note=''):
        if not rows:
            return ''
        items = ''.join(f'<li style="margin:3px 0;">{fmt(r)}</li>' for r in rows[:LIST_LIMIT])
        more = (f'<li style="color:#666;">…and {len(rows) - LIST_LIMIT} more</li>'
                if len(rows) > LIST_LIMIT else '')
        note = f'<p style="margin:0;color:#666;font-size:13px;">{note}</p>' if note else ''
        return (f'<h3 style="color:{color};margin:24px 0 6px;">{title}</h3>{note}'
                f'<ul style="padding-left:20px;margin:6px 0;">{items}{more}</ul>')

    def expiry_row(p):
        tone = '#dc2626' if p.days_left <= EXPIRY_URGENT_DAYS else '#92400e'
        return (f'<b>{e(p.name)}</b> — {p.quantity} left, '
                f'<span style="color:{tone};">{_expiry_text(p)}</span>')

    def idle_row(p):
        when = 'never sold' if p.last_sold is None else f'last sold {p.idle_days} days ago'
        return (f'<b>{e(p.name)}</b> — {p.quantity} in stock '
                f'({c} {p.stock_value:,.0f}), {when}')

    body = ''.join([
        section('⛔ Expired — still in stock', '#dc2626', d['expired'], expiry_row,
                f"{c} {d['expired_value']:,.0f} of stock. Remove it from sale."),
        section(f'⏳ Expiring within {EXPIRY_WARNING_DAYS} days', '#b45309', d['expiring'],
                expiry_row, f"{c} {d['expiring_value']:,.0f} of stock. Sell or return these first."),
        section('📉 Low stock', '#dc2626', d['low_stock'],
                lambda p: f'<b>{e(p.name)}</b> — only {p.quantity} left '
                          f'(reorder at {p.reorder_level})'),
        section('🔥 Best sellers yesterday', '#334155', d['best_day'],
                lambda r: f"<b>{e(r['product__name'])}</b> — {r['qty']} sold"),
        section('📈 Best sellers, last 7 days', '#334155', d['best_week'],
                lambda r: f"<b>{e(r['product__name'])}</b> — {r['qty']} sold"),
        section(f'🐢 Not moving (no sale in {NOT_MOVING_DAYS}+ days)', '#475569',
                d['not_moving'], idle_row,
                f"{c} {d['not_moving_value']:,.0f} tied up. Consider a discount or a supplier return."),
    ])

    return f"""<html><body style="font-family:Arial,sans-serif;color:#111;max-width:640px;margin:auto;">
  <h2 style="color:#1e40af;margin-bottom:0;">{e(d['business_name'])}</h2>
  <p style="color:#666;margin-top:4px;">Daily summary — {d['day'].strftime('%A %d %b %Y')}</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0 4px;"><tr>
    {tile('Sales yesterday', y['sales'], '#dbeafe', '#1e40af', f"{y['count']} sales")}
    {tile('Gross profit', y['gross_profit'], '#dcfce7', '#166534')}
    {tile('Expenses', y['expenses'], '#fef3c7', '#92400e')}
    {tile('Net profit', y['net_profit'], '#f0fdf4', '#166534')}
  </tr></table>
  <p style="margin:4px 0;color:#334155;">This month so far: <b>{c} {m['sales']:,.0f}</b> in sales,
     <b>{c} {m['net_profit']:,.0f}</b> net profit.</p>
  {body}
  <h3 style="color:#334155;margin:24px 0 6px;">💰 Owed to you</h3>
  <p style="font-size:18px;margin:0;">{c} {d['receivable']:,.0f}</p>
  <p style="color:#666;margin-top:32px;font-size:12px;text-align:center;">Sent by Business Manager</p>
</body></html>"""


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------
def send_digest_for_tenant(tenant, day=None, to=None):
    """
    Email yesterday's digest (or `day`'s) to the business, or only to the
    addresses in `to`. True if sent.
    """
    if day is None:
        day = timezone.localtime().date() - timedelta(days=1)
    recipients = list(to) if to else digest_recipients(tenant)
    if not recipients:
        return False

    d = build_digest(tenant, day)
    try:
        msg = EmailMultiAlternatives(
            subject=_subject(d),
            body=render_text(d),
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=recipients,
        )
        msg.attach_alternative(render_html(d), 'text/html')
        msg.send()
        return True
    except Exception as exc:
        print(f'[digest] failed for {tenant.name}: {exc}')
        return False
