"""
AI Analytics — statistical insights derived from real sales history.

No external ML libraries — pure Python + Django ORM.
Fast, explainable, and works with small data.

Endpoints:
  GET  /api/reports/ai/fast-moving/          Fast movers ranking
  GET  /api/reports/ai/stock-suggestions/    Restock suggestions
  GET  /api/reports/ai/seasonality/          Week-of-year patterns
  GET  /api/reports/ai/forecast/             Simple demand forecast
  GET  /api/reports/ai/anomalies/            Unusual sales detection
  GET  /api/reports/ai/bundles/              Product bundling suggestions
  GET  /api/reports/ai/summary/              All-in-one dashboard
"""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from statistics import mean, stdev, median
from calendar import monthrange

from django.db.models import Sum, Count, Max, Min
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.sales.models import Sale, SaleItem
from apps.inventory.models import Product
from apps.accounts.models import GarageSettings


# ============================================================================
# Helpers
# ============================================================================
def _tenant(request):
    return request.user.tenant


def _date_window(days):
    today = timezone.localtime().date()
    start = today - timedelta(days=days - 1)
    return start, today


def _sales_in_window(tenant, start, end):
    return SaleItem.objects.filter(
        sale__tenant=tenant,
        sale__created_at__date__gte=start,
        sale__created_at__date__lte=end,
    )


# ============================================================================
# 1. FAST MOVING — rank products by velocity
# ============================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def fast_moving(request):
    tenant = _tenant(request)
    days = int(request.query_params.get('days', 30))
    limit = int(request.query_params.get('limit', 20))
    direction = request.query_params.get('direction', 'fast')

    start, today = _date_window(days)
    prev_start = start - timedelta(days=days)

    # Current window
    items = _sales_in_window(tenant, start, today).values(
        'product_id', 'product__name', 'product__sku',
        'product__quantity', 'product__reorder_level',
    ).annotate(
        units=Sum('quantity'),
        revenue=Sum('unit_price'),
        orders=Count('id'),
    )

    # Previous window
    prev_units = {
        row['product_id']: row['units'] or 0
        for row in _sales_in_window(tenant, prev_start, start - timedelta(days=1))
        .values('product_id').annotate(units=Sum('quantity'))
    }

    # Last sale date
    last_sales = {
        row['product_id']: row['last']
        for row in SaleItem.objects.filter(sale__tenant=tenant)
        .values('product_id').annotate(last=Max('sale__created_at'))
    }

    results = []
    for row in items:
        pid = row['product_id']
        units = row['units'] or 0
        revenue = float(row['revenue'] or 0)
        velocity = units / days
        prev = prev_units.get(pid, 0)
        trend = round(((units - prev) / max(prev, 1)) * 100, 1) if prev else None
        last = last_sales.get(pid)

        results.append({
            'product_id': pid,
            'name': row['product__name'],
            'sku': row['product__sku'],
            'current_quantity': row['product__quantity'],
            'reorder_level': row['product__reorder_level'],
            'units_sold': units,
            'revenue': revenue,
            'orders': row['orders'],
            'velocity_per_day': round(velocity, 2),
            'revenue_per_day': round(revenue / days, 2),
            'trend_pct': trend,
            'days_since_last_sale': (today - last.date()).days if last else None,
            'avg_price': round(revenue / units, 2) if units else 0,
        })

    if direction == 'slow':
        results.sort(key=lambda r: r['velocity_per_day'])
    else:
        results.sort(key=lambda r: r['velocity_per_day'], reverse=True)

    results = results[:limit]

    total_products = Product.all_objects.filter(tenant=tenant).count()
    total_units = sum(r['units_sold'] for r in results)
    total_revenue = sum(r['revenue'] for r in results)

    return Response({
        'window_days': days,
        'period': {'start': start.isoformat(), 'end': today.isoformat()},
        'summary': {
            'active_products': len(items),
            'total_products': total_products,
            'total_units_moved': total_units,
            'total_revenue': total_revenue,
            'dead_products': total_products - len(items),
        },
        'items': results,
    })


