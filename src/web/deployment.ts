import type { AssetManifest } from './assets.ts';

export const appBasePath = import.meta.env?.VITE_APP_BASE_PATH ?? '/';
export const assetBaseUrl = import.meta.env?.BASE_URL ?? '/';

export function resourceUrl(path: string, base = assetBaseUrl): string {
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function appUrl(path: string): string { return resourceUrl(path, appBasePath); }

/** The bundled manifest retains portable root paths; resolve them at the boundary. */
export function resolveAssetManifest(manifest: AssetManifest, base = assetBaseUrl): AssetManifest {
  function visit(value: unknown): unknown {
    if (typeof value === 'string' && value.startsWith('/assets/')) return resourceUrl(value, base);
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
    return value;
  }
  return visit(manifest) as AssetManifest;
}
