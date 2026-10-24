import type { Kommune, Mandatstraeger, PlzIndex } from '../types';

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

/** ARS-Landescode → Dateiname der Laufzeitdaten (`gemeinden-<slug>.json`). */
const LAND_SLUGS: Record<string, string> = {
  '01': 'schleswig-holstein',
  '02': 'hamburg',
  '03': 'niedersachsen',
  '04': 'bremen',
  '05': 'nrw',
  '06': 'hessen',
  '07': 'rheinland-pfalz',
  '08': 'baden-wuerttemberg',
  '09': 'bayern',
  '10': 'saarland',
  '11': 'berlin',
  '12': 'brandenburg',
  '13': 'mecklenburg-vorpommern',
  '14': 'sachsen',
  '15': 'sachsen-anhalt',
  '16': 'thueringen',
};

const kommuneCache = new Map<string, Kommune[]>();
let kreiseCache: Kommune[] | null = null;

/** Lädt (und cacht) alle kommunalen Einheiten eines Bundeslands. */
async function loadKommunen(landCode: string): Promise<Kommune[]> {
  const slug = LAND_SLUGS[landCode];
  if (!slug) return [];
  if (!kommuneCache.has(slug)) {
    const data = await fetchJson<Kommune[]>(`kommunen/gemeinden-${slug}.json`);
    kommuneCache.set(slug, data ?? []);
  }
  return kommuneCache.get(slug)!;
}

/** Lädt (und cacht) alle Kreisverwaltungen. */
async function loadKreise(): Promise<Kommune[]> {
  if (!kreiseCache) {
    const data = await fetchJson<Kommune[]>('kommunen/kreise.json');
    kreiseCache = data ?? [];
  }
  return kreiseCache;
}

/** Ein Eintrag im kommunalen PLZ-Shard. */
interface KommunePlzEntry {
  ags?: string;
  kreisArs?: string;
  verbandArs?: string;
  overlap?: number;
}

/** Lädt den PLZ-Shard eines Präfixes. */
async function loadKommunePlzIndex(
  plz: string,
): Promise<Record<string, KommunePlzEntry[]> | null> {
  return fetchJson<Record<string, KommunePlzEntry[]>>(
    `kommunen/plz-kommunen/${plz.slice(0, 2)}.json`,
  );
}

/**
 * Ermittelt die zuständige Gemeindeverwaltung (und – falls vorhanden – den
 * Gemeindeverband) für eine PLZ. Eine PLZ kann mehrere Gemeinden umfassen;
 * dann werden alle zurückgegeben (Auswahl immer manuell).
 */
export async function findBuergermeisterByPlz(plz: string): Promise<Kommune[]> {
  if (!isValidPlz(plz)) return [];
  const index = await loadKommunePlzIndex(plz);
  if (!index) return [];
  const entries = index[plz] ?? [];

  const byLand = new Map<string, Kommune[]>();
  for (const entry of entries) {
    const landCode = (entry.kreisArs ?? entry.ags ?? '').slice(0, 2);
    if (!landCode || byLand.has(landCode)) continue;
    byLand.set(landCode, await loadKommunen(landCode));
  }

  const result: Kommune[] = [];
  const seen = new Set<string>();
  const add = (kommune: Kommune | undefined) => {
    if (!kommune || seen.has(kommune.id)) return;
    seen.add(kommune.id);
    result.push(kommune);
  };

  for (const entry of entries) {
    const landCode = (entry.kreisArs ?? entry.ags ?? '').slice(0, 2);
    const kommunen = byLand.get(landCode) ?? [];
    const gemeinde = entry.ags
      ? kommunen.find((item) => item.ebene === 'gemeinde' && item.ags === entry.ags)
      : undefined;
    const verbandByArs = entry.verbandArs
      ? kommunen.find((item) => item.ebene === 'verband' && item.ars === entry.verbandArs)
      : undefined;
    // Zustell-PLZ-Ergänzungen für Verbände tragen den Verbands-AGS als ags.
    const verbandByAgs = entry.ags
      ? kommunen.find((item) => item.ebene === 'verband' && item.ags === entry.ags)
      : undefined;
    add(gemeinde);
    add(verbandByArs ?? verbandByAgs);
  }

  // Die Shard-Einträge sind nach Flächenüberlappung sortiert. Diese Reihenfolge
  // bleibt erhalten: Die wahrscheinlichste Gemeinde steht oben, danach folgen
  // ihr Gemeindeverband und die übrigen (auch Zustell-PLZ-)Treffer.
  return result;
}

/**
 * Ermittelt die zuständige Kreisverwaltung (Landrät:in) für eine PLZ.
 * Bei kreisfreien Städten kommt die Stadtverwaltung mit Hinweis zurück – dort
 * gibt es keine Landrätin/keinen Landrat.
 */
export async function findLandratByPlz(plz: string): Promise<Kommune[]> {
  if (!isValidPlz(plz)) return [];
  const index = await loadKommunePlzIndex(plz);
  if (!index) return [];
  const entries = index[plz] ?? [];
  const kreise = await loadKreise();

  const result: Kommune[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const kreisArs = entry.kreisArs;
    if (!kreisArs) continue;
    const kreis = kreise.find((item) => item.ebene === 'kreis' && item.kreisArs === kreisArs);
    if (kreis && !seen.has(kreis.id)) {
      seen.add(kreis.id);
      result.push(kreis);
    }
  }
  return result;
}

/** Baut eine Anrede für eine kommunale Amtsinhaber:in. */
export function kommuneSalutation(kommune: Kommune): string {
  if (kommune.anrede) return kommune.anrede;
  const name = (kommune.name ?? '').trim();
  if (!name) return 'Sehr geehrte Damen und Herren';
  const parts = name.split(/\s+/);
  const lastName = parts[parts.length - 1] ?? name;
  if (kommune.sex === 'f') return `Sehr geehrte Frau ${lastName}`;
  if (kommune.sex === 'm') return `Sehr geehrter Herr ${lastName}`;
  return 'Sehr geehrte Damen und Herren';
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