# ============================================================================
# 2. STOCK SUGGESTIONS — what to stock next
# ============================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def stock_suggestions(request):
    tenant = _tenant(request)
    days = int(request.query_params.get('days', 30))
    lead_time = int(request.query_params.get('lead_time', 7))
    safety_days = int(request.query_params.get('safety', 3))
    priority_filter = request.query_params.get('priority', 'all')

    start, today = _date_window(days)

    sales = {
        row['product_id']: row['units'] or 0
        for row in _sales_in_window(tenant, start, today)
        .values('product_id').annotate(units=Sum('quantity'))
    }

    products = Product.all_objects.filter(tenant=tenant)
    suggestions = []

    for p in products:
        units = sales.get(p.id, 0)
        avg_daily = units / days if days else 0
        stock_days = p.quantity / avg_daily if avg_daily > 0 else None
        reorder_point = avg_daily * (lead_time + safety_days)
        target_qty = avg_daily * 30
        suggested = max(0, target_qty - p.quantity + reorder_point)
        suggested = int(round(suggested))

        if units == 0 and p.quantity == 0:
            priority = 'ok'
        elif p.quantity <= reorder_point and avg_daily > 0:
            priority = 'urgent'
        elif stock_days is not None and stock_days <= lead_time:
            priority = 'urgent'
        elif stock_days is not None and stock_days <= lead_time * 2:
            priority = 'high'
        elif stock_days is not None and stock_days <= lead_time * 3:
            priority = 'medium'
        else:
            priority = 'ok'

        if suggested <= 0 and priority == 'ok':
            continue

        suggestions.append({
            'product_id': p.id,
            'name': p.name,
            'sku': p.sku,
            'category': p.category.name if p.category else None,
            'supplier_id': p.supplier_id,
            'supplier_name': p.supplier.name if p.supplier else None,
            'current_quantity': p.quantity,
            'reorder_level': p.reorder_level,
            'units_sold_30d': units,
            'avg_daily_sales': round(avg_daily, 2),
            'stock_days_remaining': round(stock_days, 1) if stock_days is not None else None,
            'reorder_point': round(reorder_point, 1),
            'suggested_quantity': suggested,
            'priority': priority,
            'reason': (
                f'Selling {round(avg_daily, 2)}/day. '
                f'{round(stock_days, 1) if stock_days is not None else "∞"} '
                f'days of stock left.'
                if avg_daily > 0 else 'No recent sales.'
            ),
        })

    priority_order = {'urgent': 0, 'high': 1, 'medium': 2, 'ok': 3}
    suggestions.sort(key=lambda s: (
        priority_order[s['priority']],
        s['stock_days_remaining'] if s['stock_days_remaining'] is not None else 9999,
    ))

    if priority_filter != 'all':
        suggestions = [s for s in suggestions if s['priority'] == priority_filter]

    return Response({
        'window_days': days,
        'lead_time_days': lead_time,
        'safety_days': safety_days,
        'summary': {
            'total_suggestions': len(suggestions),
            'urgent': sum(1 for s in suggestions if s['priority'] == 'urgent'),
            'high': sum(1 for s in suggestions if s['priority'] == 'high'),
            'medium': sum(1 for s in suggestions if s['priority'] == 'medium'),
        },
        'suggestions': suggestions,
    })


