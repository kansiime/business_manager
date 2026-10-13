'use client';
import { useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useUser, can } from '@/lib/useUser';
import { useTenantContext } from '@/lib/useTenantContext';
import { useToast } from '@/components/Toast';

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateSKU(name) {
  if (!name) return '';
  const base = slugify(name).slice(0, 20);
  const suffix = Date.now().toString().slice(-4);
  return `${base}-${suffix}`.toUpperCase();
}

const EMPTY_FORM = {
  name: '',
  sku: '',
  category: '',
  supplier: '',
  cost_price: '',
  selling_price: '',
  quantity: '',
  reorder_level: 5,
  expiry_date: '',
  batch_number: '',
  manufacturer: '',
  unit: '',
  barcode: '',
  notes: '',
};

// Unit / pack options by business type.
const UNITS_PHARMACY = [
  { value: 'tablet',    label: 'Tablets' },
  { value: 'capsule',   label: 'Capsules' },
  { value: 'syrup',     label: 'Syrup (ml)' },
  { value: 'injection', label: 'Injection' },
  { value: 'cream',     label: 'Cream / Ointment' },
  { value: 'drops',     label: 'Drops' },
  { value: 'inhaler',   label: 'Inhaler' },
  { value: 'sachet',    label: 'Sachet' },
  { value: 'bottle',    label: 'Bottle' },
  { value: 'tube',      label: 'Tube' },
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

export default function InventoryPage() {
  const user = useUser();
  const toast = useToast();
  const { enabled_features } = useTenantContext();
  const canManage = can.viewInventoryCost(user);

  const isDrugshop = enabled_features.includes('batch_tracking') ||
                     enabled_features.includes('prescriptions');
  const isAgro     = enabled_features.includes('expiry') && !isDrugshop;
  const needsExpiry = enabled_features.includes('expiry') || isDrugshop;
  const needsBarcode = enabled_features.includes('barcode');

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [skuTouched, setSkuTouched] = useState(false);
  const [stockModal, setStockModal] = useState(null);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = async () => {
    const requests = [
      api.get('/inventory/products/'),
      api.get('/auth/settings/'),
    ];
    if (canManage) {
      requests.push(api.get('/inventory/categories/'));
      requests.push(api.get('/inventory/suppliers/'));
    }
    const [p, gs, c, s] = await Promise.all(requests);
    setProducts(p.data);
    setCurrency(gs.data.currency_symbol || 'UGX');
    if (c) setCategories(c.data);
    if (s) setSuppliers(s.data);
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line
  }, [user]);

  const handleNameChange = (value) => {
    setForm((f) => {
      const next = { ...f, name: value };
      if (!editing && !skuTouched) next.sku = generateSKU(value);
      return next;
    });
  };

  const handleSkuChange = (value) => {
    setSkuTouched(true);
    setForm((f) => ({ ...f, sku: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (isDrugshop && !form.batch_number) {
      const msg = 'Batch number is required for pharmacy products.';
      setError(msg); toast.error(msg); return;
    }
    if (needsExpiry && !form.expiry_date) {
      const msg = 'Expiry date is required for this business type.';
      setError(msg); toast.error(msg); return;
    }

    try {
      const payload = { ...form, expiry_date: form.expiry_date || null };
      if (editing) {
        await api.put(`/inventory/products/${editing}/`, payload);
        toast.success('Product updated');
      } else {
        await api.post('/inventory/products/', payload);
        toast.success('Product added');
      }
      setForm(EMPTY_FORM);
      setEditing(null);
      setSkuTouched(false);
      load();
    } catch (err) {
      const d = err.response?.data;
      const msg = d?.sku?.[0] || d?.name?.[0]
        || (typeof d === 'object' ? JSON.stringify(d) : 'Could not save product.');
      setError(msg); toast.error(msg);
    }
  };

  const del = async (id) => {
    if (!confirm('Delete this product?')) return;
    try {
      await api.delete(`/inventory/products/${id}/`);
      toast.success('Product deleted');
      load();
    } catch {
      toast.error('Could not delete.');
    }
  };

  const edit = (p) => {
    setEditing(p.id);
    setSkuTouched(true);
    setForm({
      name: p.name,
      sku: p.sku,
      category: p.category || '',
      supplier: p.supplier || '',
      cost_price: p.cost_price,
      selling_price: p.selling_price,
      quantity: p.quantity,
      reorder_level: p.reorder_level,
      expiry_date: p.expiry_date || '',
      batch_number: p.batch_number || '',
      manufacturer: p.manufacturer || '',
      unit: p.unit || '',
      barcode: p.barcode || '',
      notes: p.notes || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openStockModal = (product, type = 'in') => {
    setStockModal({ product, quantity: '', notes: '', type });
  };

  const submitStock = async (e) => {
    e.preventDefault();
    try {
      await api.post('/inventory/movements/', {
        product: stockModal.product.id,
        movement_type: stockModal.type,
        quantity: parseInt(stockModal.quantity),
        notes: stockModal.notes,
        reference: 'Manual adjustment',
      });
      toast.success('Stock updated');
      setStockModal(null);
      load();
    } catch {
      toast.error('Could not update stock.');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.category_name || '').toLowerCase().includes(q) ||
        (p.supplier_name || '').toLowerCase().includes(q) ||
        (p.batch_number || '').toLowerCase().includes(q)
    );
  }, [products, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageItems = filtered.slice(startIndex, endIndex);

  useEffect(() => { setPage(1); }, [search, pageSize]);
  const goTo = (p) => setPage(Math.max(1, Math.min(totalPages, p)));

  const expiryClass = (p) => {
    const days = p.days_to_expiry;
    if (days === null || days === undefined) return '';
    if (days < 0) return 'text-red-600 font-bold';
    if (days <= 30) return 'text-amber-600 font-semibold';
    return 'text-slate-500';
  };

  // Which unit options to show: pharmacy wins if both flags set.
  const unitOptions = isDrugshop ? UNITS_PHARMACY : (isAgro ? UNITS_AGRO : []);

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">
            {products.length} product{products.length !== 1 && 's'} total
            {search && ` — ${filtered.length} match${filtered.length !== 1 ? 'es' : ''}`}
          </p>
        </div>
        {canManage && (
          <a href="/suppliers" className="btn btn-secondary">🏢 Manage Suppliers & Categories</a>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      {canManage && (
        <form onSubmit={submit} className="card mb-6">
          <p className="card-title">{editing ? 'Edit Product' : 'Add Product'}</p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label>Product Name</label>
              <input
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={
                  isDrugshop ? 'e.g. Panadol 500mg'
                  : isAgro ? 'e.g. Urea Fertilizer 50kg'
                  : 'e.g. Clutch cable'
                }
                required
              />
            </div>
            <div className="md:col-span-2">
              <label>
                SKU / Code
                {!editing && !skuTouched && (
                  <span className="ml-2 text-slate-400 normal-case font-normal">
                    (auto-generated — edit to override)
                  </span>
                )}
              </label>
              <input
                value={form.sku}
                onChange={(e) => handleSkuChange(e.target.value)}
                placeholder="Auto-generated from name"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
            <div className="md:col-span-2">
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label>Supplier</label>
              <select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}>
                <option value="">—</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
            <div>
              <label>Cost Price</label>
              <input type="number" step="0.01" value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })} required />
            </div>
            <div>
              <label>Selling Price</label>
              <input type="number" step="0.01" value={form.selling_price}
                onChange={(e) => setForm({ ...form, selling_price: e.target.value })} required />
            </div>
            <div>
              <label>
                Opening Qty {editing && <span className="text-slate-400 normal-case font-normal">(use + Stock to change)</span>}
              </label>
              <input type="number" value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                disabled={!!editing} />
            </div>
            <div>
              <label>Reorder Level</label>
              <input type="number" value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} />
            </div>
          </div>

          {needsExpiry && (
            <div className={`mt-4 p-4 border-2 rounded-lg ${
              isDrugshop
                ? 'bg-blue-50 border-blue-300'
                : 'bg-amber-50 border-amber-300'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{isDrugshop ? '💊' : '🌾'}</span>
                <div>
                  <p className={`text-sm font-bold ${isDrugshop ? 'text-blue-900' : 'text-amber-900'}`}>
                    {isDrugshop ? 'Pharmacy Information' : 'Batch & Expiry Information'}
                  </p>
                  <p className={`text-xs ${isDrugshop ? 'text-blue-700' : 'text-amber-700'}`}>
                    {isDrugshop
                      ? 'Required for drug tracking and expiry alerts'
                      : 'Track batches and expiry for this product'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className={isDrugshop ? 'text-blue-900' : 'text-amber-900'}>
                    Batch Number {isDrugshop && <span className="text-red-600">*</span>}
                  </label>
                  <input
                    value={form.batch_number || ''}
                    onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
                    placeholder="e.g. BATCH-2026-01"
                    required={isDrugshop}
                  />
                </div>
                <div>
                  <label className={isDrugshop ? 'text-blue-900' : 'text-amber-900'}>
                    Expiry Date <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.expiry_date || ''}
                    onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                    required={needsExpiry}
                  />
                  {form.expiry_date && (
                    <p className="text-xs mt-1">
                      {(() => {
                        const days = Math.ceil((new Date(form.expiry_date) - new Date()) / 86400000);
                        if (days < 0) return <span className="text-red-600">⚠️ Expired {Math.abs(days)} days ago</span>;
                        if (days <= 30) return <span className="text-amber-600">⚠️ Expires in {days} days</span>;
                        return <span className="text-green-600">✅ {days} days valid</span>;
                      })()}
                    </p>
                  )}
                </div>
                <div>
                  <label className={isDrugshop ? 'text-blue-900' : 'text-amber-900'}>
                    {isDrugshop ? 'Manufacturer' : 'Manufacturer / Importer'}
                  </label>
                  <input
                    value={form.manufacturer || ''}
                    onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                    placeholder={isDrugshop ? 'Cipla, GSK' : 'Yara, Bayer, Syngenta'}
                  />
                </div>
                <div>
                  <label className={isDrugshop ? 'text-blue-900' : 'text-amber-900'}>
                    Unit / Pack Size
                  </label>
                  <select
                    value={form.unit || ''}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  >
                    <option value="">—</option>
                    {unitOptions.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            {editing && (
              <button type="button" className="btn btn-secondary" onClick={() => {
                setEditing(null); setSkuTouched(false); setForm(EMPTY_FORM);
              }}>Cancel</button>
            )}
            <button type="submit" className="btn btn-primary">
              {editing ? '✓ Update' : '+ Add'} Product
            </button>
          </div>
        </form>
      )}

      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label>Search products</label>
            <input
              placeholder="Search by name, SKU, barcode, category, supplier, batch…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label>Show per page</label>
            <select value={pageSize} onChange={(e) => setPageSize(parseInt(e.target.value))}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex justify-end">
            {search && (
              <button type="button" className="btn btn-secondary" onClick={() => setSearch('')}>✕ Clear</button>
            )}
          </div>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Category</th>
              {canManage && <th>Supplier</th>}
              {needsExpiry && <th>Batch</th>}
              {needsExpiry && <th>Expiry</th>}
              <th className="text-right">Qty</th>
              {canManage && <th className="text-right">Cost</th>}
              <th className="text-right">Sell</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center text-slate-400 py-8">
                  {search ? `No products match "${search}".` : 'No products yet.'}
                </td>
              </tr>
            )}
            {pageItems.map((p) => {
              const low = p.quantity <= p.reorder_level;
              return (
                <tr key={p.id} className={low ? 'bg-red-50/50' : ''}>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.category_name || '—'}</td>
                  {canManage && <td>{p.supplier_name || '—'}</td>}
                  {needsExpiry && (
                    <td className="text-xs text-slate-600">{p.batch_number || '—'}</td>
                  )}
                  {needsExpiry && (
                    <td className={`text-sm whitespace-nowrap ${expiryClass(p)}`}>
                      {p.expiry_date || '—'}
                      {p.days_to_expiry !== null && p.days_to_expiry !== undefined && (
                        <span className="text-xs ml-1">
                          ({p.days_to_expiry < 0 ? 'expired' : `${p.days_to_expiry}d`})
                        </span>
                      )}
                    </td>
                  )}
                  <td className="text-right">
                    <span className={low ? 'text-red-600 font-bold' : 'font-semibold'}>
                      {p.quantity}
                    </span>
                    {p.unit && <span className="text-xs text-slate-400 ml-1">{p.unit}</span>}
                    {low && <span className="ml-2 badge badge-red">Low</span>}
                  </td>
                  {canManage && (
                    <td className="text-right">{formatMoney(p.cost_price, currency)}</td>
                  )}
                  <td className="text-right">{formatMoney(p.selling_price, currency)}</td>
                  {canManage && (
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-success btn-sm mr-1" onClick={() => openStockModal(p, 'in')}>+ Stock</button>
                      <button className="btn btn-secondary btn-sm mr-1" onClick={() => edit(p)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(p.id)}>Del</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 mb-8">
          <p className="text-sm text-slate-600">
            Showing <b>{startIndex + 1}</b>–<b>{Math.min(endIndex, filtered.length)}</b> of <b>{filtered.length}</b>
          </p>
          <div className="flex items-center gap-1 flex-wrap">
            <button className="btn btn-secondary btn-sm" onClick={() => goTo(1)} disabled={safePage === 1}>«</button>
            <button className="btn btn-secondary btn-sm" onClick={() => goTo(safePage - 1)} disabled={safePage === 1}>← Prev</button>
            {(() => {
              const buttons = [];
              const from = Math.max(1, safePage - 2);
              const to = Math.min(totalPages, safePage + 2);
              if (from > 1) {
                buttons.push(<button key={1} className="btn btn-secondary btn-sm" onClick={() => goTo(1)}>1</button>);
                if (from > 2) buttons.push(<span key="lead" className="px-2 text-slate-400">…</span>);
              }
              for (let i = from; i <= to; i++) {
                buttons.push(
                  <button key={i}
                    className={i === safePage ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    onClick={() => goTo(i)}>{i}</button>
                );
              }
              if (to < totalPages) {
                if (to < totalPages - 1) buttons.push(<span key="trail" className="px-2 text-slate-400">…</span>);
                buttons.push(<button key={totalPages} className="btn btn-secondary btn-sm" onClick={() => goTo(totalPages)}>{totalPages}</button>);
              }
              return buttons;
            })()}
            <button className="btn btn-secondary btn-sm" onClick={() => goTo(safePage + 1)} disabled={safePage === totalPages}>Next →</button>
            <button className="btn btn-secondary btn-sm" onClick={() => goTo(totalPages)} disabled={safePage === totalPages}>»</button>
          </div>
        </div>
      )}

      {stockModal && canManage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-1">Adjust Stock</h3>
            <p className="text-sm text-slate-500 mb-4">
              {stockModal.product.name} — current stock <b>{stockModal.product.quantity}</b>
            </p>
            <form onSubmit={submitStock}>
              <div className="mb-3">
                <label>Action</label>
                <select value={stockModal.type} onChange={(e) => setStockModal({ ...stockModal, type: e.target.value })}>
                  <option value="in">Add to stock (+)</option>
                  <option value="out">Remove from stock (−)</option>
                  <option value="adjust">Set exact quantity</option>
                </select>
              </div>
              <div className="mb-3">
                <label>{stockModal.type === 'adjust' ? 'New quantity' : 'Quantity'}</label>
                <input type="number" required min="1" value={stockModal.quantity}
                  onChange={(e) => setStockModal({ ...stockModal, quantity: e.target.value })} />
              </div>
              <div className="mb-4">
                <label>Reason / Notes</label>
                <input value={stockModal.notes}
                  onChange={(e) => setStockModal({ ...stockModal, notes: e.target.value })}
                  placeholder="e.g. New delivery, damaged goods" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setStockModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Apply</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}