/**
 * Führt die Landtags-Rohdaten zu den Laufzeit-Dateien zusammen.
 *
 * Eingaben:
 *   - `scripts/source/plz-landtag/configs.json` – OpenWahlkreisMap-Configs
 *     (period_id, election, expected_wk_count) – aus `fetch-plz-landtag.mjs`.
 *   - `scripts/source/plz-landtag/<staat>.csv` – PLZ → Landtagswahlkreis.
 *   - `public/data/mandates-landtag.json` – laufende Mandate aus
 *     `fetch-landtag.mjs`.
 *   - `scripts/source/landtage.csv` – Sitzanschrift je Landtag (Brief-Fallback).
 *   - optional `scripts/source/landtag-contacts/<staat>.json` – angereicherte
 *     Kontakte (E-Mail + Wahlkreisbüro), z. B. aus `fetch-landtag-nrw.mjs`.
 *
 * Konsistenzregel: Nur Länder, deren laufende API-Wahlperiode und
 * OpenWahlkreisMap-Konfiguration in `period_id` **und** Label (Bundesland +
 * Wahljahr) übereinstimmen, bekommen eine PLZ-Suche (Roster + Shard). Alle
 * übrigen bleiben manuell erfassbar; der Grund steht im Build-Log.
 *
 * Ausgabe:
 *   - `public/data/landtag/<staat>.json` – Roster je stimmigem Land.
 *   - `public/data/plz-landtag/<prefix>.json` – `{ plz: [{ staat, wahlkreise }] }`.
 *
 * Aufruf:
 *   node scripts/build-landtag.mjs
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWk, parseCsv, periodMatchesConfig } from './lib/landtag.mjs';
import { matchKey } from './lib/names.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(root, 'scripts/source/plz-landtag');
const contactsDir = resolve(root, 'scripts/source/landtag-contacts');
const rosterDir = resolve(root, 'public/data/landtag');
const shardDir = resolve(root, 'public/data/plz-landtag');
const landtageFile = resolve(root, 'scripts/source/landtage.csv');

function readJson(file, hint) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Datei fehlt: ${file}\nBitte zuerst ausführen: ${hint}`);
    }
    throw error;
  }
}

/** Liest die Sitzanschriften je Landtag (CSV mit `#`-Kommentaren). */
function readLandtage() {
  const lines = readFileSync(landtageFile, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.startsWith('#'));
  const rows = parseCsv(lines.join('\n'));
  const header = rows.shift() ?? [];
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const byStaat = new Map();
  for (const cells of rows) {
    const staat = cells[index.staat]?.trim();
    if (!staat) continue;
    byStaat.set(staat, {
      name: cells[index.name]?.trim(),
      strasse: cells[index.strasse]?.trim(),
      plz: cells[index.plz]?.trim(),
      ort: cells[index.ort]?.trim(),
      url: cells[index.url]?.trim(),
    });
  }
  return byStaat;
}

/** Normalisiert ein Wahlkreis-Label für den Kontakt-Abgleich. */
function normalizeWkName(name) {
  return String(name ?? '').trim().toLowerCase();
}

/**
 * Liest eine optionale Kontakt-Anreicherung je Land.
 * Primär über den normalisierten Namen; als Fallback über den Wahlkreis, wenn
 * genau ein Kontakt dazu existiert (fängt abweichende Schreibweisen wie
 * „Jablonski“/„Jablonski Nagel“ ab).
 */
function readContacts(staat) {
  const file = resolve(contactsDir, `${staat}.json`);
  if (!readable(file)) return { byKey: new Map(), byWahlkreis: new Map(), all: new Set() };
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const byKey = new Map();
  const byWahlkreis = new Map();
  const all = new Set();
  for (const contact of data.contacts ?? []) {
    if (!contact.name) continue;
    all.add(contact);
    byKey.set(matchKey(contact.name), contact);
    if (contact.matchKey) byKey.set(contact.matchKey, contact);
    if (contact.wahlkreis) {
      const key = normalizeWkName(contact.wahlkreis);
      if (!byWahlkreis.has(key)) byWahlkreis.set(key, []);
      byWahlkreis.get(key).push(contact);
    }
  }
  // Mehrdeutige Wahlkreis-Zuordnungen nicht für den Fallback verwenden;
  // eindeutige auf den Kontakt (statt auf die Liste) reduzieren.
  for (const [key, list] of byWahlkreis) {
    if (list.length !== 1) byWahlkreis.delete(key);
    else byWahlkreis.set(key, list[0]);
  }
  return { byKey, byWahlkreis, all };
}

