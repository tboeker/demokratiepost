/**
 * Holt die Amtsinhaber:innen der kommunalen Verwaltungsspitze aus GERDA
 * (German Election Database, CC BY 4.0) und schreibt eine normalisierte CSV.
 *
 * Quellen (Commit gepinnt, Dateien liegen in Git LFS):
 * - mayoral_candidates.csv  (Bürgermeister:innen, Oberbürgermeister:innen,
 *   Samt- und Verbandsgemeindebürgermeister:innen)
 * - landrat_candidates.csv  (Landrät:innen)
 * https://github.com/awiedem/german_election_data
 *
 * Auswahl: je AGS die jüngste Wahl mit `is_winner = TRUE`; doppelte Zeilen
 * derselben Wahl werden über den Namen entdoppelt. Das Geschlecht wird nur
 * übernommen, wenn GERDA es als Rohangabe (`raw`) führt – `predicted` ist zu
 * unsicher für eine geschlechtsspezifische Anrede.
 *
 * Ausgabe: `scripts/source/gemeinde-koepfe.csv`
 *   typ, ebene, ags, amt, name, partei, geschlecht, geschlecht_quelle,
 *   wahljahr, verifiziert, quelle, hinweis
 *
 * Aufruf:
 *   node scripts/fetch-gemeinde-koepfe.mjs
 *   node scripts/fetch-gemeinde-koepfe.mjs --force
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './lib/landtag.mjs';
import {
  cleanText,
  formatPersonName,
  genderFromGerda,
  genderedRole,
  isPlausibleElectionYear,
  writeCsvFile,
} from './lib/kommunen.mjs';

const GERDA_COMMIT = '12869399f8bc0ebd6260fc78b25460ee51ef93fe';
const GERDA_BASE =
  `https://media.githubusercontent.com/media/awiedem/german_election_data/${GERDA_COMMIT}`;
const MAYOR_URL = `${GERDA_BASE}/data/mayoral_elections/final/mayoral_candidates.csv`;
const LANDRAT_URL = `${GERDA_BASE}/data/landrat_elections/final/landrat_candidates.csv`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = resolve(root, 'scripts/source/cache/kommunen');
const outFile = resolve(root, 'scripts/source/gemeinde-koepfe.csv');

const FORCE = process.argv.includes('--force');
const COLUMNS = [
  'typ',
  'ebene',
  'ags',
  'ags_name',
  'state_name',
  'amt',
  'name',
  'partei',
  'geschlecht',
  'geschlecht_quelle',
  'wahljahr',
  'verifiziert',
  'quelle',
  'hinweis',
];

async function download(url, target) {
  if (!FORCE && existsSync(target)) return target;
  console.log(`Lade ${url}`);
  const response = await fetch(url, {
    headers: { 'user-agent': 'demokratiepost/0.1 (Datenpipeline, Build-Zeit)' },
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) {
    throw new Error(`Download fehlgeschlagen: HTTP ${response.status} für ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(target, buffer);
  console.log(`  ${(buffer.length / 1024 / 1024).toFixed(1)} MB gespeichert`);
  return target;
}

/** Liest eine GERDA-CSV mit Kopfzeile. */
function readGerda(file) {
  const rows = parseCsv(readFileSync(file, 'utf8'));
  const header = (rows.shift() ?? []).map((cell) => cell.trim());
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  return { index, rows };
}

function value(row, index, field) {
  return cleanText(row[index[field]]);
}

function isTrue(valueToCheck) {
  return cleanText(valueToCheck).toUpperCase() === 'TRUE';
}

/** Normalisiert einen AGS auf 8 Stellen (führende Nullen bleiben erhalten). */
function normalizeAgs(ags) {
  const digits = cleanText(ags).replace(/\D/g, '');
  if (digits.length === 8) return digits;
  if (digits.length === 5) return `${digits}000`;
  return digits;
}

/**
 * Sortierschlüssel für die jüngste Wahl. Höher ist besser:
 * Datum/Jahr, Stichwahl-Rang, Stimmenanteil, Hauptwahl-Rang.
 */
