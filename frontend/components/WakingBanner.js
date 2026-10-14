'use client';
import { useEffect, useState } from 'react';

// Shown while lib/api.js retries requests against a backend that is still
// starting up after being idle.
export default function WakingBanner() {
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    const onWaking = (e) => setWaking(Boolean(e.detail));
    window.addEventListener('api:waking', onWaking);
    return () => window.removeEventListener('api:waking', onWaking);
  }, []);

  if (!waking) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-amber-100 text-amber-900 text-sm text-center px-4 py-2 shadow">
      Waking up the server — this can take up to a minute after a quiet period…
    </div>
  );
}
