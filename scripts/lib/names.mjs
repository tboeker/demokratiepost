/**
 * Namensvergleich für den Abgleich zwischen bundestag.de und abgeordnetenwatch.
 *
 * Die beiden Quellen schreiben Namen unterschiedlich: akademische Titel
 * ("Prof. Dr.-Ing. habil."), Adelspartikel ("Freiherr von"), Mittelnamen
 * ("Arne Onni Raue") oder Umschreibungen von Umlauten ("Koegel" vs. "Kögel").
 * `matchKey` reduziert einen Namen auf "vorname nachname" in normierter Form.
 */

const STOPWORDS = new Set([
  'dr', 'prof', 'dipl', 'med', 'jur', 'rer', 'pol', 'nat', 'habil', 'ing', 'phil',
  'm', 'a', 'b', 'sc', 'iur', 'oec', 'h', 'c', 'l',
  'freiherr', 'freifrau', 'baron', 'von', 'zu', 'graf', 'graefin', 'grafin',
]);

/** Normalisiert einen Namen zu einer Liste bedeutungstragender Wortteile. */
export function nameParts(name) {
  const normalized = String(name ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ı/g, 'i')
    .replace(/[’']/g, '')
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((part) => part.length > 1 && !STOPWORDS.has(part));

  return normalized;
}

/** Vergleichsschlüssel: erster und letzter bedeutungstragender Namensteil. */
export function matchKey(name) {
  const parts = nameParts(name);
  if (parts.length === 0) return '';
  return `${parts[0]} ${parts[parts.length - 1]}`;
}