# ============================================================================
# 3. SEASONALITY — group sales by week-of-year
# ============================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def seasonality(request):
    """
    Break down revenue by ISO week-of-year, and by month.
    Surfaces peak weeks — great for spotting Ramadan, Christmas, school terms.
    """
    tenant = _tenant(request)
    years = int(request.query_params.get('years', 2))

    today = timezone.localtime().date()
    start = today - timedelta(days=365 * years)

    # Weekly aggregation
    sales = SaleItem.objects.filter(
        sale__tenant=tenant,
        sale__created_at__date__gte=start,
        sale__created_at__date__lte=today,
    ).values(
        'sale__created_at__year', 'sale__created_at__week',
    ).annotate(
        revenue=Sum('unit_price'),
        orders=Count('sale_id', distinct=True),
        units=Sum('quantity'),
    ).order_by('sale__created_at__year', 'sale__created_at__week')

    weekly = [
        {
            'year': row['sale__created_at__year'],
            'week': row['sale__created_at__week'],
            'revenue': float(row['revenue'] or 0),
            'orders': row['orders'],
            'units': row['units'] or 0,
        }
        for row in sales
    ]

    # Monthly aggregation
    monthly_sales = SaleItem.objects.filter(
        sale__tenant=tenant,
        sale__created_at__date__gte=start,
        sale__created_at__date__lte=today,
    ).values(
        'sale__created_at__year', 'sale__created_at__month',
    ).annotate(
        revenue=Sum('unit_price'),
        orders=Count('sale_id', distinct=True),
    ).order_by('sale__created_at__year', 'sale__created_at__month')

    MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    monthly = [
        {
            'year': row['sale__created_at__year'],
            'month': row['sale__created_at__month'],
            'month_name': MONTH_NAMES[row['sale__created_at__month'] - 1],
            'revenue': float(row['revenue'] or 0),
            'orders': row['orders'],
        }
        for row in monthly_sales
    ]

    # Compute average per week-of-year across all years
    week_totals = defaultdict(list)
    for w in weekly:
        week_totals[w['week']].append(w['revenue'])

    week_avg = [
        {
            'week': wk,
            'avg_revenue': round(mean(vals), 2) if vals else 0,
            'samples': len(vals),
            'max_revenue': max(vals) if vals else 0,
        }
        for wk, vals in sorted(week_totals.items())
    ]

    # Find the top 5 peak weeks
    peaks = sorted(week_avg, key=lambda x: x['avg_revenue'], reverse=True)[:5]

    # Overall stats
    all_revenues = [w['revenue'] for w in weekly]
    avg_rev = mean(all_revenues) if all_revenues else 0
    std_rev = stdev(all_revenues) if len(all_revenues) > 1 else 0

    return Response({
        'years': years,
        'weekly': weekly,
        'monthly': monthly,
        'week_average': week_avg,
        'peaks': peaks,
        'stats': {
            'avg_weekly_revenue': round(avg_rev, 2),
            'std_weekly_revenue': round(std_rev, 2),
            'weeks_with_data': len(weekly),
        },
    })


