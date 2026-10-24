/**
 * Gemeinsame Definitionen und Helfer für die kommunale Datenpipeline (M5).
 *
 * Die Ebene „Gemeinde/Kreis“ besteht aus drei Quellen:
 * - Anschriftenverzeichnis (Destatis/Statistikportal): Behördenanschrift + E-Mail.
 * - GERDA (German Election Database): Amtsinhaber:innen aus Direktwahlen.
 * - PLZ-Geometrien × VG250: Zuordnung PLZ → Gemeinde/Kreis.
 *
 * Hier liegen nur Build-Zeit-Helfer; nichts davon wird in den Client gebündelt.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv } from './landtag.mjs';

/** Die 16 Länder mit ARS-Landescode und dem Dateinamen-Slug der Laufzeitdaten. */
export const LAENDER = [
  { code: '01', name: 'Schleswig-Holstein', slug: 'schleswig-holstein' },
  { code: '02', name: 'Hamburg', slug: 'hamburg' },
  { code: '03', name: 'Niedersachsen', slug: 'niedersachsen' },
  { code: '04', name: 'Bremen', slug: 'bremen' },
  { code: '05', name: 'Nordrhein-Westfalen', slug: 'nrw' },
  { code: '06', name: 'Hessen', slug: 'hessen' },
  { code: '07', name: 'Rheinland-Pfalz', slug: 'rheinland-pfalz' },
  { code: '08', name: 'Baden-Württemberg', slug: 'baden-wuerttemberg' },
  { code: '09', name: 'Bayern', slug: 'bayern' },
  { code: '10', name: 'Saarland', slug: 'saarland' },
  { code: '11', name: 'Berlin', slug: 'berlin' },
  { code: '12', name: 'Brandenburg', slug: 'brandenburg' },
  { code: '13', name: 'Mecklenburg-Vorpommern', slug: 'mecklenburg-vorpommern' },
  { code: '14', name: 'Sachsen', slug: 'sachsen' },
  { code: '15', name: 'Sachsen-Anhalt', slug: 'sachsen-anhalt' },
  { code: '16', name: 'Thüringen', slug: 'thueringen' },
];

export function landByCode(code) {
  return LAENDER.find((land) => land.code === String(code ?? '').padStart(2, '0'));
}

export function landByArs(ars) {
  return landByCode(String(ars ?? '').slice(0, 2));
}

/** Satzarten des Anschriftenverzeichnisses. */
export const SATZART = {
  LAND: '10',
  REGIERUNGSBEZIRK: '20',
  REGION: '30',
  KREIS: '40',
  GEMEINDEVERBAND: '50',
  GEMEINDE: '60',
};

/** Kreise, die eine Landrätin/einen Landrat haben (keine kreisfreien Städte). */
export const LANDRAT_ARTEN = new Set(['Kreis', 'Landkreis', 'Regionalverband']);

/** Kreisfreie Städte/Stadtkreise – dort gibt es keine Landrätin/keinen Landrat. */
export const KREISFREI_ARTEN = new Set(['Kreisfreie Stadt', 'Stadtkreis']);

/**
 * Liest eine CSV mit `#`-Kopfkommentaren. Gibt Header, Spaltenindex und
 * Datenzeilen als Objekte zurück (alle Werte getrimmt).
 */
