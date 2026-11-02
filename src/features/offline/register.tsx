'use client';
// Registers the service worker of the phones (CR-082, X-21) once the page has loaded; nothing happens where it is not supported.
import { useEffect } from 'react';

export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => null);
  }, []);
  return null;
}
