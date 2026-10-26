import { isDocKey, type DocKey } from './docs';

/** Seiten, die eine eigene URL haben (ohne Startseite). */
export type ActiveView = DocKey | 'datenspeicherung' | null;

/** Basis-Pfad aus der Vite-Konfiguration (endet auf „/“). */
const BASE_URL = import.meta.env.BASE_URL;

/**
 * Liefert den aktuellen Pfad ohne Basis-Präfix und ohne führende bzw.
 * abschließende Schrägstriche (`/impressum/` → `impressum`).
 */
function currentRoutePath(): string {
  const base = BASE_URL.replace(/\/+$/, '');
  let pathname = window.location.pathname;

  if (base) {
    if (pathname === base) {
      pathname = '/';
    } else if (pathname.startsWith(`${base}/`)) {
      pathname = pathname.slice(base.length);
    }
  }

  return pathname.replace(/^\/+|\/+$/g, '');
}

/**
 * Ermittelt die aktive Seite ausschließlich aus dem Pfad. Hash-Links wie
 * `#impressum` werden bewusst nicht mehr unterstützt.
 */
export function viewFromLocation(): ActiveView {
  const path = currentRoutePath();
  if (path === 'datenspeicherung') return 'datenspeicherung';
  if (isDocKey(path)) return path;
  return null;
}

/** Absolute URL einer Seite, z. B. `/impressum`. */
export function viewHref(view: Exclude<ActiveView, null>): string {
  return `${BASE_URL}${view}`;
}

/** Absolute URL der Startseite. */
export function homeHref(): string {
  return BASE_URL;
}
