/**
 * Holt das amtliche Anschriftenverzeichnis „Anschriften der Gemeinde- und
 * Stadtverwaltungen in Deutschland“ (Statistisches Bundesamt / Statistikportal)
 * und normalisiert es zu `scripts/source/gemeinde-verwaltungen.csv`.
 *
 * Quelle (gepinnt):
 * https://www.statistikportal.de/sites/default/files/2026-05/20260131_Anschriften_der_Gemeinde_und_Stadtverwaltungen.xlsx
 * Stand: 31.01.2026. Vervielfältigung/Verbreitung mit Quellenangabe gestattet.
 *
 * Das Verzeichnis enthält je Land, Regierungsbezirk, Region, Kreis,
 * Gemeindeverband und Gemeinde: Name, ARS, AGS, Verwaltungssitz, Straße,
 * Zustell-PLZ, Ort, E-Mail, Fläche und Bevölkerung. Namen der
 * Bürgermeister:innen/Landrät:innen sind ausdrücklich nicht enthalten – die
 * kommen aus GERDA (`fetch-gemeinde-koepfe.mjs`).
 *
 * Ausgabe: `scripts/source/gemeinde-verwaltungen.csv` mit den Spalten
 *   satzart, art, ars, ags, name, verwaltungssitz, strasse, plz, ort,
 *   email, flaeche, einwohner
 *
 * Aufruf:
 *   node scripts/fetch-kommunen-verwaltung.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import {
  SATZART,
  cleanEmail,
  cleanText,
  kreisAgsFromArs,
  parseNumber,
  verbandAgsFromArs,
  writeCsvFile,
} from './lib/kommunen.mjs';

const SOURCE_DATE = '2026-01-31';
const SOURCE_URL =
  'https://www.statistikportal.de/sites/default/files/2026-05/' +
  '20260131_Anschriften_der_Gemeinde_und_Stadtverwaltungen.xlsx';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'scripts/source/gemeinde-verwaltungen.csv');

const COLUMNS = [
  'satzart',
  'art',
  'ars',
  'ags',
  'name',
  'verwaltungssitz',
  'strasse',
  'plz',
  'ort',
  'email',
  'flaeche',
  'einwohner',
];

async function download(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'demokratiepost/0.1 (Datenpipeline, Build-Zeit)' },
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) {
    throw new Error(`Download fehlgeschlagen: HTTP ${response.status} für ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Findet das Datenblatt unabhängig vom Datumszuschlag im Blattnamen. */
function dataSheetName(workbook) {
  return workbook.SheetNames.find((name) => /^Anschriften_/.test(name));
}

/** Sucht die Kopfzeile mit den amtlichen Schlüsseln. */
function headerRowIndex(rows) {
  return rows.findIndex((row) =>
    row.some((cell) => String(cell ?? '').includes('Amtlicher Regionalschlüssel')),
  );
}

function main() {
  mkdirSync(dirname(outFile), { recursive: true });

  // Der Download ist nur 1,8 MB – kein Cache nötig. Bei Bedarf lokal ablegen.
  return download(SOURCE_URL).then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = dataSheetName(workbook);
    if (!sheetName) throw new Error('Datenblatt „Anschriften_…“ nicht gefunden.');

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    const headerIndex = headerRowIndex(rows);
    if (headerIndex < 0) throw new Error('Kopfzeile mit ARS/AGS nicht gefunden.');

    const header = rows[headerIndex].map((cell) => cleanText(cell));
    const column = (name) => {
      const exact = header.indexOf(name);
      return exact >= 0 ? exact : header.findIndex((cell) => cell.startsWith(name));
    };
    const col = {
      land: column('Land'),
      satzart: column('Satzart'),
      art: column('Textkennzeichen'),
      // Die lesbare Bezeichnung steht in der Spalte direkt hinter dem
      // numerischen Textkennzeichen; die Kopfzelle dieser Spalte ist leer.
      text: column('Textkennzeichen') + 1,
      ars: column('Amtlicher Regionalschlüssel'),
      ags: column('Amtlicher Gemeindeschlüssel'),
      name: column('Gemeinde/Stadt'),
      sitz: column('Verwaltungssitz'),
      strasse: column('Straße'),
      plz: column('PLZ'),
      ort: column('Ort'),
      email: column('E-Mail'),
      flaeche: column('Fläche'),
      einwohner: column('Bevölkerung'),
    };
    for (const [key, index] of Object.entries(col)) {
      if (index < 0) throw new Error(`Spalte für "${key}" nicht gefunden.`);
    }

    const records = [];
    const counts = new Map();
    for (const row of rows.slice(headerIndex + 1)) {
      const landCode = cleanText(row[col.land]);
      if (!/^\d{2}$/.test(landCode)) continue;

      const satzart = cleanText(row[col.satzart]);
      if (![SATZART.KREIS, SATZART.GEMEINDEVERBAND, SATZART.GEMEINDE].includes(satzart)) {
        continue;
      }

      const ars = cleanText(row[col.ars]);
      const agsRaw = cleanText(row[col.ags]);
      let ags = agsRaw;
      if (satzart === SATZART.KREIS) ags = kreisAgsFromArs(ars);
      if (satzart === SATZART.GEMEINDEVERBAND) ags = verbandAgsFromArs(ars);

      const record = {
        satzart,
        // Spalte „Textkennzeichen“ ist numerisch (z. B. 41); die lesbare
        // Bezeichnung („Kreisfreie Stadt“) steht in „Text“.
        art: cleanText(row[col.text]) || cleanText(row[col.art]),
        ars,
        ags,
        name: cleanText(row[col.name]),
        verwaltungssitz: cleanText(row[col.sitz]),
        strasse: cleanText(row[col.strasse]),
        plz: cleanText(row[col.plz]),
        ort: cleanText(row[col.ort]),
        email: cleanEmail(row[col.email]),
        flaeche: parseNumber(row[col.flaeche]) ?? '',
        einwohner: parseNumber(row[col.einwohner]) ?? '',
      };
      records.push(record);
      counts.set(satzart, (counts.get(satzart) ?? 0) + 1);
    }

    const comments = [
      '# Anschriften der Gemeinde- und Stadtverwaltungen in Deutschland',
      `# Quelle: Statistisches Bundesamt / Statistikportal, Stand ${SOURCE_DATE}`,
      `# ${SOURCE_URL}`,
      '# Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellenangabe gestattet.',
      '# Enthält KEINE Namen der Bürgermeister:innen/Landrät:innen (siehe GERDA).',
      '# Satzarten: 40 = Kreis, 50 = Gemeindeverband, 60 = Gemeinde.',
      '# ags: bei Kreisen aus dem ARS abgeleitet (5 -> 8 Stellen), bei',
      '# Gemeindeverbänden aus den ersten 8 ARS-Stellen, sonst amtlicher AGS.',
    ];
    writeCsvFile(outFile, COLUMNS, records, comments);

    console.log(`Geschrieben: ${outFile}`);
    console.log(
      `  Kreise: ${counts.get(SATZART.KREIS) ?? 0}, ` +
        `Gemeindeverbände: ${counts.get(SATZART.GEMEINDEVERBAND) ?? 0}, ` +
        `Gemeinden: ${counts.get(SATZART.GEMEINDE) ?? 0}`,
    );
    const withEmail = records.filter((record) => record.email).length;
    console.log(
      `  E-Mail: ${withEmail} von ${records.length} Zeilen ` +
        `(${Math.round((withEmail / records.length) * 100)} %)`,
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
