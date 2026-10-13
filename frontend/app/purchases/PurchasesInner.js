'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProductPicker from '@/components/ProductPicker';
import Pagination from '@/components/Pagination';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePagination } from '@/lib/usePagination';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';

const UNITS_PHARMACY = [
  { value: 'tablet',    label: 'Tablets' },
  { value: 'capsule',   label: 'Capsules' },
  { value: 'syrup',     label: 'Syrup (ml)' },
  { value: 'injection', label: 'Injection' },
  { value: 'cream',     label: 'Cream' },
  { value: 'strip',     label: 'Strip' },
];

const UNITS_AGRO = [
  { value: 'kg',      label: 'Kilogram (kg)' },
  { value: 'g',       label: 'Gram (g)' },
  { value: 'L',       label: 'Litre (L)' },
  { value: 'ml',      label: 'Millilitre (ml)' },
  { value: 'bag',     label: 'Bag (50kg)' },
  { value: 'sack',    label: 'Sack' },
  { value: 'sachet',  label: 'Sachet' },
  { value: 'bottle',  label: 'Bottle' },
  { value: 'pack',    label: 'Pack' },
  { value: 'piece',   label: 'Piece' },
];

const EMPTY_LINE = {
  product: '',
  quantity: 1,
  unit_cost: 0,
  batch_number: '',
  expiry_date: '',
  manufacturer: '',
  unit: '',
  barcode: '',
};