function electionScore(row, index) {
  const date = value(row, index, 'election_date');
  const year = Number(value(row, index, 'election_year')) || 0;
  const rankSw = Number(value(row, index, 'candidate_rank_sw')) || 99;
  const shareSw = Number(value(row, index, 'candidate_voteshare_sw')) || 0;
  const rankHw = Number(value(row, index, 'candidate_rank_hw')) || 99;
  const shareHw = Number(value(row, index, 'candidate_voteshare_hw')) || 0;
  return {
    date,
    year,
    rankSw,
    shareSw,
    rankHw,
    shareHw,
  };
}

function compareElection(a, b) {
  if (a.date !== b.date) return b.date.localeCompare(a.date);
  if (a.year !== b.year) return b.year - a.year;
  if (a.rankSw !== b.rankSw) return a.rankSw - b.rankSw;
  if (a.shareSw !== b.shareSw) return b.shareSw - a.shareSw;
  if (a.rankHw !== b.rankHw) return a.rankHw - b.rankHw;
  return b.shareHw - a.shareHw;
}

/** Wählt je AGS die jüngste, nicht überholte Gewinner-Zeile. */
function latestWinners(rows, index, todayIso) {
  const byAgs = new Map();
  for (const row of rows) {
    if (!isTrue(row[index.is_winner])) continue;
    const ags = normalizeAgs(row[index.ags]);
    if (!/^\d{8}$/.test(ags)) continue;

    const electionDate = value(row, index, 'election_date');
    const electionYear = Number(value(row, index, 'election_year')) || 0;
    // Künftige Wahlen (Datenstand enthält auch geplante Termine) ausblenden.
    if (electionDate && electionDate > todayIso) continue;
    if (!electionDate && electionYear > new Date().getFullYear()) continue;

    if (!byAgs.has(ags)) byAgs.set(ags, []);
    byAgs.get(ags).push(row);
  }

  const result = new Map();
  for (const [ags, candidates] of byAgs) {
    const active = candidates.filter((row) => !isTrue(row[index.flag_superseded]));
    const pool = active.length > 0 ? active : candidates;
    pool.sort((a, b) => compareElection(electionScore(a, index), electionScore(b, index)));

    const seen = new Set();
    for (const row of pool) {
      const name = formatPersonName(
        value(row, index, 'candidate_first_name'),
        value(row, index, 'candidate_last_name'),
        value(row, index, 'candidate_name'),
      );
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      result.set(ags, row);
      break;
    }
  }
  return result;
}

function mayoralRole(row, index, sex) {
  const electionType = value(row, index, 'election_type');
  if (electionType.includes('Oberbürgermeister')) {
    return genderedRole('Oberbürgermeister', sex);
  }
  if (electionType.includes('VG-')) return genderedRole('Verbandsbürgermeister', sex);
  if (electionType.includes('SG-')) return genderedRole('Samtgemeindebürgermeister', sex);
  return genderedRole('Bürgermeister', sex);
}

function mayoralLevel(row, index) {
  const electionType = value(row, index, 'election_type');
  return electionType.includes('VG-') || electionType.includes('SG-') ? 'verband' : 'gemeinde';
}

function buildRecord({ row, index, typ, ebene, amt, quelle, todayIso }) {
  const ags = normalizeAgs(row[index.ags]);
  const electionYear = Number(value(row, index, 'election_year')) || undefined;
  const name = formatPersonName(
    value(row, index, 'candidate_first_name'),
    value(row, index, 'candidate_last_name'),
    value(row, index, 'candidate_name'),
  );
  const genderSource = value(row, index, 'candidate_gender_source');
  const sex = genderFromGerda(row[index.candidate_gender], genderSource);
  const partei = value(row, index, 'candidate_party');
  const verifiziert = isPlausibleElectionYear(electionYear);
  const hinweise = [];
  if (!verifiziert) {
    hinweise.push(
      `Wahl ${electionYear ?? 'unbekannt'} liegt länger zurück als die reguläre Amtszeit – bitte prüfen.`,
    );
  }
  if (!name) hinweise.push('Name in den Daten leer.');

  return {
    typ,
    ebene,
    ags,
    ags_name: value(row, index, 'ags_name'),
    state_name: value(row, index, 'state_name'),
    amt,
    name,
    partei,
    geschlecht: sex ?? '',
    geschlecht_quelle: genderSource,
    wahljahr: electionYear ?? '',
    verifiziert: verifiziert ? 'TRUE' : 'FALSE',
    quelle,
    hinweis: hinweise.join(' '),
  };
}

