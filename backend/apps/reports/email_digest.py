"""
Daily email digest — sends sales summary to tenant owner.

Usage:
  python manage.py send_daily_digest
  # or schedule via cron / Render cron job:
  # 0 8 * * * cd /path && python manage.py send_daily_digest
"""
from datetime import timedelta
from decimal import Decimal

from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone
from django.conf import settings
from django.db.models import Sum, Count

from apps.tenants.models import Tenant
from apps.sales.models import Sale, SaleItem
from apps.debts.models import Debt
from apps.expenses.models import Expense
from apps.inventory.models import Product
from apps.accounts.models import GarageSettings


def _summary_for_tenant(tenant, day):
    start = day
    end = day

    sales = Sale.all_objects.filter(
        tenant=tenant,
        created_at__date__gte=start,
        created_at__date__lte=end,
    )
    items = SaleItem.objects.filter(sale__in=sales)

    total_sales = float(sales.aggregate(t=Sum('total_amount'))['t'] or 0)
    count = sales.count()

    revenue = sum((i.quantity * i.unit_price for i in items), Decimal('0'))
    cost = sum((i.quantity * i.cost_price for i in items), Decimal('0'))
    gross_profit = float(revenue - cost)

    expenses_qs = Expense.all_objects.filter(
        tenant=tenant,
        expense_date=day,
    )
    expenses = float(expenses_qs.aggregate(t=Sum('amount'))['t'] or 0)
    net_profit = gross_profit - expenses

    # Top 3 products sold yesterday
    top = (
        items.values('product__name')
        .annotate(qty=Sum('quantity'), revenue=Sum('unit_price'))
        .order_by('-qty')[:3]
    )

    # Low stock alerts
    low_stock = Product.all_objects.filter(
        tenant=tenant, quantity__lte=models.F('reorder_level'),
    )[:5] if False else Product.all_objects.filter(
        tenant=tenant,
    ).extra(where=['quantity <= reorder_level'])[:5]

    # Receivables
    receivable = sum(
        (d.balance for d in Debt.all_objects.filter(
            tenant=tenant, debt_type='receivable'
        ).exclude(status='paid')),
        Decimal('0'),
    )

    shop = GarageSettings.all_objects.filter(tenant=tenant).first()
    currency = shop.currency_symbol if shop else 'UGX'

    return {
        'total_sales': total_sales,
        'count': count,
        'gross_profit': gross_profit,
        'expenses': expenses,
        'net_profit': net_profit,
        'top_products': list(top),
        'low_stock': list(low_stock.values('name', 'quantity', 'reorder_level')),
        'receivable': float(receivable),
        'currency': currency,
        'business_name': shop.name if shop else tenant.name,
    }


def send_digest_for_tenant(tenant, day=None):
    if day is None:
        day = timezone.localtime().date() - timedelta(days=1)

    summary = _summary_for_tenant(tenant, day)

    # Recipient
    to_email = tenant.owner_email
    if not to_email:
        return False

    subject = f"[{summary['business_name']}] Daily Summary — {day.strftime('%d %b %Y')}"

    # Build plain text
    lines = [
        f"Daily Summary for {day.strftime('%d %b %Y')}",
        f"Business: {summary['business_name']}",
        '',
        f"Sales: {summary['currency']} {summary['total_sales']:,.0f}",
        f"Transactions: {summary['count']}",
        f"Gross Profit: {summary['currency']} {summary['gross_profit']:,.0f}",
        f"Expenses: {summary['currency']} {summary['expenses']:,.0f}",
        f"Net Profit: {summary['currency']} {summary['net_profit']:,.0f}",
        '',
        'Top Products:',
    ]
    for p in summary['top_products']:
        lines.append(f"  • {p['product__name']}: {p['qty']} sold")
    if not summary['top_products']:
        lines.append('  • No sales')

    lines.append('')
    lines.append(f"Receivables: {summary['currency']} {summary['receivable']:,.0f}")

    if summary['low_stock']:
        lines.append('')
        lines.append('Low Stock Alerts:')
        for p in summary['low_stock']:
            lines.append(f"  • {p['name']}: {p['quantity']} left")

    lines.append('')
    lines.append('— Sent by Business Manager · Powered by Noelsoft Technologies')

    text_body = '\n'.join(lines)

    # HTML version
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #111; max-width: 640px; margin: auto;">
        <h2 style="color: #1e40af;">📊 {summary['business_name']}</h2>
        <p style="color: #666;">Daily Summary — {day.strftime('%d %b %Y')}</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 12px; background: #dbeafe; border-radius: 8px 0 0 0;">
              <div style="font-size: 12px; color: #1e40af; text-transform: uppercase;">Sales</div>
              <div style="font-size: 22px; font-weight: bold;">{summary['currency']} {summary['total_sales']:,.0f}</div>
              <div style="font-size: 12px; color: #666;">{summary['count']} transactions</div>
            </td>
            <td style="padding: 12px; background: #dcfce7;">
              <div style="font-size: 12px; color: #166534; text-transform: uppercase;">Gross Profit</div>
              <div style="font-size: 22px; font-weight: bold;">{summary['currency']} {summary['gross_profit']:,.0f}</div>
            </td>
            <td style="padding: 12px; background: #fef3c7; border-radius: 0 8px 0 0;">
              <div style="font-size: 12px; color: #92400e; text-transform: uppercase;">Expenses</div>
              <div style="font-size: 22px; font-weight: bold;">{summary['currency']} {summary['expenses']:,.0f}</div>
            </td>
          </tr>
          <tr>
            <td colspan="3" style="padding: 12px; background: #f0fdf4; border-radius: 0 0 8px 8px;">
              <div style="font-size: 12px; color: #166534; text-transform: uppercase;">Net Profit</div>
              <div style="font-size: 26px; font-weight: bold; color: #166534;">
                {summary['currency']} {summary['net_profit']:,.0f}
              </div>
            </td>
          </tr>
        </table>

        {f'''
        <h3 style="color: #334155;">🔥 Top Products</h3>
        <ul style="padding-left: 20px;">
          {''.join(f"<li><b>{p['product__name']}</b> — {p['qty']} sold</li>" for p in summary['top_products']) or '<li>No sales</li>'}
        </ul>
        '''}

        <h3 style="color: #334155;">💰 Receivables</h3>
        <p style="font-size: 18px;">{summary['currency']} {summary['receivable']:,.0f} owed to you</p>

        {f'''
        <h3 style="color: #dc2626;">⚠️ Low Stock</h3>
        <ul style="padding-left: 20px;">
          {''.join(f"<li><b>{p['name']}</b> — only {p['quantity']} left</li>" for p in summary['low_stock'])}
        </ul>
        ''' if summary['low_stock'] else ''}

        <p style="color: #666; margin-top: 32px; font-size: 12px; text-align: center;">
          Sent by Business Manager · Powered by <b>Noelsoft Technologies</b>
        </p>
      </body>
    </html>
    """

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[to_email],
        )
        msg.attach_alternative(html_body, "text/html")
        msg.send()
        return True
    except Exception as e:
        print(f"[digest] failed for {tenant.name}: {e}")
        return False