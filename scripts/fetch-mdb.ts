/**
 * Holt die aktuellen Bundestagsabgeordneten von abgeordnetenwatch.de und
 * schreibt sie nach `public/data/mdb.json`.
 *
 * Voraussetzungen:
 *   - Kostenloser API-Key: https://www.abgeordnetenwatch.de/api
 *   - Umgebungsvariable ABGEORDNETENWATCH_API_KEY setzen
 *
 * Aufruf:
 *   ABGEORDNETENWATCH_API_KEY=xxx node --experimental-strip-types scripts/fetch-mdb.ts
 *
 * Hinweis: Die Feldnamen der API können sich ändern. Bei Fehlern die Antwort
 * einmal mit kleiner range prüfen und das Mapping unten anpassen.
 * Doku: https://www.abgeordnetenwatch.de/api
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'https://api.abgeordnetenwatch.de/api/v2';
const API_KEY = process.env.ABGEORDNETENWATCH_API_KEY;
const PAGE_SIZE = 100;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'public/data/mdb.json');

if (!API_KEY) {
  console.error('Fehlender API-Key. Bitte ABGEORDNETENWATCH_API_KEY setzen.');
  process.exit(1);
}

interface ApiList<T> {
  data: T[];
  meta?: {
    result?: { total?: number };
  };
}

async function fetchAll<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const all: T[] = [];
  let start = 0;

  for (;;) {
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('range_start', String(start));
    url.searchParams.set('range_end', String(start + PAGE_SIZE));

    const response = await fetch(url, { headers: { 'X-API-KEY': API_KEY as string } });
    if (!response.ok) {
      throw new Error(`${path} → HTTP ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as ApiList<T>;
    all.push(...payload.data);

    const total = payload.meta?.result?.total ?? all.length;
    start += PAGE_SIZE;
    if (payload.data.length === 0 || start >= total) break;
  }

  return all;
}

interface Parliament {
  id: number;
  label: string;
}

interface Constituency {
  id: number;
  label: string;
  number?: number;
}

interface Politician {
  id: number;
  label: string;
  party?: { label?: string };
  sex?: string;
}

interface Mandate {
  parliament?: { id: number };
  politician?: { id: number };
  constituency?: { id: number };
}

async function main() {
  const parliaments = await fetchAll<Parliament>('/parliaments');
  const bundestag = parliaments.find((item) => /bundestag/i.test(item.label));
  if (!bundestag) {
    throw new Error('Bundestag wurde in /parliaments nicht gefunden.');
  }

  const [politicians, constituencies, mandates] = await Promise.all([
    fetchAll<Politician>('/politicians'),
    fetchAll<Constituency>('/constituencies'),
    fetchAll<Mandate>('/candidacies-mandates', {
      'parliament[entity.id]': String(bundestag.id),
      type: 'mandate',
    }),
  ]);

  const politicianById = new Map(politicians.map((item) => [item.id, item]));
  const constituencyById = new Map(constituencies.map((item) => [item.id, item]));

  const seen = new Set<number>();
  const mdBs = [];

  for (const mandate of mandates) {
    const politicianId = mandate.politician?.id;
    const constituencyId = mandate.constituency?.id;
    if (!politicianId || !constituencyId || seen.has(politicianId)) continue;
    seen.add(politicianId);

    const politician = politicianById.get(politicianId);
    const constituency = constituencyById.get(constituencyId);
    if (!politician || !constituency) continue;

    mdBs.push({
      id: `aw-${politicianId}`,
      name: politician.label,
      party: politician.party?.label ?? '',
      sex: politician.sex === 'm' || politician.sex === 'f' ? politician.sex : undefined,
      wahlkreis: { number: constituency.number ?? 0, name: constituency.label },
      email: undefined as string | undefined,
      website: undefined as string | undefined,
      address: undefined as Record<string, string> | undefined,
    });
  }

  mdBs.sort(
    (a, b) =>
      a.wahlkreis.number - b.wahlkreis.number || a.name.localeCompare(b.name, 'de'),
  );

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(mdBs, null, 2)}\n`);
  console.log(`${mdBs.length} Abgeordnete nach ${outFile} geschrieben.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
