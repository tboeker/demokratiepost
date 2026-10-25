/**
 * Erzeugt die Rohdaten für die PLZ→Verteilnetzbetreiber-Zuordnung (M6) aus dem
 * MaStR-Gesamtdatenexport.
 *
 * Quelle: Marktstammdatenregister (Bundesnetzagentur), Gesamtdatenexport
 * 01.10.2026 (Revision 26.1), Datenlizenz Deutschland – Namensnennung 2.0.
 * Der Export ist ca. 3 GB groß und wird nur selten benötigt. Das Skript liest
 * ihn streaming (yauzl + eigener XML-Record-Parser), ohne ihn zu entpacken.
 *
 * Ausgabe (committet, damit `data:netz:build` ohne den großen Download läuft):
 * - `scripts/source/mastr-netzbetreiber-operators.csv`
 * - `scripts/source/mastr-netzbetreiber-plz.csv`
 * - `scripts/source/mastr-netzbetreiber-ags.csv`
 *
 * Aufruf:
 *   node scripts/fetch-mastr-netzbetreiber.mjs
 *   MASTR_ZIP=/pfad/zum/export.zip node scripts/fetch-mastr-netzbetreiber.mjs
 *   node scripts/fetch-mastr-netzbetreiber.mjs --force   # Download erneuern
 */
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';
import yauzl from 'yauzl';
import { cleanEmail, cleanText, normalizePlz, writeCsvFile } from './lib/kommunen.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = resolve(root, 'scripts/source/cache/mastr');
const sourceDir = resolve(root, 'scripts/source');

const EXPORT_STAND = '2026-10-01';
const EXPORT_REVISION = '26.1';
const EXPORT_URL =
  'https://download.marktstammdatenregister.de/Stichtag/Gesamtdatenexport_20261001_26.1.zip';
const DEFAULT_ZIP = resolve(cacheDir, 'Gesamtdatenexport_20261001_26.1.zip');
const FORCE = process.argv.includes('--force');

const operatorsFile = resolve(sourceDir, 'mastr-netzbetreiber-operators.csv');
const plzFile = resolve(sourceDir, 'mastr-netzbetreiber-plz.csv');
const agsFile = resolve(sourceDir, 'mastr-netzbetreiber-ags.csv');

function log(message) {
  console.log(`[mastr] ${message}`);
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Lädt den gepinnten Export herunter (mit Resume) und gibt den Pfad zurück. */
async function ensureDownload() {
  const fromEnv = process.env.MASTR_ZIP;
  if (fromEnv) {
    const file = resolve(fromEnv);
    if (!existsSync(file)) throw new Error(`MASTR_ZIP existiert nicht: ${file}`);
    log(`nutze lokalen Export: ${file}`);
    return file;
  }

  const file = DEFAULT_ZIP;
  const part = `${file}.part`;
  if (FORCE) {
    rmSync(file, { force: true });
    rmSync(part, { force: true });
  }

  // Ein vorhandener, nicht angebrochener Export wird ohne Netzzugriff genutzt.
  // Das Skript schreibt selbst nur nach `.part` und benennt erst am Ende um.
  if (existsSync(file)) {
    log(`nutze vorhandenen Export: ${file} (${formatBytes(statSync(file).size)})`);
    return file;
  }

  const head = await fetch(EXPORT_URL, { method: 'HEAD' });
  if (!head.ok) throw new Error(`Download-HEAD fehlgeschlagen: HTTP ${head.status}`);
  const expected = Number(head.headers.get('content-length') ?? 0);
  if (!expected) throw new Error('Download-Größe unbekannt (kein Content-Length).');

  mkdirSync(cacheDir, { recursive: true });
  let offset = existsSync(part) ? statSync(part).size : 0;
  if (offset > expected) {
    rmSync(part, { force: true });
    offset = 0;
  }
  log(
    offset > 0
      ? `setze Download bei ${formatBytes(offset)} fort (${EXPORT_URL})`
      : `lade ${formatBytes(expected)} herunter (${EXPORT_URL})`,
  );

  const response = await fetch(EXPORT_URL, {
    headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`Download fehlgeschlagen: HTTP ${response.status}`);
  }
  if (!response.body) throw new Error('Download ohne Body.');

  let written = offset;
  let nextLog = Math.floor(written / (512 * 1024 * 1024)) * 512 * 1024 * 1024 + 512 * 1024 * 1024;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      written += chunk.length;
      if (written >= nextLog) {
        log(`  ${formatBytes(written)} / ${formatBytes(expected)}`);
        nextLog += 512 * 1024 * 1024;
      }
      callback(null, chunk);
    },
  });

  const out = createWriteStream(part, { flags: offset > 0 ? 'a' : 'w' });
  await pipeline(Readable.fromWeb(response.body), progress, out);
  const size = statSync(part).size;
  if (size !== expected) {
    throw new Error(`Download unvollständig: ${formatBytes(size)} statt ${formatBytes(expected)}.`);
  }
  renameSync(part, file);
  log(`Download abgeschlossen: ${file}`);
  return file;
}

