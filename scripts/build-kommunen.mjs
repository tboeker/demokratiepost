/**
 * Führt die kommunalen Rohdaten zu den Laufzeit-Dateien zusammen.
 *
 * Eingaben:
 * - `scripts/source/gemeinde-verwaltungen.csv` (Destatis-Anschriften)
 * - `scripts/source/plz-gemeinde.csv` (Geometrie-Join)
 * - `scripts/source/gemeinde-koepfe.csv` (GERDA-Amtsträger:innen)
 *
 * Ausgabe:
 * - `public/data/kommunen/gemeinden-<land>.json` – Kreis-, Verbands- und
 *   Gemeindeverwaltungen je Land inkl. Anschrift, E-Mail und Amtsinhaber:in.
 * - `public/data/kommunen/kreise.json` – alle Kreisverwaltungen (für `landrat`).
 * - `public/data/kommunen/plz-kommunen/<prefix>.json` – PLZ → Gemeinden/Kreise.
 *
 * Validierung: Warnungen statt Abbruch. Geprüft werden u. a. die erwarteten
 * Satzart-Zahlen (401 Kreise, 1.202 Verbände, 12.088 Gemeinden), die
 * PLZ-Abdeckung und die Namensabdeckung je Land.
 *
 * Aufruf:
 *   node scripts/build-kommunen.mjs
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAENDER,
  SATZART,
  behoerdeForGemeinde,
  behoerdeForKreis,
  behoerdeForVerband,
  buildAnrede,
  cleanText,
  defaultGemeindeRole,
  defaultVerbandRole,
  genderedRole,
  kreisAgsFromArs,
  kreisArsFromArs,
  landByArs,
  normalizeName,
  readCsvFile,
  verbandAgsFromArs,
  verbandArsFromArs,
} from './lib/kommunen.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(root, 'scripts/source');
const outDir = resolve(root, 'public/data/kommunen');
const plzShardDir = resolve(outDir, 'plz-kommunen');
const plzIndexDir = resolve(root, 'public/data/plz');

const verwaltungenFile = resolve(sourceDir, 'gemeinde-verwaltungen.csv');
const plzGemeindeFile = resolve(sourceDir, 'plz-gemeinde.csv');
const koepfeFile = resolve(sourceDir, 'gemeinde-koepfe.csv');

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

function headScore(record) {
  return (record.verifiziert === 'TRUE' ? 100000 : 0) + (Number(record.wahljahr) || 0);
}

/**
 * Baut die Kopf-Indizes:
 * - `byAgs`: `${typ}|${ags}` (Primärschlüssel).
 * - `byName`: `${typ}|${ebene}|${land}|${normalisierter ags_name}` mit allen
 *   Kandidaten – für die Fälle, in denen GERDA einen anderen AGS-Stand führt
 *   (z. B. Sachsen, Sachsen-Anhalt, Rheinland-Pfalz).
 */
function buildKoepfe(records) {
  const byAgs = new Map();
  const byName = new Map();
  const all = [];
  for (const record of records) {
    const ags = cleanText(record.ags);
    if (!ags) continue;
    all.push(record);

    const agsKey = `${record.typ}|${ags}`;
    const previous = byAgs.get(agsKey);
    if (!previous || headScore(record) > headScore(previous)) {
      byAgs.set(agsKey, record);
    }

    const name = cleanText(record.ags_name);
    if (name) {
      const nameKey = `${record.typ}|${record.ebene}|${ags.slice(0, 2)}|${normalizeName(name)}`;
      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey).push(record);
    }
  }
  return { byAgs, byName, all };
}

/**
 * Sucht die Amtsinhaber:in primär über den AGS, sonst über den normalisierten
 * Namen. Mehrdeutige Namensmatches werden nicht verwendet (Name bleibt leer).
 */
function findHead(koepfe, { typ, ebene, ags, name, landCode, kreisArs, used }) {
  const byAgs = koepfe.byAgs.get(`${typ}|${ags}`);
  if (byAgs) {
    used?.add(byAgs);
    return byAgs;
  }
  if (!name) return undefined;
  const nameKey = `${typ}|${ebene}|${landCode}|${normalizeName(name)}`;
  const candidates = koepfe.byName.get(nameKey);
  if (!candidates || candidates.length === 0) return undefined;

  let pool = candidates;
  if (pool.length > 1 && kreisArs) {
    const sameKreis = pool.filter((candidate) => candidate.ags.slice(0, 5) === kreisArs);
    if (sameKreis.length > 0) pool = sameKreis;
  }
  if (pool.length !== 1) return undefined;
  used?.add(pool[0]);
  return pool[0];
}

