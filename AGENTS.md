# AGENTS.md

Hinweise für Coding-Agents, die in diesem Repository arbeiten.

## Projekt

**Demokratiepost** ist eine statische Web-App, die aus einer Postleitzahl und einer
Kampagne fertige politische Musterschreiben erzeugt (Empfänger + Absenderdaten eingesetzt),
bereit zum Drucken oder Versenden.

- 100 % clientseitig, **kein Backend, kein Tracking**.
- Stack: Vite + React + TypeScript.
- Hosting: GitHub Pages unter eigener Domain `https://demokratiepost.de` (`base: '/'`).
- Der vollständige Plan steht in [`PLAN.md`](./PLAN.md) – **das ist die Quelle der Wahrheit**
  für Architektur, Datenquellen und Meilensteine. Der Plan wird **ausschließlich in dieser
  lokalen Datei im Repo** gepflegt – auch geplante Änderungen (z. B. der Fünf-Schritte-
  User-Workflow) dokumentiert man dort, nicht in separaten Dateien.

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
# Jeder Schritt wird einzeln ausgeführt (kein Sammelbefehl):
node scripts/fetch-abgeordnetenwatch.mjs                      # laufende Mandate → public/data/mandates.json
node scripts/fetch-bundestag.mjs                              # bundestag.de-Profile → public/data/mdb-profiles.json
node scripts/build-mdb.mjs                                    # zusammenführen → public/data/mdb.json
npm run data:plz         # PLZ-CSV aktualisieren + Shards → public/data/plz/*.json

# Landtag (M4), ebenfalls einzeln und in dieser Reihenfolge:
npm run data:lt:plz      # 16 PLZ-CSVs + Configs → scripts/source/plz-landtag/
npm run data:lt:aw       # Landtags-Roster + sex-Cache → public/data/mandates-landtag.json
npm run data:lt:build    # Konsistenzcheck + Shards → public/data/landtag/ + public/data/plz-landtag/
npm run data:lt:nrw      # NRW-Anreicherung (E-Mail/Wahlkreisbüro) → scripts/source/landtag-contacts/nrw.json

# Gemeinde-/Kreisebene (M5), ebenfalls einzeln und in dieser Reihenfolge:
npm run data:kom:verwaltung  # Anschriftenverzeichnis → scripts/source/gemeinde-verwaltungen.csv
npm run data:kom:plz         # PLZ-Geometrie × VG250 → scripts/source/plz-gemeinde.csv
npm run data:kom:koepfe      # GERDA-Amtsträger:innen → scripts/source/gemeinde-koepfe.csv
npm run data:kom:build       # Join + Validierung → public/data/kommunen/

# Netzbetreiber Strom (M6), ebenfalls einzeln und in dieser Reihenfolge:
npm run data:netz:mastr      # MaStR-Gesamtexport → scripts/source/mastr-netzbetreiber-*.csv
npm run data:netz:build      # Join + Validierung → public/data/netzbetreiber/
```

## Dev-Container

Unter `.devcontainer/` liegt eine VS-Code-Containerumgebung (Node 22 + OpenCode +
Chromium). Sie kapselt OpenCode im Container (Sandbox): OpenCode kann nur den
Workspace und den Container verändern, nicht das Host-System. Details und
Sandboxing-Optionen: `.devcontainer/README.md`.

## Struktur

```
campaigns/                 Content: campaign.yaml + templates/<typ>.md
                           + instructions/<typ>.md (Anleitungstypen, M7)
scripts/                   Datenpipeline (Build-Zeit)
public/data/               Laufzeit-Daten: mdb.json, plz/<prefix>.json,
                           landtag/<staat>.json + plz-landtag/<prefix>.json,
                           kommunen/gemeinden-<land>.json + kreise.json +
                           plz-kommunen/<prefix>.json,
                           netzbetreiber/netzbetreiber.json + meta.json +
                           plz-netzbetreiber/<prefix>.json (alle lazy geladen)
src/App.tsx                Ablauf: Kampagne → Absender → Empfängertyp →
                           Empfänger (Suche mit PLZ-Vorbelegung / manuell / Anleitung) → Vorschau
src/components/            PlzInput, SenderForm, RecipientTypeSelect, RecipientList,
                           ManualRecipientForm, LetterPreview, CopyFields,
                           ContactFormFields, InstructionCard
src/lib/                   campaigns, template, storage, lookup, recipientTypes,
                           recipientRoles, sender, export, markdown
src/types.ts               Mandatstraeger (MdB/Landtag), Kommune (M5),
                           Netzbetreiber (M6), Instruction (M7), ManualRecipient,
                           Recipient/RecipientCandidate, Wahlkreis, Campaign, Sender
