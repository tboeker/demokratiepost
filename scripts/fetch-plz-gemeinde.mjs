/**
 * Erzeugt die Zuordnung PLZ -> Gemeinde/Kreis durch einen geometrischen
 * Verschnitt der PLZ-Polygone mit den Gemeindegrenzen der VG250.
 *
 * Quellen (beide gepinnt):
 * - PLZ-Polygone: yetzt/postleitzahlen, Release 2026.02 (ODbL), TopoJSON.
 * - Gemeindegrenzen: BKG VG250, Ebenen 01.01.2026, UTM32-Shapefile
 *   (Datenlizenz Deutschland – Namensnennung 2.0, „© GeoBasis-DE / BKG“).
 *
 * Methodik wie OpenWahlkreisMap (MIT): Überlappung = Schnittfläche / PLZ-Fläche,
 * alle Gemeinden mit mindestens 1 % Flächenanteil werden übernommen. Eine PLZ
 * kann mehrere Gemeinden umfassen – das ist ein Feature, kein Fehler.
 *
 * Lücken werden aus den amtlichen Zustell-PLZ des Anschriftenverzeichnisses
 * ergänzt (`scripts/source/gemeinde-verwaltungen.csv`), damit jede dort
 * bekannte PLZ mindestens eine Gemeinde hat.
 *
 * Ausgabe: `scripts/source/plz-gemeinde.csv`
 *   plz, ags, kreis_ars, verband_ars, overlap, quelle
 *
 * Aufruf:
 *   node scripts/fetch-plz-gemeinde.mjs
 *   node scripts/fetch-plz-gemeinde.mjs --force       # Downloads neu holen
 *   node scripts/fetch-plz-gemeinde.mjs --land=01     # nur ein Land (Test)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { unzipSync } from 'fflate';
import proj4 from 'proj4';
import polygonClipping from 'polygon-clipping';
import * as shapefile from 'shapefile';
import { feature } from 'topojson-client';
import {
  SATZART,
  normalizeName,
  readCsvFile,
  verbandAgsFromArs,
  writeCsvFile,
} from './lib/kommunen.mjs';

const VG250_URL =
  'https://daten.gdz.bkg.bund.de/produkte/vg/vg250_ebenen_0101/2026/' +
  'vg250_01-01.utm32s.shape.ebenen.zip';
const PLZ_URL =
  'https://github.com/yetzt/postleitzahlen/releases/download/2026.02/' +
  'postleitzahlen.topojson.br';
const MIN_OVERLAP = 0.01; // 1 %

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = resolve(root, 'scripts/source/cache/kommunen');
const vg250Zip = resolve(cacheDir, 'vg250_01-01.utm32s.shape.ebenen.zip');
const vg250Dir = resolve(cacheDir, 'vg250');
const plzFile = resolve(cacheDir, 'postleitzahlen.topojson.br');
const verwaltungenFile = resolve(root, 'scripts/source/gemeinde-verwaltungen.csv');
const overridesFile = resolve(root, 'scripts/source/kommunen-plz-ergaenzungen.csv');
const outFile = resolve(root, 'scripts/source/plz-gemeinde.csv');

const FORCE = process.argv.includes('--force');
const LAND_FILTER = process.argv
  .find((argument) => argument.startsWith('--land='))
  ?.split('=')[1];

// ETRS89 / UTM Zone 32N – dieselbe Projektion wie die VG250-Shapefiles.
const UTM32 = '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs';
const toUtm = (coordinate) => proj4('EPSG:4326', UTM32, coordinate);

function log(message) {
  console.log(message);
}

async function download(url, target) {
  if (!FORCE && existsSync(target)) return;
  log(`Lade ${url}`);
  const response = await fetch(url, {
    headers: { 'user-agent': 'demokratiepost/0.1 (Datenpipeline, Build-Zeit)' },
    signal: AbortSignal.timeout(600000),
  });
  if (!response.ok) {
    throw new Error(`Download fehlgeschlagen: HTTP ${response.status} für ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(target, buffer);
  log(`  ${(buffer.length / 1024 / 1024).toFixed(1)} MB gespeichert`);
}

function ensureVg250() {
  if (!FORCE && existsSync(resolve(vg250Dir, 'vg250_ebenen_0101/VG250_GEM.shp'))) return;
  log('Entpacke VG250 …');
  mkdirSync(vg250Dir, { recursive: true });
  const archive = unzipSync(new Uint8Array(readFileSync(vg250Zip)));
  // Nur die für den Verschnitt benötigten Ebenen entpacken.
  const wanted = /vg250_ebenen_0101\/(VG250_GEM|VG250_KRS)\.(shp|shx|dbf|prj|cpg)$/;
  for (const [name, data] of Object.entries(archive)) {
    if (!wanted.test(name)) continue;
    const target = resolve(vg250Dir, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
}

function transformRing(ring) {
  return ring.map(toUtm);
}

/** GeoJSON-Geometrie in eine polygon-clipping-MultiPolygon-Struktur wandeln. */
function toMultiPolygon(geometry, transform) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates.map((ring) => (transform ? transformRing(ring) : ring))];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((polygon) =>
      polygon.map((ring) => (transform ? transformRing(ring) : ring)),
    );
  }
  return [];
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return area / 2;
}