function landName(ars) {
  return landByArs(ars)?.name ?? '';
}

function addHint(parts, hint) {
  const text = cleanText(hint);
  if (text && !parts.includes(text)) parts.push(text);
}

/**
 * Erzeugt den Kopf-Teil eines Eintrags: Amtsbezeichnung, Name, Partei, Sex,
 * Anrede, Wahljahr, Quelle und Hinweise. Ohne verlässliche Amtsinhaber:in
 * bleibt die Rolle neutral, der Name leer (Behördenbrief).
 */
function headFields(head, defaultRole, extraHints = []) {
  const verified = head?.verifiziert === 'TRUE';
  const sex = verified ? cleanText(head.geschlecht) || undefined : undefined;
  const role =
    verified && cleanText(head.amt)
      ? cleanText(head.amt)
      : defaultRole
        ? genderedRole(defaultRole, sex)
        : '';
  const name = verified ? cleanText(head.name) : '';
  const partei = verified ? cleanText(head.partei) : '';
  const wahljahr = head?.wahljahr ? Number(head.wahljahr) || undefined : undefined;
  const quelle = head?.quelle ? cleanText(head.quelle) : '';
  const hinweise = [];
  if (!head) {
    addHint(hinweise, 'Amtsträger:in nicht in den Daten – bitte prüfen/ergänzen.');
  } else if (!verified) {
    addHint(
      hinweise,
      `Amtsträger:in nicht verifiziert${wahljahr ? ` (Wahl ${wahljahr})` : ''} – bitte prüfen/ergänzen.`,
    );
  }
  if (verified && head?.geschlecht_quelle === 'predicted' && !sex) {
    addHint(hinweise, 'Geschlecht nur geschätzt – Anrede bitte prüfen.');
  }
  for (const hint of extraHints) addHint(hinweise, hint);

  return {
    amt: role,
    name,
    partei,
    sex,
    anrede: buildAnrede(role, name, sex),
    wahljahr,
    quelle,
    hinweis: hinweise.join(' '),
  };
}