function readable(file) {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}

/** Liest die normalisierte PLZ-CSV eines Landes → Map(plz -> Map(wk -> name)). */
function readPlzCsv(staat) {
  const text = readFileSync(resolve(sourceDir, `${staat}.csv`), 'utf8');
  const rows = parseCsv(text);
  const data = rows.filter((cells) => cells[0] && cells[0].trim() !== '' && !cells[0].startsWith('#'));
  data.shift(); // Kopfzeile plz,wk,wahlkreis_name
  const map = new Map();
  for (const cells of data) {
    const plz = (cells[0] ?? '').trim();
    const wk = normalizeWk(staat, Number((cells[1] ?? '').trim()));
    const name = (cells[2] ?? '').trim();
    if (!/^\d{5}$/.test(plz) || !Number.isInteger(wk)) continue;
    if (!map.has(plz)) map.set(plz, new Map());
    map.get(plz).set(wk, name);
  }
  return map;
}

function main() {
  const { configs } = readJson(
    resolve(sourceDir, 'configs.json'),
    'node scripts/fetch-plz-landtag.mjs',
  );
  const dataset = readJson(
    resolve(root, 'public/data/mandates-landtag.json'),
    'node scripts/fetch-landtag.mjs',
  );
  const landtage = readLandtage();

  mkdirSync(rosterDir, { recursive: true });
  mkdirSync(shardDir, { recursive: true });

  const consistent = [];
  const excluded = [];

  for (const parliament of dataset.parliaments) {
    const config = configs[parliament.staat];
    const matches = periodMatchesConfig(config, {
      id: parliament.periodId,
      label: parliament.periodLabel,
    });
    if (!matches) {
      excluded.push({ parliament, config });
      continue;
    }
    consistent.push({ parliament, config });
  }

  const warnings = [];

  // PLZ-Shards: plz -> Map(staat -> Set(wk))
  const shards = new Map();

  for (const { parliament, config } of consistent) {
    const { staat, stateName } = parliament;
    const plz = readPlzCsv(staat);
    const contacts = readContacts(staat);
    const seat = landtage.get(staat);
    if (!seat) throw new Error(`Sitzanschrift fehlt in landtage.csv: ${staat}`);

    const csvWahlkreise = new Set([...plz.values()].flatMap((map) => [...map.keys()]));
    const expected = Number(config.expected_wk_count);
    if (Number.isFinite(expected) && csvWahlkreise.size !== expected) {
      warnings.push(
        `${staat}: ${csvWahlkreise.size} Wahlkreise in der PLZ-CSV, expected_wk_count=${expected}.`,
      );
    }

    // Länder ohne ausgewiesene Direktmandate (z. B. Saarland mit Wahlkreislisten
    // seit 2022) haben in der API kein `mandate_won = constituency`. Dort dient
    // die Wahlkreis-Zuordnung als Suchschlüssel, damit die PLZ-Suche funktioniert.
    const hasDirect = parliament.mandates.some((m) => m.mandate === 'direct');
    if (!hasDirect) {
      const withConstituency = parliament.mandates.filter((m) => m.wahlkreis).length;
      if (withConstituency > 0) {
        warnings.push(
          `${staat}: keine Direktmandate in der API – nutze die Wahlkreis-Zuordnung ` +
            `(${withConstituency} Mandate) als Suchschlüssel.`,
        );
      }
    }

    const roster = parliament.mandates.map((mandate) => {
      const searchable = mandate.mandate === 'direct' || (!hasDirect && Boolean(mandate.wahlkreis));
      const contact =
        contacts.byKey.get(matchKey(mandate.name)) ??
        (mandate.mandate === 'direct' && mandate.wahlkreis
          ? contacts.byWahlkreis.get(normalizeWkName(mandate.wahlkreis.name))
          : undefined);
      const address = contact?.address
        ? contact.address
        : {
            strasse: seat.strasse,
            plz: seat.plz,
            ort: seat.ort,
            label: seat.name,
          };

      const entry = {
        id: mandate.id,
        name: mandate.name,
        party: mandate.party ?? '',
        sex: mandate.sex ?? undefined,
        mandate: searchable ? 'direct' : 'list',
        parlament: 'landtag',
        bundesland: stateName,
        address,
        profileUrl: mandate.profileUrl,
      };
      if (searchable && mandate.wahlkreis) {
        entry.wahlkreis = mandate.wahlkreis;
      } else {
        entry.state = stateName;
      }
      const email = contact?.email;
      if (email) entry.email = email;
      return entry;
    });

    // Validierung: jedes Direktmandat muss über die PLZ-CSV auffindbar sein.
    for (const entry of roster) {
      if (entry.mandate !== 'direct' || !entry.wahlkreis) continue;
      if (!csvWahlkreise.has(entry.wahlkreis.number)) {
        warnings.push(
          `${staat}: Direktmandat ${entry.name} hat WK ${entry.wahlkreis.number}, ` +
            'der in der PLZ-CSV fehlt.',
        );
      }
    }

    roster.sort(
      (a, b) =>
        (a.wahlkreis?.number ?? 9999) - (b.wahlkreis?.number ?? 9999) ||
        a.name.localeCompare(b.name, 'de'),
    );

    writeFileSync(resolve(rosterDir, `${staat}.json`), `${JSON.stringify(roster, null, 2)}\n`);

    for (const [plzCode, map] of plz) {
      const prefix = plzCode.slice(0, 2);
      if (!shards.has(prefix)) shards.set(prefix, new Map());
      const shard = shards.get(prefix);
      if (!shard.has(plzCode)) shard.set(plzCode, []);
      shard.get(plzCode).push({ staat, wahlkreise: [...map.keys()].sort((a, b) => a - b) });
    }

    const direct = roster.filter((entry) => entry.mandate === 'direct').length;
    console.log(
      `${staat.padEnd(24)} Roster: ${roster.length.toString().padStart(4)} (${direct} direkt), ` +
        `${plz.size.toString().padStart(5)} PLZ, ${contacts.all.size} Kontakt(e) angereichert`,
    );
  }

  // Alte Roster-Dateien nicht mehr stimmiger Länder entfernen.
  const wanted = new Set(consistent.map(({ parliament }) => `${parliament.staat}.json`));
  for (const file of readdirSync(rosterDir)) {
    if (file.endsWith('.json') && !wanted.has(file)) {
      rmSync(resolve(rosterDir, file));
      console.log(`Entfernt (nicht mehr stimmig): public/data/landtag/${file}`);
    }
  }

  // Shards schreiben (vorher alte *.json entfernen, damit keine Reste bleiben).
  for (const file of readdirSync(shardDir)) {
    if (file.endsWith('.json')) rmSync(resolve(shardDir, file));
  }
  let plzCount = 0;
  for (const [prefix, shard] of shards) {
    const object = {};
    for (const [plzCode, entries] of [...shard].sort(([a], [b]) => a.localeCompare(b))) {
      object[plzCode] = entries;
      plzCount += 1;
    }
    writeFileSync(resolve(shardDir, `${prefix}.json`), `${JSON.stringify(object)}\n`);
  }

  console.log(
    `\n${consistent.length} Länder durchsuchbar (${shards.size} PLZ-Shards, ${plzCount} PLZ).`,
  );
  if (excluded.length > 0) {
    console.log(`\nNicht durchsuchbar (Wahlperiode/Zuschnitt passt nicht zur API):`);
    for (const { parliament, config } of excluded) {
      console.log(
        `  ${parliament.staat.padEnd(24)} API: ${String(parliament.periodLabel)} | ` +
          `OWM: period ${config?.period_id ?? '?'} (${config?.election ?? '?'})`,
      );
    }
  }
  if (warnings.length > 0) {
    console.warn(`\nWarnungen:`);
    for (const warning of warnings) console.warn(`  ${warning}`);
  }
  if (consistent.length === 0) {
    throw new Error('Kein Land ist stimmig – bitte Datenstand prüfen.');
  }
  console.log('\nStimmige Länder: ' + consistent.map(({ parliament }) => parliament.stateName).join(', '));
}

main();
