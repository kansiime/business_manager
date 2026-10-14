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

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (typeof window === 'undefined') return Promise.reject(err);
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
