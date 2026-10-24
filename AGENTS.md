# AGENTS.md

Hinweise für Coding-Agents, die in diesem Repository arbeiten.

## Projekt

**Demokratiepost** ist eine statische Web-App, die aus einer Postleitzahl und einer
Kampagne fertige politische Musterschreiben erzeugt (Empfänger + Absenderdaten eingesetzt),
bereit zum Drucken oder Versenden.

- 100 % clientseitig, **kein Backend, kein Tracking**.
- Stack: Vite + React + TypeScript.
- Hosting: GitHub Pages (`base: '/demokratiepost/'`).
- Der vollständige Plan steht in [`PLAN.md`](./PLAN.md) – **das ist die Quelle der Wahrheit**
  für Architektur, Datenquellen und Meilensteine.

## Befehle

```bash
npm install          # Abhängigkeiten
npm run dev          # Entwicklungsserver
npm run build        # tsc --noEmit && vite build
npm run preview      # Produktions-Build lokal testen
```

Datenpipeline (Build-Zeit, nicht Teil des Clients) – Details in
[`scripts/README.md`](./scripts/README.md):

```bash
npm run data             # alle Schritte: Mandate + Profile + Zusammenführung + PLZ-Index
node scripts/fetch-abgeordnetenwatch.mjs                      # laufende Mandate → public/data/mandates.json
node scripts/fetch-bundestag.mjs                              # bundestag.de-Profile → public/data/mdb-profiles.json
node scripts/build-mdb.mjs                                    # zusammenführen → public/data/mdb.json
npm run data:plz         # PLZ-CSV aktualisieren + Shards → public/data/plz/*.json
```

## Dev-Container

Unter `.devcontainer/` liegt eine VS-Code-Containerumgebung (Node 22 + OpenCode +
Chromium). Sie kapselt OpenCode im Container (Sandbox): OpenCode kann nur den
Workspace und den Container verändern, nicht das Host-System. Details und
Sandboxing-Optionen: `.devcontainer/README.md`.

## Struktur

```
campaigns/                 Content: campaign.yaml + templates/<typ>.md
scripts/                   Datenpipeline (Build-Zeit)
public/data/               Laufzeit-Daten: mdb.json + plz/<prefix>.json (lazy geladen)
src/App.tsx                Ablauf: PLZ → Kampagne → Empfänger → Absender → Brief
src/components/            PlzInput, SenderForm, RecipientList, LetterPreview
src/lib/                   campaigns, template, storage, lookup, export
src/types.ts               MdB, Wahlkreis, Campaign, Sender
```

## Konventionen

- **Sprache: Deutsch** – UI-Texte, Kommentare, Doku und Commit-Messages.
- Keine externen Netzwerkzugriffe zur Laufzeit außer dem Laden der eigenen Daten aus
  `public/data/` (URLs über `import.meta.env.BASE_URL` bauen, wegen GitHub-Pages-Basispfad).
- Absenderdaten nur lokal im Browser: `localStorage`-Key `demokratiepost.sender.v1`
  (versioniert, siehe `src/lib/storage.ts`).
- Template-Platzhalter in Punktnotation: `{{ absender.name }}`, `{{ empfaenger.wahlkreis }}`.
- Der Abschnitt `<!-- kontaktformular:start -->` … `<!-- kontaktformular:ende -->` im Template
  ist die Nachricht für Kontaktformular/E-Mail (nur Text + Abschlussformel); der Rest ist der
  vollständige Brief. Fehlen die Marker, gilt der ganze Brief als Nachricht.
- Änderungen am Verhalten an `PLAN.md` spiegeln, wenn sie Architektur/Meilensteine betreffen.

## Daten & Gotchas

- **Keine E-Mail-Adressen**: Der Bundestag veröffentlicht keine Mails der Abgeordneten (nur
  Kontaktformulare; auch die Open-Data-Stammdaten enthalten keine Kontakte). Die App nutzt
  deshalb den **Kontaktformular-Link** und für Briefe die **Wahlkreisbüro-Anschrift**
  (Fallback: Bundestagsbüro).
- **Bot-Challenge**: bundestag.de schützt Seiten mit einer Challenge (Enodia). Ein normaler
  HTTP-Request wird auf `/.enodia/challenge` umgeleitet. `fetch-bundestag.mjs` nutzt daher
  Headless-Chrome über `puppeteer-core` (Chrome nötig, Pfad via `CHROME_PATH`).
- **Zwei Datenquellen**: Wer aktuell Mitglied ist, kommt aus der abgeordnetenwatch.de-API
  (`fetch-abgeordnetenwatch.mjs`, CC0, ohne Schlüssel); bundestag.de liefert nur Anschriften,
  Kontaktformular und Homepage. bundestag.de hat Profile ausgeschiedener Abgeordneter online
  (639 Profile für 630 Mandate) – `build-mdb.mjs` filtert sie über den Mandatsabgleich.
- **Mandatsart** steht auf bundestag.de im `constituencyInfo`-Block
  (`Wahlkreismandat` / `Gewählt über Landesliste`), **nicht** zuverlässig im JSON-LD.
- Alle **630 Abgeordneten** werden erfasst: Direktmandate (mit Wahlkreis) und Listenmandate
  (mit Bundesland). Nur Direktmandate sind über die PLZ auffindbar. Aktuell 274 Direkt- und
  356 Listenmandate (Zweitstimmendeckung + vakante Wahlkreise).
- Die **PLZ→Wahlkreis-Zuordnung** ist vollständig (8.218 PLZ, 299 Wahlkreise) und wird aus
  [OpenWahlkreisMap](https://github.com/maximilion-ai/OpenWahlkreisMap) (MIT) erzeugt. Die
  Aufbereitung beruht auf den BKG-PLZ-Gebieten und der Wahlkreiseinteilung 2025, ergänzt um
  die amtliche Gemeinde-Zuordnung der Bundeswahlleiterin; eine PLZ kann mehrere Wahlkreise
  überlappen, dann sind alle Zuordnungen (≥ 1 % Flächenanteil) enthalten.
  `fetch-plz-wahlkreis.mjs` pinnt die Quelle auf einen Commit. BKG-Attribution
  („© GeoBasis-DE / BKG“) muss im Impressum bleiben.
- Nach `npm run data:plz` den **Dev-Server neu starten**: Vite kann sonst noch den alten
  Stand des Public-Ordners ausliefern und liefert neue Shards als HTML statt JSON.

## Git

- Identität dieses Repos: `tboeker <tboeker@users.noreply.github.com>`.
- **`git push` ist im Dev-Container standardmäßig gesperrt** (`.devcontainer/gitconfig-sandbox` +
  `pre-push`-Hook, `opencode.json` verbietet dem Agenten den Befehl). Committen im
  Container ist okay, Publish macht der Nutzer auf dem Host. Freischalten per Flag
  `DEVCONTAINER_ALLOW_PUSH=1` (siehe `.devcontainer/README.md`); die Agenten-Permission
  in `opencode.json` bleibt davon unberührt.
- `node_modules`, `dist`, `*.local` sind ignoriert.
