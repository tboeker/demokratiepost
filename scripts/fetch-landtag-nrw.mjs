/**
 * Reichert das NRW-Landtags-Roster mit Kontaktdaten an (Pilot).
 *
 * Die Detailseiten auf landtag.nrw.de (`abgeordnetendetail.html?k=…`) sind mit
 * einem einfachen HTTP-Request abrufbar (keine Bot-Challenge) und liefern die
 * dienstliche E-Mail-Adresse sowie – sofern angegeben – ein Wahlkreisbüro.
 * Die A-Z-Übersicht liefert die `k`-Werte aller aktuellen Abgeordneten.
 *
 * Join zum Roster aus `fetch-landtag.mjs` über den normalisierten Namen
 * (`scripts/lib/names.mjs`): Abgeordnetenwatch schreibt „Vorname Nachname“,
 * der Landtag „Nachname, Vorname“.
 *
 * Ausgabe: `scripts/source/landtag-contacts/nrw.json` (Quelle für
 * `build-landtag.mjs`). Wo kein Wahlkreisbüro angegeben ist, bleibt es bei der
 * Sitzanschrift aus `scripts/source/landtage.csv`.
 *
 * Aufruf:
 *   node scripts/fetch-landtag-nrw.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchKey } from './lib/names.mjs';

const BASE =
  'https://www.landtag.nrw.de/home/der-landtag/abgeordnete-und--fraktionen/die-abgeordneten/abgeordnetensuche';
const LISTING = `${BASE}/liste-aller-abgeordneten.html`;
const DETAIL = `${BASE}/abgeordnetendetail.html?k=`;
const USER_AGENT = 'demokratiepost/0.1 (Datenpipeline, Build-Zeit)';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'scripts/source/landtag-contacts');

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function get(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} für ${url}`);
  return response.text();
}

/** „Nachname, Vorname“ (ggf. mit Titel) → „Vorname Nachname“. */
function reorderName(raw) {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const comma = cleaned.indexOf(',');
  if (comma < 0) return cleaned;
  const surname = cleaned
    .slice(0, comma)
    .replace(/^(?:Dr\.?|Prof\.?|Dipl\.?-?\w*|med\.?|jur\.?)\s+/gi, '')
    .trim();
  const rest = cleaned.slice(comma + 1).trim();
  return `${rest} ${surname}`.trim();
}

/** Liest die `key`/`value`-Paare aus dem Metadaten-Block der Detailseite. */
function metaPairs(html) {
  const pairs = new Map();
  const re =
    /<dt class="e-abgeordneter__meta-key">([\s\S]*?)<\/dt>\s*<dd class="e-abgeordneter__meta-value"[^>]*>([\s\S]*?)<\/dd>/g;
  for (const match of html.matchAll(re)) {
    const key = match[1].replace(/<[^>]+>/g, '').trim();
    const value = match[2]
      .replace(/<br\s*\/?>/gi, '|')
      .replace(/&nbsp;/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    pairs.set(key, value);
  }
  return pairs;
}

/** „Wahlkreisbüro X|Straße 1| 12345 Ort“ → { label, strasse, plz, ort }. */
function parseWahlkreisbuero(value) {
  if (!value || !/Wahlkreisbüro/i.test(value)) return undefined;
  const parts = value
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  const zipIndex = parts.findIndex((part) => /^\d{5}\s+\S/.test(part));
  if (zipIndex < 1) return undefined;
  const [plz, ...ortParts] = parts[zipIndex].split(/\s+/);
  const strasse = parts[zipIndex - 1];
  const label = parts[0] && parts[0] !== strasse ? parts[0] : 'Wahlkreisbüro';
  return { label, strasse, plz, ort: ortParts.join(' ') };
}

async function main() {
  const listing = await get(LISTING);
  const entries = [...listing.matchAll(/abgeordnetendetail\.html\?k=(\d+)"[^>]*>([^<]*)/g)].map(
    (match) => ({ k: match[1], rawName: match[2].trim() }),
  );
  if (entries.length === 0) throw new Error('Keine Abgeordneten in der A-Z-Liste gefunden.');
  console.log(`${entries.length} Abgeordnete in der NRW-Liste.`);

  const contacts = [];
  for (const entry of entries) {
    const html = await get(DETAIL + entry.k);
    await sleep(150);

    const pairs = metaPairs(html);
    const email = (pairs.get('E-Mail (dienstlich)') ?? '').match(
      /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
    )?.[0];
    const wahlkreis = pairs.get('Wahlkreis/Landesliste') || undefined;
    const address = parseWahlkreisbuero(pairs.get('Postanschrift'));

    const name = reorderName(entry.rawName);
    contacts.push({
      key: entry.k,
      name,
      matchKey: matchKey(name),
      wahlkreis,
      email: email || undefined,
      address,
    });
  }

  const withEmail = contacts.filter((contact) => contact.email).length;
  const withOffice = contacts.filter((contact) => contact.address).length;

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, 'nrw.json'),
    `${JSON.stringify(
      {
        staat: 'nrw',
        source: 'landtag.nrw.de – Abgeordnetendetailseiten',
        generatedAt: new Date().toISOString(),
        contacts,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `${contacts.length} Kontakte geschrieben (${withEmail} mit E-Mail, ${withOffice} mit ` +
      'Wahlkreisbüro) nach scripts/source/landtag-contacts/nrw.json',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
