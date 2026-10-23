import type { TemplateContext } from '../types';

// Platzhalter-Syntax: {{ absender.name }} – erlaubt Punktnotation.
const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Löst einen Pfad wie "absender.name" gegen den Kontext auf. */
function resolvePath(context: TemplateContext, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, context);
}

/** Ersetzt alle Platzhalter im Template durch Werte aus dem Kontext. */
export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(PLACEHOLDER, (_match, path: string) => {
    const value = resolvePath(context, path);
    return value == null ? '' : String(value);
  });
}

/** Listet alle im Template verwendeten Platzhalter auf (z. B. für Formulare). */
export function listPlaceholders(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) {
    found.add(match[1]);
  }
  return [...found].sort((a, b) => a.localeCompare(b, 'de'));
}
