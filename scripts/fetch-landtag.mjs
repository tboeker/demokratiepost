/**
 * Holt die laufenden Mandate aller 16 Landtage aus der abgeordnetenwatch.de-API
 * (CC0 1.0) und schreibt sie nach `public/data/mandates-landtag.json`.
 *
 * Warum? Für die Landtage gibt es – anders als für den Bundestag – keine
 * bundestag.de-Profile mit Anschriften. Wer aktuell Mitglied ist, Mandatsart,
 * Wahlkreis und Fraktion kommen daher aus abgeordnetenwatch. Die Anrede (`sex`)
 * steht nur an der Politiker:in; sie wird über einen inkrementellen Cache
 * gehalten, damit ein zweiter Lauf keine erneuten Einzelabfragen braucht.
 *
 * Aufruf:
 *   node scripts/fetch-landtag.mjs
 *   node scripts/fetch-landtag.mjs --force   # Cache für sex ignorieren
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LANDTAG_PARLIAMENTS,
  cleanFraction,
  currentPeriod,
  parseConstituency,
} from './lib/landtag.mjs';

const BASE = 'https://www.abgeordnetenwatch.de/api/v2';
const USER_AGENT = 'demokratiepost/0.1 (Datenpipeline, Build-Zeit)';
const FORCE = process.argv.includes('--force');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'public/data/mandates-landtag.json');
const cacheDir = resolve(root, 'scripts/source/cache/politicians');

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Abruf mit Backoff. Die API drosselt schnelle Folgen mit HTTP 429; zusätzlich
 * schließt sie gelegentlich Keep-Alive-Verbindungen, daher auch Netzfehler
 * abfangen und erneut versuchen.
 */
async function api(path, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${BASE}${path}`, {
        headers: { 'User-Agent': USER_AGENT, connection: 'close' },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return response.json();
      if (response.status === 429) {
        await sleep(1500 * attempt);
        lastError = new Error(`429 Rate Limit: ${path}`);
        continue;
      }
      throw new Error(`${response.status} ${response.statusText}: ${path}`);
    } catch (error) {
      lastError = error;
      await sleep(1000 * attempt);
    }
  }
  throw lastError ?? new Error(`Abruf fehlgeschlagen: ${path}`);
}

function cacheFile(id) {
  return resolve(cacheDir, `${id}.json`);
}

function readCachedSex(id) {
  if (FORCE) return undefined;
  const file = cacheFile(id);
  if (!existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed.sex ?? null;
  } catch {
    return undefined;
  }
}

function writeCachedSex(id, sex) {
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile(id), `${JSON.stringify({ id, sex: sex ?? null })}\n`);
  } catch {
    // Cache ist eine Optimierung – Fehler nicht fatal.
  }
}

/**
 * Ermittelt die Anrede (`sex`) für die Politiker:innen einer Wahlperiode.
 * Statt ~1.900 Einzelabfragen filtert die API Mandate nach
 * `politician[entity.sex]` – drei Abrufe je Wahlperiode liefern m/f/d.
 */
async function resolveSexes(periodId, politicianIds) {
  const missing = politicianIds.filter((id) => readCachedSex(id) === undefined);
  if (missing.length === 0) return;

  const sexes = new Map();
  for (const sex of ['m', 'f', 'd']) {
    const json = await api(
      `/candidacies-mandates?parliament_period=${periodId}&type=mandate&range_end=1000` +
        `&politician[entity.sex]=${sex}`,
    );
    for (const mandate of json.data ?? []) {
      if (mandate.politician?.id) sexes.set(mandate.politician.id, sex);
    }
    await sleep(300);
  }

  for (const id of missing) {
    writeCachedSex(id, sexes.get(id) ?? null);
  }
}

async function fetchParliament({ staat, stateName, parliament, parliamentId }) {
  const periods = await api(`/parliament-periods?parliament=${parliamentId}&range_end=100`);
  await sleep(200);
  const period = currentPeriod(periods.data ?? []);
  if (!period) throw new Error(`Keine laufende Wahlperiode für ${stateName}.`);

  const json = await api(
    `/candidacies-mandates?parliament_period=${period.id}&type=mandate&range_end=1000`,
  );
  await sleep(200);
  const mandates = json.data ?? [];
  const total = json.meta?.result?.total;
  if (typeof total === 'number' && mandates.length !== total) {
    console.warn(
      `Warnung ${stateName}: ${mandates.length} von ${total} Mandaten geladen (Paginierung?).`,
    );
  }

  const politicianIds = [...new Set(mandates.map((m) => m.politician?.id).filter(Boolean))];
  await resolveSexes(period.id, politicianIds);

  const entries = mandates.map((mandate) => {
    const fraction = mandate.fraction_membership?.at(-1);
    const party = cleanFraction(fraction?.fraction?.label);
    const won = mandate.electoral_data?.mandate_won;
    const constituency = parseConstituency(mandate.electoral_data?.constituency?.label);
    const direct = won === 'constituency' && constituency;

    return {
      id: `lt-${staat}-${mandate.id}`,
      politicianId: mandate.politician?.id,
      name: mandate.politician?.label ?? '',
      party,
      sex: readCachedSex(mandate.politician?.id) ?? null,
      mandate: direct ? 'direct' : 'list',
      wahlkreis: constituency,
      state: stateName,
      mandateWon: won,
      profileUrl: mandate.politician?.abgeordnetenwatch_url,
      info: mandate.info ?? undefined,
    };
  });

  const direct = entries.filter((entry) => entry.mandate === 'direct');
  console.log(
    `${staat.padEnd(24)} ${period.label.padEnd(32)} ${entries.length
      .toString()
      .padStart(4)} Mandate (${direct.length} direkt)`,
  );

  return {
    staat,
    stateName,
    parliament,
    parliamentId,
    periodId: period.id,
    periodLabel: period.label,
    periodStart: period.start_date_period,
    periodEnd: period.end_date_period ?? null,
    mandates: entries,
  };
}

async function main() {
  const parliaments = [];
  for (const entry of LANDTAG_PARLIAMENTS) {
    parliaments.push(await fetchParliament(entry));
  }

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(
    outFile,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: 'abgeordnetenwatch.de API v2 (CC0 1.0)',
        parliaments,
      },
      null,
      2,
    )}\n`,
  );

  const totalMandates = parliaments.reduce((sum, p) => sum + p.mandates.length, 0);
  const totalDirect = parliaments.reduce(
    (sum, p) => sum + p.mandates.filter((m) => m.mandate === 'direct').length,
    0,
  );
  console.log(
    `\n${parliaments.length} Landtage, ${totalMandates} Mandate (${totalDirect} direkt) ` +
      'geschrieben nach public/data/mandates-landtag.json',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
