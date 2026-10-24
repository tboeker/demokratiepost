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

/** Markiert im Template den Text, der als Nachricht im Kontaktformular dient. */
const CONTACT_START = '<!-- kontaktformular:start -->';
const CONTACT_END = '<!-- kontaktformular:ende -->';

/** Entfernt die Marker-Zeilen vollständig (inkl. Zeilenumbruch) aus dem Brief. */
const CONTACT_MARKER_LINES = /^[ \t]*<!-- kontaktformular:(?:start|ende) -->[ \t]*\r?\n?/gm;

export interface TemplateParts {
  /** Vollständiger Brief inkl. Anschriften, Datum und Betreff. */
  letter: string;
  /** Nur der Nachrichtentext mit Anrede und Abschlussformel. */
  contact: string;
}

/**
 * Teilt ein Template in Brief und Kontaktformular-Nachricht.
 *
 * Der Kontaktformular-Abschnitt ist ein Ausschnitt des Briefes (keine Dublette).
 * Fehlen die Marker, wird der vollständige Brief auch als Nachricht verwendet.
 */
export function splitTemplate(template: string): TemplateParts {
  const start = template.indexOf(CONTACT_START);
  const end = template.indexOf(CONTACT_END);
  const letter = template.replace(CONTACT_MARKER_LINES, '').trim();

  if (start === -1 || end === -1 || end < start) {
    return { letter, contact: letter };
  }

  return {
    letter,
    contact: template.slice(start + CONTACT_START.length, end).trim(),
  };
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
