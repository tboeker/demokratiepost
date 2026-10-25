/**
 * Führt die Rohdaten zu `public/data/mdb.json` zusammen.
 *
 * Eingaben:
 *   - `public/data/mdb-profiles.json` – Profile von bundestag.de (Anschriften,
 *     Büros, Kontaktformular, Geschlecht, Homepage) – erzeugt von
 *     `fetch-bundestag.mjs`.
 *   - `public/data/mandates.json` – laufende Mandate von abgeordnetenwatch.de
 *     (maßgeblich dafür, wer aktuell Mitglied ist, und für Mandatsart,
 *     Wahlkreis bzw. Landesliste) – erzeugt von `fetch-abgeordnetenwatch.mjs`.
 *
 * Ergebnis: nur noch aktuelle Abgeordnete. Profile von Ausgeschiedenen, die
 * bundestag.de weiterhin online hat, fallen dabei heraus.
 *
 * Aufruf:
 *   node scripts/build-mdb.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchKey } from './lib/names.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profilesFile = resolve(root, 'public/data/mdb-profiles.json');
const mandatesFile = resolve(root, 'public/data/mandates.json');
const emailsFile = resolve(root, 'scripts/source/mdb-emails.json');
const outFile = resolve(root, 'public/data/mdb.json');

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

const profiles = readJson(profilesFile, 'node scripts/fetch-bundestag.mjs');
const mandates = readJson(mandatesFile, 'node scripts/fetch-abgeordnetenwatch.mjs');

// Optional: E-Mail-Adressen aus `fetch-mdb-emails.mjs`. Fehlt die Datei, wird
// ohne E-Mail gebaut (die App nutzt dann weiter nur das Kontaktformular).
const emailData = existsSync(emailsFile)
  ? JSON.parse(readFileSync(emailsFile, 'utf8'))
  : undefined;
const emailsById = new Map((emailData?.eintraege ?? []).map((entry) => [entry.id, entry]));

function emailQuelleLabel(hit) {
  if (!hit) return undefined;
  if (hit.quelle === 'kuerschner') return 'Kürschners Volkshandbuch';
  if (hit.quelle === 'homepage') return 'Persönliche Website';
  return hit.quelle;
}

const byKey = new Map();
for (const profile of profiles) {
  const key = matchKey(profile.name);
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(profile);
}

const merged = [];
const missing = [];
const ambiguous = [];
const typeMismatch = [];

for (const mandate of mandates) {
  const key = matchKey(mandate.name);
  const candidates = byKey.get(key) ?? [];

  let profile = candidates[0];
  if (candidates.length === 0) {
    missing.push(mandate.name);
    profile = undefined;
  } else if (candidates.length > 1) {
    const sameParty = candidates.find((candidate) => candidate.party === mandate.party);
    profile = sameParty ?? candidates[0];
    ambiguous.push(`${mandate.name} → ${candidates.map((c) => c.name).join(' | ')}`);
  }

  const mandateType = profile?.mandate ?? mandate.mandate;
  const wahlkreis = profile?.wahlkreis ?? mandate.wahlkreis;
  const state = profile?.state ?? mandate.state;

  if (profile?.mandate && profile.mandate !== mandate.mandate) {
    typeMismatch.push(
      `${mandate.name}: bundestag.de=${profile.mandate}${profile.wahlkreis ? ` (WK ${profile.wahlkreis.number})` : ''}, ` +
        `abgeordnetenwatch=${mandate.mandate}${mandate.wahlkreis ? ` (WK ${mandate.wahlkreis.number})` : ''} – ` +
        'bundestag.de übernommen',
    );
  }

  if (mandateType === 'direct' && !wahlkreis) {
    throw new Error(`Direktmandat ohne Wahlkreis: ${mandate.name}`);
  }
  if (mandateType === 'list' && !state) {
    throw new Error(`Listenmandat ohne Bundesland: ${mandate.name}`);
  }

  const emailHit = emailsById.get(profile?.id ?? `aw-${mandate.politicianId}`);

  merged.push({
    id: profile?.id ?? `aw-${mandate.politicianId}`,
    name: profile?.name ?? mandate.name,
    party: profile?.party || mandate.party || '',
    sex: profile?.sex,
    mandate: mandateType,
    ...(mandateType === 'direct' ? { wahlkreis } : { state }),
    address: profile?.address,
    offices: profile?.offices,
    contactFormUrl: profile?.contactFormUrl,
    ...(emailHit
      ? {
          email: emailHit.email,
          emailQuelle: emailQuelleLabel(emailHit),
          ...(emailHit.quelleUrl ? { emailQuelleUrl: emailHit.quelleUrl } : {}),
          ...(emailHit.stand ? { emailStand: emailHit.stand } : {}),
        }
      : {}),
    homepage: profile?.homepage,
    profileUrl: profile?.profileUrl,
  });
}

merged.sort(
  (a, b) =>
    (a.wahlkreis?.number ?? 9999) - (b.wahlkreis?.number ?? 9999) ||
    a.name.localeCompare(b.name, 'de'),
);

const usedIds = new Set(merged.map((entry) => entry.id));
const dropped = profiles.filter((profile) => !usedIds.has(profile.id)).map((profile) => profile.name);

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(merged, null, 2)}\n`);

const direct = merged.filter((entry) => entry.mandate === 'direct').length;
const list = merged.filter((entry) => entry.mandate === 'list').length;
const withEmail = merged.filter((entry) => entry.email).length;
console.log(`${merged.length} Abgeordnete geschrieben (${direct} direkt, ${list} Liste).`);
console.log(
  `${withEmail} mit E-Mail-Adresse` +
    (emailData
      ? ` (${emailData.stand ? `Kürschner-Stand ${emailData.stand}` : 'Quelle: mdb-emails.json'})`
      : ' – mdb-emails.json fehlt'),
);
if (dropped.length > 0) {
  console.log(`${dropped.length} Profile ohne laufendes Mandat entfernt: ${dropped.join(', ')}`);
}
if (missing.length > 0) {
  console.warn(`Warnung: ${missing.length} Mandate ohne bundestag.de-Profil: ${missing.join(', ')}`);
}
if (ambiguous.length > 0) {
  console.warn(`Warnung: mehrdeutige Namen:\n  ${ambiguous.join('\n  ')}`);
}
if (typeMismatch.length > 0) {
  console.log(`Hinweis: abweichende Mandatsart (${typeMismatch.length}):\n  ${typeMismatch.join('\n  ')}`);
}
