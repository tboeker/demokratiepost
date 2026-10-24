/**
 * Holt die vollständige Zuordnung PLZ -> Bundestagswahlkreis und schreibt sie
 * als normalisierte CSV nach `scripts/source/plz-wahlkreis.csv`.
 *
 * Quellen:
 * - OpenWahlkreisMap (MIT): räumlicher Verschnitt der BKG-PLZ-Gebiete mit der
 *   Wahlkreiseinteilung 2025.
 *     https://github.com/maximilion-ai/OpenWahlkreisMap
 *     https://gdz.bkg.bund.de/index.php/default/postleitzahlgebiete-deutschland-plz.html
 * - Die Bundeswahlleiterin: Wahlkreise und zugeordnete Gemeinden (PLZ der
 *   Gemeindeverwaltung). Ergänzt PLZ, die im räumlichen Verschnitt fehlen.
 *     https://www.bundeswahlleiterin.de/bundestagswahlen/2025/wahlkreiseinteilung/downloads.html
 *
 * Die OpenWahlkreisMap-Quelle wird auf einen festen Commit gepinnt, damit Builds
 * reproduzierbar bleiben. Eine PLZ kann mehrere Wahlkreise überlappen; alle
 * Überlappungen (mindestens 1 %) werden übernommen.
 *
 * Aufruf:
 *   node scripts/fetch-plz-wahlkreis.mjs
 */
import { renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = resolve(root, 'scripts/source/plz-wahlkreis.csv');

const SOURCE_COMMIT = '6dbe352dccf4dbda3bb05e94f764fc9ff9ae4923';
const SOURCE_URL = `https://raw.githubusercontent.com/maximilion-ai/OpenWahlkreisMap/${SOURCE_COMMIT}/data/bundestag/plz-wahlkreis.csv`;
const OFFICIAL_URL =
  'https://www.bundeswahlleiterin.de/dam/jcr/aa868597-0e60-476c-bd2b-279c1e9a142a/btw25_wkr_gemeinden_20241130_utf8.csv';

async function download(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'demokratiepost/0.1 (Datenpipeline, Build-Zeit)' },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    throw new Error(`Download fehlgeschlagen: HTTP ${response.status} für ${url}`);
  }
  return response.text();
}

const text = await download(SOURCE_URL);
const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
if (lines.length < 2) {
  throw new Error('Die heruntergeladene CSV ist leer.');
}

const header = lines[0].split(',').map((cell) => cell.trim());
const plzColumn = header.indexOf('plz');
const wahlkreisColumn = header.indexOf('wahlkreis_nr');
if (plzColumn < 0 || wahlkreisColumn < 0) {
  throw new Error(`Unerwartetes CSV-Format: ${lines[0]}`);
}

const assignments = new Map();
let skipped = 0;

function addAssignment(plz, wahlkreis) {
  if (!assignments.has(plz)) assignments.set(plz, new Set());
  assignments.get(plz).add(wahlkreis);
}

for (const line of lines.slice(1)) {
  const cells = line.split(',');
  const plz = cells[plzColumn]?.trim();
  const wahlkreis = Number(cells[wahlkreisColumn]?.trim());

  if (!/^\d{5}$/.test(plz ?? '') || !Number.isInteger(wahlkreis) || wahlkreis < 1 || wahlkreis > 299) {
    skipped += 1;
    continue;
  }

  addAssignment(plz, wahlkreis);
}

// Ergänzung aus der amtlichen Gemeinde-Zuordnung: Für Gemeinden, die genau einem
// Wahlkreis angehören, ist die dort genannte PLZ eindeutig. Das füllt Lücken des
// räumlichen Verschnitts (z. B. 94158 Philippsreut) und fehlende Randgebiete
// (z. B. 56729 Nitz, 83256 Chiemsee). Gemeinden mit mehreren Wahlkreisen
// (Berlin, Hamburg, …) werden bewusst übersprungen.
const officialText = (await download(OFFICIAL_URL)).replace(/^\uFEFF/, '');
const officialLines = officialText
  .split(/\r?\n/)
  .filter((line) => line.length > 0 && !line.startsWith('#'));
