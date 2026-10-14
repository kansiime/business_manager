import axios from 'axios';
import { clearSession } from './session';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

const api = axios.create({ baseURL: API_URL });

const PUBLIC_PATHS = ['/login', '/signup'];

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// The free Render backend sleeps when idle and answers 502/503 (or, because
// Render's error page has no CORS headers, a bare network error) while it
// starts up. Those requests never reached Django, so retrying is safe.
const WAKE_DELAYS_MS = [2000, 3000, 5000, 8000, 10000, 15000, 15000];

const isWakingUp = (err) => {
  const status = err.response?.status;
  if (status === 502 || status === 503) return true;
  if (status === 504) return (err.config?.method || 'get') === 'get';
  return !err.response && err.code === 'ERR_NETWORK';
};

const setWaking = (waking) => {
  window.dispatchEvent(new CustomEvent('api:waking', { detail: waking }));
};

api.interceptors.response.use(
  (res) => {
    if (typeof window !== 'undefined' && res.config.__wakeAttempt) setWaking(false);
    return res;
  },
  async (err) => {
    if (typeof window === 'undefined') return Promise.reject(err);

    const config = err.config;
    if (config && isWakingUp(err)) {
      const attempt = config.__wakeAttempt || 0;
      if (attempt < WAKE_DELAYS_MS.length) {
        config.__wakeAttempt = attempt + 1;
        setWaking(true);
        await new Promise((r) => setTimeout(r, WAKE_DELAYS_MS[attempt]));
        return api(config);
      }
      setWaking(false);
    }

    const status = err.response?.status;
    const path = window.location.pathname;

    if (status === 401) {
      clearSession();
      if (!PUBLIC_PATHS.includes(path)) window.location.href = '/login';
    }

    // Trial / plan ran out: the app is read-only until the owner pays.
    if (status === 403 && err.response?.data?.code === 'subscription_expired') {
      if (!path.startsWith('/subscription')) {
        window.location.href = '/subscription?expired=1';
      }
    }
    return Promise.reject(err);
  }
);

export const auth = {
  login: (u, p) => api.post('/auth/login/', { username: u, password: p }),
  signup: (data) => api.post('/auth/signup/', data),
  me: () => api.get('/auth/users/me/'),
  businesses: () => api.get('/auth/businesses/'),
  createBusiness: (data) => api.post('/auth/businesses/', data),
  switchBusiness: (tenantId) => api.post('/auth/switch-business/', { tenant_id: tenantId }),
};

export const billing = {
  plans: () => api.get('/billing/plans/'),
  status: () => api.get('/billing/subscription/'),
  checkout: (plan, billingCycle) =>
    api.post('/billing/checkout/', { plan, billing_cycle: billingCycle }),
  verify: (params) => api.post('/billing/verify/', params),
  momoPay: (plan, billingCycle, phone) =>
    api.post('/billing/momo/pay/', { plan, billing_cycle: billingCycle, phone }),
  momoStatus: (txRef) => api.get(`/billing/momo/status/${txRef}/`),
  manualClaim: (data) => api.post('/billing/manual/claim/', data),
  pendingClaims: () => api.get('/billing/manual/pending/'),
  reviewClaim: (id, decision, reason) =>
    api.post(`/billing/manual/${id}/${decision}/`, reason ? { reason } : {}),
};

export const downloadFile = async (url, filename) => {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
};

export default api;