function numberOrUndefined(value) {
  const text = cleanText(value);
  if (!text) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

function baseEntry(row, ebene, behoerde, extra = {}) {
  const ars = cleanText(row.ars);
  const ags = cleanText(row.ags);
  const entry = {
    id: `kom-${ebene}-${ars}`,
    ebene,
    ars,
    ags,
    kreisArs: kreisArsFromArs(ars),
    land: landName(ars),
    behoerde,
    ...extra,
    address: {
      strasse: cleanText(row.strasse),
      plz: cleanText(row.plz),
      ort: cleanText(row.ort),
    },
    email: cleanText(row.email) || undefined,
    einwohner: numberOrUndefined(row.einwohner),
  };
  if (!entry.email) delete entry.email;
  if (entry.einwohner === undefined) delete entry.einwohner;
  return entry;
}

function buildLand(land, kreisRows, verbandRows, gemeindeRows, koepfe, usedHeads) {
  const entries = [];
  const isStadtstaat = ['02', '04', '11'].includes(land.code);

  for (const row of kreisRows) {
    const ars = cleanText(row.ars);
    const ags = kreisAgsFromArs(ars);
    const kreisArs = ars.slice(0, 5);
    const art = cleanText(row.art);
    const landratCapable = ['Kreis', 'Landkreis', 'Regionalverband'].includes(art);
    const isKreisfrei = art === 'Kreisfreie Stadt' || art === 'Stadtkreis';
    const isRegion = /^Region\s/i.test(row.name);
    const isRegionalverband =
      art === 'Regionalverband' || /^Regionalverband\s/i.test(row.name);

    let head;
    let defaultRole;
    if (landratCapable) {
      head = findHead(koepfe, {
        typ: 'landrat',
        ebene: 'kreis',
        ags,
        name: row.name,
        landCode: land.code,
        kreisArs,
        used: usedHeads,
      });
      defaultRole = isStadtstaat
        ? ''
        : isRegion
          ? 'Regionspräsident'
          : isRegionalverband
            ? 'Regionalverbandspräsident'
            : 'Landrat';
    } else {
      // Kreisfreie Stadt: für die Alternative den Oberbürgermeister mitnehmen.
      head = findHead(koepfe, {
        typ: 'buergermeister',
        ebene: 'gemeinde',
        ags,
        name: row.name,
        landCode: land.code,
        kreisArs,
        used: usedHeads,
      });
      defaultRole = isStadtstaat ? '' : 'Oberbürgermeister';
    }

    const extraHints = [];
    if (isKreisfrei) {
      extraHints.push(
        'Kreisfreie Stadt: Es gibt keine Landrätin/keinen Landrat. ' +
          'Wähle ggf. den Empfängertyp „Bürgermeister(in)“ oder wende dich an die Stadtverwaltung.',
      );
    }
    if (art === 'Stadtstaat') {
      extraHints.push('Stadtstaat: Die Verwaltungsspitze ist die Regierung des Stadtstaats.');
    }

    const entry = baseEntry(row, 'kreis', behoerdeForKreis(row.name, art), {
      ...headFields(head, defaultRole, extraHints),
      landratCapable,
    });
    entries.push(entry);
  }

  for (const row of verbandRows) {
    const ars = cleanText(row.ars);
    const ags = verbandAgsFromArs(ars);
    const head = findHead(koepfe, {
      typ: 'buergermeister',
      ebene: 'verband',
      ags,
      name: row.name,
      landCode: land.code,
      kreisArs: ars.slice(0, 5),
      used: usedHeads,
    });
    const entry = baseEntry(row, 'verband', behoerdeForVerband(row.name, row.art), {
      ...headFields(head, defaultVerbandRole(row.art)),
      verbandArs: ars,
    });
    entries.push(entry);
  }

  for (const row of gemeindeRows) {
    const ars = cleanText(row.ars);
    const ags = cleanText(row.ags);
    const head = findHead(koepfe, {
      typ: 'buergermeister',
      ebene: 'gemeinde',
      ags,
      name: row.name,
      landCode: land.code,
      kreisArs: ars.slice(0, 5),
      used: usedHeads,
    });
    const extraHints = [];
    if (row.art === 'Stadtstaat' || isStadtstaat) {
      extraHints.push('Stadtstaat: Die Verwaltungsspitze ist die Regierung des Stadtstaats.');
    }
    const kreisRow = kreisRows.find((kreis) => cleanText(kreis.ars) === ars.slice(0, 5));
    const kreisfrei =
      kreisRow &&
      (cleanText(kreisRow.art) === 'Kreisfreie Stadt' ||
        cleanText(kreisRow.art) === 'Stadtkreis');
    const defaultRole = isStadtstaat
      ? ''
      : kreisfrei
        ? 'Oberbürgermeister'
        : defaultGemeindeRole(row.art, row.name);
    const verbandArs = verbandArsFromArs(ars);
    const entry = baseEntry(row, 'gemeinde', behoerdeForGemeinde(row.name, row.art), {
      ...headFields(head, defaultRole, extraHints),
    });
    if (verbandRows.some((verband) => cleanText(verband.ars) === verbandArs)) {
      entry.verbandArs = verbandArs;
    }
    entries.push(entry);
  }

  const order = { kreis: 0, verband: 1, gemeinde: 2 };
  entries.sort(
    (a, b) =>
      (order[a.ebene] ?? 9) - (order[b.ebene] ?? 9) ||
      a.behoerde.localeCompare(b.behoerde, 'de'),
  );
  return entries;
}

function writeJson(file, data) {
  writeFileSync(file, `${JSON.stringify(data)}\n`);
}

function fileSize(file) {
  return `${(statSync(file).size / 1024).toFixed(0)} KB`;
}

function main() {
  const verwaltungen = readRequired(
    verwaltungenFile,
    'node scripts/fetch-kommunen-verwaltung.mjs',
  ).rows;
  const plzGemeinde = readRequired(
    plzGemeindeFile,
    'node scripts/fetch-plz-gemeinde.mjs',
  ).rows;
  const koepfe = buildKoepfe(
    readRequired(koepfeFile, 'node scripts/fetch-gemeinde-koepfe.mjs').rows,
  );

  mkdirSync(outDir, { recursive: true });
  mkdirSync(plzShardDir, { recursive: true });

  const byLand = new Map();
  for (const land of LAENDER) {
    byLand.set(land.code, { kreis: [], verband: [], gemeinde: [] });
  }
  for (const row of verwaltungen) {
    const land = landByArs(row.ars);
    if (!land) continue;
    const bucket = byLand.get(land.code);
    if (row.satzart === SATZART.KREIS) bucket.kreis.push(row);
    else if (row.satzart === SATZART.GEMEINDEVERBAND) bucket.verband.push(row);
    else if (row.satzart === SATZART.GEMEINDE) bucket.gemeinde.push(row);
  }

  const allKreise = [];
  const allEntries = [];
  const coverage = [];
  const usedHeads = new Set();
  for (const land of LAENDER) {
    const bucket = byLand.get(land.code);
    const entries = buildLand(
      land,
      bucket.kreis,
      bucket.verband,
      bucket.gemeinde,
      koepfe,
      usedHeads,
    );
    const file = resolve(outDir, `gemeinden-${land.slug}.json`);
    writeJson(file, entries);
    allEntries.push(...entries);

    const kreise = entries.filter((entry) => entry.ebene === 'kreis');
    const landraete = kreise.filter((entry) => entry.landratCapable);
    const buergermeister = entries.filter(
      (entry) => entry.ebene === 'gemeinde' || entry.ebene === 'verband',
    );
    allKreise.push(...kreise);
    coverage.push({
      land,
      file,
      entries: entries.length,
      kreise: kreise.length,
      landraete: landraete.length,
      landraeteNamed: landraete.filter((entry) => entry.name).length,
      buergermeister: buergermeister.length,
      buergermeisterNamed: buergermeister.filter((entry) => entry.name).length,
    });
  }

  const unmatchedHeads = koepfe.all.filter((head) => !usedHeads.has(head));
  if (unmatchedHeads.length > 0) {
    const byKey = new Map();
    for (const head of unmatchedHeads) {
      const key = `${head.ags.slice(0, 2)}|${head.typ}|${head.ebene}`;
      byKey.set(key, (byKey.get(key) ?? 0) + 1);
    }
    console.log(`\nNicht zugeordnete GERDA-Köpfe: ${unmatchedHeads.length}`);
    for (const [key, count] of [...byKey].sort()) {
      const [land, typ, ebene] = key.split('|');
      console.log(
        `  ${land} ${typ}/${ebene}: ${count} (AGS-Stand oder Name nicht eindeutig)`,
      );
    }
  }

  writeJson(resolve(outDir, 'kreise.json'), allKreise);

  // PLZ-Shards: alte Dateien entfernen, damit keine Reste bleiben.
  for (const file of readdirSync(plzShardDir)) {
    if (file.endsWith('.json')) rmSync(resolve(plzShardDir, file));
  }

  const shards = new Map();
  for (const row of plzGemeinde) {
    const plz = cleanText(row.plz);
    if (!/^\d{5}$/.test(plz)) continue;
    const prefix = plz.slice(0, 2);
    if (!shards.has(prefix)) shards.set(prefix, new Map());
    const shard = shards.get(prefix);
    if (!shard.has(plz)) shard.set(plz, []);
    const entry = {
      kreisArs: cleanText(row.kreis_ars),
      overlap: Number(row.overlap) || 0,
    };
    const ags = cleanText(row.ags);
    const verbandArs = cleanText(row.verband_ars);
    if (ags) entry.ags = ags;
    if (verbandArs) entry.verbandArs = verbandArs;
    shard.get(plz).push(entry);
  }

  let plzCount = 0;
  for (const [prefix, shard] of [...shards].sort(([a], [b]) => a.localeCompare(b))) {
    const object = {};
    for (const [plz, entries] of [...shard].sort(([a], [b]) => a.localeCompare(b))) {
      entries.sort((a, b) => b.overlap - a.overlap || (a.ags ?? '').localeCompare(b.ags ?? ''));
      object[plz] = entries;
      plzCount += 1;
    }
    writeJson(resolve(plzShardDir, `${prefix}.json`), object);
  }

  // ---- Validierung / Report -------------------------------------------------
  const warnings = [];
  const expected = { kreis: 401, verband: 1202, gemeinde: 12088 };
  const actual = { kreis: 0, verband: 0, gemeinde: 0 };
  for (const row of verwaltungen) {
    if (row.satzart === SATZART.KREIS) actual.kreis += 1;
    if (row.satzart === SATZART.GEMEINDEVERBAND) actual.verband += 1;
    if (row.satzart === SATZART.GEMEINDE) actual.gemeinde += 1;
  }
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      warnings.push(`${key}: ${actual[key]} Zeilen, erwartet ${value}.`);
    }
  }

  // PLZ-Abdeckung gegen den Bundestags-PLZ-Index (8.218 PLZ).
  const bundPlz = new Set();
  try {
    for (const file of readdirSync(plzIndexDir)) {
      if (!file.endsWith('.json')) continue;
      const shard = JSON.parse(readFileSync(resolve(plzIndexDir, file), 'utf8'));
      for (const plz of Object.keys(shard)) bundPlz.add(plz);
    }
  } catch {
    warnings.push('public/data/plz/ fehlt – PLZ-Abdeckung nicht geprüft.');
  }
  const kommunenPlz = new Set(plzGemeinde.map((row) => cleanText(row.plz)).filter(Boolean));
  const missingPlz = [...bundPlz].filter((plz) => !kommunenPlz.has(plz));
  if (missingPlz.length > 0) {
    warnings.push(
      `${missingPlz.length} PLZ aus dem Bundestags-Index ohne kommunale Zuordnung ` +
        `(z. B. ${missingPlz.slice(0, 8).join(', ')}).`,
    );
  }

  // PLZ, die nur eine Kreiszuordnung haben (typisch: Postfach-PLZ von
  // Kreisverwaltungen). Dort bietet die Bürgermeister-Suche den manuellen Fallback.
  const gemeindeAgs = new Set(
    verwaltungen.filter((row) => row.satzart === SATZART.GEMEINDE).map((row) => row.ags),
  );
  const verbandArs = new Set(
    verwaltungen
      .filter((row) => row.satzart === SATZART.GEMEINDEVERBAND)
      .map((row) => row.ars),
  );
  const plzWithGemeinde = new Set();
  for (const row of plzGemeinde) {
    const ags = cleanText(row.ags);
    const verband = cleanText(row.verband_ars);
    if ((ags && gemeindeAgs.has(ags)) || (verband && verbandArs.has(verband))) {
      plzWithGemeinde.add(cleanText(row.plz));
    }
  }
  const onlyKreis = [...kommunenPlz].filter((plz) => !plzWithGemeinde.has(plz));
  if (onlyKreis.length > 0) {
    warnings.push(
      `${onlyKreis.length} PLZ nur mit Kreiszuordnung (überwiegend Postfach-PLZ); ` +
        `die Bürgermeister-Suche bietet dort den manuellen Fallback ` +
        `(z. B. ${onlyKreis.slice(0, 8).join(', ')}).`,
    );
  }

  // Zustell-PLZ ⊆ Geometrie-PLZ.
  const geometryPlz = new Set(
    plzGemeinde.filter((row) => row.quelle === 'geometrie').map((row) => cleanText(row.plz)),
  );
  const zustellPlz = new Set(
    verwaltungen.map((row) => cleanText(row.plz)).filter((plz) => /^\d{5}$/.test(plz)),
  );
  const zustellMissing = [...zustellPlz].filter((plz) => !geometryPlz.has(plz));
  if (zustellMissing.length > 0) {
    warnings.push(
      `${zustellMissing.length} Zustell-PLZ ohne Geometrie-Treffer ` +
        `(z. B. ${zustellMissing.slice(0, 8).join(', ')}).`,
    );
  }

  // Stichproben.
  const probe = (ags, ebene) =>
    allEntries.find((item) => item.ags === ags && item.ebene === ebene);
  const kiel = probe('01002000', 'gemeinde');
  const flensburg = allKreise.find((entry) => entry.ars === '01001');
  const adenau = probe('07131500', 'verband');
  const samples = [
    ['Kiel (Gemeinde)', kiel],
    ['Flensburg (Kreis, kreisfrei)', flensburg],
    ['Adenau (Verbandsgemeinde)', adenau],
  ];
  console.log('\nStichproben:');
  for (const [label, entry] of samples) {
    if (!entry) {
      warnings.push(`Stichprobe ${label} nicht gefunden.`);
      continue;
    }
    console.log(
      `  ${label}: ${entry.behoerde} | ${entry.amt ?? ''} ${entry.name ?? ''}`.trim() +
        `${entry.wahljahr ? ` (${entry.wahljahr})` : ''}` +
        `${entry.hinweis ? ` | ${entry.hinweis}` : ''}`,
    );
  }

  console.log('\nAbdeckung je Land:');
  for (const item of coverage) {
    console.log(
      `  ${item.land.name.padEnd(24)} ${item.entries.toString().padStart(5)} Einheiten, ` +
        `${item.kreise.toString().padStart(3)} Kreise (${item.landraeteNamed}/${item.landraete} Landrät:innen), ` +
        `${item.buergermeisterNamed}/${item.buergermeister} Bürgermeister:innen | ${fileSize(item.file)}`,
    );
  }

  console.log(
    `\nGeschrieben: ${plzCount} PLZ in ${shards.size} Shards, ` +
      `${allKreise.length} Kreise in kreise.json`,
  );
  if (warnings.length > 0) {
    console.warn('\nWarnungen:');
    for (const warning of warnings) console.warn(`  ${warning}`);
  }
  console.log('\nFertig.');
}

main();