const officialHeader = officialLines.shift()?.split(';').map((cell) => cell.trim()) ?? [];
const officialIndex = Object.fromEntries(officialHeader.map((name, index) => [name, index]));
const requiredColumns = [
  'Wahlkreis-Nr',
  'RGS_Land',
  'RGS_RegBez',
  'RGS_Kreis',
  'RGS_Gemeinde',
  'PLZ-GemVerwaltung',
];
for (const column of requiredColumns) {
  if (officialIndex[column] === undefined) {
    throw new Error(`Unerwartetes Format der amtlichen CSV: Spalte "${column}" fehlt.`);
  }
}

const officialRows = officialLines.map((line) => line.split(';'));
const wahlkreiseByAgs = new Map();
for (const cells of officialRows) {
  const ags =
    cells[officialIndex['RGS_Land']] +
    cells[officialIndex['RGS_RegBez']] +
    cells[officialIndex['RGS_Kreis']] +
    cells[officialIndex['RGS_Gemeinde']];
  if (!wahlkreiseByAgs.has(ags)) wahlkreiseByAgs.set(ags, new Set());
  wahlkreiseByAgs.get(ags).add(Number(cells[officialIndex['Wahlkreis-Nr']]));
}

let supplemented = 0;
for (const cells of officialRows) {
  const ags =
    cells[officialIndex['RGS_Land']] +
    cells[officialIndex['RGS_RegBez']] +
    cells[officialIndex['RGS_Kreis']] +
    cells[officialIndex['RGS_Gemeinde']];
  const wahlkreise = wahlkreiseByAgs.get(ags);
  if (wahlkreise?.size !== 1) continue;

  const wahlkreis = [...wahlkreise][0];
  if (!Number.isInteger(wahlkreis) || wahlkreis < 1 || wahlkreis > 299) continue;

  for (const plz of (cells[officialIndex['PLZ-GemVerwaltung']] ?? '').split(/[ ,;]+/)) {
    if (!/^\d{5}$/.test(plz)) continue;
    if (!assignments.get(plz)?.has(wahlkreis)) supplemented += 1;
    addAssignment(plz, wahlkreis);
  }
}

const plzCount = assignments.size;
const wahlkreisCount = new Set([...assignments.values()].flatMap((set) => [...set])).size;
if (plzCount < 8000 || wahlkreisCount < 299) {
  throw new Error(
    `Daten unvollständig: ${plzCount} PLZ, ${wahlkreisCount} Wahlkreise (erwartet: >= 8000 PLZ, 299 Wahlkreise).`,
  );
}
if (skipped > 0) {
  console.warn(`${skipped} Zeile(n) mit ungültiger PLZ oder Wahlkreisnummer übersprungen.`);
}

const rows = [...assignments]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([plz, wahlkreise]) => [plz, [...wahlkreise].sort((a, b) => a - b)]);

const headerLines = [
  '# PLZ -> Bundestagswahlkreis (21. Bundestag, Wahlkreiseinteilung 2025)',
  '#',
  '# Quellen: OpenWahlkreisMap (MIT), abgeleitet aus den PLZ-Gebieten des BKG',
  '# (© GeoBasis-DE / BKG), sowie die amtliche Gemeinde-Zuordnung der',
  '# Bundeswahlleiterin (Wahlkreise und zugeordnete Gemeinden).',
  `# Stand: OpenWahlkreisMap ${SOURCE_COMMIT.slice(0, 7)}`,
  '# Eine PLZ kann mehrere Wahlkreise überlappen; alle Überlappungen (>= 1 %) sind enthalten.',
  'plz,wk',
];

const output = [
  ...headerLines,
  ...rows.flatMap(([plz, wahlkreise]) => wahlkreise.map((wk) => `${plz},${wk}`)),
].join('\n');

const tempFile = `${sourceFile}.tmp`;
writeFileSync(tempFile, `${output}\n`);
renameSync(tempFile, sourceFile);

console.log(
  `${plzCount} PLZ mit ${rows.reduce((sum, [, wahlkreise]) => sum + wahlkreise.length, 0)} Zuordnungen ` +
    `(${wahlkreisCount} Wahlkreise, ${supplemented} Ergänzungen aus der amtlichen Gemeinde-Zuordnung) ` +
    'geschrieben nach scripts/source/plz-wahlkreis.csv',
);
