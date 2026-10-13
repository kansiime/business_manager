'use client';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

/**
 * Loads the current business info for the login page.
 *  - If `?tenant=<slug>` is present in the URL, loads that specific business.
 *  - Otherwise falls back to a generic "Business Manager" branding.
 */
export function usePublicBusiness() {
  const [info, setInfo] = useState({
    found: false,
    name: 'Business Manager',
    business_type: 'general',
    business_type_name: 'Business',
    business_type_icon: '🏪',
    currency_symbol: 'UGX',
    features: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('tenant');
    const qs = slug ? `?tenant=${encodeURIComponent(slug)}` : '';

    fetch(`${API_URL}/auth/public-settings/${qs}`)
      .then((r) => r.json())
      .then((d) => setInfo(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { info, loading };
}