# ============================================================================
# 4. FORECAST — simple next-30-days demand forecast
# ============================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def forecast(request):
    """
    Simple, robust forecast using a weighted average of recent windows.

    Method (no external ML libs):
      - Weighted average of last 7, 14, and 30 day velocities
      - Adjusts for trend
      - Produces a 30-day projection with confidence range
    """
    tenant = _tenant(request)
    product_id = request.query_params.get('product_id')

    if not product_id:
        return Response({'detail': 'product_id is required.'}, status=400)

    try:
        product = Product.all_objects.get(pk=product_id, tenant=tenant)
    except Product.DoesNotExist:
        return Response({'detail': 'Product not found.'}, status=404)

    today = timezone.localtime().date()

    def units_in(days):
        start = today - timedelta(days=days - 1)
        r = SaleItem.objects.filter(
            sale__tenant=tenant,
            product=product,
            sale__created_at__date__gte=start,
            sale__created_at__date__lte=today,
        ).aggregate(units=Sum('quantity'))['units']
        return r or 0

    units_7 = units_in(7)
    units_14 = units_in(14)
    units_30 = units_in(30)

    vel_7 = units_7 / 7
    vel_14 = units_14 / 14
    vel_30 = units_30 / 30

    # Weighted: 50% recent week, 30% two-week, 20% month
    weighted_velocity = (vel_7 * 0.5) + (vel_14 * 0.3) + (vel_30 * 0.2)

    forecast_30 = weighted_velocity * 30
    forecast_7 = weighted_velocity * 7

    # Trend indicator
    if vel_7 > vel_30 * 1.2:
        trend = 'up'
        trend_pct = round(((vel_7 - vel_30) / max(vel_30, 0.01)) * 100, 1)
    elif vel_7 < vel_30 * 0.8:
        trend = 'down'
        trend_pct = round(((vel_7 - vel_30) / max(vel_30, 0.01)) * 100, 1)
    else:
        trend = 'stable'
        trend_pct = 0

    # Confidence range — always ±20% for small data
    lower = round(forecast_30 * 0.8)
    upper = round(forecast_30 * 1.2)

    # Reorder suggestion: how much to stock to cover 30 days
    suggested_reorder = max(0, round(forecast_30 - product.quantity))

    return Response({
        'product': {
            'id': product.id,
            'name': product.name,
            'sku': product.sku,
            'current_quantity': product.quantity,
            'cost_price': float(product.cost_price),
            'selling_price': float(product.selling_price),
        },
        'velocity': {
            'last_7d': round(vel_7, 2),
            'last_14d': round(vel_14, 2),
            'last_30d': round(vel_30, 2),
            'weighted': round(weighted_velocity, 2),
        },
        'forecast': {
            'next_7_days': round(forecast_7),
            'next_30_days': round(forecast_30),
            'confidence_low': lower,
            'confidence_high': upper,
        },
        'trend': {'direction': trend, 'percent': trend_pct},
        'suggested_reorder': suggested_reorder,
    })


# ============================================================================
# 5. ANOMALY DETECTION — flag unusual sales days
# ============================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def anomalies(request):
    """
    Detect days where revenue spiked or dropped significantly vs the
    rolling 30-day average. Uses z-score (standard deviations from mean).
    """
    tenant = _tenant(request)
    days = int(request.query_params.get('days', 90))
    threshold = float(request.query_params.get('threshold', 2.0))  # z-score

    today = timezone.localtime().date()
    start = today - timedelta(days=days - 1)

    # Daily revenue
    daily = SaleItem.objects.filter(
        sale__tenant=tenant,
        sale__created_at__date__gte=start,
        sale__created_at__date__lte=today,
    ).values('sale__created_at__date').annotate(
        revenue=Sum('unit_price'),
        orders=Count('sale_id', distinct=True),
    ).order_by('sale__created_at__date')

    daily_list = [
        {
            'date': row['sale__created_at__date'].isoformat(),
            'revenue': float(row['revenue'] or 0),
            'orders': row['orders'],
        }
        for row in daily
    ]

    if len(daily_list) < 7:
        return Response({
            'window_days': days,
            'threshold': threshold,
            'daily': daily_list,
            'anomalies': [],
            'stats': {'avg': 0, 'std': 0, 'days_with_data': len(daily_list)},
        })

    revenues = [d['revenue'] for d in daily_list]
    avg = mean(revenues)
    std = stdev(revenues) if len(revenues) > 1 else 0

    # Also compute a 7-day rolling average to compare against
    anomalies_list = []
    for i, d in enumerate(daily_list):
        if std == 0:
            continue
        z = (d['revenue'] - avg) / std
        if abs(z) >= threshold:
            # Find nearby revenue context
            nearby = revenues[max(0, i - 7):i + 8]
            rolling_avg = mean(nearby) if nearby else 0
            pct_change = (
                round(((d['revenue'] - rolling_avg) / rolling_avg) * 100, 1)
                if rolling_avg else 0
            )
            anomalies_list.append({
                'date': d['date'],
                'revenue': d['revenue'],
                'orders': d['orders'],
                'z_score': round(z, 2),
                'rolling_avg': round(rolling_avg, 2),
                'pct_change': pct_change,
                'type': 'spike' if z > 0 else 'drop',
            })

    return Response({
        'window_days': days,
        'threshold': threshold,
        'daily': daily_list,
        'anomalies': anomalies_list,
        'stats': {
            'avg': round(avg, 2),
            'std': round(std, 2),
            'days_with_data': len(daily_list),
            'anomaly_count': len(anomalies_list),
        },
    })


