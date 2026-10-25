/**
 * Baut aus den MaStR-Rohdaten die Laufzeitdaten für den Empfängertyp
 * `netzbetreiber` (M6).
 *
 * Eingaben:
 * - `scripts/source/mastr-netzbetreiber-operators.csv`
 * - `scripts/source/mastr-netzbetreiber-plz.csv`
 * - `scripts/source/mastr-netzbetreiber-ags.csv`
 * - `public/data/kommunen/plz-kommunen/<prefix>.json` (M5-Gemeindezuordnung)
 * - `public/data/plz/<prefix>.json` (Vollständigkeitsprüfung)
 *
 * Ausgabe:
 * - `public/data/netzbetreiber/netzbetreiber.json` – Betreiberstammdaten
 * - `public/data/netzbetreiber/meta.json` – Stand, Quelle, Methodik, Kennzahlen
 * - `public/data/netzbetreiber/plz-netzbetreiber/<prefix>.json` – PLZ → Betreiber
 * - `scripts/source/netzbetreiber-prueffaelle.csv` – unsichere Fälle (Anteil < 70 %
 *   oder Gemeinde-Fallback) für die manuelle Prüfung
 *
 * Aufruf:
 *   node scripts/build-netzbetreiber.mjs
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanText, readCsvFile, writeCsvFile } from './lib/kommunen.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(root, 'scripts/source');
const outDir = resolve(root, 'public/data/netzbetreiber');
const shardDir = resolve(outDir, 'plz-netzbetreiber');
const kommuneShardDir = resolve(root, 'public/data/kommunen/plz-kommunen');
const plzIndexDir = resolve(root, 'public/data/plz');

const operatorsFile = resolve(sourceDir, 'mastr-netzbetreiber-operators.csv');
const plzFile = resolve(sourceDir, 'mastr-netzbetreiber-plz.csv');
const agsFile = resolve(sourceDir, 'mastr-netzbetreiber-ags.csv');
const pruefFile = resolve(sourceDir, 'netzbetreiber-prueffaelle.csv');

const EXPORT_STAND = '2026-10-01';
const EXPORT_REVISION = '26.1';
/** Ab so vielen Anlagen in der PLZ wird die PLZ-Verteilung verwendet. */
const MIN_PLZ_UNITS = 10;
/** Weitere Betreiber werden ab diesem Anteil angezeigt. */
const MIN_SHARE = 0.1;
/** Unter diesem Anteil gilt die Zuordnung als Grenzgebiet. */
const WARN_SHARE = 0.7;

function log(message) {
  console.log(`[netzbetreiber] ${message}`);
}