/** Öffnet das ZIP und sammelt die Einträge (ZIP64-fähig über yauzl). */
async function openZip(file) {
  const zipfile = await new Promise((resolveOpen, reject) => {
    yauzl.open(file, { lazyEntries: false, autoClose: false }, (error, opened) => {
      if (error) reject(error);
      else resolveOpen(opened);
    });
  });
  const entries = new Map();
  zipfile.on('entry', (entry) => entries.set(entry.fileName, entry));
  await once(zipfile, 'end');
  return { zipfile, entries };
}

/** Liest alle Teile einer (ggf. aufgeteilten) XML-Datei nacheinander. */
async function readParts(zipfile, entries, name, parser, label = name) {
  const parts = requireEntries(entries, name);
  const limit = Number(process.env.MASTR_MAX_PARTS) || 0;
  const selected = limit > 0 ? parts.slice(0, limit) : parts;
  for (let index = 0; index < selected.length; index += 1) {
    const suffix = selected.length > 1 ? ` (${index + 1}/${selected.length})` : '';
    log(`lese ${label}${suffix}`);
    await readEntry(zipfile, selected[index], parser);
  }
}
function findEntries(entries, name) {
  const wanted = name.toLowerCase();
  const stem = wanted.replace(/\.xml$/i, '');
  const partPattern = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)\\.xml$`, 'i');
  const matches = [];
  for (const [path, entry] of entries) {
    const base = path.split('/').pop()?.toLowerCase() ?? '';
    if (base === wanted) {
      matches.push({ entry, part: 0 });
      continue;
    }
    const match = base.match(partPattern);
    if (match) matches.push({ entry, part: Number(match[1]) });
  }
  return matches
    .sort((a, b) => a.part - b.part || a.entry.fileName.localeCompare(b.entry.fileName))
    .map((match) => match.entry);
}

/** Wirft einen verständlichen Fehler, wenn ein Pflichtbestandteil fehlt. */
function requireEntries(entries, name) {
  const found = findEntries(entries, name);
  if (found.length === 0) throw new Error(`ZIP-Eintrag fehlt: ${name}`);
  return found;
}

/** Liest einen ZIP-Eintrag als Text-Stream und ruft `onChunk` auf. */
async function readEntry(zipfile, entry, onChunk) {
  await new Promise((resolveRead, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }
      let decoder = null;
      let first = true;
      stream.on('data', (buffer) => {
        if (!decoder) {
          let encoding = 'utf-8';
          if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
            encoding = 'utf-16le';
          } else if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
            encoding = 'utf-16be';
          }
          decoder = new TextDecoder(encoding);
        }
        let text = decoder.decode(buffer, { stream: true });
        if (first) {
          text = text.replace(/^\uFEFF/, '');
          first = false;
        }
        if (text) onChunk(text);
      });
      stream.on('end', () => {
        if (decoder) {
          const rest = decoder.decode();
          if (rest) onChunk(rest);
        }
        resolveRead();
      });
      stream.on('error', reject);
    });
  });
}

const XML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Dekodiert XML-Entities in einem Feldwert. */
function decodeXml(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

const FIELD_RE = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;

/**
 * Liest die benötigten Felder aus einem XML-Record (ohne DOM).
 * Die Feldnamen werden case-insensitiv auf die kanonische Schreibweise
 * abgebildet: Der MaStR-Export schreibt `MastrNummer`, die Dokumentation
 * `mastrNummer`.
 */
function parseFields(record, canonicalFields) {
  const result = Object.create(null);
  FIELD_RE.lastIndex = 0;
  let match;
  while ((match = FIELD_RE.exec(record)) !== null) {
    const key = match[1].toLowerCase();
    const name = canonicalFields.get(key);
    if (!name) continue;
    const value = decodeXml(match[2]);
    // Marktrollen/Marktfunktionen können mehrfach vorkommen.
    if (key === 'marktrollen' || key === 'marktfunktion') {
      result[name] = result[name] ? `${result[name]}|${value}` : value;
    } else {
      result[name] = value;
    }
  }
  return result;
}

/** Sucht das letzte öffnende Tag `<tag...>` vor `before`. */
function findOpenTag(buffer, tag, before) {
  const needle = `<${tag}`;
  let position = buffer.lastIndexOf(needle, before);
  while (position !== -1) {
    const next = buffer[position + needle.length];
    if (next === '>' || next === ' ' || next === '\n' || next === '\r' || next === '\t') {
      return position;
    }
    position = buffer.lastIndexOf(needle, position - 1);
  }
  return -1;
}

/**
 * Streaming-Parser für eine flache Record-Liste (`<Tag>…</Tag>`).
 * Die MaStR-XML-Dateien haben genau ein solches Format; ein DOM wäre bei
 * mehreren GB nicht tragbar.
 */
function createRecordParser(tag, fields, onRecord) {
  const closeTag = `</${tag}>`;
  const canonicalFields = new Map([...fields].map((field) => [field.toLowerCase(), field]));
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    let processedUntil = 0;
    let closeIndex;
    while ((closeIndex = buffer.indexOf(closeTag, processedUntil)) !== -1) {
      const openIndex = findOpenTag(buffer, tag, closeIndex);
      if (openIndex === -1) {
        processedUntil = closeIndex + closeTag.length;
        continue;
      }
      const tagEnd = buffer.indexOf('>', openIndex);
      if (tagEnd === -1 || tagEnd > closeIndex) {
        processedUntil = closeIndex + closeTag.length;
        continue;
      }
      const record = buffer.slice(tagEnd + 1, closeIndex);
      onRecord(parseFields(record, canonicalFields));
      processedUntil = closeIndex + closeTag.length;
    }
    buffer = buffer.slice(processedUntil);
    if (buffer.length > 1_000_000) {
      // Schutz gegen einen kaputten Record: nur den offenen Rest behalten.
      const lastOpen = buffer.lastIndexOf(`<${tag}`);
      buffer = lastOpen >= 0 ? buffer.slice(lastOpen) : '';
    }
  };
}

/** Normalisiert ein MaStR-Datum auf `YYYY-MM-DD` (ISO oder DD.MM.YYYY). */
function normalizeDate(value) {
  const text = cleanText(value);
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const german = text.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (german) return `${german[3]}-${german[2]}-${german[1]}`;
  return '';
}

/** Prüft, ob ein Marktakteur im Exportzeitraum aktiv ist. */
function isActive(record) {
  const begin = normalizeDate(record.taetigkeitsbeginn);
  const end = normalizeDate(record.taetigkeitsende);
  if (begin && begin > EXPORT_STAND) return false;
  if (end && end < EXPORT_STAND) return false;
  return true;
}

/** MaStR-Bundesland-Code → Name (Katalogwerte des Gesamtdatenexports). */
const BUNDESLAND_BY_CODE = {
  '333': 'Berlin',
  '334': 'Baden-Württemberg',
  '335': 'Bayern',
  '336': 'Bremen',
  '337': 'Hessen',
  '338': 'Hamburg',
  '339': 'Mecklenburg-Vorpommern',
  '340': 'Niedersachsen',
  '341': 'Nordrhein-Westfalen',
  '342': 'Rheinland-Pfalz',
  '343': 'Schleswig-Holstein',
  '344': 'Saarland',
  '345': 'Sachsen',
  '346': 'Sachsen-Anhalt',
  '347': 'Thüringen',
  '348': 'Brandenburg',
};

function bundeslandName(value) {
  const code = cleanText(value);
  return BUNDESLAND_BY_CODE[code] ?? code;
}

/** Normalisiert den Firmennamen eines Marktakteurs. */
function operatorName(record) {
  const firm = cleanText(record.firmenname);
  const person = [record.marktakteurVorname, record.marktakteurNachname]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ');
  // Der Export enthält teils fullwidth „＆“ (U+FF06) statt „&“.
  return (firm || person).replace(/＆/g, '&').trim();
}

async function main() {
  const zipPath = await ensureDownload();
  log(`öffne ZIP: ${zipPath}`);
  const { zipfile, entries } = await openZip(zipPath);
  log(`ZIP enthält ${entries.size} Einträge`);

  // 1. Kataloge: Marktrollen/Marktfunktionen liefern die Rolle „Stromnetzbetreiber“.
  const roleIds = new Set();
  // Die Record-Tags heißen je nach Datei z. B. <Marktrolle> oder <Marktfunktion>.
  for (const [file, tag] of [
    ['Marktrollen.xml', 'Marktrolle'],
    ['Marktfunktionen.xml', 'Marktfunktion'],
  ]) {
    const found = findEntries(entries, file);
    if (found.length === 0) continue;
    log(`lese ${file}`);
    for (const part of found) {
      await readEntry(
        zipfile,
        part,
        createRecordParser(tag, new Set(['id', 'wert']), (record) => {
          const text = cleanText(record.wert);
          if (/^stromnetzbetreiber$/i.test(text)) {
            roleIds.add(cleanText(record.id));
          }
        }),
      );
    }
  }
  log(
    roleIds.size > 0
      ? `Stromnetzbetreiber-Rollen: ${[...roleIds].join(', ')}`
      : 'keine Rollen-Katalogtreffer – filtere über Marktakteur/Netz',
  );

  // 2. Marktakteure + Netze.
  const operators = new Map();
  const marktakteurParser = createRecordParser(
      'Marktakteur',
      new Set([
        'mastrNummer',
        'firmenname',
        'marktakteurVorname',
        'marktakteurNachname',
        'strasse',
        'hausnummer',
        'postleitzahl',
        'ort',
        'bundesland',
        'email',
        'telefon',
        'marktrollen',
        'marktfunktion',
        'netz',
        'taetigkeitsbeginn',
        'taetigkeitsende',
        'strasseAnZustelladresse',
        'hausnummerAnZustelladresse',
        'postleitzahlAnZustelladresse',
        'ortAnZustelladresse',
      ]),
      (record) => {
        if (!isActive(record)) return;
        const id = cleanText(record.mastrNummer);
        if (!id) return;
        const name = operatorName(record);
        if (!name) return;
        const roles = `${record.marktrollen ?? ''}|${record.marktfunktion ?? ''}`
          .split(/[|,;]+/)
          .map((value) => cleanText(value))
          .filter(Boolean);
        const hasRole = roleIds.size > 0 && roles.some((role) => roleIds.has(role));
        const netzId = cleanText(record.netz);
        // `netz` ist der Verweis auf das Netz des Betreibers. Stromnetze haben
        // das Präfix `SNE`, Gasnetze `GNE`; letztere gehören nicht in diesen Typ.
        if (!hasRole && !netzId.startsWith('SNE')) return;
        const street = [cleanText(record.strasse), cleanText(record.hausnummer)]
          .filter(Boolean)
          .join(' ') || [cleanText(record.strasseAnZustelladresse), cleanText(record.hausnummerAnZustelladresse)]
          .filter(Boolean)
          .join(' ');
        operators.set(id, {
          id,
          name,
          strasse: street,
          plz: normalizePlz(record.postleitzahl) || normalizePlz(record.postleitzahlAnZustelladresse),
          ort: cleanText(record.ort) || cleanText(record.ortAnZustelladresse),
          bundesland: bundeslandName(record.bundesland),
          email: cleanEmail(record.email),
          telefon: cleanText(record.telefon),
          netz: netzId,
          geschlossen: false,
          kunden: 0,
        });
      },
    );
  await readParts(zipfile, entries, 'Marktakteure.xml', marktakteurParser);
  log(`Marktakteure (aktiv, Stromnetz): ${operators.size}`);
  if (operators.size < 50) {
    log(
      'WARNUNG: unerwartet wenige Stromnetzbetreiber – bitte Rollen-/Netzfilter im Export prüfen.',
    );
  }

  // Netze: geschlossene Verteilnetze und angeschlossene Kunden.
  const netze = new Map();
  const netzEntries = findEntries(entries, 'Netze.xml');
  if (netzEntries.length > 0) {
    log('lese Netze.xml');
    for (const part of netzEntries) {
      await readEntry(
        zipfile,
        part,
        createRecordParser(
          'Netz',
          new Set(['mastrNummer', 'geschlossenesVerteilnetz', 'kundenAngeschlossen', 'sparte']),
          (record) => {
            const id = cleanText(record.mastrNummer);
            if (!id) return;
            netze.set(id, {
              geschlossen: /^(true|1|ja)$/i.test(cleanText(record.geschlossenesVerteilnetz)),
              kunden: Number(cleanText(record.kundenAngeschlossen)) || 0,
            });
          },
        ),
      );
    }
  }
  for (const operator of operators.values()) {
    const netz = netze.get(operator.netz);
    if (netz) {
      operator.geschlossen = netz.geschlossen;
      operator.kunden = netz.kunden;
    }
  }
  const closedCount = [...operators.values()].filter((operator) => operator.geschlossen).length;
  log(`geschlossene Verteilnetze (ausgeschlossen): ${closedCount}`);

  // 3. Netzanschlusspunkte: Lokation → Betreiber.
  const lokationToOperator = new Map();
  const netzToOperator = new Map();
  for (const operator of operators.values()) {
    if (operator.netz) netzToOperator.set(operator.netz, operator.id);
  }
  const napParser = createRecordParser(
    'Netzanschlusspunkt',
    new Set(['lokationMaStRNummer', 'netzbetreiberMaStRNummer', 'nochInPlanung']),
    (record) => {
      if (/^(true|1|ja)$/i.test(cleanText(record.nochInPlanung))) return;
      const rawId = cleanText(record.netzbetreiberMaStRNummer);
      if (!rawId) return;
      // Je nach Revision verweist das Feld auf den Marktakteur oder auf das Netz.
      const operatorId = operators.has(rawId) ? rawId : netzToOperator.get(rawId);
      if (!operatorId) return;
      const operator = operators.get(operatorId);
      if (!operator || operator.geschlossen) return;
      const lokation = cleanText(record.lokationMaStRNummer);
      if (!lokation) return;
      lokationToOperator.set(lokation, operatorId);
    },
  );
  await readParts(zipfile, entries, 'Netzanschlusspunkte.xml', napParser);
  log(`Netzanschlusspunkte (aktive, offene Netze): ${lokationToOperator.size}`);

  // 4. In-Betrieb-Solaranlagen aggregieren.
  const plzAgg = new Map(); // "plz|ags|op" -> { plz, ags, gemeinde, op, anzahl }
  const agsAgg = new Map(); // "ags|op" -> { ags, gemeinde, op, anzahl }
  let solarRecords = 0;
  let solarUsed = 0;
  let solarWithoutNap = 0;
  const solarParser = createRecordParser(
    'EinheitSolar',
    new Set([
      'einheitMastrNummer',
      'lokationMaStRNummer',
      'postleitzahl',
      'gemeindeschluessel',
      'gemeinde',
      'einheitBetriebsstatus',
    ]),
    (record) => {
      solarRecords += 1;
      if (solarRecords % 500_000 === 0) log(`  ${solarRecords.toLocaleString('de-DE')} Anlagen gelesen`);
      if (Number(cleanText(record.einheitBetriebsstatus)) !== 35) return;
      const lokation = cleanText(record.lokationMaStRNummer);
      if (!lokation) return;
      const operatorId = lokationToOperator.get(lokation);
      if (!operatorId) {
        solarWithoutNap += 1;
        return;
      }
      const plz = normalizePlz(record.postleitzahl);
      const ags = cleanText(record.gemeindeschluessel).padStart(8, '0');
      if (!/^\d{8}$/.test(ags)) return;
      const gemeinde = cleanText(record.gemeinde);
      if (!plz) return;
      solarUsed += 1;

      const plzKey = `${plz}|${ags}|${operatorId}`;
      const plzRow = plzAgg.get(plzKey);
      if (plzRow) plzRow.anzahl += 1;
      else plzAgg.set(plzKey, { plz, ags, gemeinde, op: operatorId, anzahl: 1 });

      const agsKey = `${ags}|${operatorId}`;
      const agsRow = agsAgg.get(agsKey);
      if (agsRow) agsRow.anzahl += 1;
      else agsAgg.set(agsKey, { ags, gemeinde, op: operatorId, anzahl: 1 });
    },
  );
  await readParts(zipfile, entries, 'EinheitenSolar.xml', solarParser);
  log(
    `Solaranlagen: ${solarRecords.toLocaleString('de-DE')} gesamt, ` +
      `${solarUsed.toLocaleString('de-DE')} verwendet, ` +
      `${solarWithoutNap.toLocaleString('de-DE')} ohne aktiven Netzanschlusspunkt`,
  );

  // 5. CSV-Ausgabe.
  const usedOperatorIds = new Set();
  for (const row of plzAgg.values()) usedOperatorIds.add(row.op);
  for (const row of agsAgg.values()) usedOperatorIds.add(row.op);

  const operatorRows = [...usedOperatorIds]
    .map((id) => operators.get(id))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((operator) => ({
      id: operator.id,
      name: operator.name,
      strasse: operator.strasse,
      plz: operator.plz,
      ort: operator.ort,
      bundesland: operator.bundesland,
      email: operator.email,
      telefon: operator.telefon,
      geschlossen: operator.geschlossen ? 'TRUE' : 'FALSE',
      kunden100k: operator.kunden >= 100000 ? 'TRUE' : 'FALSE',
    }));

  const comments = [
    `# Marktstammdatenregister, Gesamtdatenexport ${EXPORT_STAND} (Revision ${EXPORT_REVISION})`,
    '# Quelle: Bundesnetzagentur für Elektrizität, Gas, Telekommunikation, Post und Eisenbahnen',
    '# Lizenz: Datenlizenz Deutschland – Namensnennung 2.0 (dl-de/by-2-0)',
    '# Methode: In-Betrieb-PV-Anlagen (Status 35) → Netzanschlusspunkt → Stromnetzbetreiber',
    `# Anlagen verwendet: ${solarUsed}; Betreiber mit Anlagen: ${operatorRows.length}`,
  ];

  writeCsvFile(
    operatorsFile,
    ['id', 'name', 'strasse', 'plz', 'ort', 'bundesland', 'email', 'telefon', 'geschlossen', 'kunden100k'],
    operatorRows,
    comments,
  );
  writeCsvFile(
    plzFile,
    ['plz', 'ags', 'gemeinde', 'netzbetreiber_id', 'anzahl'],
    [...plzAgg.values()]
      .map((row) => ({
        plz: row.plz,
        ags: row.ags,
        gemeinde: row.gemeinde,
        netzbetreiber_id: row.op,
        anzahl: row.anzahl,
      }))
      .sort((a, b) => a.plz.localeCompare(b.plz) || b.anzahl - a.anzahl),
    comments,
  );
  writeCsvFile(
    agsFile,
    ['ags', 'gemeinde', 'netzbetreiber_id', 'anzahl'],
    [...agsAgg.values()]
      .map((row) => ({
        ags: row.ags,
        gemeinde: row.gemeinde,
        netzbetreiber_id: row.op,
        anzahl: row.anzahl,
      }))
      .sort((a, b) => a.ags.localeCompare(b.ags) || b.anzahl - a.anzahl),
    comments,
  );

  log(`geschrieben: ${operatorsFile}`);
  log(`geschrieben: ${plzFile}`);
  log(`geschrieben: ${agsFile}`);

  zipfile.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
