'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProductPicker from '@/components/ProductPicker';
import Pagination from '@/components/Pagination';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePagination } from '@/lib/usePagination';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';
import { openWhatsApp, renderTemplate, DEFAULT_TEMPLATES } from '@/lib/whatsapp';

export default function SalesPage() {
  const toast = useToast();
  const { enabled_features, role } = useTenantContext();
  // Admins and managers may give any discount and (after confirming) sell
  // below cost; other staff are held to the business's discount limit.
  const canOverridePrice = ['admin', 'manager', 'super'].includes(role);
  const isPharmacy = enabled_features.includes('batch_tracking') ||
                     enabled_features.includes('expiry');

  const [sales, setSales] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState({});
  const [currency, setCurrency] = useState('UGX');
  const [form, setForm] = useState({
    reference: '', customer_name: '', customer_phone: '',
    payment_type: 'cash', amount_paid: '', notes: '',
  });
  const [items, setItems] = useState([
    { product: '', quantity: 1, unit_price: 0 },
  ]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const load = async () => {
    const [s, p, gs] = await Promise.all([
      api.get('/sales/'),
      api.get('/inventory/products/'),
      api.get('/auth/settings/'),
    ]);
    setSales(s.data);
    setProducts(p.data);
    setSettings(gs.data);
    setCurrency(gs.data.currency_symbol || 'UGX');
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);

  const addItem = () =>
    setItems([...items, { product: '', quantity: 1, unit_price: 0 }]);

  const removeItem = (i) =>
    setItems(items.filter((_, idx) => idx !== i));

  const updateItem = (i, field, value) => {
    const copy = [...items];
    copy[i][field] = value;
    if (field === 'product') {
      const p = products.find((x) => x.id === parseInt(value));
      if (p) copy[i].unit_price = parseFloat(p.selling_price);
    }
    setItems(copy);
  };

  const total = items.reduce(
    (s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0
  );

  // How much below each product's normal price this sale is going.
  const discountLimit = parseFloat(settings?.max_discount_percent ?? 10);
  const totalDiscount = items.reduce((sum, i) => {
    const p = products.find((x) => x.id === parseInt(i.product));
    if (!p) return sum;
    const off = parseFloat(p.selling_price) - (parseFloat(i.unit_price) || 0);
    return off > 0 ? sum + off * (parseInt(i.quantity) || 0) : sum;
  }, 0);

  // Cash, mobile money and card are paid in full on the spot.
  const paidInFull = ['cash', 'mobile_money', 'card'].includes(form.payment_type);

  useEffect(() => {
    if (paidInFull) {
      setForm((f) => ({ ...f, amount_paid: total.toString() }));
    } else if (form.payment_type === 'credit') {
      setForm((f) => ({ ...f, amount_paid: '0' }));
    }
    // eslint-disable-next-line
  }, [form.payment_type, total]);

  const generateRef = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `SL-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  const resetForm = () => {
    setForm({
      reference: generateRef(),
      customer_name: '', customer_phone: '',
      payment_type: 'cash', amount_paid: '', notes: '',
    });
    setItems([{ product: '', quantity: 1, unit_price: 0 }]);
  };
  useEffect(() => { resetForm(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (items.some((i) => !i.product || i.quantity <= 0)) {
      const msg = 'Please pick a product and quantity for every line.';
      setError(msg); toast.error(msg); return;
    }
    const paid = parseFloat(form.amount_paid || 0);
    if (paidInFull && paid < total) {
      const msg = `This payment type must be paid in full. Total is ${money(total)}. Use Partial or Credit otherwise.`;
      setError(msg); toast.error(msg); return;
    }
    if (form.payment_type === 'credit' && paid > 0) {
      const msg = 'Credit sales should have Amount Paid = 0.';
      setError(msg); toast.error(msg); return;
    }
    if (form.payment_type === 'partial' && (paid <= 0 || paid >= total)) {
      const msg = 'Partial payments must be greater than 0 and less than the total.';
      setError(msg); toast.error(msg); return;
    }

    const payload = {
      ...form,
      amount_paid: paid,
      items: items.map((i) => ({
        product: parseInt(i.product),
        quantity: parseInt(i.quantity),
        unit_price: parseFloat(i.unit_price),
      })),
    };

    setSaving(true);
    try {
      try {
        await api.post('/sales/', payload);
      } catch (err) {
        const belowCost = err.response?.data?.below_cost;
        if (!belowCost) throw err;
        // A manager / admin selling below cost: confirm, then resend.
        const ok = window.confirm(
          `${belowCost.join('\n')}\n\nThis sale will make a loss. Sell below cost anyway?`
        );
        if (!ok) return;
        await api.post('/sales/', { ...payload, allow_below_cost: true });
      }
      toast.success(`Sale saved — ${money(total)}`);
      resetForm();
      load();
    } catch (err) {
      const msg = saleErrorMessage(err.response?.data);
      setError(msg); toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const printReceipt = async (saleId) => {
    try {
      const res = await api.get(`/sales/${saleId}/receipt/`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      toast.success('Receipt opened');
    } catch {
      toast.error('Could not generate receipt.');
    }
  };

  const sendReceiptWhatsApp = (sale) => {
    if (!sale.customer_phone) {
      toast.warning('This sale has no customer phone number.');
      return;
    }
    const template = settings.whatsapp_template_receipt || DEFAULT_TEMPLATES.sale_receipt;
    const message = renderTemplate(template, {
      name: sale.customer_name || 'customer',
      reference: sale.reference,
      date: new Date(sale.created_at).toLocaleDateString(),
      amount: money(sale.total_amount),
      paid: money(sale.amount_paid),
      balance: money(sale.balance),
      business: settings.name || 'our business',
    });
    openWhatsApp(sale.customer_phone, message);
    toast.success(`Opening WhatsApp…`);
  };

  const money = (n) => formatMoney(n, currency);
  const badgeClass = (status) => {
    if (status === 'paid') return 'badge badge-green';
    if (status === 'partial') return 'badge badge-amber';
    return 'badge badge-red';
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      if (filterPayment !== 'all' && s.payment_type !== filterPayment) return false;
      const debtBal = parseFloat(s.debt_balance || 0);
      const liveStatus =
        s.debt_status === 'paid' || (debtBal <= 0) ? 'paid'
        : s.debt_status === 'partial' ? 'partial'
        : 'unpaid';
      if (filterStatus !== 'all' && liveStatus !== filterStatus) return false;
      if (!q) return true;
      return (
        (s.reference || '').toLowerCase().includes(q) ||
        (s.customer_name || '').toLowerCase().includes(q) ||
        (s.customer_phone || '').toLowerCase().includes(q)
      );
    });
  }, [sales, search, filterPayment, filterStatus]);

  const pg = usePagination(filtered, 10);

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Sales</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record new sales and print or WhatsApp receipts.
          {isPharmacy && ' Batch numbers and expiry dates appear on receipts.'}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      <form onSubmit={submit} className="card mb-6">
        <p className="card-title">New Sale</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div><label>Reference</label>
            <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} required /></div>
          <div><label>Customer Name</label>
            <input placeholder="Walk-in" value={form.customer_name}
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
          <div><label>Customer Phone</label>
            <input placeholder="Optional" value={form.customer_phone}
              onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} /></div>
          <div><label>Payment Type</label>
            <select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })}>
              <option value="cash">Cash (full payment)</option>
              <option value="mobile_money">Mobile money (full payment)</option>
              <option value="card">Card (full payment)</option>
              <option value="credit">Credit (unpaid)</option>
              <option value="partial">Partial (some paid)</option>
            </select></div>
          <div><label>Amount Paid</label>
            <input type="number" step="0.01" min="0" placeholder="0" value={form.amount_paid}
              onChange={(e) => setForm({ ...form, amount_paid: e.target.value })} /></div>
          <div><label>Notes</label>
            <input placeholder="Optional" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>

        {form.payment_type !== 'cash' && total > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <b>Balance owed:</b> {money(Math.max(0, total - (parseFloat(form.amount_paid) || 0)))}
            {' '}— will be recorded as a receivable debt.
          </div>
        )}

        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Items</p>
            <button type="button" onClick={addItem} className="btn btn-secondary btn-sm">+ Add item</button>
          </div>
          <div className="space-y-3">
            <div className="hidden md:grid grid-cols-12 gap-2 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <span className="col-span-5">Product</span>
              <span className="col-span-2">Qty</span>
              <span className="col-span-2">Unit price</span>
              <span className="col-span-2 text-right">Subtotal</span>
            </div>
            {items.map((it, i) => {
              const selected = products.find((p) => p.id === parseInt(it.product));
              const outOfStock = selected && !selected.is_service && it.quantity > selected.quantity;
              return (
                <div key={i} className="p-3 border border-slate-200 rounded-lg">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 md:col-span-5">
                      <label className="md:hidden">Product</label>
                      <ProductPicker
                        products={products}
                        value={it.product}
                        currency={currency}
                        onChange={(id, product) => {
                          updateItem(i, 'product', id);
                          if (product) updateItem(i, 'unit_price', parseFloat(product.selling_price));
                        }}
                      />
                      {selected && isPharmacy && (selected.batch_number || selected.expiry_date) && (
                        <p className="text-xs text-blue-600 mt-1">
                          {selected.batch_number && <>Batch: <b>{selected.batch_number}</b></>}
                          {selected.batch_number && selected.expiry_date && ' · '}
                          {selected.expiry_date && <>Exp: {selected.expiry_date}</>}
                        </p>
                      )}
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="md:hidden">Qty</label>
                      <input type="number" min="1" value={it.quantity}
                        onChange={(e) => updateItem(i, 'quantity', parseInt(e.target.value) || 0)} required /></div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="md:hidden">Unit Price</label>
                      <input type="number" step="0.01" value={it.unit_price}
                        onChange={(e) => updateItem(i, 'unit_price', parseFloat(e.target.value) || 0)} required /></div>
                    <div className="col-span-3 md:col-span-2 text-right">
                      <label className="md:hidden">Subtotal</label>
                      <p className="py-2 text-sm font-semibold">{money((it.quantity || 0) * (it.unit_price || 0))}</p></div>
                    <div className="col-span-1 flex justify-end">
                      {items.length > 1 && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(i)}>✕</button>
                      )}
                    </div>
                    {outOfStock && (
                      <div className="col-span-12 text-xs text-red-600">
                        ⚠ Only {selected.quantity} in stock for {selected.name}.
                      </div>
                    )}
                    {selected && (
                      <PriceNote
                        price={parseFloat(it.unit_price) || 0}
                        normal={parseFloat(selected.selling_price) || 0}
                        cost={parseFloat(selected.cost_price) || 0}
                        quantity={parseInt(it.quantity) || 0}
                        limit={discountLimit}
                        canOverride={canOverridePrice}
                        money={money}
                        onReset={() => updateItem(i, 'unit_price', parseFloat(selected.selling_price))}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-end gap-6">
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold">Total</p>
              <p className="text-2xl font-bold text-slate-900">{money(total)}</p>
            </div>
            {totalDiscount > 0 && (
              <div className="pb-0.5">
                <p className="text-xs text-slate-500 uppercase font-semibold">Discount given</p>
                <p className="text-base font-semibold text-emerald-700">
                  −{money(totalDiscount)}
                  <span className="text-xs font-normal text-slate-500 ml-1.5">
                    (normal price {money(total + totalDiscount)})
                  </span>
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Clear</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Sale'}
            </button>
          </div>
        </div>
      </form>

      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2"><label>Search</label>
            <input placeholder="Reference, customer name, or phone…"
              value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div><label>Payment</label>
            <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)}>
              <option value="all">All payments</option>
              <option value="cash">Cash</option>
              <option value="mobile_money">Mobile money</option>
              <option value="card">Card</option>
              <option value="credit">Credit</option>
              <option value="partial">Partial</option>
            </select></div>
          <div><label>Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select></div>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Reference</th><th>Date</th><th>Customer</th><th>Payment</th>
              <th className="text-right">Total</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Balance</th>
              <th>Status</th><th>Debt</th><th></th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.length === 0 && (
              <tr><td colSpan={10} className="text-center text-slate-400 py-8">
                {!loaded
                  ? 'Loading sales…'
                  : search || filterPayment !== 'all' || filterStatus !== 'all'
                    ? 'No sales match your filters.'
                    : 'No sales recorded yet.'}
              </td></tr>
            )}
            {pg.pageItems.map((s) => {
              const debtBal = parseFloat(s.debt_balance || 0);
              let liveStatus;
              if (s.debt_status === 'paid' || (debtBal === 0 && parseFloat(s.balance) > 0 && s.debt_status === 'settled')) {
                liveStatus = 'paid';
              } else if (debtBal > 0 && s.debt_status === 'partial') {
                liveStatus = 'partial';
              } else if (debtBal > 0) {
                liveStatus = 'unpaid';
              } else {
                liveStatus = 'paid';
              }
              return (
                <tr key={s.id}>
                  <td className="font-mono text-xs">{s.reference}</td>
                  <td className="whitespace-nowrap">{new Date(s.created_at).toLocaleString()}</td>
                  <td>{s.customer_name || 'Walk-in'}</td>
                  <td className="capitalize">{(s.payment_type || "").replace(/_/g, " ")}</td>
                  <td className="text-right font-medium">
                    {money(s.total_amount)}
                    {s.total_discount > 0 && (
                      <span className="block text-[11px] font-normal text-emerald-700">
                        −{money(s.total_discount)} off
                      </span>
                    )}
                  </td>
                  <td className="text-right">{money(s.amount_paid)}</td>
                  <td className={`text-right ${parseFloat(s.balance) > 0 ? 'text-red-600 font-semibold' : ''}`}>
                    {money(s.balance)}
                  </td>
                  <td><span className={badgeClass(liveStatus)}>{liveStatus}</span></td>
                  <td>
                    {debtBal > 0 ? (
                      <Link href={`/debts?search=${encodeURIComponent(s.reference)}`}
                        className="badge badge-red hover:bg-red-200">
                        {money(debtBal)} owed
                      </Link>
                    ) : (
                      <span className="badge badge-green">settled</span>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-secondary btn-sm mr-1"
                      onClick={() => printReceipt(s.id)} title="Open printable receipt">🧾</button>
                    {s.customer_phone && (
                      <button className="btn btn-success btn-sm"
                        onClick={() => sendReceiptWhatsApp(s)} title="Send via WhatsApp">💬</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={pg.page} totalPages={pg.totalPages} goTo={pg.setPage}
        startIndex={pg.startIndex} endIndex={pg.endIndex}
        totalItems={filtered.length} label="sales" />
    </ProtectedRoute>
  );
}

/** Turn the API's validation errors into one readable message. */
function saleErrorMessage(data) {
  if (!data) return 'Could not save sale. Check your connection.';
  if (typeof data === 'string') return 'Could not save sale.';
  if (data.detail) return data.detail;
  const lines = [];
  for (const [field, value] of Object.entries(data)) {
    const list = Array.isArray(value) ? value : [value];
    for (const v of list) {
      if (typeof v === 'string') lines.push(v);
      else if (v && typeof v === 'object') lines.push(...Object.values(v).flat().map(String));
      else lines.push(`${field}: ${v}`);
    }
  }
  return lines.join(' ') || 'Could not save sale.';
}

/**
 * Under a sale line: how the price compares with the product's normal price
 * and cost, and whether this user is allowed to charge it.
 */
function PriceNote({ price, normal, cost, quantity, limit, canOverride, money, onReset }) {
  if (!normal || price === normal) return null;
  const reset = (
    <button type="button" onClick={onReset} className="ml-2 underline hover:no-underline">
      Use normal price
    </button>
  );

  if (cost > 0 && price < cost) {
    return (
      <div className="col-span-12 text-xs rounded-md bg-red-50 text-red-700 px-2.5 py-1.5">
        ⛔ {money(price)} is below cost ({money(cost)}): a loss of {money((cost - price) * quantity)}.
        {canOverride ? ' You will be asked to confirm.' : ' Only a manager or admin can sell below cost.'}
        {reset}
      </div>
    );
  }

  if (price > normal) {
    return (
      <div className="col-span-12 text-xs text-slate-500">
        Above the normal price of {money(normal)}.{reset}
      </div>
    );
  }

  const pct = ((normal - price) / normal) * 100;
  const off = (normal - price) * quantity;
  if (!canOverride && pct > limit + 0.005) {
    return (
      <div className="col-span-12 text-xs rounded-md bg-amber-50 text-amber-800 px-2.5 py-1.5">
        ⚠ {pct.toFixed(0)}% off is more than your {limit.toFixed(0)}% discount limit. The lowest you can
        charge is {money(normal * (1 - limit / 100))}. Ask a manager or admin for a bigger discount.
        {reset}
      </div>
    );
  }
  return (
    <div className="col-span-12 text-xs text-emerald-700">
      🏷️ Normal price {money(normal)} · {pct.toFixed(pct < 10 ? 1 : 0)}% off ({money(off)} discount)
      {reset}
    </div>
  );
}
