import type { Mandatstraeger, PlzIndex } from '../types';

/** Prüft, ob eine Eingabe eine gültige fünfstellige PLZ ist. */
export function isValidPlz(plz: string): boolean {
  return /^\d{5}$/.test(plz);
}

/**
 * Lädt eine JSON-Datei. Gibt `null` zurück, wenn sie fehlt oder der Server
 * (z. B. per SPA-Fallback) HTML statt JSON liefert – statt eine Ausnahme zu werfen.
 */
async function fetchJson<T>(relativePath: string): Promise<T | null> {
  const base = import.meta.env.BASE_URL;
  const response = await fetch(`${base}data/${relativePath}`);
  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) return null;

  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

let mdbCache: Mandatstraeger[] | null = null;

async function loadAllMdB(): Promise<Mandatstraeger[]> {
  if (!mdbCache) {
    const data = await fetchJson<Mandatstraeger[]>('mdb.json');
    if (!data) {
      throw new Error('Die Empfängerdaten konnten nicht geladen werden.');
    }
    mdbCache = data.map((entry) => ({ ...entry, parlament: entry.parlament ?? 'bundestag' }));
  }
  return mdbCache;
}

/**
 * Ermittelt die zuständigen Bundestagsabgeordneten für eine PLZ.
 * Eine PLZ kann mehrere Wahlkreise umfassen – dann werden alle zurückgegeben.
 */
export async function findRecipientsByPlz(plz: string): Promise<Mandatstraeger[]> {
  if (!isValidPlz(plz)) return [];

  const prefix = plz.slice(0, 2);
  const index = await fetchJson<PlzIndex>(`plz/${prefix}.json`);
  if (!index) return [];

  const wahlkreisNumbers = index[plz] ?? [];
  if (wahlkreisNumbers.length === 0) return [];

  const all = await loadAllMdB();
  return all.filter(
    (mdB) => mdB.wahlkreis && wahlkreisNumbers.includes(mdB.wahlkreis.number),
  );
}

/** Ein Eintrag im Landtags-PLZ-Shard: Bundesland + Wahlkreisnummern. */
interface LandtagPlzEntry {
  staat: string;
  wahlkreise: number[];
}

const landtagCache = new Map<string, Mandatstraeger[]>();

/** Lädt (und cacht) das Roster eines Bundeslands. */
async function loadLandtagRoster(staat: string): Promise<Mandatstraeger[]> {
  if (!landtagCache.has(staat)) {
    const data = await fetchJson<Mandatstraeger[]>(`landtag/${staat}.json`);
    landtagCache.set(staat, data ?? []);
  }
  return landtagCache.get(staat)!;
}

/**
 * Ermittelt die zuständigen Landtagsabgeordneten für eine PLZ.
 * Die PLZ-Shards (`plz-landtag/<prefix>.json`) nennen Bundesland und
 * Wahlkreisnummern; das Roster des Bundeslands liefert die Direktmandate.
 * Für Bundesländer ohne Landtagsdaten (Wahlperiode/Zuschnitt) kommt nichts
 * zurück – dann greift in der App der manuelle Fallback.
 */
export async function findLandtagRecipientsByPlz(plz: string): Promise<Mandatstraeger[]> {
  if (!isValidPlz(plz)) return [];

  const prefix = plz.slice(0, 2);
  const index = await fetchJson<Record<string, LandtagPlzEntry[]>>(`plz-landtag/${prefix}.json`);
  if (!index) return [];

  const entries = index[plz] ?? [];
  const result: Mandatstraeger[] = [];
  for (const entry of entries) {
    const roster = await loadLandtagRoster(entry.staat);
    for (const mandate of roster) {
      if (
        mandate.mandate === 'direct' &&
        mandate.wahlkreis &&
        entry.wahlkreise.includes(mandate.wahlkreis.number)
      ) {
        result.push(mandate);
      }
    }
  }
  return result;
}

/** Baut eine passende Anrede aus Geschlecht und Namen. */
export function salutation(mandat: Mandatstraeger): string {
  if (mandat.anrede) return mandat.anrede;

  const parts = mandat.name.trim().split(/\s+/);
  const lastName = parts.length > 0 ? parts[parts.length - 1] : mandat.name;

  if (mandat.sex === 'm') return `Sehr geehrter Herr ${lastName}`;
  if (mandat.sex === 'f') return `Sehr geehrte Frau ${lastName}`;
  return 'Sehr geehrte Damen und Herren';
}

/**
 * Anrede für einen manuell erfassten Empfänger ohne Geschlechtsangabe:
 * Namen wie "Frau Müller"/"Herr Schmidt" werden erkannt, sonst neutrale Anrede.
 */
export function genericSalutation(name: string): string {
  const match = name.trim().match(/^(Frau|Herr)\s+(.+)$/i);
  if (match) {
    const parts = match[2].trim().split(/\s+/);
    const lastName = parts[parts.length - 1] ?? '';
    return match[1].toLowerCase() === 'frau'
      ? `Sehr geehrte Frau ${lastName}`
      : `Sehr geehrter Herr ${lastName}`;
  }
  return 'Sehr geehrte Damen und Herren';
}
