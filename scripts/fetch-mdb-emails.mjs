/**
 * Ermittelt die E-Mail-Adressen der Bundestagsabgeordneten und schreibt
 * `scripts/source/mdb-emails.json`.
 *
 * Quelle 1 (maßgeblich): „Kürschners Volkshandbuch Deutscher Bundestag“, das der
 * Bundestag als PDF-Sonderdruck veröffentlicht. Unter jeder Biografie steht die
 * E-Mail-Adresse, die die Abgeordneten bzw. ihre Büros regelmäßig einsehen.
 * Das PDF wird nach `scripts/source/cache/kuerschner/` geladen (gitignored).
 *
 * Quelle 2 (Fallback): die persönliche Homepage aus dem bundestag.de-Profil.
 * Damit werden Nachrücker abgedeckt, die erst nach dem Redaktionsschluss des
 * Handbuchs in den Bundestag eingezogen sind. Es werden nur Adressen übernommen,
 * deren lokaler Teil den Nachnamen der Person enthält – fremde/veraltete
 * Adressen (z. B. die eines Vorgängers) fallen so heraus.
 *
 * Quelle 3 (manuelle Ergänzung, optional): `scripts/source/mdb-emails-ergaenzungen.json`.
 * Dort eingetragene, amtlich geprüfte Adressen überschreiben die automatisch
 * ermittelten (Muster wie bei den PLZ-Ergänzungen in M5).
 *
 * Aufruf:
 *   node scripts/fetch-mdb-emails.mjs
 *   KUERSCHNER_PDF=/pfad/volkshandbuch.pdf node scripts/fetch-mdb-emails.mjs
 *   node scripts/fetch-mdb-emails.mjs --force      # PDF neu laden
 *
 * Voraussetzung: `public/data/mdb-profiles.json` und `public/data/mandates.json`
 * (Schritte `data:bundestag` und `data:aw`).
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { matchKey, nameParts } from './lib/names.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profilesFile = resolve(root, 'public/data/mdb-profiles.json');
const mandatesFile = resolve(root, 'public/data/mandates.json');
const outFile = resolve(root, 'scripts/source/mdb-emails.json');
const supplementFile = resolve(root, 'scripts/source/mdb-emails-ergaenzungen.json');
const cacheDir = resolve(root, 'scripts/source/cache/kuerschner');
const cacheFile = resolve(cacheDir, 'kuerschner-volkshandbuch.pdf');

const PDF_URL = 'https://www.btg-bestellservice.de/pdf/10037700.pdf';
const PDF_TITEL = 'Kürschners Volkshandbuch Deutscher Bundestag (Sonderdruck des Bundestages)';
const FORCE = process.argv.includes('--force');
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const PARTIES = [
  'BÜNDNIS 90/DIE GRÜNEN',
  'Die Linke',
  'Fraktionslos',
  'parteilos',
  'CDU',
  'CSU',
  'SPD',
  'AfD',
  'BSW',
  'SSW',
];
const PARTY_RE = new RegExp(`^(${PARTIES.map(escapeRegex).join('|')})$`);
const PARTY_SUFFIX_RE = new RegExp(`^(.+?)\\s+(${PARTIES.map(escapeRegex).join('|')})$`);
const TITLES = /^(?:Prof\.|Dr\.|med\.|jur\.|Ing\.|habil\.|Dr\.-Ing\.|Freiherr|Graf|Prinz)$/;
const PARTICLES = /^(?:dos|van|von|de|zu|der)$/;
const SOCIAL_HOSTS =
  /(^|\.)(facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|linkedin\.com|mastodon\.social|t\.me)$/i;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

function readJsonIfExists(file) {
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Normalisiert Namen/Adressen für den Vergleich (Umlaute wie im Bundestag). */
function translit(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[àáâãå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõ]/g, 'o')
    .replace(/[ùúû]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/ñ/g, 'n')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ć/g, 'c')
    .replace(/č/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/[^a-z0-9-]/g, '');
}

function surnameOf(name) {
  return translit(String(name ?? '').trim().split(/\s+/).pop());
}

function localOf(email) {
  return translit(String(email ?? '').split('@')[0]);
}

