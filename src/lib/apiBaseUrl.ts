import { Capacitor } from '@capacitor/core';

const RENDER_API_BASE_URL = 'https://medank.onrender.com';

/**
 * Retorna a URL correta pra chamar a API:
 * - Dentro do app nativo (iOS/Android via Capacitor): URL absoluta do backend no Render.
 * - No navegador (dev/preview/PWA): caminho relativo, servido pelo mesmo domínio.
 */
export function apiUrl(path: string): string {
  if (Capacitor.isNativePlatform()) {
    return `${RENDER_API_BASE_URL}${path}`;
  }
  return path;
}