export function readCsvFile(file) {
  const text = readFileSync(file, 'utf8');
  const dataLines = text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
  const rows = parseCsv(dataLines);
  const header = (rows.shift() ?? []).map((cell) => cell.trim());
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const records = rows.map((cells) => {
    const record = {};
    for (const name of header) record[name] = (cells[index[name]] ?? '').trim();
    return record;
  });
  return { header, index, rows: records };
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Schreibt eine CSV mit optionalen `#`-Kopfkommentaren. */
export function writeCsvFile(file, header, rows, comments = []) {
  const lines = [
    ...comments.map((line) => (line.startsWith('#') ? line : `# ${line}`)),
    header.join(','),
  ];
  for (const row of rows) {
    lines.push(header.map((name) => csvEscape(row[name])).join(','));
  }
  writeFileSync(file, `${lines.join('\n')}\n`);
}

/** Entfernt Leerraum inkl. geschützter/ schmaler Leerzeichen. */
export function cleanText(value) {
  return String(value ?? '').replace(/[\u00a0\u202f]/g, ' ').trim();
}

/** Erste valide E-Mail-Adresse aus einem Feld (das Verzeichnis enthält teils Listen). */
export function cleanEmail(value) {
  const text = cleanText(value);
  if (!text) return '';
  const candidates = text.split(/[;,\s]+/).filter(Boolean);
  return candidates.find((candidate) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate)) ?? '';
}