# ============================================================================
# 6. PRODUCT BUNDLING — market basket analysis
# ============================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def bundles(request):
    """
    Find products that are frequently bought together.

    Metrics:
      - support:  fraction of orders containing both A and B
      - confidence: P(B | A) — how often B appears when A appears
      - lift:     confidence / baseline B — how much more often B is bought with A
    """
    tenant = _tenant(request)
    days = int(request.query_params.get('days', 180))
    min_support = int(request.query_params.get('min_orders', 3))
    limit = int(request.query_params.get('limit', 20))

    today = timezone.localtime().date()
    start = today - timedelta(days=days - 1)

    # Get all sales in the window with their items
    sales = Sale.objects.filter(
        tenant=tenant,
        created_at__date__gte=start,
        created_at__date__lte=today,
    ).prefetch_related('items__product')

    total_orders = sales.count()
    if total_orders == 0:
        return Response({
            'window_days': days,
            'total_orders': 0,
            'bundles': [],
        })

    # Count product frequency and co-occurrence
    product_counts = defaultdict(int)
    pair_counts = defaultdict(int)

    for sale in sales:
        products_in_sale = set()
        for item in sale.items.all():
            pid = item.product_id
            product_counts[pid] += 1
            products_in_sale.add(pid)

        # All pairs (A, B) with A < B for uniqueness
        ids = sorted(products_in_sale)
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                pair_counts[(ids[i], ids[j])] += 1

    # Fetch product names
    all_ids = set(product_counts.keys())
    names = {
        p.id: (p.name, p.sku)
        for p in Product.all_objects.filter(id__in=all_ids)
    }

    # Compute metrics
    candidates = []
    for (a, b), count in pair_counts.items():
        if count < min_support:
            continue
        support_a = product_counts[a] / total_orders
        support_b = product_counts[b] / total_orders
        support_ab = count / total_orders
        confidence_ab = count / product_counts[a]
        confidence_ba = count / product_counts[b]
        expected_ab = support_a * support_b
        lift = (support_ab / expected_ab) if expected_ab > 0 else 0

        candidates.append({
            'a_id': a,
            'a_name': names.get(a, ('Unknown', ''))[0],
            'a_sku': names.get(a, ('', ''))[1],
            'b_id': b,
            'b_name': names.get(b, ('Unknown', ''))[0],
            'b_sku': names.get(b, ('', ''))[1],
            'co_occurrences': count,
            'support': round(support_ab, 4),
            'confidence_a_to_b': round(confidence_ab, 3),
            'confidence_b_to_a': round(confidence_ba, 3),
            'lift': round(lift, 2),
        })

    # Sort by lift * co_occurrences (impact)
    candidates.sort(key=lambda c: c['lift'] * c['co_occurrences'], reverse=True)
    candidates = candidates[:limit]

    return Response({
        'window_days': days,
        'total_orders': total_orders,
        'min_support': min_support,
        'bundles': candidates,
    })


