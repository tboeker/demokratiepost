/**
 * Erzeugt aus einer CSV-Quelle (PLZ -> Wahlkreis) die Laufzeit-Shards
 * unter `public/data/plz/<prefix>.json`.
 *
 * Eingabeformat (Kopfzeile optional, Trennzeichen Komma/Semikolon/Tab):
 *   plz,wk
 *   10115,74
 *   10117,74
 *
 * Aufruf:
 *   node --experimental-strip-types scripts/build-plz-index.ts
 *   PLZ_SOURCE=/pfad/zu/datei.csv node --experimental-strip-types scripts/build-plz-index.ts
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = process.env.PLZ_SOURCE ?? resolve(root, 'scripts/source/plz-wahlkreis.csv');
const outDir = resolve(root, 'public/data/plz');

const lines = readFileSync(sourceFile, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.toLowerCase().startsWith('plz'));

// prefix -> plz -> Menge von Wahlkreis-Nummern
const byPrefix = new Map<string, Map<string, Set<number>>>();

for (const line of lines) {
  const [plz, wkRaw] = line.split(/[;,\t]/).map((cell) => cell.trim());
  if (!/^\d{5}$/.test(plz)) continue;

  const wk = Number(wkRaw);
  if (!Number.isInteger(wk)) continue;

  const prefix = plz.slice(0, 2);
  const plzMap = byPrefix.get(prefix) ?? new Map<string, Set<number>>();
  const wahlkreise = plzMap.get(plz) ?? new Set<number>();
  wahlkreise.add(wk);
  plzMap.set(plz, wahlkreise);
  byPrefix.set(prefix, plzMap);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let shardCount = 0;
for (const [prefix, plzMap] of byPrefix) {
  const result: Record<string, number[]> = {};
  for (const [plz, wahlkreise] of [...plzMap].sort(([a], [b]) => a.localeCompare(b))) {
    result[plz] = [...wahlkreise].sort((a, b) => a - b);
  }
  writeFileSync(resolve(outDir, `${prefix}.json`), `${JSON.stringify(result, null, 2)}\n`);
  shardCount += 1;
}

console.log(
  `${shardCount} Shard(s) aus ${lines.length} Zeilen geschrieben nach public/data/plz/`,
);
