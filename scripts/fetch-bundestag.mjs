/**
 * Liest die Abgeordneten-Profile von bundestag.de aus und schreibt
 * `public/data/mdb.json`.
 *
 * Warum ein Browser? bundestag.de schützt seine Seiten mit einer Bot-Challenge.
 * Ein normaler HTTP-Request bekommt eine Weiterleitung auf /.enodia/challenge.
 * Ein echter (Headless-)Chrome löst die Challenge und liefert die Inhalte.
 *
 * Aus jedem Profil werden gelesen:
 *   - JSON-LD: Name, Geschlecht, Fraktion, Wahlkreis (Nummer + Name), Homepage
 *   - Anschriftenblock: Bundestagsbüro und Wahlkreisbüro(s)
 *   - Kontaktformular-Link (der Bundestag veröffentlicht keine E-Mail-Adressen)
 *
 * Es werden nur Direktmandate (mit Wahlkreis) berücksichtigt.
 *
 * Voraussetzung: installiertes Chrome/Chromium.
 * Aufruf:
 *   node scripts/fetch-bundestag.mjs
 *   CHROME_PATH=/pfad/zu/chrome MAX_PROFILES=5 node scripts/fetch-bundestag.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const BASE = 'https://www.bundestag.de';
const LIST_URL = `${BASE}/ajax/filterlist/de/abgeordnete/1040594-1040594`;
const PAGE_STEP = 10;
const EXECUTABLE_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const MAX_PROFILES = process.env.MAX_PROFILES ? Number(process.env.MAX_PROFILES) : Infinity;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'public/data/mdb.json');

const SOCIAL = /(facebook|instagram|twitter|x\.com|tiktok|youtube|linkedin|mastodon)/i;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function unescapeHtml(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Wandelt einen Anschriften-Absatz in Büro-Objekte um. */
function parseOffices(sectionHtml) {
  if (!sectionHtml) return [];
  const paragraph = sectionHtml.match(/<p>([\s\S]*?)<\/p>/i)?.[1];
  if (!paragraph) return [];

  const text = unescapeHtml(paragraph.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
  const lines = text.split('\n').map((line) => line.trim());

  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (line === '') {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  const offices = [];
  for (const block of blocks) {
    const zipIndex = block.findIndex((line) => /^\d{5}\b/.test(line));
    if (zipIndex === -1) continue;
    const zipLine = block[zipIndex];
    const strasse = zipIndex > 0 ? block[zipIndex - 1] : undefined;
    offices.push({
      plz: zipLine.slice(0, 5),
      ort: zipLine.slice(5).trim(),
      strasse,
      label: block[0] !== strasse ? block[0] : undefined,
    });
  }
  return offices;
}

function sexFromGender(gender) {
  if (!gender) return undefined;
  if (/weiblich/i.test(gender)) return 'f';
  if (/männlich|maennlich/i.test(gender)) return 'm';
  return undefined;
}

async function load(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
}

async function collectProfileUrls(page) {
  const urls = new Set();
  for (let offset = 0; offset < 5000; offset += PAGE_STEP) {
    await load(page, `${LIST_URL}?offset=${offset}&limit=100`);
    await sleep(300);
    const found = await page.$$eval('a[href*="/abgeordnete/biografien/"]', (anchors) =>
      anchors.map((anchor) => anchor.href),
    );
    if (found.length === 0) break;
    for (const url of found) urls.add(url);
    if (urls.size % 60 < PAGE_STEP) console.log(`  Liste offset=${offset}: ${urls.size} Profile bisher`);
  }
  return [...urls];
}

async function readProfile(page, url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await load(page, url);
    await sleep(400);
    const raw = await page.evaluate(() => {
      const ldEl = document.querySelector('script[type="application/ld+json"]');
      const section = (title) => {
        const heading = [...document.querySelectorAll('h2.m-marginal__itemTitle')].find(
          (el) => el.textContent.trim() === title,
        );
        return heading?.closest('.m-marginal__item')?.querySelector('.m-marginal__itemContent')
          ?.innerHTML ?? null;
      };
      return {
        ld: ldEl ? ldEl.textContent : null,
        abgeordnetenbueros: section('Abgeordnetenbüro'),
        wahlkreisbueros: section('Wahlkreisbüro'),
        contact: document.querySelector('a[href*="contactform?mdbId="]')?.getAttribute('href') ?? null,
      };
    });
    if (raw.ld) return raw;
  }
  return null;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    console.log('Sammle Profil-URLs …');
    let urls = await collectProfileUrls(page);
    console.log(`Insgesamt ${urls.length} Profile gefunden.`);
    if (Number.isFinite(MAX_PROFILES)) urls = urls.slice(0, MAX_PROFILES);

    const mdBs = [];
    const failed = [];
    let skipped = 0;

    for (const [index, url] of urls.entries()) {
      const raw = await readProfile(page, url);
      if (!raw?.ld) {
        failed.push(url);
        continue;
      }

      let ld;
      try {
        ld = JSON.parse(raw.ld);
      } catch {
        skipped += 1;
        continue;
      }

      const wahlkreisEntry = (ld.hasPart ?? []).find((part) =>
        /^Wahlkreis\s+\d+/i.test(part.name ?? ''),
      );
      const wahlkreisMatch = wahlkreisEntry?.name?.match(/^Wahlkreis\s+(\d+):\s*(.+)$/i);
      if (!ld.mainEntity?.name || !wahlkreisMatch) {
        skipped += 1;
        continue;
      }

      const party = (ld.mainEntity.memberOf ?? []).find(
        (entry) => entry['@type'] === 'PoliticalParty',
      )?.name;
      const homepage = (ld.mainEntity.sameAs ?? []).find((link) => !SOCIAL.test(link));

      const offices = [
        ...parseOffices(raw.abgeordnetenbueros),
        ...parseOffices(raw.wahlkreisbueros),
      ];
      const primary = offices.find((office) => /wahlkreis/i.test(office.label ?? '')) ?? offices[0];

      const id = url.match(/-(\d+)$/)?.[1] ?? String(index);
      mdBs.push({
        id: `bt-${id}`,
        name: ld.mainEntity.name,
        party: party ?? '',
        sex: sexFromGender(ld.mainEntity.gender),
        wahlkreis: { number: Number(wahlkreisMatch[1]), name: wahlkreisMatch[2].trim() },
        address: primary,
        offices,
        contactFormUrl: raw.contact ? `${BASE}${raw.contact}` : undefined,
        homepage,
      });

      if ((index + 1) % 25 === 0) console.log(`  ${index + 1}/${urls.length} verarbeitet …`);
    }

    mdBs.sort(
      (a, b) => a.wahlkreis.number - b.wahlkreis.number || a.name.localeCompare(b.name, 'de'),
    );

    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, `${JSON.stringify(mdBs, null, 2)}\n`);
    console.log(
      `${mdBs.length} Direktmandate geschrieben (${skipped} ohne Wahlkreis, ${failed.length} fehlgeschlagen).`,
    );
    if (failed.length > 0) console.log(`Fehlgeschlagen: ${failed.join(', ')}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