/** Nettofläche einer MultiPolygon-Struktur (Außenring minus Löcher). */
function multiArea(multi) {
  let total = 0;
  for (const polygon of multi) {
    if (!polygon.length) continue;
    let area = Math.abs(ringArea(polygon[0]));
    for (let i = 1; i < polygon.length; i += 1) {
      area -= Math.abs(ringArea(polygon[i]));
    }
    total += Math.max(0, area);
  }
  return total;
}

function bboxOf(multi) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of multi) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return [minX, minY, maxX, maxY];
}

function bboxOverlap(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Liest die Gemeinden aus der VG250 (bereits in UTM32). */
async function readGemeinden() {
  const shp = resolve(vg250Dir, 'vg250_ebenen_0101/VG250_GEM.shp');
  const source = await shapefile.open(shp, undefined, { encoding: 'utf-8' });
  const gemeinden = [];
  let total = 0;
  while (true) {
    const result = await source.read();
    if (result.done) break;
    total += 1;
    const properties = result.value.properties;
    if (LAND_FILTER && properties.SN_L !== LAND_FILTER) continue;
    const multi = toMultiPolygon(result.value.geometry, false);
    if (multi.length === 0) continue;
    gemeinden.push({
      ags: String(properties.AGS ?? '').trim(),
      ars: String(properties.ARS ?? '').trim(),
      name: String(properties.GEN ?? '').trim(),
      art: String(properties.BEZ ?? '').trim(),
      multi,
      bbox: bboxOf(multi),
    });
  }
  log(
    `VG250: ${total} Gemeinden gelesen, ${gemeinden.length} im Verschnitt` +
      (LAND_FILTER ? ` (Filter Land ${LAND_FILTER})` : ''),
  );
  return gemeinden;
}

/** Liest die Kreise nur zur Plausibilitätskontrolle (ohne Geometrie). */
async function countKreise() {
  const shp = resolve(vg250Dir, 'vg250_ebenen_0101/VG250_KRS.shp');
  const source = await shapefile.open(shp, undefined, { encoding: 'utf-8' });
  let count = 0;
  while (true) {
    const result = await source.read();
    if (result.done) break;
    count += 1;
  }
  return count;
}

function readTopology() {
  log('Lade PLZ-Topologie …');
  const text = brotliDecompressSync(readFileSync(plzFile)).toString('utf8');
  const topology = JSON.parse(text);
  const collection = topology.objects?.postleitzahlen;
  if (!collection?.geometries) {
    throw new Error('Unerwartete TopoJSON-Struktur (postleitzahlen fehlt).');
  }
  return topology;
}

/**
 * Räumlicher Index: Jede Gemeinde wird in alle 10-km-Rasterzellen ihrer
 * Bounding-Box eingetragen. Dadurch bleiben pro PLZ nur wenige Kandidaten.
 */
function buildGrid(gemeinden, cellSize = 10000) {
  const grid = new Map();
  const key = (x, y) => `${x},${y}`;
  for (let index = 0; index < gemeinden.length; index += 1) {
    const [minX, minY, maxX, maxY] = gemeinden[index].bbox;
    for (let x = Math.floor(minX / cellSize); x <= Math.floor(maxX / cellSize); x += 1) {
      for (let y = Math.floor(minY / cellSize); y <= Math.floor(maxY / cellSize); y += 1) {
        const cell = key(x, y);
        if (!grid.has(cell)) grid.set(cell, []);
        grid.get(cell).push(index);
      }
    }
  }
  return { grid, cellSize, key };
}

function main() {
  mkdirSync(cacheDir, { recursive: true });
  return Promise.all([download(VG250_URL, vg250Zip), download(PLZ_URL, plzFile)])
    .then(() => {
      ensureVg250();
      return Promise.all([readGemeinden(), countKreise()]);
    })
    .then(([gemeinden, kreisCount]) => {
      log(`VG250: ${kreisCount} Kreise (inkl. kreisfreie Städte).`);
      const topology = readTopology();
      const geometries = topology.objects.postleitzahlen.geometries;
      const { grid, cellSize, key } = buildGrid(gemeinden);

      // PLZ -> Map(AGS -> { interArea, gemeinde }); eine PLZ kann aus mehreren
      // TopoJSON-Geometrien bestehen (Exklaven) – die Flächen werden summiert.
      const plzAreas = new Map();
      const plzHits = new Map();
      let plzFeatures = 0;
      let pairCount = 0;
      let intersectionCount = 0;
      let geometryErrors = 0;

      for (const geometry of geometries) {
        const plz = String(geometry.properties?.postcode ?? '').trim();
        if (!/^\d{5}$/.test(plz)) continue;
        let multi;
        try {
          const shape = feature(topology, geometry);
          multi = toMultiPolygon(shape.geometry, true);
        } catch (error) {
          geometryErrors += 1;
          continue;
        }
        if (multi.length === 0) continue;
        const area = multiArea(multi);
        if (area <= 0) continue;
        plzFeatures += 1;
        plzAreas.set(plz, (plzAreas.get(plz) ?? 0) + area);

        const bbox = bboxOf(multi);
        const candidates = new Set();
        for (let x = Math.floor(bbox[0] / cellSize); x <= Math.floor(bbox[2] / cellSize); x += 1) {
          for (let y = Math.floor(bbox[1] / cellSize); y <= Math.floor(bbox[3] / cellSize); y += 1) {
            const list = grid.get(key(x, y));
            if (list) for (const index of list) candidates.add(index);
          }
        }

        for (const index of candidates) {
          const gemeinde = gemeinden[index];
          if (!bboxOverlap(bbox, gemeinde.bbox)) continue;
          pairCount += 1;
          let intersection;
          try {
            intersection = polygonClipping.intersection(multi, gemeinde.multi);
          } catch {
            geometryErrors += 1;
            continue;
          }
          if (!intersection || intersection.length === 0) continue;
          const interArea = multiArea(intersection);
          if (interArea <= 0) continue;
          intersectionCount += 1;
          if (!plzHits.has(plz)) plzHits.set(plz, new Map());
          const hits = plzHits.get(plz);
          const previous = hits.get(gemeinde.ags);
          // Mehrere VG250-Features mit demselben AGS (z. B. Exklaven) addieren.
          hits.set(gemeinde.ags, {
            interArea: (previous?.interArea ?? 0) + interArea,
            gemeinde,
          });
        }

        if (plzFeatures % 500 === 0) {
          log(`  ${plzFeatures} PLZ-Geometrien verarbeitet …`);
        }
      }

      log(
        `Geometrie: ${plzFeatures} PLZ-Geometrien, ${pairCount} Kandidatenpaare, ` +
          `${intersectionCount} Schnitte, ${geometryErrors} Fehler.`,
      );

      const rows = [];
      const acceptedPlz = new Set();
      let fallbackUnderOnePercent = 0;

      for (const [plz, area] of [...plzAreas].sort(([a], [b]) => a.localeCompare(b))) {
        const hits = plzHits.get(plz);
        if (!hits) continue;
        const accepted = [];
        let best = null;
        for (const [ags, hit] of hits) {
          const overlap = hit.interArea / area;
          if (!best || overlap > best.overlap) best = { ags, overlap, gemeinde: hit.gemeinde };
          if (overlap >= MIN_OVERLAP) accepted.push({ ags, overlap, gemeinde: hit.gemeinde });
        }
        if (accepted.length === 0 && best) {
          accepted.push(best);
          fallbackUnderOnePercent += 1;
        }
        for (const hit of accepted) {
          rows.push({
            plz,
            ags: hit.gemeinde.ags,
            kreis_ars: hit.gemeinde.ars.slice(0, 5),
            verband_ars: hit.gemeinde.ars.slice(0, 9),
            overlap: hit.overlap.toFixed(6),
            quelle: hit.overlap >= MIN_OVERLAP ? 'geometrie' : 'geometrie-unter-1-prozent',
          });
          acceptedPlz.add(plz);
        }
      }

      // Lücken aus den amtlichen Zustell-PLZ ergänzen.
      let zustellRows = 0;
      let manualRows = 0;
      const verwaltungen = existsSync(verwaltungenFile)
        ? readCsvFile(verwaltungenFile).rows
        : [];
      const existing = new Set(rows.map((row) => `${row.plz}|${row.ags}|${row.kreis_ars}`));
      if (verwaltungen.length > 0) {
        for (const verwaltung of verwaltungen) {
          const plz = String(verwaltung.plz ?? '').trim();
          if (!/^\d{5}$/.test(plz)) continue;
          const ars = String(verwaltung.ars ?? '').trim();
          if (verwaltung.satzart === SATZART.GEMEINDE) {
            const key = `${plz}|${verwaltung.ags}|${ars.slice(0, 5)}`;
            if (existing.has(key)) continue;
            existing.add(key);
            rows.push({
              plz,
              ags: verwaltung.ags,
              kreis_ars: ars.slice(0, 5),
              verband_ars: ars.slice(0, 9),
              overlap: '0',
              quelle: 'zustell-plz',
            });
            acceptedPlz.add(plz);
            zustellRows += 1;
          } else if (verwaltung.satzart === SATZART.GEMEINDEVERBAND) {
            const verbandArs = ars;
            const key = `${plz}|${verwaltung.ags}|${ars.slice(0, 5)}`;
            if (existing.has(key)) continue;
            existing.add(key);
            rows.push({
              plz,
              ags: verbandAgsFromArs(verbandArs),
              kreis_ars: verbandArs.slice(0, 5),
              verband_ars: verbandArs,
              overlap: '0',
              quelle: 'zustell-plz-verband',
            });
            acceptedPlz.add(plz);
            zustellRows += 1;
          } else if (verwaltung.satzart === SATZART.KREIS) {
            const kreisArs = ars;
            const key = `${plz}||${kreisArs}`;
            if (!existing.has(key)) {
              existing.add(key);
              rows.push({
                plz,
                ags: '',
                kreis_ars: kreisArs,
                verband_ars: '',
                overlap: '0',
                quelle: 'zustell-plz-kreis',
              });
              acceptedPlz.add(plz);
              zustellRows += 1;
            }

            // Postfach-PLZ von Kreisverwaltungen: zusätzlich die Gemeinde am
            // Verwaltungssitz zuordnen, damit auch die Bürgermeister-Suche
            // einen Treffer hat.
            const seatName = normalizeName(verwaltung.ort || verwaltung.verwaltungssitz);
            if (seatName) {
              const seat = verwaltungen.find(
                (candidate) =>
                  candidate.satzart === SATZART.GEMEINDE &&
                  candidate.ars.slice(0, 5) === kreisArs &&
                  normalizeName(candidate.name) === seatName,
              );
              if (seat) {
                const seatKey = `${plz}|${seat.ags}|${kreisArs}`;
                if (!existing.has(seatKey)) {
                  existing.add(seatKey);
                  rows.push({
                    plz,
                    ags: seat.ags,
                    kreis_ars: kreisArs,
                    verband_ars: seat.ars.slice(0, 9),
                    overlap: '0',
                    quelle: 'zustell-plz-kreis-sitz',
                  });
                  acceptedPlz.add(plz);
                  zustellRows += 1;
                }
              }
            }
          }
        }
      } else {
        log('Hinweis: gemeinde-verwaltungen.csv fehlt – keine Zustell-PLZ-Ergänzung.');
      }

      // Manuelle Ergänzungen für PLZ, die in keiner der beiden Quellen vorkommen.
      if (existsSync(overridesFile)) {
        const { rows: overrides } = readCsvFile(overridesFile);
        for (const override of overrides) {
          const plz = String(override.plz ?? '').trim();
          const ags = String(override.ags ?? '').trim();
          if (!/^\d{5}$/.test(plz) || !/^\d{8}$/.test(ags)) continue;
          const gemeinde = verwaltungen.find(
            (verwaltung) => verwaltung.satzart === SATZART.GEMEINDE && verwaltung.ags === ags,
          );
          if (!gemeinde) {
            log(`Warnung: manuelle PLZ-Ergänzung ${plz} → AGS ${ags} ohne Gemeindezeile.`);
            continue;
          }
          const ars = String(gemeinde.ars ?? '').trim();
          const key = `${plz}|${ags}|${ars.slice(0, 5)}`;
          if (existing.has(key)) continue;
          existing.add(key);
          rows.push({
            plz,
            ags,
            kreis_ars: ars.slice(0, 5),
            verband_ars: ars.slice(0, 9),
            overlap: '0',
            quelle: 'manuell',
          });
          acceptedPlz.add(plz);
          manualRows += 1;
        }
      }

      rows.sort(
        (a, b) =>
          a.plz.localeCompare(b.plz) ||
          b.overlap.localeCompare(a.overlap) ||
          a.ags.localeCompare(b.ags),
      );

      const comments = [
        '# PLZ -> Gemeinde/Kreis (geometrischer Verschnitt, Überlappung >= 1 %)',
        '#',
        '# Quellen:',
        '# - PLZ-Polygone: yetzt/postleitzahlen, Release 2026.02 (ODbL)',
        '# - Gemeindegrenzen: BKG VG250, Ebenen 01.01.2026 (© GeoBasis-DE / BKG, dl-de/by-2-0)',
        '# - Zustell-PLZ-Ergänzung: Destatis-Anschriftenverzeichnis, Stand 31.01.2026',
        '# Methodik wie OpenWahlkreisMap (MIT): Schnittfläche / PLZ-Fläche.',
        '# overlap = Anteil der PLZ-Fläche; 0 bei Ergänzung aus der Zustell-PLZ.',
        '# ags ist bei Kreis-Ergänzungen leer; verband_ars nur bei Verbänden.',
      ];
      writeCsvFile(
        outFile,
        ['plz', 'ags', 'kreis_ars', 'verband_ars', 'overlap', 'quelle'],
        rows,
        comments,
      );

      const bySource = new Map();
      for (const row of rows) bySource.set(row.quelle, (bySource.get(row.quelle) ?? 0) + 1);
      log(`\nGeschrieben: ${outFile}`);
      log(`  ${rows.length} Zuordnungen für ${acceptedPlz.size} PLZ`);
      log(`  Zustell-PLZ-Ergänzungen: ${zustellRows}`);
      log(`  Manuelle Ergänzungen: ${manualRows}`);
      log(`  PLZ ohne Treffer >= 1 %, aber mit bestem Treffer: ${fallbackUnderOnePercent}`);
      for (const [source, count] of [...bySource].sort()) log(`  ${source}: ${count}`);
    });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