# ============================================================================
# 7. SUMMARY — all-in-one dashboard payload
# ============================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ai_summary(request):
    """
    Single request that returns top movers, urgent restocks, and today's
    anomalies — used on the main dashboard.
    """
    tenant = _tenant(request)
    today = timezone.localtime().date()

    # Top 5 fast movers (last 30d)
    start = today - timedelta(days=29)
    items = _sales_in_window(tenant, start, today).values(
        'product_id', 'product__name', 'product__sku',
    ).annotate(
        units=Sum('quantity'),
        revenue=Sum('unit_price'),
    ).order_by('-units')[:5]

    fast_movers = [
        {
            'product_id': row['product_id'],
            'name': row['product__name'],
            'sku': row['product__sku'],
            'units_sold': row['units'] or 0,
            'revenue': float(row['revenue'] or 0),
            'velocity_per_day': round((row['units'] or 0) / 30, 2),
        }
        for row in items
    ]

    # Urgent restocks
    sales_map = {
        row['product_id']: row['units'] or 0
        for row in _sales_in_window(tenant, start, today)
        .values('product_id').annotate(units=Sum('quantity'))
    }

    urgent = []
    for p in Product.all_objects.filter(tenant=tenant):
        units = sales_map.get(p.id, 0)
        avg_daily = units / 30
        reorder_point = avg_daily * 10
        if avg_daily > 0 and p.quantity <= reorder_point:
            suggested = max(0, int(round((avg_daily * 30) - p.quantity)))
            urgent.append({
                'product_id': p.id,
                'name': p.name,
                'sku': p.sku,
                'current_quantity': p.quantity,
                'suggested_quantity': suggested,
                'velocity_per_day': round(avg_daily, 2),
            })

    urgent.sort(key=lambda u: u['current_quantity'])
    urgent = urgent[:5]

    return Response({
        'fast_movers': fast_movers,
        'urgent_restock': urgent,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sales_per_staff(request):
    """
    Sales aggregated by user (staff member).
    Query params:
      ?days=30
    """
    from apps.accounts.models import User

    tenant = _tenant(request)
    days = int(request.query_params.get('days', 30))
    start, today = _date_window(days)

    sales = (
        Sale.objects.filter(
            tenant=tenant,
            created_at__date__gte=start,
            created_at__date__lte=today,
        )
        .values('user_id', 'user__username', 'user__first_name', 'user__last_name', 'user__role')
        .annotate(
            total_sales=Sum('total_amount'),
            transaction_count=Count('id'),
        )
        .order_by('-total_sales')
    )

    # Compute profit for each user
    items_by_user = (
        SaleItem.objects.filter(
            sale__tenant=tenant,
            sale__created_at__date__gte=start,
            sale__created_at__date__lte=today,
        )
        .values('sale__user_id')
        .annotate(
            revenue=Sum('unit_price'),
            cost=Sum('cost_price'),
        )
    )
    profit_map = {}
    for row in items_by_user:
        uid = row['sale__user_id']
        revenue = float(row['revenue'] or 0)
        cost = float(row['cost'] or 0)
        profit_map[uid] = revenue - cost

    # Compute average transaction value
    rows = []
    for s in sales:
        uid = s['user_id']
        count = s['transaction_count'] or 0
        total = float(s['total_sales'] or 0)
        full_name = f"{s['user__first_name'] or ''} {s['user__last_name'] or ''}".strip()
        rows.append({
            'user_id': uid,
            'username': s['user__username'],
            'full_name': full_name or s['user__username'],
            'role': s['user__role'],
            'total_sales': total,
            'transaction_count': count,
            'avg_transaction': round(total / count, 2) if count else 0,
            'profit': round(profit_map.get(uid, 0), 2),
        })

    total_sales_all = sum(r['total_sales'] for r in rows)
    total_profit_all = sum(r['profit'] for r in rows)

    # Rank + share
    for i, r in enumerate(rows):
        r['rank'] = i + 1
        r['share_pct'] = round((r['total_sales'] / total_sales_all * 100), 1) if total_sales_all else 0

    return Response({
        'window_days': days,
        'period': {'start': start.isoformat(), 'end': today.isoformat()},
        'summary': {
            'total_staff': len(rows),
            'total_sales': total_sales_all,
            'total_profit': total_profit_all,
            'top_seller': rows[0]['full_name'] if rows else None,
        },
        'rows': rows,
    })