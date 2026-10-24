/**
 * Liest die Abgeordneten-Profile von bundestag.de aus und schreibt
 * `public/data/mdb.json`.
 *
 * Erfasst **alle** Abgeordneten des laufenden Bundestages:
 *   - Direktmandate (mit Wahlkreis) und Listenmandate (mit Bundesland)
 *   - Anschriften (Bundestagsbüro + Wahlkreisbüro), Kontaktformular-Link, Homepage
 *
 * Warum ein Browser? bundestag.de schützt seine Seiten mit einer Bot-Challenge.
 * Ein normaler HTTP-Request bekommt eine Weiterleitung auf /.enodia/challenge.
 * Ein echter (Headless-)Chrome löst die Challenge und liefert die Inhalte.
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
// Rohdaten; `build-mdb.mjs` filtert Ausgeschiedene und schreibt `mdb.json`.
const outFile = resolve(root, 'public/data/mdb-profiles.json');

const SOCIAL = /(facebook|instagram|twitter|x\.com|tiktok|youtube|linkedin|mastodon)/i;
const STATES = new Set([
  'Baden-Württemberg',
  'Bayern',
  'Berlin',
  'Brandenburg',
  'Bremen',
  'Hamburg',
  'Hessen',
  'Mecklenburg-Vorpommern',
  'Niedersachsen',
  'Nordrhein-Westfalen',
  'Rheinland-Pfalz',
  'Saarland',
  'Sachsen',
  'Sachsen-Anhalt',
  'Schleswig-Holstein',
  'Thüringen',
]);
const BERLIN_OFFICE = {
  strasse: 'Platz der Republik 1',
  plz: '11011',
  ort: 'Berlin',
  label: 'Deutscher Bundestag',
};

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

/**
 * Liest die Mandatsart aus dem `constituencyInfo`-Block des Profils.
 * Das ist die verlässliche Quelle – im JSON-LD fehlt der Wahlkreis bei einem
 * Teil der Profile.
 */
function mandateFromConstituency(items = []) {
  const direct = items.find((item) => /^Wahlkreismandat$/i.test(item.title));
  if (direct) {
    const number =
      direct.href?.match(/wknr=(\d+)/)?.[1] ?? direct.label.match(/Wahlkreis\s+(\d+)/)?.[1];
    if (number) {
      const name = direct.label
        .replace(/^Wahlkreis\s+\d+:\s*/, '')
        .replace(/,\s*[^,]+$/, '')
        .trim();
      return { mandate: 'direct', wahlkreis: { number: Number(number), name } };
    }
  }

  const list = items.find((item) => /Landesliste/i.test(item.title));
  if (list) {
    const state = list.label.replace(/^Landesliste:\s*/, '').trim();
    if (state) return { mandate: 'list', state };
  }

  return undefined;
}

/** Ermittelt die Partei aus den JSON-LD-Keywords als Fallback. */
function partyFromKeywords(keywords) {
  if (!Array.isArray(keywords)) return undefined;
  const index = keywords.findIndex((k) => /^\s*\d+\.\s*Deutscher Bundestag\s*$/.test(k ?? ''));
  if (index > 0) {
    const candidate = (keywords[index - 1] ?? '').trim();
    if (candidate && !/^(MdB|Mitglied des Bundestages)$/i.test(candidate)) return candidate;
  }
  return undefined;
}

async function load(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  } catch {
    // Zweiter Versuch mit vollständigem Ladeereignis (Challenge/Redirects).
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  }
  await sleep(1000);
}

async function collectProfileUrls(page) {
  const urls = new Set();
  for (let offset = 0; offset < 5000; offset += PAGE_STEP) {
    try {
      await load(page, `${LIST_URL}?offset=${offset}&limit=100`);
      await sleep(800);
      const found = await page.$$eval('a[href*="/abgeordnete/biografien/"]', (anchors) =>
        anchors
          .map((anchor) => anchor.href.replace('/de/abgeordnete/biografien/', '/abgeordnete/biografien/'))
          .filter((href) => !/biografien\/(ausgeschiedene|verstorbene_abgeordnete)/.test(href)),
      );
      if (found.length === 0) break;
      for (const url of found) urls.add(url);
      if (urls.size % 60 < PAGE_STEP) console.log(`  Liste offset=${offset}: ${urls.size} Profile bisher`);
    } catch (e) {
      console.log(`  Fehler bei offset=${offset}, versuche weiter...`);
      break;
    }
  }
  return [...urls];
}