function domainOf(email) {
  return String(email ?? '').split('@')[1]?.toLowerCase().replace(/\.$/, '') ?? '';
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Partei-Vergleich zwischen PDF und Roster (CDU/CSU, Grüne, fraktionslos). */
function partyCompat(profileParty, pdfParty) {
  const profile = String(profileParty ?? '').toLowerCase();
  const pdf = String(pdfParty ?? '').toLowerCase();
  if (profile === 'cdu/csu') return pdf === 'cdu' || pdf === 'csu';
  if (profile === 'bündnis 90/die grünen') return pdf.includes('grünen');
  if (profile === 'fraktionslos') return true;
  return profile === pdf;
}

// ---------------------------------------------------------------------------
// 1. Aktuelle Abgeordnete aus Profilen + Mandaten
// ---------------------------------------------------------------------------

function currentMembers(profiles, mandates) {
  const byKey = new Map();
  for (const profile of profiles) {
    const key = matchKey(profile.name);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(profile);
  }

  const members = new Map();
  for (const mandate of mandates) {
    const candidates = byKey.get(matchKey(mandate.name)) ?? [];
    const profile =
      candidates.find((candidate) => candidate.party === mandate.party) ?? candidates[0];
    const id = profile?.id ?? `aw-${mandate.politicianId}`;
    members.set(id, {
      id,
      name: profile?.name ?? mandate.name,
      party: profile?.party || mandate.party || '',
      homepage: profile?.homepage,
      profileUrl: profile?.profileUrl,
    });
  }
  return [...members.values()];
}

// ---------------------------------------------------------------------------
// 2. PDF: Kürschners Volkshandbuch
// ---------------------------------------------------------------------------

async function downloadPdf() {
  const fromEnv = process.env.KUERSCHNER_PDF;
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`KUERSCHNER_PDF nicht gefunden: ${fromEnv}`);
    console.log(`  Nutze lokale PDF: ${fromEnv}`);
    return readFileSync(fromEnv);
  }

  if (!FORCE && existsSync(cacheFile) && statSync(cacheFile).size > 1_000_000) {
    console.log(`  Nutze Cache: ${cacheFile}`);
    return readFileSync(cacheFile);
  }

  console.log(`  Lade ${PDF_URL} …`);
  const response = await fetch(PDF_URL, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/pdf' },
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`PDF-Download fehlgeschlagen: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length < 1_000_000 || data.subarray(0, 4).toString() !== '%PDF') {
    throw new Error(`Antwort ist kein PDF (${data.length} Bytes).`);
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cacheFile, data);
  console.log(`  ${(data.length / 1024 / 1024).toFixed(1)} MB gespeichert.`);
  return data;
}

async function readPdfPages(data) {
  const doc = await getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;
  const pages = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str + (item.hasEOL ? '\n' : '')).join(''));
  }
  return pages;
}

function looksLikeName(line) {
  if (!line || line.length > 55 || /\d/.test(line) || /@/.test(line)) return false;
  const tokens = line.split(/\s+/);
  const upper = (token) => token.replace(/ß/g, 'SS');
  return (
    tokens.every((token) => TITLES.test(token) || PARTICLES.test(token) || !/\p{Ll}/u.test(upper(token))) &&
    /\p{Lu}{2}/u.test(upper(line))
  );
}

/** Erkennt den Kopf einer Biografie – ein- oder zweizeilig (Partei in Folgezeile). */
function headerAt(lines, index) {
  const line = lines[index].trim().replace(/\s*\([^)]*\)/g, '');
  const match = line.match(PARTY_SUFFIX_RE);
  if (match && looksLikeName(match[1].trim())) {
    return { surname: match[1].trim(), party: match[2].trim() };
  }
  if (looksLikeName(line) && PARTY_RE.test((lines[index + 1] ?? '').trim())) {
    return { surname: line, party: lines[index + 1].trim() };
  }
  return null;
}

function stripTitle(name) {
  return name
    .replace(/^(?:(?:Prof\.|Dr\.|med\.|jur\.|Ing\.|habil\.|Dr\.-Ing\.|Freiherr|Graf|Prinz)\s*)+/i, '')
    .trim();
}

/**
 * Liest aus dem Biografie-Teil alle „E-Mail:“-Zeilen und ordnet sie über den
 * nächstgelegenen Biografie-Kopf einer Person zu.
 */
function parseKuerschner(pages) {
  // Nicht das Inhaltsverzeichnis erwischen: dort stehen „Biografischer Teil“ und
  // „Vorbemerkung“ ebenfalls. Die Biografien beginnen mit dem Satz
  // „Die Biografien der Abgeordneten erscheinen …“.
  const start = pages.findIndex(
    (text) => /Biografischer Teil/.test(text) && /Die Biografien der Abgeordneten/.test(text),
  );
  if (start === -1) throw new Error('Biografischer Teil im PDF nicht gefunden.');

  // Der Biografie-Teil endet vor der Seite „Mandatsveränderungen“.
  const end = pages.findIndex(
    (text, index) =>
      index > start && /Mandatsveränderungen/.test(text) && !/E-Mail:/.test(text),
  );
  const bioPages = pages.slice(start + 1, end === -1 ? pages.length : end);

  const lines = bioPages
    .flatMap((text) => text.split('\n'))
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^\d{1,3}$/.test(line));

  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^E-Mail:\s*(\S+@\S+)$/);
    if (!match) continue;

    let header = null;
    for (let cursor = index - 1; cursor >= Math.max(0, index - 60); cursor -= 1) {
      header = headerAt(lines, cursor);
      if (header) break;
    }
    entries.push({ email: match[1].replace(/[.,;]$/, ''), header });
  }

  return {
    entries,
    stand: parseStand(pages),
    pages: bioPages.length,
  };
}

function parseStand(pages) {
  for (const text of pages.slice(0, 8)) {
    const match = text.match(/Stand:\s*([0-9]{1,2}\.\s*[A-Za-zÄÖÜäöü]+\s+[0-9]{4})/);
    if (match) return match[1].replace(/\s+/g, ' ').trim();
  }
  return undefined;
}

/** Ordnet PDF-Einträge den aktuellen Abgeordneten zu (Nachname + Partei, dann Vornamen). */
function matchEntries(entries, members) {
  const used = new Set();
  const assigned = new Map();
  const unmatched = [];

  for (const entry of entries) {
    if (!entry.header) {
      unmatched.push({ email: entry.email, reason: 'kein Biografie-Kopf erkannt' });
      continue;
    }
    const headerSurname = surnameOf(stripTitle(entry.header.surname).split(/\s+/).pop());
    const candidates = members.filter(
      (member) =>
        !used.has(member.id) &&
        surnameOf(member.name) === headerSurname &&
        partyCompat(member.party, entry.header.party),
    );

    let member = candidates[0];
    if (candidates.length > 1) {
      const local = localOf(entry.email);
      const scored = candidates
        .map((candidate) => ({
          candidate,
          score: nameParts(candidate.name).reduce(
            (sum, part) => sum + (part.length >= 3 && local.includes(part) ? 1 : 0),
            0,
          ),
        }))
        .sort((a, b) => b.score - a.score);
      if (scored[0].score > (scored[1]?.score ?? 0)) member = scored[0].candidate;
      else member = undefined;
    }

    if (!member) {
      unmatched.push({ email: entry.email, reason: `keine eindeutige Zuordnung (${entry.header.surname})` });
      continue;
    }
    used.add(member.id);
    assigned.set(member.id, {
      email: entry.email,
      quelle: 'kuerschner',
      quelleUrl: PDF_URL,
    });
  }

  return { assigned, unmatched };
}

// ---------------------------------------------------------------------------
// 3. Fallback: persönliche Homepage
// ---------------------------------------------------------------------------

function decodeHtml(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&commat;/gi, '@')
    .replace(/&period;/gi, '.');
}

/** Entschlüsselt Cloudflares E-Mail-Schutz (`data-cfemail` / `/cdn-cgi/l/email-protection`). */
function decodeCloudflare(html) {
  const decodeHex = (hex) => {
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 4) return null;
    const key = parseInt(hex.slice(0, 2), 16);
    let out = '';
    for (let index = 2; index < hex.length; index += 2) {
      out += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16) ^ key);
    }
    return out;
  };

  return html
    .replace(/data-cfemail="([0-9a-f]+)"/gi, (match, hex) => decodeHex(hex) ?? match)
    .replace(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi, (match, hex) => decodeHex(hex) ?? match);
}

/**
 * Entschlüsselt das auf WordPress-Seiten verbreitete Muster
 * `var ml="…", mi="…"` (Zeichen-Offset-Verfahren).
 */
function decodeJsObfuscation(html) {
  return html.replace(
    /var\s+ml\s*=\s*["']([^"']+)["']\s*,\s*mi\s*=\s*["']([^"']+)["']/g,
    (match, ml, mi) => {
      let out = '';
      for (let index = 0; index < mi.length; index += 1) {
        out += ml.charAt(mi.charCodeAt(index) - 48);
      }
      try {
        return `${match} ${decodeURIComponent(out)}`;
      } catch {
        return match;
      }
    },
  );
}

function extractEmails(html) {
  const decoded = decodeJsObfuscation(decodeCloudflare(html));
  const found = new Set();

  for (const match of decoded.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    try {
      found.add(decodeURIComponent(match[1]));
    } catch {
      found.add(match[1]);
    }
  }

  // Obfuskation mit [at]/[dot] bzw. (at)/(dot) zusätzlich als Klartext lesen.
  const plain = decodeHtml(decoded.replace(/<[^>]+>/g, ' '))
    .replace(/\s*(?:\[at\]|\(at\)|\{at\}|\[ät\])\s*/gi, '@')
    .replace(/\s*(?:\[dot\]|\(dot\)|\{dot\}|\[punkt\])\s*/gi, '.');

  for (const match of plain.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    found.add(match[0]);
  }

  return [...found]
    .map((email) => email.trim().replace(/^mailto:/i, '').replace(/[.,;:]+$/, ''))
    .filter(isPlausibleEmail);
}

function isPlausibleEmail(email) {
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
  if (/\.(png|jpe?g|gif|svg|webp|css|js|woff2?|ttf)$/i.test(email)) return false;
  if (
    /(^|@)(example\.|domain\.|sentry|wixpress|wordpress|placeholder)/i.test(email) ||
    /^(no-?reply|donotreply)@/i.test(email)
  ) {
    return false;
  }
  return true;
}

function scoreEmail(email, pageUrl, person, homepageUrl) {
  const local = localOf(email);
  const domain = domainOf(email);
  const homepageHost = hostOf(homepageUrl);
  const pageHost = hostOf(pageUrl);
  const surname = surnameOf(person.name);
  const parts = nameParts(person.name);

  const surnameMatch = surname.length >= 3 && local.includes(surname);
  const personalDomain =
    domain === homepageHost ||
    domain === pageHost ||
    (homepageHost && (homepageHost.endsWith(`.${domain}`) || domain.endsWith(`.${homepageHost}`)));
  const bundestag = domain === 'bundestag.de';
  const generic = /^(info|kontakt|contact|mail|office|buero|büro|presse|press|webmaster|datenschutz|team|post)$/.test(
    local,
  );

  let score = 0;
  if (surnameMatch) score += 30;
  if (bundestag) score += 20;
  if (personalDomain) score += 10;
  if (parts[0] && local.includes(parts[0])) score += 5;
  if (generic) score -= 5;

  // Ohne Nachnamen im lokalen Teil keine Übernahme: verhindert, dass die
  // veraltete Adresse eines Vorgängers (z. B. jan.koestering@…) verwendet wird.
  const accepted = surnameMatch && (bundestag || personalDomain);
  return { email, score, accepted };
}

async function fetchHtml(url) {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? '';
    if (type && !/text\/html|application\/xhtml/i.test(type)) return null;
    return { html: await response.text(), url: response.url };
  } catch {
    return null;
  }
}

function contactLinks(html, baseUrl) {
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1];
    const label = decodeHtml(match[2].replace(/<[^>]+>/g, ' '));
    if (!/kontakt|contact|impressum|imprint/i.test(`${href} ${label}`)) continue;
    try {
      const url = new URL(href, baseUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:') links.push(url.href);
    } catch {
      // ignorieren
    }
  }
  return [...new Set(links)].slice(0, 5);
}

function externalLinks(html, baseUrl) {
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)) {
    const url = match[1];
    if (SOCIAL_HOSTS.test(hostOf(url))) continue;
    if (hostOf(url) === hostOf(baseUrl)) continue;
    if (/wikipedia|bundestag\.de|abgeordnetenwatch|facebook|instagram|x\.com|t\.me/i.test(url)) continue;
    links.push(url);
  }
  return [...new Set(links)].slice(0, 3);
}

async function findEmailOnHomepage(person) {
  if (!person.homepage) return undefined;

  const queue = [person.homepage];
  const visited = new Set();
  const candidates = [];

  while (queue.length > 0 && visited.size < 6) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);

    const page = await fetchHtml(url);
    if (!page) continue;

    for (const email of extractEmails(page.html)) {
      candidates.push(scoreEmail(email, page.url, person, person.homepage));
    }

    for (const link of contactLinks(page.html, page.url)) {
      if (!visited.has(link)) queue.push(link);
    }

    // Social-Media-Profil als Homepage: verlinkte persönliche Website folgen.
    if (SOCIAL_HOSTS.test(hostOf(page.url))) {
      for (const link of externalLinks(page.html, page.url)) {
        if (!visited.has(link)) queue.push(link);
      }
    }
  }

  const best = candidates
    .filter((candidate) => candidate.accepted)
    .sort((a, b) => b.score - a.score)[0];

  return best
    ? { email: best.email, quelleUrl: person.homepage }
    : undefined;
}

// ---------------------------------------------------------------------------
// 4. Zusammenführen
// ---------------------------------------------------------------------------

function isoStand(stand) {
  if (!stand) return undefined;
  const months = {
    januar: '01', februar: '02', märz: '03', april: '04', mai: '05', juni: '06',
    juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
  };
  const match = stand.match(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s*(\d{4})/);
  if (!match) return undefined;
  const month = months[match[2].toLowerCase()];
  if (!month) return undefined;
  return `${match[3]}-${month}-${match[1].padStart(2, '0')}`;
}

function today() {
  return new Date().toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

async function main() {
  const profiles = readJson(profilesFile, 'node scripts/fetch-bundestag.mjs');
  const mandates = readJson(mandatesFile, 'node scripts/fetch-abgeordnetenwatch.mjs');
  const members = currentMembers(profiles, mandates);
  console.log(`${members.length} laufende Mandate, ${profiles.length} bundestag.de-Profile.`);

  console.log('Lese Kürschners Volkshandbuch …');
  const pages = await readPdfPages(await downloadPdf());
  const parsed = parseKuerschner(pages);
  console.log(
    `  ${parsed.entries.length} E-Mail-Zeilen im Biografie-Teil ` +
      `(${parsed.pages} Seiten, Stand ${parsed.stand ?? 'unbekannt'}).`,
  );
  // Schutz vor einem stillen Strukturbruch: dann lieber abbrechen, als für alle
  // 630 Abgeordneten die Homepages zu durchsuchen.
  if (parsed.entries.length < 100) {
    throw new Error(
      `Zu wenige E-Mail-Zeilen (${parsed.entries.length}) – hat sich die PDF-Struktur geändert?`,
    );
  }

  const { assigned, unmatched } = matchEntries(parsed.entries, members);
  console.log(`  ${assigned.size} Adressen direkt zugeordnet.`);

  // Fallback für Nachrücker: persönliche Homepage.
  const missing = members.filter((member) => !assigned.has(member.id));
  const fromHomepage = [];
  for (const [index, member] of missing.entries()) {
    const result = await findEmailOnHomepage(member);
    if (result) {
      assigned.set(member.id, {
        email: result.email,
        quelle: 'homepage',
        quelleUrl: result.quelleUrl,
        stand: today(),
      });
      fromHomepage.push(member.name);
      console.log(`  Homepage: ${member.name} → ${result.email}`);
    }
    if ((index + 1) % 5 === 0) console.log(`  ${index + 1}/${missing.length} Homepages geprüft …`);
  }

  // Manuelle, geprüfte Ergänzungen überschreiben alles andere.
  const supplement = readJsonIfExists(supplementFile) ?? [];
  for (const entry of supplement) {
    const member = entry.id
      ? members.find((item) => item.id === entry.id)
      : members.find((item) => matchKey(item.name) === matchKey(entry.name));
    if (!member) {
      console.warn(`  Ergänzung ohne laufendes Mandat: ${entry.name ?? entry.id}`);
      continue;
    }
    assigned.set(member.id, {
      email: entry.email,
      quelle: entry.quelle ?? 'manuell geprüft',
      quelleUrl: entry.quelleUrl,
      stand: entry.stand,
    });
  }

  const standIso = isoStand(parsed.stand);
  const eintraege = members
    .map((member) => {
      const hit = assigned.get(member.id);
      if (!hit) return null;
      const stand = hit.stand ?? (hit.quelle === 'kuerschner' ? parsed.stand : undefined);
      return {
        id: member.id,
        name: member.name,
        email: hit.email,
        quelle: hit.quelle,
        ...(hit.quelleUrl ? { quelleUrl: hit.quelleUrl } : {}),
        ...(stand ? { stand } : {}),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const without = members.filter((member) => !assigned.has(member.id)).map((member) => member.name);

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(
    outFile,
    `${JSON.stringify(
      {
        stand: standIso,
        quellen: {
          kuerschner: { titel: PDF_TITEL, url: PDF_URL, stand: parsed.stand },
          homepage: 'Persönliche Website aus dem bundestag.de-Profil (Fallback für Nachrücker)',
          ergaenzungen: 'scripts/source/mdb-emails-ergaenzungen.json (manuell geprüft)',
        },
        eintraege,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\n${eintraege.length}/${members.length} E-Mail-Adressen geschrieben → ${outFile}`);
  console.log(
    `  Kürschner: ${assigned.size - fromHomepage.length - supplement.length}, ` +
      `Homepage: ${fromHomepage.length}, manuell: ${supplement.length}.`,
  );
  if (without.length > 0) {
    console.log(`  Ohne E-Mail (Kontaktformular/Brief): ${without.join(', ')}`);
  }
  if (unmatched.length > 0) {
    console.log(`  ${unmatched.length} PDF-Zeilen ohne Zuordnung (Nachrücker/Ausscheider):`);
    for (const item of unmatched) console.log(`    ${item.email} – ${item.reason}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