```

## Konventionen

- **Sprache: Deutsch** – UI-Texte, Kommentare, Doku und Commit-Messages.
- Keine externen Netzwerkzugriffe zur Laufzeit außer dem Laden der eigenen Daten aus
  `public/data/` (URLs über `import.meta.env.BASE_URL` bauen, wegen des Basispfads).
- Absenderdaten nur lokal im Browser: `localStorage`-Key `demokratiepost.sender.v1`
  (versioniert, siehe `src/lib/storage.ts`).
- Manuell erfasste Empfänger ebenfalls nur lokal, **ein Key pro Typ**:
  `demokratiepost.empfaenger.<typ>.v1`. Durchsuchbare Typen wie `mdb` werden nicht gespeichert;
  Ausnahmen sind `landtag` (bei leerer Suche: `emptyFallback`) und die kommunalen Typen
  `landrat`/`buergermeister` sowie `netzbetreiber` (immer sichtbares, beim Treffer vorbefülltes
  Formular: `prefillForm`). Registry: `src/lib/recipientTypes.ts`.
- **Anleitungstypen** (`instruction: true`, z. B. `ep-petition`, M7): kein Lookup, kein
  Adressformular, kein Druck/PDF. Die Anleitung liegt in
  `campaigns/<id>/instructions/<typ>.md` (Markdown + YAML-Frontmatter mit `url`,
  `linkLabel`, `fields`), der Text für das Webformular in `templates/<typ>.md`.
  Feldwerte dürfen Platzhalter enthalten (`{{ absender.* }}`, `{{ betreff }}`,
  `{{ nachricht }}` = gerenderter Template-Text); der Markdown-Text bleibt statisch.
- Template-Platzhalter in Punktnotation: `{{ absender.name }}`, für die Selbstbezeichnung
  `{{ absender.buerger }}` („Bürgerin“/„Bürger“/„Bürger:in“, ohne Angabe
  „Bürgerin/Bürger“), `{{ empfaenger.wahlkreis }}`, für die geschlechtsbezogene
  Rollenbezeichnung `{{ empfaenger.rolle }}` (z. B. „Landrätin“/„Landrat“/„Landrät:in“),
  für kommunale Empfänger `{{ empfaenger.organisation }}`, `{{ empfaenger.amt }}`,
  `{{ empfaenger.name }}`; für Netzbetreiber zusätzlich `{{ empfaenger.netzgebiet }}`,
  `{{ empfaenger.anteil }}` und `{{ empfaenger.quelle }}` (Unternehmen ohne `amt`/`name`).
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
- **Landtag (M4)**: Mandate (wer aktuell Mitglied ist) kommen aus derselben
  abgeordnetenwatch.de-API (`fetch-landtag.mjs`); nur `mandate_won = constituency` gilt als
  Direktmandat. Die Anrede (`sex`) wird über den Cache `scripts/source/cache/politicians/`
  gehalten. Die PLZ→Landtagswahlkreis-Zuordnung stammt aus OpenWahlkreisMap
  (`fetch-plz-landtag.mjs`, Quellen yetzt/postleitzahlen ODbL + Landeswahlleiter:innen).
- **Konsistenzregel**: Ein Land ist nur durchsuchbar, wenn die laufende API-Wahlperiode und die
  OpenWahlkreisMap-Config in `period_id` **und** Label (Bundesland + Wahljahr) übereinstimmen.
  Stand Oktober 2026: 11 Länder stimmig (SH, SN, BB, TH, SL, BY, NI, HE, HB, HH, NRW);
  nicht durchsuchbar (manueller Fallback): MV, ST, RP (Datenstand Wahl 2021), BW (Id-Drift)
  und BE (Legislaturwechsel noch nicht in der API). Grund steht im Build-Log.
- **Wahlkreis-Nummerierung**: Einzelne Länder nummerieren in der OWM-Quelle anders als die API
  (z. B. SH 101–135 statt 1–35) – `LANDTAG_WK_OFFSET` in `scripts/lib/landtag.mjs` rechnet um.
- **Saarland** hat seit 2022 keine ausgewiesenen Direktmandate (`mandate_won` ist `null`);
  `build-landtag.mjs` nutzt dort die Wahlkreis-Zuordnung als Suchschlüssel.
- **Landtags-Kontakte**: Es gibt kein bundestag.de-Äquivalent. Brief-Fallback ist die
  Sitzanschrift aus `scripts/source/landtage.csv`. NRW ist der Pilot: `fetch-landtag-nrw.mjs`
  liest die Detailseiten von landtag.nrw.de (einfaches HTTP) und liefert E-Mail +
  ggf. Wahlkreisbüro → `scripts/source/landtag-contacts/nrw.json`; `build-landtag.mjs` mischt
  das ins Roster. Nach `data:lt:nrw` erneut `data:lt:build` ausführen.
- Nach `npm run data:lt:plz`/`data:lt:build` den **Dev-Server neu starten** (Vite-Cache).
- **Gemeinde-/Kreisebene (M5)**: Anschriften/E-Mail aus dem Destatis-Anschriftenverzeichnis
  (XLSX, Stand 31.01.2026), Namen aus GERDA (CC BY 4.0). Die Namen sind **Forschungsdaten,
  nicht amtlich** und teils veraltet; die App zeigt den Stand und lässt das Formular immer
  bearbeiten. Keine geschlechtsspezifische Anrede bei GERDA-Quelle `predicted`.
- **AGS-Drift**: GERDA führt teils andere AGS-Stände als Destatis/VG250 (u. a. SN, ST, RP, NI).
  `build-kommunen.mjs` gleicht deshalb zuerst über den AGS, dann über den normalisierten Namen
  (`ags_name`). Nicht zugeordnete GERDA-Köpfe stehen im Build-Log; dort fehlt der Name, der
  Behördenbrief bleibt gültig.
- **PLZ → Gemeinde/Kreis**: geometrischer Verschnitt aus yetzt/postleitzahlen (ODbL) und
  VG250 (BKG, dl-de/by-2-0), Überlappung ≥ 1 %, plus Zustell-PLZ-Ergänzung. Die
  Geometrie-Bibliotheken (`shapefile`, `proj4`, `polygon-clipping`, `topojson-client`,
  `xlsx`, `fflate`) sind **nur devDependencies** und dürfen nicht in den Client.
- **Manuelle PLZ-Ergänzungen**: `scripts/source/kommunen-plz-ergaenzungen.csv` für PLZ, die
  weder im Polygon-Verschnitt noch in den Zustell-PLZ vorkommen (aktuell 7). Nur nach
  amtlicher Prüfung erweitern.
- **Sonderfälle M5**: kreisfreie Stadt + Typ `landrat` → Stadtverwaltung mit Hinweis
  (keine Landrätin/kein Landrat); Stadtstaaten BE/HH/HB → Stadtverwaltung ohne Namen und
  ohne Amtsbezeichnung; eine PLZ kann mehrere Gemeinden und deren Verband treffen.
  56 PLZ (überwiegend Postfach-PLZ von Kreisverwaltungen) haben nur eine Kreiszuordnung –
  die Bürgermeister-Suche bietet dort den manuellen Fallback.
- Nach `npm run data:kom:plz`/`data:kom:build` den **Dev-Server neu starten** (Vite-Cache).
- **Netzbetreiber Strom (M6)**: Quelle ist der MaStR-Gesamtdatenexport (ca. 3 GB ZIP,
  01.10.2026, Revision 26.1, dl-de/by-2-0). Die PLZ→Betreiber-Zuordnung wird aus
  In-Betrieb-PV-Anlagen (Status 35) über den Netzanschlusspunkt abgeleitet und ist
  **keine amtliche Netzgebietsgrenze**. `data:netz:mastr` streamt den Export (yauzl),
  `data:netz:build` nutzt die committeten CSVs `scripts/source/mastr-netzbetreiber-*.csv`;
  der Client-Build braucht den 3-GB-Download nicht. 8 GB RAM und ca. 5–10 Minuten
  einplanen, danach `data:netz:build` erneut ausführen und den Dev-Server neu starten.
- **Kein Grundversorger**: Die BNetzA führt keine bundesweite Grundversorger-Liste; M6
  liefert nur den Verteilnetzbetreiber. `stadtwerke` bleibt manuell.
- **Netzbetreiber-Zuordnung**: Top-1 immer, weitere Betreiber ab 10 % Anteil; unter
  70 % oder bei Gemeinde-Fallback zeigt die App einen Prüfhinweis. Geschlossene
  Verteilnetze (§ 110 EnWG) werden ausgeschlossen. Das Formular ist immer editierbar.
- Nach `npm run data:netz:build` den **Dev-Server neu starten** (Vite-Cache).

## Git

- Identität dieses Repos: `tboeker <tboeker@users.noreply.github.com>`.
- **`git push` ist im Dev-Container standardmäßig gesperrt** (`.devcontainer/gitconfig-sandbox` +
  `pre-push`-Hook, `opencode.json` verbietet dem Agenten den Befehl). Committen im
  Container ist okay, Publish macht der Nutzer auf dem Host. Freischalten per Flag
  `DEVCONTAINER_ALLOW_PUSH=1` (siehe `.devcontainer/README.md`); die Agenten-Permission
  in `opencode.json` bleibt davon unberührt.
- `node_modules`, `dist`, `*.local` sind ignoriert.
