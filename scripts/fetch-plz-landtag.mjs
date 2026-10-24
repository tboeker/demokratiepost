/**
 * Holt die Zuordnung PLZ -> Landtagswahlkreis für alle 16 Bundesländer und die
 * zugehörigen OpenWahlkreisMap-Konfigurationen vom gepinnten Commit.
 *
 * Quellen:
 * - OpenWahlkreisMap (MIT): räumlicher Verschnitt der PLZ-Gebiete
 *   (yetzt/postleitzahlen, ODbL) mit den amtlichen Landtagswahlkreisen.
 *     https://github.com/maximilion-ai/OpenWahlkreisMap
 *
 * Ausgabe:
 * - `scripts/source/plz-landtag/<staat>.csv` – normalisiert, nur Überlappungen
 *   ≥ 1 %, Spalten `plz,wk,wahlkreis_name` (mit Kopfkommentaren wie beim Bund)
 * - `scripts/source/plz-landtag/configs.json` – Teilmenge der Configs
 *   (`state_name`, `parliament`, `period_id`, `election`, `expected_wk_count`)
 *   für den Konsistenzcheck in `build-landtag.mjs`.
 *
 * Aufruf:
 *   node scripts/fetch-plz-landtag.mjs
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { LANDTAG_PARLIAMENTS, parseCsv } from './lib/landtag.mjs';

const SOURCE_COMMIT = '6dbe352dccf4dbda3bb05e94f764fc9ff9ae4923';
const SOURCE_BASE = `https://raw.githubusercontent.com/maximilion-ai/OpenWahlkreisMap/${SOURCE_COMMIT}`;
const MIN_OVERLAP = 0.01; // 1 %

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'scripts/source/plz-landtag');

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

/** Nur die Felder, die der Build-Schritt braucht. */
function configSubset(config) {
  return {
    state_name: config.state_name,
    parliament: config.parliament,
    period_id: config.period_id,
    election: config.election,
    expected_wk_count: config.expected_wk_count,
  };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const configs = {};

  for (const { staat } of LANDTAG_PARLIAMENTS) {
    const configText = await download(`${SOURCE_BASE}/configs/landtag/${staat}.yaml`);
    const config = parse(configText);
    configs[staat] = configSubset(config);

    const csvText = await download(`${SOURCE_BASE}/data/landtag/${staat}/plz-wahlkreis.csv`);
    const rows = parseCsv(csvText);
    const header = rows.shift()?.map((cell) => cell.trim()) ?? [];
    const index = Object.fromEntries(header.map((name, i) => [name, i]));
    for (const column of ['plz', 'wahlkreis_nr', 'wahlkreis_name', 'overlap']) {
      if (index[column] === undefined) {
        throw new Error(`Unerwartetes CSV-Format für ${staat}: Spalte "${column}" fehlt.`);
      }
    }

    const assignments = new Map(); // plz -> Map(wk -> name)
    let skipped = 0;
    for (const cells of rows) {
      const plz = (cells[index.plz] ?? '').trim();
      const wk = Number((cells[index.wahlkreis_nr] ?? '').trim());
      const name = (cells[index.wahlkreis_name] ?? '').trim();
      const overlap = Number((cells[index.overlap] ?? '').trim());

      if (!/^\d{5}$/.test(plz) || !Number.isInteger(wk) || !(overlap >= MIN_OVERLAP)) {
        skipped += 1;
        continue;
      }
      if (!assignments.has(plz)) assignments.set(plz, new Map());
      assignments.get(plz).set(wk, name);
    }

    const wahlkreise = new Set([...assignments.values()].flatMap((map) => [...map.keys()]));
    const expected = Number(config.expected_wk_count);
    if (Number.isFinite(expected) && wahlkreise.size !== expected) {
      console.warn(
        `Warnung ${staat}: ${wahlkreise.size} Wahlkreise in der CSV, erwartet ${expected}.`,
      );
    }

    const headerLines = [
      `# PLZ -> Landtagswahlkreis ${config.state_name} (${config.parliament})`,
      '#',
      '# Quelle: OpenWahlkreisMap (MIT), abgeleitet aus den PLZ-Gebieten von',
      '# yetzt/postleitzahlen (ODbL) und den amtlichen Wahlkreisgrenzen des Landes.',
      `# Stand: OpenWahlkreisMap ${SOURCE_COMMIT.slice(0, 7)} | Wahlperiode ${config.period_id} (${config.election})`,
      '# Nur Überlappungen >= 1 % sind enthalten.',
      'plz,wk,wahlkreis_name',
    ];

    const lines = [...assignments]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([plz, map]) =>
        [...map]
          .sort(([a], [b]) => a - b)
          .map(([wk, name]) => `${plz},${wk},${name.includes(',') ? `"${name}"` : name}`),
      );

    const target = resolve(outDir, `${staat}.csv`);
    const temp = `${target}.tmp`;
    writeFileSync(temp, `${[...headerLines, ...lines].join('\n')}\n`);
    renameSync(temp, target);

    console.log(
      `${staat.padEnd(24)} ${assignments.size.toString().padStart(5)} PLZ, ` +
        `${wahlkreise.size.toString().padStart(3)} Wahlkreise${skipped ? ` (${skipped} Zeilen < 1 % verworfen)` : ''}`,
    );
  }

  writeFileSync(
    resolve(outDir, 'configs.json'),
    `${JSON.stringify({ commit: SOURCE_COMMIT, configs }, null, 2)}\n`,
  );
  console.log(`Konfigurationen geschrieben nach scripts/source/plz-landtag/configs.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