function readRequired(file, hint) {
  try {
    return readCsvFile(file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Datei fehlt: ${file}\nBitte zuerst ausführen: ${hint}`);
    }
    throw error;
  }
}

function jsonFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function roundShare(value) {
  return Math.round(value * 10000) / 10000;
}

/** Liest die MaStR-CSVs in Map-Strukturen. */
function loadMastr() {
  const operatorRecords = readRequired(
    operatorsFile,
    'node scripts/fetch-mastr-netzbetreiber.mjs',
  ).rows;
  const operators = new Map();
  for (const record of operatorRecords) {
    const id = cleanText(record.id);
    if (!id) continue;
    operators.set(id, {
      id,
      name: cleanText(record.name),
      strasse: cleanText(record.strasse),
      plz: cleanText(record.plz),
      ort: cleanText(record.ort),
      bundesland: cleanText(record.bundesland),
      email: cleanText(record.email),
      telefon: cleanText(record.telefon),
      geschlossen: /^true$/i.test(cleanText(record.geschlossen)),
      kunden100k: /^true$/i.test(cleanText(record.kunden100k)),
    });
  }

  const plzRows = readRequired(plzFile, 'node scripts/fetch-mastr-netzbetreiber.mjs').rows;
  const plzByPlz = new Map();
  for (const record of plzRows) {
    const plz = cleanText(record.plz);
    const operatorId = cleanText(record.netzbetreiber_id);
    const anzahl = Number(cleanText(record.anzahl)) || 0;
    if (!/^\d{5}$/.test(plz) || !operatorId || anzahl <= 0) continue;
    if (!plzByPlz.has(plz)) plzByPlz.set(plz, []);
    plzByPlz.get(plz).push({
      plz,
      ags: cleanText(record.ags),
      gemeinde: cleanText(record.gemeinde),
      operatorId,
      anzahl,
    });
  }

  const agsRows = readRequired(agsFile, 'node scripts/fetch-mastr-netzbetreiber.mjs').rows;
  const agsByAgs = new Map();
  for (const record of agsRows) {
    const ags = cleanText(record.ags).padStart(8, '0');
    const operatorId = cleanText(record.netzbetreiber_id);
    const anzahl = Number(cleanText(record.anzahl)) || 0;
    if (!/^\d{8}$/.test(ags) || !operatorId || anzahl <= 0) continue;
    if (!agsByAgs.has(ags)) agsByAgs.set(ags, []);
    agsByAgs.get(ags).push({
      ags,
      gemeinde: cleanText(record.gemeinde),
      operatorId,
      anzahl,
    });
  }

  return { operators, plzByPlz, agsByAgs };
}

/** Liest die M5-Shards (PLZ → Gemeinden/Kreise). */
function loadKommuneShards() {
  const byPlz = new Map();
  for (const name of jsonFiles(kommuneShardDir)) {
    const shard = readJson(resolve(kommuneShardDir, name));
    for (const [plz, entries] of Object.entries(shard)) {
      byPlz.set(plz, entries);
    }
  }
  return byPlz;
}

/** Alle bekannten PLZ aus dem Bundestags-Index und den M5-Shards. */
function loadAllPlz(kommuneByPlz) {
  const all = new Set(kommuneByPlz.keys());
  for (const name of jsonFiles(plzIndexDir)) {
    const shard = readJson(resolve(plzIndexDir, name));
    for (const plz of Object.keys(shard)) all.add(plz);
  }
  return [...all].filter((plz) => /^\d{5}$/.test(plz)).sort();
}

/** Häufigster nicht-leerer Gemeindename einer Trefferliste. */
function mostCommonGemeinde(rows) {
  const counts = new Map();
  for (const row of rows) {
    const name = cleanText(row.gemeinde);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + row.anzahl);
  }
  let best = '';
  let bestCount = -1;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

/** Wählt den AGS mit der größten Flächenüberlappung aus dem M5-Shard. */
function bestAgs(entries) {
  const candidates = (entries ?? [])
    .filter((entry) => entry.ags && /^\d{8}$/.test(entry.ags))
    .sort((a, b) => (b.overlap ?? 0) - (a.overlap ?? 0));
  return candidates[0]?.ags ?? '';
}

/**
 * Fasst eine Trefferliste zu Betreiberanteilen zusammen: Top-1 immer, weitere
 * Betreiber ab `MIN_SHARE`. Dedupliziert je Betreiber-ID (höchster Anteil).
 */
function rankOperators(rows) {
  const byOperator = new Map();
  for (const row of rows) {
    byOperator.set(row.operatorId, (byOperator.get(row.operatorId) ?? 0) + row.anzahl);
  }
  const total = [...byOperator.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];
  const ranked = [...byOperator.entries()]
    .map(([operatorId, anzahl]) => ({ operatorId, anzahl, anteil: roundShare(anzahl / total) }))
    .sort((a, b) => b.anzahl - a.anzahl || a.operatorId.localeCompare(b.operatorId));
  return ranked.filter((entry, index) => index === 0 || entry.anteil >= MIN_SHARE);
}

function main() {
  log('lese MaStR-CSVs');
  const { operators, plzByPlz, agsByAgs } = loadMastr();
  log(`Betreiber im Roster: ${operators.size}`);

  log('lese M5-Gemeindezuordnung');
  const kommuneByPlz = loadKommuneShards();
  const allPlz = loadAllPlz(kommuneByPlz);
  log(`PLZ gesamt: ${allPlz.length}`);

  const shards = new Map();
  const pruefRows = [];
  const stats = {
    plzTotal: allPlz.length,
    withResult: 0,
    plzLevel: 0,
    gemeindeFallback: 0,
    withoutResult: 0,
    lowShare: 0,
    units: 0,
  };
  const topShareBuckets = { high: 0, medium: 0, low: 0 };

  for (const plz of allPlz) {
    const plzRows = (plzByPlz.get(plz) ?? []).filter((row) => {
      const operator = operators.get(row.operatorId);
      return operator && !operator.geschlossen;
    });
    const plzUnits = plzRows.reduce((sum, row) => sum + row.anzahl, 0);

    let rows = [];
    let quelle = 'plz';
    let fallbackAgs = '';
    if (plzUnits >= MIN_PLZ_UNITS) {
      rows = plzRows;
    } else {
      fallbackAgs = bestAgs(kommuneByPlz.get(plz));
      const agsRows = fallbackAgs
        ? (agsByAgs.get(fallbackAgs) ?? []).filter((row) => {
            const operator = operators.get(row.operatorId);
            return operator && !operator.geschlossen;
          })
        : [];
      if (agsRows.length > 0) {
        rows = agsRows;
        quelle = 'gemeinde';
      }
    }

    const ranked = rankOperators(rows);
    if (ranked.length === 0) {
      stats.withoutResult += 1;
      continue;
    }

    const gemeinde = mostCommonGemeinde(rows);
    const totalUnits = rows.reduce((sum, row) => sum + row.anzahl, 0);
    const entries = [];
    for (const entry of ranked) {
      const operator = operators.get(entry.operatorId);
      if (!operator) continue;
      const ags = quelle === 'gemeinde' ? fallbackAgs : (rows[0]?.ags ?? '');
      entries.push({
        id: entry.operatorId,
        ags,
        gemeinde,
        anteil: entry.anteil,
        anzahl: entry.anzahl,
        quelle,
      });
      if (quelle === 'gemeinde' || entry.anteil < WARN_SHARE) {
        stats.lowShare += 1;
        pruefRows.push({
          plz,
          gemeinde,
          quelle,
          anteil: entry.anteil,
          netzbetreiber: operator.name,
          anzahl: entry.anzahl,
          hinweis:
            quelle === 'gemeinde'
              ? 'Gemeinde-Fallback (keine/wenige PV-Anlagen in der PLZ)'
              : 'Grenzgebiet (Anteil < 70 %)',
        });
      }
    }

    if (entries.length === 0) {
      stats.withoutResult += 1;
      continue;
    }

    stats.withResult += 1;
    stats.units += totalUnits;
    if (quelle === 'plz') stats.plzLevel += 1;
    else stats.gemeindeFallback += 1;
    if (entries[0].anteil >= 0.95) topShareBuckets.high += 1;
    else if (entries[0].anteil >= 0.7) topShareBuckets.medium += 1;
    else topShareBuckets.low += 1;

    const prefix = plz.slice(0, 2);
    if (!shards.has(prefix)) shards.set(prefix, {});
    shards.get(prefix)[plz] = entries;
  }

  // Roster: alle Betreiber mit Anlagen (auch wenn eine PLZ am Ende keinen Treffer
  // hat), damit jede Referenz auflösbar bleibt und die Datei vollständig ist.
  const roster = [...operators.values()]
    .filter((operator) => !operator.geschlossen)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((operator) => ({
      id: operator.id,
      name: operator.name,
      address: {
        strasse: operator.strasse,
        plz: operator.plz,
        ort: operator.ort,
      },
      email: operator.email || undefined,
      telefon: operator.telefon || undefined,
      bundesland: operator.bundesland || undefined,
    }));

  // Ausgabe vorbereiten (alte Shards entfernen, damit keine Karteileichen bleiben).
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(shardDir, { recursive: true });

  const meta = {
    stand: EXPORT_STAND,
    revision: EXPORT_REVISION,
    quelle:
      'Marktstammdatenregister (Bundesnetzagentur), Gesamtdatenexport ' +
      `${EXPORT_STAND} (Revision ${EXPORT_REVISION})`,
    lizenz: 'Datenlizenz Deutschland – Namensnennung 2.0 (dl-de/by-2-0)',
    methodik:
      'Zuordnung aus in Betrieb befindlichen PV-Anlagen (EinheitBetriebsstatus 35) ' +
      'über den Netzanschlusspunkt zum Stromnetzbetreiber. Keine amtliche ' +
      'Netzgebietsgrenze. Top-1 immer, weitere Betreiber ab 10 % Anteil; ' +
      `PLZ-Verteilung ab ${MIN_PLZ_UNITS} Anlagen, sonst Gemeinde-Fallback.`,
    minPlzUnits: MIN_PLZ_UNITS,
    minShare: MIN_SHARE,
    warnShare: WARN_SHARE,
    erzeugt: new Date().toISOString(),
    betreiber: roster.length,
    plz: {
      gesamt: stats.plzTotal,
      mitTreffer: stats.withResult,
      plzEbene: stats.plzLevel,
      gemeindeFallback: stats.gemeindeFallback,
      ohneTreffer: stats.withoutResult,
    },
    top1Anteil: topShareBuckets,
    unsichereTreffer: pruefRows.length,
    anlagenInTreffern: stats.units,
  };

  writeFileSync(resolve(outDir, 'netzbetreiber.json'), `${JSON.stringify(roster)}\n`);
  writeFileSync(resolve(outDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  for (const [prefix, data] of [...shards.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    writeFileSync(resolve(shardDir, `${prefix}.json`), `${JSON.stringify(data)}\n`);
  }

  writeCsvFile(
    pruefFile,
    ['plz', 'gemeinde', 'quelle', 'anteil', 'netzbetreiber', 'anzahl', 'hinweis'],
    pruefRows.sort((a, b) => a.plz.localeCompare(b.plz)),
    [
      '# Unsichere PLZ→Netzbetreiber-Zuordnungen (Anteil < 70 % oder Gemeinde-Fallback)',
      `# Stand ${EXPORT_STAND}, erzeugt aus dem MaStR-Gesamtdatenexport`,
    ],
  );

  // Validierung: Warnungen statt Abbruch.
  const missingPlz = allPlz.filter((plz) => !shards.has(plz.slice(0, 2)) || !shards.get(plz.slice(0, 2))[plz]);
  log(
    `PLZ: ${stats.withResult}/${stats.plzTotal} mit Treffer ` +
      `(${stats.plzLevel} PLZ-Ebene, ${stats.gemeindeFallback} Gemeinde-Fallback, ` +
      `${stats.withoutResult} ohne Treffer)`,
  );
  log(
    `Top-1-Anteil: ≥ 95 %: ${topShareBuckets.high}, 70–95 %: ${topShareBuckets.medium}, ` +
      `< 70 %: ${topShareBuckets.low}`,
  );
  log(`Roster: ${roster.length} Betreiber, Shards: ${shards.size}, unsichere Treffer: ${pruefRows.length}`);

  const referenced = new Set();
  for (const data of shards.values()) {
    for (const entries of Object.values(data)) {
      for (const entry of entries) referenced.add(entry.id);
    }
  }
  const missingOperators = [...referenced].filter((id) => !roster.some((op) => op.id === id));
  if (missingOperators.length > 0) {
    log(`WARNUNG: ${missingOperators.length} Betreiber-IDs ohne Roster-Eintrag.`);
  }
  const unusedOperators = roster.filter((op) => !referenced.has(op.id));
  if (unusedOperators.length > 0) {
    log(`Hinweis: ${unusedOperators.length} Roster-Einträge ohne Shard-Treffer.`);
  }
  if (missingPlz.length > 0) {
    log(
      `WARNUNG: ${missingPlz.length} PLZ ohne Treffer (manuelles Formular), ` +
        `z. B. ${missingPlz.slice(0, 12).join(', ')}`,
    );
  }

  // Top-10-Betreiber nach Anzahl der Gemeinden/Anlagen (Plausibilitätscheck).
  const operatorUnits = new Map();
  for (const rows of agsByAgs.values()) {
    for (const row of rows) {
      operatorUnits.set(row.operatorId, (operatorUnits.get(row.operatorId) ?? 0) + row.anzahl);
    }
  }
  const top10 = [...operatorUnits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, units]) => `${operators.get(id)?.name ?? id} (${units.toLocaleString('de-DE')})`);
  log(`Top-10-Betreiber nach Anlagen: ${top10.join(', ')}`);

  // Stichproben aus der Abnahme.
  const spotChecks = [
    ['10115', 'Stromnetz Berlin'],
    ['80331', 'SWM'],
    ['50667', 'RheinNetz'],
    ['01067', 'SachsenNetze'],
    ['24103', 'SWKiel'],
    ['79098', 'badenova'],
    ['04109', 'Netz Leipzig'],
    ['20095', 'Hamburger Energienetze'],
    ['28195', 'wesernetz'],
    ['30159', ''],
    ['66111', 'Saarbrücken'],
  ];
  for (const [plz, expected] of spotChecks) {
    const entries = shards.get(plz.slice(0, 2))?.[plz] ?? [];
    const names = entries
      .map((entry) => `${operators.get(entry.id)?.name ?? entry.id} (${Math.round(entry.anteil * 100)} %, ${entry.quelle})`)
      .join('; ');
    const ok = expected ? names.toLowerCase().includes(expected.toLowerCase()) : names.length > 0;
    log(`Stichprobe ${plz}: ${names || 'kein Treffer'} ${ok ? '✓' : `✗ erwartet: ${expected}`}`);
  }

  log(`fertig: ${outDir}`);
}

main();
