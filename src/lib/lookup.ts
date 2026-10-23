import type { MdB, PlzIndex } from '../types';

/** Prüft, ob eine Eingabe eine gültige fünfstellige PLZ ist. */
export function isValidPlz(plz: string): boolean {
  return /^\d{5}$/.test(plz);
}

async function fetchJson<T>(relativePath: string): Promise<T> {
  const base = import.meta.env.BASE_URL;
  const response = await fetch(`${base}data/${relativePath}`);
  if (!response.ok) {
    throw new Error(`Daten konnten nicht geladen werden (${relativePath}).`);
  }
  return (await response.json()) as T;
}

let mdbCache: MdB[] | null = null;

async function loadAllMdB(): Promise<MdB[]> {
  if (!mdbCache) {
    mdbCache = await fetchJson<MdB[]>('mdb.json');
  }
  return mdbCache;
}

/**
 * Ermittelt die zuständigen Bundestagsabgeordneten für eine PLZ.
 * Eine PLZ kann mehrere Wahlkreise umfassen – dann werden alle zurückgegeben.
 */
export async function findRecipientsByPlz(plz: string): Promise<MdB[]> {
  if (!isValidPlz(plz)) return [];

  const prefix = plz.slice(0, 2);
  const index = await fetchJson<PlzIndex>(`plz/${prefix}.json`);
  const wahlkreisNumbers = index[plz] ?? [];
  if (wahlkreisNumbers.length === 0) return [];

  const all = await loadAllMdB();
  return all.filter((mdB) => wahlkreisNumbers.includes(mdB.wahlkreis.number));
}

/** Baut eine passende Anrede aus Geschlecht und Namen. */
export function salutation(mdB: MdB): string {
  if (mdB.anrede) return mdB.anrede;

  const parts = mdB.name.trim().split(/\s+/);
  const lastName = parts.length > 0 ? parts[parts.length - 1] : mdB.name;

  if (mdB.sex === 'm') return `Sehr geehrter Herr ${lastName}`;
  if (mdB.sex === 'f') return `Sehr geehrte Frau ${lastName}`;
  return 'Sehr geehrte Damen und Herren';
}