function summarize(records, label) {
  const byLand = new Map();
  for (const record of records) {
    const land = record.ags.slice(0, 2);
    if (!byLand.has(land)) {
      byLand.set(land, { total: 0, verified: 0, named: 0, gender: 0 });
    }
    const stats = byLand.get(land);
    stats.total += 1;
    if (record.verifiziert === 'TRUE') stats.verified += 1;
    if (record.name) stats.named += 1;
    if (record.geschlecht) stats.gender += 1;
  }
  console.log(`\n${label}: ${records.length} Einträge`);
  for (const [land, stats] of [...byLand].sort()) {
    console.log(
      `  ${land}: ${stats.total.toString().padStart(4)} gesamt, ` +
        `${stats.verified.toString().padStart(4)} verifiziert, ` +
        `${stats.named.toString().padStart(4)} mit Name, ` +
        `${stats.gender.toString().padStart(3)} mit Geschlecht`,
    );
  }
}

function main() {
  mkdirSync(cacheDir, { recursive: true });
  const todayIso = new Date().toISOString().slice(0, 10);

  return Promise.all([
    download(MAYOR_URL, resolve(cacheDir, 'mayoral_candidates.csv')),
    download(LANDRAT_URL, resolve(cacheDir, 'landrat_candidates.csv')),
  ]).then(([mayorFile, landratFile]) => {
    const mayor = readGerda(mayorFile);
    const landrat = readGerda(landratFile);

    const mayorWinners = latestWinners(mayor.rows, mayor.index, todayIso);
    const landratWinners = latestWinners(landrat.rows, landrat.index, todayIso);

    const records = [];
    for (const row of mayorWinners.values()) {
      const genderSource = value(row, mayor.index, 'candidate_gender_source');
      const sex = genderFromGerda(row[mayor.index.candidate_gender], genderSource);
      records.push(
        buildRecord({
          row,
          index: mayor.index,
          typ: 'buergermeister',
          ebene: mayoralLevel(row, mayor.index),
          amt: mayoralRole(row, mayor.index, sex),
          quelle: `GERDA mayoral_candidates.csv (${GERDA_COMMIT.slice(0, 7)})`,
          todayIso,
        }),
      );
    }
    for (const row of landratWinners.values()) {
      const genderSource = value(row, landrat.index, 'candidate_gender_source');
      const sex = genderFromGerda(row[landrat.index.candidate_gender], genderSource);
      // Sonderformen tragen eigene Amtsbezeichnungen (Region Hannover,
      // Regionalverband Saarbrücken).
      const agsName = value(row, landrat.index, 'ags_name');
      const baseRole = /^Region\s/i.test(agsName)
        ? 'Regionspräsident'
        : /^Regionalverband\s/i.test(agsName)
          ? 'Regionalverbandspräsident'
          : 'Landrat';
      records.push(
        buildRecord({
          row,
          index: landrat.index,
          typ: 'landrat',
          ebene: 'kreis',
          amt: genderedRole(baseRole, sex),
          quelle: `GERDA landrat_candidates.csv (${GERDA_COMMIT.slice(0, 7)})`,
          todayIso,
        }),
      );
    }

    records.sort(
      (a, b) => a.typ.localeCompare(b.typ) || a.ags.localeCompare(b.ags) || a.ebene.localeCompare(b.ebene),
    );

    const comments = [
      '# Amtsinhaber:innen der kommunalen Verwaltungsspitze (GERDA)',
      `# Quelle: German Election Database, Commit ${GERDA_COMMIT}`,
      '# https://github.com/awiedem/german_election_data (CC BY 4.0)',
      '# Je AGS die jüngste Wahl mit is_winner = TRUE; doppelte Zeilen entdoppelt.',
      '# Geschlecht nur bei Quelle "raw" übernommen (nicht bei "predicted").',
      '# verifiziert = Wahljahr nicht älter als 9 Jahre (Amtszeit + Puffer).',
    ];
    writeCsvFile(outFile, COLUMNS, records, comments);

    summarize(
      records.filter((record) => record.typ === 'buergermeister'),
      'Bürgermeister:innen',
    );
    summarize(
      records.filter((record) => record.typ === 'landrat'),
      'Landrät:innen',
    );
    console.log(`\nGeschrieben: ${outFile}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