async function readProfile(page, url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await load(page, url);
    await sleep(500);
    const raw = await page.evaluate(() => {
      const ldEl = document.querySelector('script[type="application/ld+json"]');
      const section = (title) => {
        const heading = [...document.querySelectorAll('h2.m-marginal__itemTitle')].find(
          (el) => el.textContent.trim() === title,
        );
        return (
          heading?.closest('.m-marginal__item')?.querySelector('.m-marginal__itemContent')
            ?.innerHTML ?? null
        );
      };
      return {
        ld: ldEl ? ldEl.textContent : null,
        abgeordnetenbueros: section('Abgeordnetenbüro'),
        wahlkreisbueros: section('Wahlkreisbüro'),
        contact: document.querySelector('a[href*="contactform?mdbId="]')?.getAttribute('href') ?? null,
        // Maßgeblicher Block für die Mandatsart: "Wahlkreismandat" bzw.
        // "Gewählt über Landesliste" (das JSON-LD enthält den Wahlkreis nicht immer).
        constituency: [...document.querySelectorAll('.m-biography__constituencyInfoItem')].map((item) => ({
          title:
            item
              .querySelector('.m-biography__constituencyInfoItemTitle')
              ?.textContent.replace(/\s+/g, ' ')
              .trim() ?? '',
          href: item.querySelector('a')?.getAttribute('href') ?? null,
          label:
            item.querySelector('.a-link__label')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
        })),
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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
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

      const parts = ld.hasPart ?? [];
      const wahlkreisEntry = parts.find((part) => /^Wahlkreis\s+\d+/i.test(part.name ?? ''));
      const wahlkreisMatch = wahlkreisEntry?.name?.match(/^Wahlkreis\s+(\d+):\s*(.+)$/i);
      const stateEntry = parts.find((part) => STATES.has((part.name ?? '').trim()));

      // Vorrang: der constituencyInfo-Block, danach das JSON-LD.
      const fromPage = mandateFromConstituency(raw.constituency);
      const wahlkreis =
        fromPage?.wahlkreis ??
        (wahlkreisMatch
          ? { number: Number(wahlkreisMatch[1]), name: wahlkreisMatch[2].trim() }
          : undefined);
      const state = fromPage?.state ?? stateEntry?.name?.trim();
      const mandate = fromPage?.mandate ?? (wahlkreis ? 'direct' : state ? 'list' : undefined);

      // Weder Wahlkreis noch Bundesland erkennbar → kein verwertbares Mandat.
      if (!mandate) {
        skipped += 1;
        continue;
      }

      const party =
        (ld.mainEntity?.memberOf ?? []).find((entry) => entry['@type'] === 'PoliticalParty')?.name ??
        partyFromKeywords(ld.keywords);

      const homepage = (ld.mainEntity?.sameAs ?? []).find((link) => !SOCIAL.test(link));
      const id = url.match(/-(\d+)$/)?.[1];

      const offices = [
        ...parseOffices(raw.abgeordnetenbueros),
        ...parseOffices(raw.wahlkreisbueros),
      ];
      const primary =
        offices.find((office) => /wahlkreis/i.test(office.label ?? '')) ?? offices[0];
      // Fallback: die Bundestagsadresse funktioniert für alle Abgeordneten.
      const address = primary ?? { ...BERLIN_OFFICE };
      const officeList = offices.length > 0 ? offices : [{ ...BERLIN_OFFICE }];

      const contactFormUrl = raw.contact
        ? `${BASE}${raw.contact}`
        : id
          ? `${BASE}/services/formular/contactform?mdbId=${id}`
          : undefined;

      mdBs.push({
        id: `bt-${id ?? index}`,
        name: ld.mainEntity?.name ?? '',
        party: party ?? '',
        sex: sexFromGender(ld.mainEntity?.gender),
        mandate,
        ...(mandate === 'direct' ? { wahlkreis } : { state }),
        address,
        offices: officeList,
        contactFormUrl,
        homepage,
        profileUrl: url,
      });

      if ((index + 1) % 25 === 0) console.log(`  ${index + 1}/${urls.length} verarbeitet …`);
    }

    mdBs.sort(
      (a, b) =>
        (a.wahlkreis?.number ?? 9999) - (b.wahlkreis?.number ?? 9999) ||
        a.name.localeCompare(b.name, 'de'),
    );

    const direct = mdBs.filter((m) => m.mandate === 'direct').length;
    const list = mdBs.filter((m) => m.mandate === 'list').length;

    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, `${JSON.stringify(mdBs, null, 2)}\n`);
    console.log(
      `${mdBs.length} Abgeordnete geschrieben (${direct} Direkt-, ${list} Listenmandate; ` +
        `${skipped} ohne Mandat übersprungen, ${failed.length} fehlgeschlagen).`,
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
