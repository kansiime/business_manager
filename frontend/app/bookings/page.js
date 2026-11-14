'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';

const STATUS = {
  booked:    { label: 'Booked',    badge: 'badge-blue' },
  arrived:   { label: 'Arrived',   badge: 'badge-amber' },
  completed: { label: 'Completed', badge: 'badge-green' },
  cancelled: { label: 'Cancelled', badge: 'badge-gray' },
  no_show:   { label: 'No-show',   badge: 'badge-red' },
};

const localISO = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const shiftDate = (iso, days) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localISO(d);
};
const prettyDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

const EMPTY = (date) => ({
  customer_name: '', customer_phone: '', service: '', staff: '',
  date, time: '09:00', duration_minutes: 30, price: '', notes: '',
});

function errorText(err, fallback) {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (data.detail) return data.detail;
  const first = Object.values(data)[0];
  return Array.isArray(first) ? String(first[0]) : String(first || fallback);
}

export default function BookingsPage() {
  const toast = useToast();
  const { enabled_features = [] } = useTenantContext();
  const today = localISO(new Date());

  const [date, setDate] = useState(today);
  const [bookings, setBookings] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [form, setForm] = useState(null);       // null = closed; {...} = new / editing
  const [saving, setSaving] = useState(false);
  const [charging, setCharging] = useState(null); // booking being checked out

  const money = (n) => formatMoney(n, currency);

  const load = async (d = date) => {
    setLoaded(false);
    try {
      const { data } = await api.get(`/bookings/?date=${d}`);
      setBookings(data);
    } catch (err) {
      toast.error(errorText(err, 'Could not load bookings.'));
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { load(date); /* eslint-disable-next-line */ }, [date]);
  useEffect(() => {
    api.get('/inventory/products/').then((r) => {
      // Services first, then products, so the usual choice is at the top.
      const items = [...r.data].sort((a, b) => Number(!!b.is_service) - Number(!!a.is_service) || a.name.localeCompare(b.name));
      setServices(items);
    }).catch(() => {});
    api.get('/auth/users/').then((r) => setStaff(r.data.filter((u) => u.is_active))).catch(() => {});
    api.get('/auth/settings/').then((r) => setCurrency(r.data.currency_symbol || 'UGX')).catch(() => {});
  }, []);

  const counts = useMemo(() => {
    const c = { total: 0, done: 0, waiting: 0, revenue: 0 };
    bookings.forEach((b) => {
      if (b.status === 'cancelled') return;
      c.total += 1;
      if (b.status === 'completed') { c.done += 1; c.revenue += Number(b.price) || 0; }
      if (b.status === 'arrived') c.waiting += 1;
    });
    return c;
  }, [bookings]);

  const pickService = (id) => {
    const s = services.find((x) => String(x.id) === String(id));
    setForm((f) => ({
      ...f,
      service: id,
      price: s ? s.selling_price : f.price,
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      service: form.service || null,
      staff: form.staff || null,
      price: form.price === '' ? 0 : form.price,
    };
    try {
      if (form.id) await api.patch(`/bookings/${form.id}/`, payload);
      else await api.post('/bookings/', payload);
      toast.success(form.id ? 'Booking updated' : `Booked ${form.customer_name}`);
      setForm(null);
      if (payload.date !== date) setDate(payload.date); else load();
    } catch (err) {
      toast.error(errorText(err, 'Could not save the booking.'));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (b, status) => {
    try {
      await api.patch(`/bookings/${b.id}/`, { status });
      load();
    } catch (err) {
      toast.error(errorText(err, 'Could not update the booking.'));
    }
  };

  const checkout = async (paymentType, allowBelowCost = false) => {
    const b = charging;
    try {
      await api.post(`/bookings/${b.id}/checkout/`, {
        payment_type: paymentType, price: b.price, allow_below_cost: allowBelowCost,
      });
      toast.success(`Charged ${b.customer_name} ${money(b.price)}`);
      setCharging(null);
      load();
    } catch (err) {
      const belowCost = err?.response?.data?.below_cost;
      if (belowCost && window.confirm(`${belowCost.join('\n')}\n\nCharge below cost anyway?`)) {
        return checkout(paymentType, true);
      }
      toast.error(errorText(err, 'Could not charge this booking.'));
    }
  };

  if (!enabled_features.includes('bookings')) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="font-semibold text-slate-900">Bookings aren&apos;t enabled for this business.</p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bookings</h1>
          <p className="text-sm text-slate-500 mt-1">Book clients in, check them off when they arrive, and charge when done.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm(EMPTY(date))}>+ New booking</button>
      </div>

      {/* Day navigator + summary */}
      <div className="card mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">←</button>
          <div className="min-w-[13rem] text-center">
            <p className="font-semibold text-slate-900">{prettyDate(date)}</p>
            <p className="text-xs text-slate-500">{date === today ? 'Today' : date < today ? 'Past day' : 'Upcoming'}</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">→</button>
          {date !== today && (
            <button className="btn btn-secondary btn-sm" onClick={() => setDate(today)}>Today</button>
          )}
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="!w-auto !min-h-0 !py-1.5 text-sm"
            aria-label="Pick a date"
          />
        </div>
        <div className="flex gap-6 text-sm">
          <div><p className="text-slate-500 text-xs uppercase font-semibold">Bookings</p><p className="text-xl font-bold">{counts.total}</p></div>
          <div><p className="text-slate-500 text-xs uppercase font-semibold">Waiting</p><p className="text-xl font-bold text-amber-700">{counts.waiting}</p></div>
          <div><p className="text-slate-500 text-xs uppercase font-semibold">Done</p><p className="text-xl font-bold text-emerald-700">{counts.done}</p></div>
          <div><p className="text-slate-500 text-xs uppercase font-semibold">Charged</p><p className="text-xl font-bold">{money(counts.revenue)}</p></div>
        </div>
      </div>

      {/* Day list */}
      <div className="space-y-2.5">
        {!loaded && <div className="card text-sm text-slate-500">Loading bookings…</div>}
        {loaded && bookings.length === 0 && (
          <div className="card text-center py-10">
            <p className="text-3xl mb-2">📅</p>
            <p className="font-semibold text-slate-900">No bookings for this day</p>
            <p className="text-sm text-slate-500 mt-1">Add one with “New booking”.</p>
          </div>
        )}
        {loaded && bookings.map((b) => {
          const st = STATUS[b.status] || STATUS.booked;
          const active = b.status === 'booked' || b.status === 'arrived';
          return (
            <div
              key={b.id}
              className={`card !p-4 flex flex-wrap items-center gap-4 ${b.status === 'cancelled' ? 'opacity-60' : ''}`}
            >
              <div className="w-16 text-center shrink-0">
                <p className="text-lg font-bold text-slate-900 tabular-nums">{b.time.slice(0, 5)}</p>
                <p className="text-[11px] text-slate-400">{b.duration_minutes} min</p>
              </div>
              <div className="flex-1 min-w-[12rem]">
                <p className="font-semibold text-slate-900">
                  {b.customer_name}
                  {b.customer_phone && <span className="ml-2 text-xs font-normal text-slate-500">{b.customer_phone}</span>}
                </p>
                <p className="text-sm text-slate-600">
                  {b.service_name || 'No service chosen'}
                  {b.staff_name && <span className="text-slate-400"> · with {b.staff_name}</span>}
                  <span className="text-slate-400"> · {money(b.price)}</span>
                </p>
                {b.notes && <p className="text-xs text-slate-400 mt-0.5">{b.notes}</p>}
              </div>
              <span className={`badge ${st.badge} normal-case`}>{st.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {b.status === 'booked' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setStatus(b, 'arrived')}>Arrived</button>
                )}
                {active && (
                  <button className="btn btn-success btn-sm" onClick={() => setCharging(b)}>Complete &amp; charge</button>
                )}
                {active && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setForm({ ...b, service: b.service || '', staff: b.staff || '' })}>Edit</button>
                )}
                {b.status === 'booked' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setStatus(b, 'no_show')}>No-show</button>
                )}
                {active && (
                  <button className="btn btn-secondary btn-sm text-red-600" onClick={() => setStatus(b, 'cancelled')}>Cancel</button>
                )}
                {b.sale_reference && (
                  <Link href="/sales" className="text-xs text-blue-600 hover:underline self-center">Sale {b.sale_reference}</Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New / edit booking */}
      {form && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={save} className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{form.id ? 'Edit booking' : 'New booking'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="bk_name">Client name</label>
                <input id="bk_name" value={form.customer_name} required autoFocus
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
              </div>
              <div>
                <label htmlFor="bk_phone">Phone</label>
                <input id="bk_phone" type="tel" value={form.customer_phone} placeholder="07XX XXX XXX"
                  onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="bk_service">Service</label>
                <select id="bk_service" value={form.service} onChange={(e) => pickService(e.target.value)}>
                  <option value="">Choose a service…</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {money(s.selling_price)}{s.is_service ? '' : ' (product)'}
                    </option>
                  ))}
                </select>
                {services.length === 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    No services yet. Add them under <Link href="/inventory" className="text-blue-600 underline">Inventory</Link> and tick “This is a service”.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="bk_staff">With</label>
                <select id="bk_staff" value={form.staff} onChange={(e) => setForm({ ...form, staff: e.target.value })}>
                  <option value="">Anyone</option>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>{[u.first_name, u.last_name].filter(Boolean).join(' ') || u.username}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="bk_price">Price</label>
                <input id="bk_price" type="number" min="0" step="0.01" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div>
                <label htmlFor="bk_date">Date</label>
                <input id="bk_date" type="date" value={form.date} required
                  onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bk_time">Time</label>
                  <input id="bk_time" type="time" value={form.time?.slice(0, 5)} required
                    onChange={(e) => setForm({ ...form, time: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="bk_dur">Minutes</label>
                  <input id="bk_dur" type="number" min="5" step="5" value={form.duration_minutes}
                    onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value || '30', 10) })} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="bk_notes">Notes</label>
                <textarea id="bk_notes" rows={2} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : form.id ? 'Save changes' : 'Book'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Charge */}
      {charging && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold">Charge {charging.customer_name}</h3>
            <p className="text-sm text-slate-500 mt-1">{charging.service_name || 'Service'}</p>
            <label htmlFor="ch_price" className="mt-4">Amount</label>
            <input id="ch_price" type="number" min="0" step="0.01" value={charging.price}
              onChange={(e) => setCharging({ ...charging, price: e.target.value })} />
            <p className="text-xs text-slate-400 mt-1">Records the sale, so it shows in Sales, reports and your daily email.</p>
            <p className="text-sm font-semibold text-slate-700 mt-5 mb-2">How did they pay?</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-primary" onClick={() => checkout('cash')}>Cash</button>
              <button className="btn btn-primary" onClick={() => checkout('mobile_money')}>Mobile money</button>
              <button className="btn btn-secondary" onClick={() => checkout('card')}>Card</button>
              <button className="btn btn-secondary" onClick={() => checkout('credit')}>On credit</button>
            </div>
            <button className="btn btn-secondary btn-block mt-3" onClick={() => setCharging(null)}>Cancel</button>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
