// Web app manifest (CR-082, X-21): Crucible installed on a phone's home screen opens on My schedule, full screen.
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Crucible — moyens d’essais R&D',
    short_name: 'Crucible',
    description: 'Planification et arbitrage des moyens d’essais R&D partagés',
    start_url: '/my/schedule',
    scope: '/',
    display: 'standalone',
    lang: 'fr',
    background_color: '#16161d',
    theme_color: '#16161d',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