export default function PurchasesInner() {
  const toast = useToast();
  const { enabled_features } = useTenantContext();
  const searchParams = useSearchParams();

  const isDrugshop  = enabled_features.includes('batch_tracking') ||
                      enabled_features.includes('prescriptions');
  const isAgro      = enabled_features.includes('expiry') && !isDrugshop;
  const needsExpiry = enabled_features.includes('expiry') || isDrugshop;

  const unitOptions = isDrugshop ? UNITS_PHARMACY : (isAgro ? UNITS_AGRO : []);

  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [form, setForm] = useState({
    reference: '', supplier: '', status: 'pending',
    amount_paid: '', notes: '',
  });
  const [items, setItems] = useState([{ ...EMPTY_LINE }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const generateRef = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `PO-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  const load = async () => {
    const [p, pr, s, gs] = await Promise.all([
      api.get('/purchases/'),
      api.get('/inventory/products/'),
      api.get('/inventory/suppliers/'),
      api.get('/auth/settings/'),
    ]);
    setPurchases(p.data);
    setProducts(pr.data);
    setSuppliers(s.data);
    setCurrency(gs.data.currency_symbol || 'UGX');
  };

  useEffect(() => {
    load();
    const pid = searchParams.get('product');
    const qty = searchParams.get('quantity');
    const supp = searchParams.get('supplier');
    if (pid && qty) {
      setForm((f) => ({
        ...f,
        reference: f.reference || generateRef(),
        supplier: supp || f.supplier,
      }));
      setItems([{ ...EMPTY_LINE, product: pid, quantity: parseInt(qty) }]);
    } else {
      setForm((f) => ({ ...f, reference: f.reference || generateRef() }));
    }
    // eslint-disable-next-line
  }, []);

  const addItem = () => setItems([...items, { ...EMPTY_LINE }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const updateItem = (i, field, value) => {
    const copy = [...items];
    copy[i][field] = value;
    if (field === 'product') {
      const p = products.find((x) => x.id === parseInt(value));
      if (p) {
        copy[i].unit_cost = parseFloat(p.cost_price);
        if (needsExpiry && p.unit) copy[i].unit = p.unit;
        if (needsExpiry && p.manufacturer) copy[i].manufacturer = p.manufacturer;
      }
    }
    setItems(copy);
  };

  const total = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);

  const resetForm = () => {
    setForm({ reference: generateRef(), supplier: '', status: 'pending', amount_paid: '', notes: '' });
    setItems([{ ...EMPTY_LINE }]);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (items.some((i) => !i.product || i.quantity <= 0)) {
      const msg = 'Please pick a product and quantity for every line.';
      setError(msg); toast.error(msg); return;
    }
    if (isDrugshop && items.some((i) => !i.batch_number)) {
      const msg = 'Every line must have a batch number.';
      setError(msg); toast.error(msg); return;
    }
    if (needsExpiry && items.some((i) => !i.expiry_date)) {
      const msg = 'Every line must have an expiry date.';
      setError(msg); toast.error(msg); return;
    }
    setSaving(true);
    try {
      await api.post('/purchases/', {
        ...form,
        amount_paid: parseFloat(form.amount_paid || 0),
        items: items.map((i) => ({
          product: parseInt(i.product),
          quantity: parseInt(i.quantity),
          unit_cost: parseFloat(i.unit_cost),
          batch_number: i.batch_number || '',
          expiry_date: i.expiry_date || null,
          manufacturer: i.manufacturer || '',
          unit: i.unit || '',
        })),
      });
      toast.success(`Purchase saved — ${money(total)}`);
      resetForm();
      load();
    } catch (err) {
      const data = err.response?.data;
      const msg = data?.detail || (typeof data === 'object' ? JSON.stringify(data) : 'Could not save purchase.');
      setError(msg); toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const money = (n) => formatMoney(n, currency);
  const statusBadge = (s) => {
    if (s === 'received') return 'badge badge-green';
    if (s === 'cancelled') return 'badge badge-red';
    return 'badge badge-amber';
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchases.filter((p) => {
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (!q) return true;
      return (
        (p.reference || '').toLowerCase().includes(q) ||
        (p.supplier_name || '').toLowerCase().includes(q)
      );
    });
  }, [purchases, search, filterStatus]);

  const pg = usePagination(filtered, 10);

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Purchases</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record purchases from suppliers.
          {needsExpiry && ' Capture batch numbers and expiry dates per item.'}
          {' '}Set status to <b>Received</b> to add stock automatically.
        </p>
      </div>

      {searchParams.get('product') && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
          🤖 Prefilled from AI suggestion — review and save when ready.
        </div>
      )}

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}

      <form onSubmit={submit} className="card mb-6">
        <p className="card-title">New Purchase Order</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div><label>Reference</label>
            <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} required /></div>
          <div><label>Supplier</label>
            <select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}>
              <option value="">— Select supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div><label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="pending">Pending (stock not added)</option>
              <option value="received">Received (add to stock)</option>
              <option value="cancelled">Cancelled</option>
            </select></div>
          <div><label>Amount Paid</label>
            <input type="number" step="0.01" min="0" placeholder="0" value={form.amount_paid}
              onChange={(e) => setForm({ ...form, amount_paid: e.target.value })} /></div>
          <div className="md:col-span-2"><label>Notes</label>
            <input placeholder="Optional" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Items</p>
            <button type="button" onClick={addItem} className="btn btn-secondary btn-sm">+ Add item</button>
          </div>

          {needsExpiry && (
            <div className={`mb-3 p-2 border rounded text-xs ${
              isDrugshop
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              {isDrugshop
                ? '💊 Batch number and expiry date are required per item for this business type.'
                : '🌾 Batch number and expiry date are recommended per item for expiry tracking.'}
            </div>
          )}

          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className={`p-3 rounded-lg border-2 ${
                isDrugshop
                  ? 'border-blue-200 bg-blue-50/30'
                  : isAgro
                  ? 'border-amber-200 bg-amber-50/30'
                  : 'border-slate-200 bg-slate-50/30'
              }`}>
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 md:col-span-5">
                    <label className="text-xs">Product *</label>
                    <ProductPicker products={products} value={it.product} currency={currency}
                      priceField="cost_price"
                      onChange={(id, product) => {
                        updateItem(i, 'product', id);
                        if (product) {
                          updateItem(i, 'unit_cost', parseFloat(product.cost_price));
                          if (needsExpiry && product.unit) updateItem(i, 'unit', product.unit);
                          if (needsExpiry && product.manufacturer) updateItem(i, 'manufacturer', product.manufacturer);
                        }
                      }} />
                  </div>
                  <div className="col-span-4 md:col-span-2"><label className="text-xs">Qty</label>
                    <input type="number" min="1" value={it.quantity}
                      onChange={(e) => updateItem(i, 'quantity', parseInt(e.target.value) || 0)} required /></div>
                  <div className="col-span-4 md:col-span-2"><label className="text-xs">Unit Cost</label>
                    <input type="number" step="0.01" value={it.unit_cost}
                      onChange={(e) => updateItem(i, 'unit_cost', parseFloat(e.target.value) || 0)} required /></div>
                  <div className="col-span-3 md:col-span-2 text-right"><label className="text-xs">Subtotal</label>
                    <p className="py-2 text-sm font-semibold">{money((it.quantity || 0) * (it.unit_cost || 0))}</p></div>
                  <div className="col-span-1 flex justify-end">
                    {items.length > 1 && (
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(i)}>✕</button>
                    )}
                  </div>
                </div>

                {needsExpiry && (
                  <div className={`mt-3 pt-3 border-t ${
                    isDrugshop ? 'border-blue-200' : 'border-amber-200'
                  }`}>
                    <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${
                      isDrugshop ? 'text-blue-800' : 'text-amber-800'
                    }`}>
                      {isDrugshop ? '💊 Drug Details' : '🌾 Batch & Expiry'}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <label className="text-xs">
                          Batch # {isDrugshop && <span className="text-red-600">*</span>}
                        </label>
                        <input value={it.batch_number}
                          onChange={(e) => updateItem(i, 'batch_number', e.target.value)}
                          placeholder="BATCH-2026-01"
                          required={isDrugshop} />
                      </div>
                      <div>
                        <label className="text-xs">
                          Expiry <span className="text-red-600">*</span>
                        </label>
                        <input type="date" value={it.expiry_date}
                          onChange={(e) => updateItem(i, 'expiry_date', e.target.value)}
                          required={needsExpiry} />
                      </div>
                      <div>
                        <label className="text-xs">
                          {isDrugshop ? 'Manufacturer' : 'Manufacturer / Importer'}
                        </label>
                        <input value={it.manufacturer}
                          onChange={(e) => updateItem(i, 'manufacturer', e.target.value)}
                          placeholder={isDrugshop ? 'Cipla' : 'Yara, Bayer'} />
                      </div>
                      <div>
                        <label className="text-xs">Unit</label>
                        <select value={it.unit} onChange={(e) => updateItem(i, 'unit', e.target.value)}>
                          <option value="">—</option>
                          {unitOptions.map((u) => (
                            <option key={u.value} value={u.value}>{u.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap justify-between items-center gap-3">
          <div>
            <p className="text-xs text-slate-500 uppercase font-semibold">Total</p>
            <p className="text-2xl font-bold text-slate-900">{money(total)}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Clear</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : '💾 Save Purchase Order'}
            </button>
          </div>
        </div>
      </form>

      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2"><label>Search</label>
            <input placeholder="Reference or supplier…"
              value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div><label>Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select></div>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Reference</th><th>Date</th><th>Supplier</th><th>Status</th>
              <th className="text-right">Total</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-400 py-8">
                {search || filterStatus !== 'all' ? 'No purchases match your filters.' : 'No purchases yet.'}
              </td></tr>
            )}
            {pg.pageItems.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-xs">{p.reference}</td>
                <td className="whitespace-nowrap">{new Date(p.created_at).toLocaleString()}</td>
                <td>{p.supplier_name || '—'}</td>
                <td><span className={statusBadge(p.status)}>{p.status}</span></td>
                <td className="text-right font-medium">{money(p.total_amount)}</td>
                <td className="text-right">{money(p.amount_paid)}</td>
                <td className={`text-right ${parseFloat(p.balance) > 0 ? 'text-red-600 font-semibold' : ''}`}>
                  {money(p.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={pg.page} totalPages={pg.totalPages} goTo={pg.setPage}
        startIndex={pg.startIndex} endIndex={pg.endIndex}
        totalItems={filtered.length} label="purchases" />
    </ProtectedRoute>
  );
}