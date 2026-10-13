'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';

export default function ServicesPage() {
  const toast = useToast();
  const { enabled_features } = useTenantContext();
  const canUse =
    enabled_features.includes('prescriptions') ||
    enabled_features.includes('appointments');

  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [serviceModal, setServiceModal] = useState(null);
  const [catModal, setCatModal] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [consumeModal, setConsumeModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, s, gs] = await Promise.all([
        api.get('/clinic/service-categories/'),
        api.get('/clinic/services/'),
        api.get('/auth/settings/'),
      ]);
      setCategories(c.data);
      setServices(s.data);
      setCurrency(gs.data.currency_symbol || 'UGX');
    } catch {
      toast.error('Could not load services.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (!canUse) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Not available</p>
          <p className="text-sm text-slate-500 mt-1">
            Services are only enabled for clinics and health facilities.
          </p>
        </div>
      </ProtectedRoute>
    );
  }

  const filtered =
    activeCategory === 'all'
      ? services
      : services.filter((s) => s.category === parseInt(activeCategory));

  const openCreate = () => {
    setServiceModal({
      mode: 'create',
      code: '',
      name: '',
      category: '',
      price: '',
      cost: '',
      description: '',
      is_active: true,
    });
  };

  const openEdit = (s) => {
    setServiceModal({
      mode: 'edit',
      id: s.id,
      code: s.code,
      name: s.name,
      category: s.category || '',
      price: s.price,
      cost: s.cost,
      description: s.description || '',
      is_active: s.is_active,
    });
  };

  const saveService = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        code: serviceModal.code,
        name: serviceModal.name,
        category: serviceModal.category || null,
        price: parseFloat(serviceModal.price || 0),
        cost: parseFloat(serviceModal.cost || 0),
        description: serviceModal.description,
        is_active: serviceModal.is_active,
      };
      if (serviceModal.mode === 'edit') {
        await api.put(`/clinic/services/${serviceModal.id}/`, payload);
        toast.success('Service updated');
      } else {
        await api.post('/clinic/services/', payload);
        toast.success('Service added');
      }
      setServiceModal(null);
      load();
    } catch (err) {
      const d = err.response?.data;
      toast.error(typeof d === 'object' ? JSON.stringify(d) : 'Could not save.');
    }
  };

  const addCategory = async (e) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    try {
      await api.post('/clinic/service-categories/', { name: newCat.trim() });
      setNewCat('');
      toast.success('Category added');
      load();
    } catch {
      toast.error('Could not add category.');
    }
  };

  const deleteCategory = async (id) => {
    if (!confirm('Delete this category? Services inside will remain but be uncategorised.')) return;
    try {
      await api.delete(`/clinic/service-categories/${id}/`);
      toast.success('Category deleted');
      load();
    } catch {
      toast.error('Could not delete.');
    }
  };

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Services & Prices</h1>
          <p className="text-sm text-slate-500 mt-1">
            {services.length} service{services.length !== 1 && 's'} across {categories.length} categories
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => setCatModal(true)}>
            Manage Categories
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            + Add Service
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="mb-4 border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              activeCategory === 'all'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            All ({services.length})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(String(c.id))}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeCategory === String(c.id)
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {c.name} ({c.service_count})
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Category</th>
              <th className="text-right">Price</th>
              <th className="text-right">Cost</th>
              <th>Consumables</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="text-center text-slate-400 py-8">
                  No services in this category.
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id}>
                <td className="font-mono text-xs">{s.code}</td>
                <td className="font-medium">{s.name}</td>
                <td className="text-sm">{s.category_name || '—'}</td>
                <td className="text-right font-semibold">
                  {formatMoney(s.price, currency)}
                </td>
                <td className="text-right text-slate-500">
                  {formatMoney(s.cost, currency)}
                </td>
                <td className="text-sm text-slate-600">
                  {s.consumables && s.consumables.length > 0
                    ? `${s.consumables.length} item${s.consumables.length !== 1 ? 's' : ''}`
                    : '—'}
                </td>
                <td>{s.is_active ? '✅' : '—'}</td>
                <td className="text-right whitespace-nowrap">
                  <button
                    className="btn btn-secondary btn-sm mr-1"
                    onClick={() => setConsumeModal({ service: s })}
                    title="Manage consumables"
                  >
                    🧪
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openEdit(s)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Service modal */}
      {serviceModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 my-8">
            <h3 className="text-lg font-bold mb-4">
              {serviceModal.mode === 'edit' ? 'Edit Service' : 'Add Service'}
            </h3>
            <form onSubmit={saveService}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label>Code *</label>
                  <input
                    value={serviceModal.code}
                    onChange={(e) =>
                      setServiceModal({ ...serviceModal, code: e.target.value })
                    }
                    placeholder="e.g. LAB-CBC"
                    required
                  />
                </div>
                <div>
                  <label>Category</label>
                  <select
                    value={serviceModal.category}
                    onChange={(e) =>
                      setServiceModal({ ...serviceModal, category: e.target.value })
                    }
                  >
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label>Name *</label>
                  <input
                    value={serviceModal.name}
                    onChange={(e) =>
                      setServiceModal({ ...serviceModal, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label>Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={serviceModal.price}
                    onChange={(e) =>
                      setServiceModal({ ...serviceModal, price: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label>Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={serviceModal.cost}
                    onChange={(e) =>
                      setServiceModal({ ...serviceModal, cost: e.target.value })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <label>Description</label>
                  <textarea
                    rows={2}
                    value={serviceModal.description}
                    onChange={(e) =>
                      setServiceModal({ ...serviceModal, description: e.target.value })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={serviceModal.is_active}
                      onChange={(e) =>
                        setServiceModal({ ...serviceModal, is_active: e.target.checked })
                      }
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Active (available for billing)</span>
                  </label>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setServiceModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category modal */}
      {catModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-4">Service Categories</h3>
            <form onSubmit={addCategory} className="flex gap-2 mb-4">
              <input
                placeholder="New category name"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
              />
              <button className="btn btn-primary">Add</button>
            </form>
            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
              {categories.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-4">
                  No categories yet.
                </p>
              )}
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-3 py-2 border-b border-slate-100 last:border-b-0"
                >
                  <div>
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-xs text-slate-400 ml-2">
                      {c.service_count} service{c.service_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => deleteCategory(c.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button className="btn btn-secondary" onClick={() => setCatModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Consumables modal */}
      {consumeModal && (
        <ConsumablesModal
          service={consumeModal.service}
          onClose={() => {
            setConsumeModal(null);
            load();
          }}
        />
      )}
    </ProtectedRoute>
  );
}

/* ============================================================
   Consumables modal
   ============================================================ */
function ConsumablesModal({ service, onClose }) {
  const toast = useToast();
  const [consumables, setConsumables] = useState([]);
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        api.get(`/clinic/service-consumables/?service=${service.id}`),
        api.get('/inventory/products/'),
      ]);
      setConsumables(c.data);
      setProducts(p.data);
    } catch {
      toast.error('Could not load consumables.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [service.id]);

  const add = async () => {
    if (!newProduct) {
      toast.warning('Select a product first.');
      return;
    }
    try {
      await api.post('/clinic/service-consumables/', {
        service: service.id,
        product: newProduct,
        quantity: parseFloat(newQty || 1),
        auto_deduct: true,
      });
      setNewProduct('');
      setNewQty(1);
      toast.success('Consumable linked');
      load();
    } catch (err) {
      const d = err.response?.data;
      toast.error(
        typeof d === 'object' ? JSON.stringify(d) : 'Could not add consumable.'
      );
    }
  };

  const remove = async (id) => {
    if (!confirm('Remove this consumable?')) return;
    try {
      await api.delete(`/clinic/service-consumables/${id}/`);
      toast.success('Removed');
      load();
    } catch {
      toast.error('Could not remove.');
    }
  };

  const updateQty = async (item, qty) => {
    try {
      await api.patch(`/clinic/service-consumables/${item.id}/`, {
        quantity: parseFloat(qty || 1),
      });
      load();
    } catch {
      toast.error('Could not update quantity.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 my-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-bold">🧪 Consumables for {service.name}</h3>
            <p className="text-sm text-slate-500">
              These inventory items are auto-deducted each time this service is billed
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {/* Add consumable */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-semibold mb-3">Link an Inventory Item</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
            <div className="md:col-span-2">
              <label className="text-xs">Product</label>
              <select
                value={newProduct}
                onChange={(e) => setNewProduct(e.target.value)}
              >
                <option value="">— Select inventory item —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (stock: {p.quantity})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs">Qty per service</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
              />
            </div>
            <div>
              <button className="btn btn-primary w-full" onClick={add}>
                + Add
              </button>
            </div>
          </div>
        </div>

        {loading && <p className="text-sm text-slate-500">Loading…</p>}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th className="text-right">Qty per Service</th>
                <th className="text-right">Current Stock</th>
                <th>Auto Deduct</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {consumables.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="text-center text-slate-400 py-6">
                    No consumables linked to this service yet.
                  </td>
                </tr>
              )}
              {consumables.map((c) => {
                const product = products.find((p) => p.id === c.product);
                return (
                  <tr key={c.id}>
                    <td className="font-medium">{c.product_name}</td>
                    <td className="text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        defaultValue={c.quantity}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (v && v !== parseFloat(c.quantity)) updateQty(c, v);
                        }}
                        style={{ width: 80, textAlign: 'right' }}
                      />
                    </td>
                    <td className="text-right text-slate-600">
                      {product ? product.quantity : '—'}
                    </td>
                    <td>{c.auto_deduct ? '✅' : '—'}</td>
                    <td className="text-right">
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => remove(c.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-400 mt-3">
          Tip: for a Chest X-Ray, link "X-ray Film" x1 and "Radiologist Gloves" x1.
          For a Wound Dressing, link "Bandage" x1 and "Antiseptic" x1.
        </p>
      </div>
    </div>
  );
}