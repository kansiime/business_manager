/**
 * Session storage helpers shared by login, sign-up and the business switcher.
 * The backend returns { access, refresh, user, businesses } from all three.
 */

export function saveSession(data) {
  localStorage.setItem('access_token', data.access);
  localStorage.setItem('refresh_token', data.refresh);
  localStorage.setItem('user', JSON.stringify(data.user));
  if (data.businesses) {
    localStorage.setItem('businesses', JSON.stringify(data.businesses));
  }
  if (data.context) {
    localStorage.setItem('tenant_context', JSON.stringify(data.context));
  }
}

/** Last app-shell context (menu, features, plan) — lets the app render instantly. */
export function cachedContext() {
  try {
    return JSON.parse(localStorage.getItem('tenant_context') || 'null');
  } catch {
    return null;
  }
}

export function clearSession() {
  ['access_token', 'refresh_token', 'user', 'businesses', 'tenant_context'].forEach((k) =>
    localStorage.removeItem(k)
  );
}

export function storedBusinesses() {
  try {
    return JSON.parse(localStorage.getItem('businesses') || '[]');
  } catch {
    return [];
  }
}

/** Where to go right after signing in. */
export function landingPath(data) {
  if (data.user?.role === 'super') return '/dashboard';
  return (data.businesses || []).length > 1 ? '/businesses' : '/dashboard';
}

/** Turn a DRF error response into one readable sentence. */
export function apiErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const data = err?.response?.data;
  if (!data) return err?.response ? fallback : 'Could not reach the server. Check your connection.';
  if (typeof data === 'string') return fallback;
  if (data.error) return data.error;
  if (data.detail) return data.detail;
  const first = Object.values(data)[0];
  if (Array.isArray(first) && first.length) return String(first[0]);
  if (typeof first === 'string') return first;
  return fallback;
}