/** Zahl aus einem Statistik-Feld („ 15 804.30“, „2 959 517“) lesen. */
export function parseNumber(value) {
  let text = cleanText(value).replace(/\s/g, '');
  if (!text) return undefined;
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

/** Normalisiert eine PLZ auf fünf Ziffern; ungültige Werte werden leer. */
export function normalizePlz(value) {
  const digits = cleanText(value).replace(/\D/g, '');
  return digits.length === 5 ? digits : '';
}

/** Kreis-AGS (8-stellig) aus einem 5-stelligen Kreis-ARS. */
export function kreisAgsFromArs(ars) {
  const text = cleanText(ars);
  return text.length === 5 ? `${text}000` : '';
}

/** Verbands-AGS (8-stellig) aus einem 9-stelligen Verbands-ARS. */
export function verbandAgsFromArs(ars) {
  const text = cleanText(ars);
  return text.length === 9 ? text.slice(0, 8) : '';
}

/** Verbands-ARS (9-stellig) aus einem 12-stelligen Gemeinde-ARS. */
export function verbandArsFromArs(ars) {
  const text = cleanText(ars);
  return text.length === 12 ? text.slice(0, 9) : '';
}

/** Kreis-ARS (5-stellig) aus einem Gemeinde-/Verbands-ARS. */
export function kreisArsFromArs(ars) {
  return cleanText(ars).slice(0, 5);
}

/**
 * Normalisiert einen Orts-/Verbandsnamen für den Abgleich zwischen GERDA und
 * dem Anschriftenverzeichnis. Die AGS-Stände driften (z. B. Sachsen-Anhalt,
 * Sachsen, Rheinland-Pfalz), deshalb ist der Name der stabile Zweitschlüssel.
 * Behördenpräfixe („Verbandsgemeindeverwaltung“, „Landkreis“, „Stadt“ …)
 * werden entfernt, Umlaute und ß vereinheitlicht.
 */
export function normalizeName(name) {
  const prefixes =
    /\b(verbandsgemeindeverwaltung|verbandsgemeinde|samtgemeinde|verwaltungsgemeinschaft|verwaltungsverband|erfüllende gemeinde|landratsamt|landkreis|kreis|städteregion|region|stadt|gemeinde|markt|hansestadt|landeshauptstadt|freie und hansestadt|freie hansestadt)\b/g;
  return cleanText(name)
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/\bst\.?\b/g, 'sankt')
    .replace(/[.,/()\-–—]/g, ' ')
    .replace(prefixes, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Name aus GERDA („Nachname, Vorname“) in „Vorname Nachname“ umwandeln. */
export function formatPersonName(firstName, lastName, fullName) {
  let name = '';
  if (cleanText(firstName) && cleanText(lastName)) {
    name = `${cleanText(firstName)} ${cleanText(lastName)}`;
  } else {
    const full = cleanText(fullName);
    const comma = full.indexOf(',');
    name = comma >= 0
      ? `${full.slice(comma + 1).trim()} ${full.slice(0, comma).trim()}`
      : full;
  }
  // GERDA schreibt Titel teils ohne Leerzeichen („Dr.Andreas“).
  return name
    .replace(/\.(?=\S)/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nachname für die Anrede. */
export function lastNameOf(name) {
  const parts = cleanText(name).split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

/**
 * Geschlecht nur übernehmen, wenn GERDA es als Rohangabe führt. Vorhergesagte
 * Werte (`predicted`) sind zu unsicher für eine geschlechtsspezifische Anrede.
 */
export function genderFromGerda(gender, source) {
  if (cleanText(source).toLowerCase() !== 'raw') return undefined;
  const value = cleanText(gender).toLowerCase();
  if (value === 'm') return 'm';
  if (value === 'w' || value === 'f') return 'f';
  if (value === 'd') return 'd';
  return undefined;
}

/**
 * Rollenbezeichnung geschlechtsbezogen bilden. Ohne verlässliches Geschlecht
 * bleibt die neutrale Form mit Doppelpunkt („Bürgermeister:in“).
 */
export function genderedRole(base, sex) {
  const role = cleanText(base);
  if (sex === 'm') return role;
  if (sex === 'f') {
    if (role === 'Landrat') return 'Landrätin';
    if (role === 'Regionspräsident') return 'Regionspräsidentin';
    return `${role}in`;
  }
  if (role === 'Landrat') return 'Landrät:in';
  return `${role}:in`;
}

/** Anrede aus Rolle, Name und (verlässlichem) Geschlecht. */
export function buildAnrede(role, name, sex) {
  const lastName = lastNameOf(name);
  if (!lastName) return 'Sehr geehrte Damen und Herren';
  if (sex === 'f') {
    return cleanText(role)
      ? `Sehr geehrte Frau ${cleanText(role)} ${lastName}`
      : `Sehr geehrte Frau ${lastName}`;
  }
  if (sex === 'm') {
    return cleanText(role)
      ? `Sehr geehrter Herr ${cleanText(role)} ${lastName}`
      : `Sehr geehrter Herr ${lastName}`;
  }
  return 'Sehr geehrte Damen und Herren';
}

/**
 * Plausibilitätsregel für GERDA-Wahldaten: Die Wahl darf nicht länger zurück-
 * liegen als eine reguläre Amtszeit plus ein Jahr Puffer. Kommunale Amtszeiten
 * liegen je nach Land bei 4–8 Jahren; 9 Jahre decken alle Fälle ab.
 */
export function isPlausibleElectionYear(year, now = new Date()) {
  const value = Number(year);
  if (!Number.isFinite(value) || value <= 0) return false;
  const age = now.getFullYear() - value;
  return age >= 0 && age <= 9;
}

/**
 * Zerlegt einen Gemeindenamen der Form „Flensburg, Stadt“ in Basis und
 * Bezeichnungszusatz. Der Zusatz wird für die Behördenzeile vorangestellt.
 */
function splitMunicipalityName(name) {
  const text = cleanText(name);
  const comma = text.indexOf(',');
  if (comma < 0) return { base: text, suffix: '' };
  return {
    base: text.slice(0, comma).trim(),
    suffix: text.slice(comma + 1).trim(),
  };
}

const CITY_SUFFIXES = new Set([
  'Stadt',
  'Landeshauptstadt',
  'Hansestadt',
  'Freie und Hansestadt',
  'Freie Hansestadt',
  'Kreisstadt',
  'Große Kreisstadt',
  'Große kreisangehörige Stadt',
  'Markt',
  'Stadtkreis',
  'Kreisfreie Stadt',
]);

const GEMEINDE_PREFIXES =
  /^(Stadt|Hansestadt|Landeshauptstadt|Freie und Hansestadt|Freie Hansestadt|Markt|Gemeinde)\b/i;

/** Behördenzeile für eine Gemeinde-/Stadtverwaltung. */
export function behoerdeForGemeinde(name, art) {
  const { base, suffix } = splitMunicipalityName(name);
  const kind = cleanText(art);
  if (suffix && CITY_SUFFIXES.has(suffix)) return `${suffix} ${base}`;
  if (GEMEINDE_PREFIXES.test(base)) return base;
  if (kind === 'Markt') return `Markt ${base}`;
  if (kind === 'Bewohntes gemeindefreies Gebiet') return `Gemeindefreies Gebiet ${base}`;
  if (kind === 'Stadtstaat') return `Stadt ${base}`;
  if (/^(Kreisfreie Stadt|Stadtkreis|Stadt|Große kreisangehörige Stadt|Große Kreisstadt)$/.test(kind)) {
    return `Stadt ${base}`;
  }
  return `Gemeinde ${base}`;
}

/** Behördenzeile für einen Kreis / ein Landratsamt. */
export function behoerdeForKreis(name, art) {
  const { base, suffix } = splitMunicipalityName(name);
  const kind = cleanText(art);
  // Sonderformen führen ihren Namen selbst („Region Hannover“,
  // „Regionalverband Saarbrücken“).
  if (/^(Region|Regionalverband)\s+/i.test(base)) return base;
  if (kind === 'Regionalverband') return base;
  if (KREISFREI_ARTEN.has(kind)) {
    if (suffix && CITY_SUFFIXES.has(suffix)) return `${suffix} ${base}`;
    return `Stadt ${base}`;
  }
  const bare = base.replace(/^(Landkreis|Kreis)\s+/i, '');
  return `Landratsamt ${bare}`;
}

/** Behördenzeile für einen Gemeindeverband (Amt, Samt-/Verbandsgemeinde …). */
export function behoerdeForVerband(name, art) {
  const text = cleanText(name);
  const kind = cleanText(art);
  if (!kind) return text;
  // „Erfüllende Gemeinde“ ist selbst eine Stadt/Gemeinde; die Behördenzeile
  // folgt deshalb der Gemeinde-Logik. „Kirchspielslandgemeinde“ heißt im
  // Amtsverkehr „Amt …“ und bleibt unverändert.
  if (kind === 'Erfüllende Gemeinde') return behoerdeForGemeinde(text, 'Gemeinde');
  if (kind === 'Kirchspielslandgemeinde') return text;
  // Das Anschriftenverzeichnis führt die Verwaltung teils als
  // „Verbandsgemeindeverwaltung X“ – im Brief genügt „Verbandsgemeinde X“.
  const shortened = text
    .replace(/^Verbandsgemeindeverwaltung\s+/i, 'Verbandsgemeinde ')
    .replace(/^Samtgemeindeverwaltung\s+/i, 'Samtgemeinde ');
  // Auch Komposita wie „Gemeindeverwaltungsverband“ enthalten die Bezeichnung
  // bereits; dann nicht noch einmal voranstellen.
  if (shortened.toLowerCase().includes(kind.toLowerCase())) return shortened;
  return `${kind} ${shortened}`;
}

/** Standardrolle einer Gemeinde, wenn keine Amtsinhaber:in bekannt ist. */
export function defaultGemeindeRole(art, name = '') {
  const kind = cleanText(art);
  // Landeshauptstädte haben auch dann eine:n Oberbürgermeister:in, wenn sie
  // im Anschriftenverzeichnis nur als „Stadt“ geführt werden (z. B. Hannover).
  if (/Landeshauptstadt/i.test(cleanText(name))) return 'Oberbürgermeister';
  if (kind === 'Stadtstaat' || KREISFREI_ARTEN.has(kind)) return 'Oberbürgermeister';
  return 'Bürgermeister';
}

/** Standardrolle eines Gemeindeverbands. */
export function defaultVerbandRole(art) {
  const kind = cleanText(art);
  if (kind === 'Samtgemeinde') return 'Samtgemeindebürgermeister';
  if (kind === 'Verbandsgemeinde') return 'Verbandsbürgermeister';
  return 'Bürgermeister';
}
