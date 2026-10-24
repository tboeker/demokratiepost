/**
 * Holt den aktuellen Mitgliederstand des Bundestages aus der
 * abgeordnetenwatch.de-API (CC0) und schreibt `public/data/mandates.json`.
 *
 * Warum? bundestag.de listet auch Profile von Abgeordneten, die inzwischen
 * ausgeschieden sind (aktuell 639 Profile für 630 Mandate), und der
 * Wahlkreis steht nicht in jedem Profil im JSON-LD. abgeordnetenwatch führt
 * dagegen genau die laufenden Mandate inkl. Mandatsart, Wahlkreis und
 * Landesliste.
 *
 * Die API braucht keinen Schlüssel und keinen Browser.
 * Aufruf:
 *   node scripts/fetch-abgeordnetenwatch.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.abgeordnetenwatch.de/api/v2';
const BUNDESTAG = 5; // parliament.id der abgeordnetenwatch-API
const USER_AGENT = 'demokratiepost/0.1 (Datenpipeline, Build-Zeit)';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'public/data/mandates.json');

/** Räumt Fraktions-/Parteinamen der API auf. */
function cleanParty(label) {
  if (!label) return undefined;
  const cleaned = label.replace(/\u00ad/g, '').replace(/\s*\(Bundestag.*$/, '').trim();
  if (/^fraktionslos$/i.test(cleaned)) return undefined;
  return cleaned;
}

async function api(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${path}`);
  return res.json();
}

/** Liefert die laufende Wahlperiode des Bundestages (z. B. "Bundestag 2025 - 2029"). */
async function currentPeriod() {
  const json = await api(`/parliament-periods?parliament=${BUNDESTAG}&range_end=20`);
  const periods = (json.data ?? [])
    .filter((period) => period.type === 'legislature' && period.start_date_period)
    .sort((a, b) => b.start_date_period.localeCompare(a.start_date_period));
  if (periods.length === 0) throw new Error('Keine Wahlperiode des Bundestages gefunden.');
  return periods[0];
}

/** "Wahlkreis 146: Hochsauerlandkreis, Nordrhein-Westfalen" → { number, name } */
function parseConstituency(label) {
  if (!label) return undefined;
  const match = label.match(/^(\d+)\s*[-–]\s*(.+?)\s*(?:\(Bundestag[^)]*\))?$/);
  if (!match) return undefined;
  return { number: Number(match[1]), name: match[2].trim() };
}

/** "Landesliste Bayern" → "Bayern" */
function parseState(label) {
  if (!label) return undefined;
  return label.replace(/^Landesliste\s+/i, '').replace(/\s*\(Bundestag[^)]*\)$/, '').trim() || undefined;
}

async function main() {
  const period = await currentPeriod();
  console.log(`Wahlperiode: ${period.label} (id ${period.id})`);

  const json = await api(
    `/candidacies-mandates?parliament_period=${period.id}&type=mandate&range_end=1000`,
  );
  const mandates = json.data ?? [];
  const total = json.meta?.result?.total;
  console.log(`${mandates.length} Mandate geladen (API meldet ${total}).`);
  if (typeof total === 'number' && mandates.length !== total) {
    console.warn(`Warnung: ${total - mandates.length} Mandate fehlen (Paginierung?).`);
  }

  const entries = [];
  const withoutParty = [];

  for (const mandate of mandates) {
    const fraction = mandate.fraction_membership?.at(-1);
    let party = cleanParty(fraction?.fraction?.label);
    if (!party) withoutParty.push(mandate);

    const won = mandate.electoral_data?.mandate_won;
    const constituency = parseConstituency(mandate.electoral_data?.constituency?.label);
    const direct = won === 'constituency' && constituency;

    entries.push({
      id: mandate.id,
      politicianId: mandate.politician?.id,
      name: mandate.politician?.label ?? '',
      party,
      mandate: direct ? 'direct' : 'list',
      wahlkreis: direct ? constituency : undefined,
      state: direct ? undefined : parseState(mandate.electoral_data?.electoral_list?.label),
      mandateWon: won,
      profileUrl: mandate.politician?.abgeordnetenwatch_url,
      startDate: mandate.start_date ?? undefined,
      info: mandate.info ?? undefined,
    });
  }

  // Partei für fraktionslose Abgeordnete einzeln nachschlagen.
  for (const mandate of withoutParty) {
    const politician = await api(`/politicians?id=${mandate.politician.id}`);
    const entry = entries.find((item) => item.id === mandate.id);
    if (entry) entry.party = politician.data?.[0]?.party?.label ?? undefined;
  }

  const direct = entries.filter((entry) => entry.mandate === 'direct');
  const list = entries.filter((entry) => entry.mandate === 'list');
  const numbers = new Set(direct.map((entry) => entry.wahlkreis.number));
  const withoutState = list.filter((entry) => !entry.state);

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(entries, null, 2)}\n`);

  console.log(
    `${entries.length} Mandate geschrieben (${direct.length} direkt, ${list.length} Liste; ` +
      `${numbers.size} besetzte Wahlkreise).`,
  );
  if (withoutState.length > 0) {
    console.log(
      `Ohne Landesliste (Nachrücker, Bundesland kommt aus dem bundestag.de-Profil): ` +
        withoutState.map((entry) => entry.name).join(', '),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
