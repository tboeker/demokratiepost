# Plan: Demokratiepost Prototyp

## Idee (Kurzfassung)

Fulfillment-Layer für politische Musterschreiben von Gutachter Kail (YouTube, Stromnetze/Erneuerbare Energien).

Kernversprechen:

> **PLZ rein → korrekte Empfänger raus → fertiger, personalisierter Brief.**

Der Nutzer wählt eine Kampagne, erfasst seine Absenderdaten und den Empfängertyp. Die
zuständigen Empfänger werden über die PLZ (aus den Absenderdaten vorbelegt) gesucht oder –
bei Typen ohne Suche – manuell erfasst. Das zum Typ passende Musterschreiben (Absender +
Empfänger bereits eingesetzt) wird versandfertig aufbereitet. Ziel: maximale Reichweite durch
minimale Hürde.

Mögliche Empfängertypen: Bundestagsabgeordnete, Landtagsabgeordnete, Landrat, Bürgermeister, Stadtwerke, Netzbetreiber.

## Entscheidungen (fix)

| Thema | Entscheidung |
|---|---|
| Versandkanal | PDF-Brief (Druck) **und** Kontaktformular/mailto (E-Mail nur, wo vorhanden) |
| MVP-Empfänger | Bundestagsabgeordnete |
| Nächster Empfängertyp | Landtagsabgeordnete (M4, siehe *M4 im Detail — Landtag*) |
| Architektur | Statische Seite, 100 % clientseitig, kein Backend/Tracking |
| Stack | Vite + React + TypeScript |
| Hosting | GitHub Pages (Deploy via GitHub Actions) |
| Content/Pflege | Dateien im Repo + Build-Skripte |

## Architektur (statisch, clientseitig)

```
Browser (statische Seite) – Fünf-Schritte-Ablauf (siehe *User-Workflow*)
├── 1. Kampagne: campaigns/*/campaign.yaml (recipients + templates/<typ>.md)
├── 2. Absenderdaten: Eingabe + localStorage (demokratiepost.sender.v1)
├── 3. Empfängertyp: Auswahl aus campaign.recipients → bestimmt das Template
├── 4. Empfänger: Suche (mdb, landtag) mit PLZ-Vorbelegung
│      (Lookup: PLZ-Präfix → public/data/plz/<prefix>.json bzw.
│       public/data/plz-landtag/<prefix>.json + Roster public/data/landtag/<staat>.json,
│       nur bei Bedarf geladen)
│      bzw. manuelles Formular (Typen ohne Suche; bei `landtag` als Fallback,
│      wenn für die PLZ keine Landtagsdaten vorliegen),
│      Speicherung pro Typ: demokratiepost.empfaenger.<typ>.v1
├── 5. Rendering: Markdown-Template + Platzhalter → HTML (Vorschau)
├── Ausgabe A: DIN-5008-Briefansicht → window.print() → "Als PDF speichern"
└── Ausgabe B: Kontaktformular-Link (bzw. mailto) + "Nachricht kopieren"
```

- Kein Backend, kein Tracking. PLZ und Absenderdaten bleiben im Browser
  (`localStorage` für Komfort). Gleichzeitig das Datenschutz-Argument.
- PDF über eine per CSS gestylte Briefansicht + `window.print()` (beste Typografie,
  DIN 5008, keine PDF-Library nötig). Optional später `pdf-lib` für direkten `.pdf`-Download.
- Versand: Der Bundestag veröffentlicht **keine E-Mail-Adressen**. Die App führt daher direkt
  zum **Kontaktformular** des Abgeordneten; zusätzlich „Nachricht kopieren". Wo eine E-Mail-Adresse
  vorliegt (spätere Empfängertypen, z. B. Landtag Nordrhein-Westfalen), wird ein `mailto:`-Link
  angeboten.
- Das Kontaktformular auf bundestag.de lässt sich **nicht** per URL vorbelegen (getestet) und
  ist wegen Cross-Origin/CSRF von der App aus nicht befüllbar. Beim Klick auf
  „Kontaktformular öffnen" wird deshalb die Nachricht automatisch in die Zwischenablage
  kopiert. Zusätzlich zeigt die App die Formularfelder (Betreff, Nachricht, Absenderdaten)
  vorausgefüllt an – jedes Feld mit eigenem Kopier-Button.
- Brief und Kontaktformular brauchen **unterschiedliche Inhalte**: Der Brief enthält Absender,
  Empfängeranschrift, Datum und Betreff; die Kontaktformular-Nachricht nur den Text mit
  Anrede und Abschlussformel. Im Template markieren
  `<!-- kontaktformular:start -->` … `<!-- kontaktformular:ende -->` diesen Ausschnitt.
  Fehlen die Marker, wird der vollständige Brief als Nachricht verwendet.

## User-Workflow (fünf Schritte)

Alle Schritte auf einer Seite als nummerierte Karten (kein Wizard). **Umgesetzt.**

1. **Kampagne auswählen** – Auswahl aus `campaigns/*/campaign.yaml`.
2. **Absenderdaten erfassen** – wie bisher; localStorage `demokratiepost.sender.v1`.
3. **Empfängertyp auswählen** – Auswahl aus `recipients` der Kampagne (z. B. `mdb` →
   „Bundestagsabgeordnete(r)"). **Der gewählte Typ bestimmt das Template**
   (`templates/<typ>.md`) für Schritt 5.
4. **Empfänger suchen bzw. manuell erfassen** – typabhängig über eine Registry
   (`src/lib/recipientTypes.ts`: Label, `searchable`, Lookup-Funktion, `emptyFallback`):
   - **Typ mit Suche** (`mdb`, `landtag`): PLZ-Feld **mit `absender.plz` vorbelegt**
     (nur initiale Vorbelegung, der Nutzer kann überschreiben). Wie bisher mehrere Treffer
     bei mehrdeutiger PLZ; die Auswahl erfolgt **immer manuell** – auch bei nur einem
     Treffer wird nicht automatisch vorausgewählt.
     - `mdb`: PLZ → Bundestagswahlkreis → Direktmandat(e), Shards `public/data/plz/…`.
     - `landtag`: PLZ → Bundesland + Landtagswahlkreis → Direktmandat, Shards
       `public/data/plz-landtag/…` + Roster `public/data/landtag/<staat>.json`.
       Suche nur für Bundesländer, deren Datenstand zur laufenden Wahlperiode passt
       (Details: Abschnitt *M4 im Detail — Landtag*).
   - **Typ ohne Suche** (alle übrigen/unbekannten Typen, z. B. später `landrat`,
     `buergermeister`, `stadtwerke`): **manuelles Formular** mit für alle Typen gleichen
     Feldern: Anrede, Name, Behörde/Organisation, Straße, PLZ, Ort, E-Mail. Leere Anrede →
     automatische Anrede aus dem Namen. Die erfassten Daten werden **pro Typ** gespeichert:
     `demokratiepost.empfaenger.<typ>.v1` (versioniert wie der Absender, `src/lib/storage.ts`).
   - **Fallback für Typen mit `emptyFallback`** (`landtag`): Liefert die Suche keine Treffer
     (z. B. Bundesland ohne Landtagsdaten oder PLZ ohne besetztes Direktmandat), bietet
     Schritt 4 zusätzlich das manuelle Formular an – mit derselben Speicherung pro Typ.
     Das ist die **einzige Ausnahme** zur Regel, dass durchsuchbare Typen nicht gespeichert
     werden.
   - `empfaenger.*` wird aus dem gewählten Suchtreffer oder den manuellen Daten gespeist;
     Organisation → `empfaenger.organisation`; Partei/Wahlkreis/Bundesland nur bei
     Suchtreffern gesetzt.
5. **Vorschau** – `renderTemplate()` füllt die Platzhalter dynamisch; Brief, Druck/PDF,
   Kontaktformular/mailto und „Nachricht kopieren" wie bisher.

**Fehlerfall:** Ist ein Typ in `recipients` gelistet, aber es existiert kein
`templates/<typ>.md`, zeigt die App einen Hinweis statt einer Vorschau.

## Datenpipeline (kritischer Teil)

Zwei getrennte Baustellen für den Bundestag (Punkt 1–2), dazu der Landtag (Punkt 3, M4):

**1. Empfänger (MdB) — abgeordnetenwatch.de + bundestag.de**
- **Wer ist aktuell Mitglied**: abgeordnetenwatch.de-API v2 (CC0, ohne Schlüssel). Sie liefert
  die laufenden Mandate des Bundestages (aktuell 630) mit Mandatsart, Wahlkreis, Landesliste
  und Partei. Nötig, weil bundestag.de Profile ausgeschiedener Abgeordneter online lässt
  (aktuell 639 Profile für 630 Mandate).
- **Anschriften**: Scraping der Profile auf bundestag.de (`/abgeordnete/biografien/…`).
  Die Mandatsart kommt dort aus dem `constituencyInfo`-Block (`Wahlkreismandat` /
  `Gewählt über Landesliste`); das JSON-LD enthält den Wahlkreis nicht zuverlässig.
- Liefert: Name, Fraktion, Geschlecht, Wahlkreis/Bundesland, Homepage,
  **Wahlkreisbüro-Anschrift** und **Kontaktformular-Link**. Nur Direktmandate sind über die
  PLZ auffindbar.
- **Keine E-Mail-Adressen**: Der Bundestag veröffentlicht nur Kontaktformulare (auch die
  Open-Data-Stammdaten enthalten keine Kontakte). Die App nutzt daher den
  Kontaktformular-Link statt einer E-Mail und für Briefe die Wahlkreisbüro-Anschrift.
- Die Seite schützt sich mit einer Bot-Challenge → Abruf über einen Headless-Browser
  (`puppeteer-core`). Zusammenführung: `scripts/build-mdb.mjs`.

**2. PLZ → Wahlkreis — gelöst über abgeleitete Geodaten**
- Es gibt keine amtliche 1:1-Tabelle, weil PLZ- und Wahlkreisgrenzen nicht deckungsgleich sind.
- Die App nutzt eine aus amtlichen Geodaten abgeleitete Zuordnung: PLZ-Gebiete des BKG
  (dl-de/by-2-0) verschnitten mit der Wahlkreiseinteilung 2025 der Bundeswahlleiterin,
  ergänzt um die amtliche Gemeinde-Zuordnung der Bundeswahlleiterin.
  Die Aufbereitung stammt von OpenWahlkreisMap (MIT) und wird auf einen Commit gepinnt
  (`scripts/fetch-plz-wahlkreis.mjs`).
- PLZ und Wahlkreis sind **nicht** 1:1. Eine PLZ kann mehrere Wahlkreise umfassen.
  Bei Mehrdeutigkeit werden **alle** passenden MdB angezeigt (Feature, kein Bug).
- Wegen der Zweitstimmendeckung (Wahlrechtsreform) sind nicht alle 299 Wahlkreise besetzt;
  für unbesetzte Wahlkreise gibt es keinen direkten Abgeordneten.

Ergebnis wird als **Shards** (`public/data/plz/10.json`, `11.json`, …) ausgeliefert,
damit pro Anfrage nur wenige KB geladen werden.

**3. Landtag — 16 Bundesländer (geplant, M4)**
- **Wer ist aktuell Mitglied**: dieselbe abgeordnetenwatch.de-API v2. `GET /parliaments`
  listet die 16 Landtage (ids 2–4, 6–18; ohne Bundestag 5 und EU-Parlament 1) inklusive
  `current_project` = laufende Wahlperiode. `candidacies-mandates?parliament_period=…&type=mandate&range_end=1000`
  liefert je Land die laufenden Mandate (~1.900 insgesamt, ~1.200 Direktmandate) mit
  Mandatsart (`constituency`/`list`/`moved_up`), Wahlkreis-Label (z. B.
  „39 - Mettmann III - Mülheim II (Nordrhein-Westfalen 2022 - 2027)") und Fraktion.
  Nur `mandate_won = constituency` gilt als Direktmandat (nur diese sind über die PLZ
  auffindbar); Listenmandate werden mitgeführt, aber nicht gesucht.
- **Anrede (`sex`)**: steht nur pro Person (`/politicians?id=…`); Batching ist nicht möglich
  (getestet). Deshalb **incrementeller Cache** `scripts/source/cache/politicians/<id>.json`:
  erster Vollaufbau ~1.900 Einzelabfragen, danach nur noch Deltas. Die API drosselt
  (HTTP 429 bei schnellen Folgen) → Build-Skript mit Backoff und Pausen.
- **PLZ → Landtagswahlkreis**: OpenWahlkreisMap (derselbe gepinnte Commit wie beim Bund)
  liefert für alle 16 Länder `data/landtag/<staat>/plz-wahlkreis.csv`
  (`plz, wahlkreis_nr, wahlkreis_name, overlap, is_primary`) sowie je Land
  `configs/landtag/<staat>.yaml` mit `period_id`, `election` und `expected_wk_count`.
  Überlappungen **≥ 1 %** übernehmen (die CSVs enthalten auch Mikro-Überlappungen, z. B.
  0,016 %). Wahlkreisnummern kollidieren zwischen Ländern (Bayern 108 ≠ Berlin 108) →
  Shards mit Bundesland-Schlüssel.
- **Konsistenzregel (nur stimmige Länder werden durchsuchbar)**: Ein Land erhält die
  PLZ-Suche nur, wenn laufende API-Wahlperiode und OpenWahlkreisMap-Konfiguration in
  **`period_id` und Label** (Bundesland + Wahljahr) übereinstimmen. Grund: Die Id allein
  reicht nicht (OpenWahlkreisMap kann dieselbe Id für das *Wahl*-Projekt meinen, die API
  für die *auslaufende* Legislature – z. B. Berlin 2026). Bei Abweichung bleibt das Land
  manuell erfassbar, der Grund steht im Build-Log. Stand Oktober 2026 sind 11 Länder
  stimmig (SH, SN, BB, TH, SL, BY, NI, HE, HB, HH, NRW); ausgeschlossen sind MV, ST, RP
  (Daten noch Wahl 2021), BW (Perioden-Id-Drift 163/165) und BE (Legislaturwechsel noch
  nicht in der API abgebildet). Reaktivierung = neue/geprüfte OpenWahlkreisMap-Daten bzw.
  verifizierter Override, dann die Landtag-Schritte erneut ausführen (s. u.).
- **Anschriften/Kontakt**: Es gibt kein bundestag.de-Äquivalent; die 16 Landtage sind
  uneinheitlich. Deshalb als Brief-Fallback je Land die **Sitzanschrift des Landtags**
  (`scripts/source/landtage.csv`, 16 Zeilen, von Hand gepflegt). **NRW** ist der erste
  Anreicherungs-Pilot: Die Detailseiten auf landtag.nrw.de
  (`abgeordnetendetail.html?k=…`, per einfachem HTTP ohne Bot-Challenge abrufbar) liefern
  **E-Mail** und **Wahlkreisbüro-Anschrift**; Join über normalisierten Namen und
  Wahlkreis-Label. Weitere Länder folgen nach demselben Muster (je Land ein eigener
  Scraper). Wo eine E-Mail vorliegt, bietet die App `mailto:` an; sonst Druck/PDF +
  „Nachricht kopieren".

Build-Skripte (analog zum Bund, aber separat, weil langsam):

```bash
node scripts/fetch-plz-landtag.mjs    # 1. 16 CSVs + Configs → scripts/source/plz-landtag/
node scripts/fetch-landtag.mjs        # 2. Roster + sex-Cache → public/data/mandates-landtag.json
node scripts/build-landtag.mjs        # 3. Konsistenzcheck + Shards → public/data/landtag/ + plz-landtag/
```

Die Schritte werden **einzeln und in dieser Reihenfolge** ausgeführt; ein Sammelbefehl
existiert bewusst nicht (Laufzeit/Cache/Backoff). Die npm-Aliase `data:lt:plz`,
`data:lt:aw` und `data:lt:build` stehen für die drei Schritte.

## Kampagnen-Format (Dateien im Repo)

```
campaigns/
  stromnetz-2026/
    campaign.yaml        # id, titel, betreff, thema, beschreibung, empfängertypen, laufzeit
    templates/
      mdb.md             # Musterschreiben für Bundestagsabgeordnete (Typ "mdb")
      landtag.md         # weiteres Schreiben pro Empfängertyp (Typ "landtag", M4)
      landrat.md         # später: Gemeinde-Ebene (Typ "landrat")
```

**Pro Empfängertyp aus `recipients` gibt es genau ein Template** `templates/<typ>.md`;
die Typ-Auswahl im Workflow (Schritt 3) bestimmt, welches Template gerendert wird.
Der Betreff (`{{ betreff }}`) bleibt kampagnenweit – ein Betreff pro Typ wäre eine
spätere Erweiterung (z. B. `subject` pro Typ in der YAML).

Platzhalter: `{{ absender.* }}`, `{{ empfaenger.anrede|name|partei|wahlkreis|bundesland }}`,
`{{ datum }}`, `{{ betreff }}` + optionaler **persönlicher Absatz** des Nutzers
(erhöht die Wirkung gegenüber 1:1-Kopien deutlich). Die vollständige Menge der
`empfaenger.*`-Felder (inkl. `organisation`, `strasse`, `plz`, `ort`, `email`) ergibt sich
aus `recipientContext()` in `src/App.tsx`.

## Absenderdaten (Eingabe + localStorage)

Der Nutzer gibt seine Absenderdaten **einmal** ein. Sie werden lokal im Browser gespeichert
und beim nächsten Besuch automatisch vorausgefüllt – kein erneutes Tippen.

**Felder**

- Pflicht: Name, Straße/Hausnummer, PLZ, Ort
- Optional: E-Mail, Telefon

**Speicherung**

- Key: `demokratiepost.sender.v1` (versioniert, damit spätere Schemaänderungen sauber
  migrierbar sind)
- Format: JSON
- Laden beim Start, Speichern bei Eingabe/Submit; Schaltflächen „Speichern" und „Löschen"
- Umsetzung: `src/lib/storage.ts` (lesen/schreiben/validieren) + `SenderForm`-Komponente
- Der `TemplateContext` (`absender.*`) wird direkt aus diesen Werten gespeist.
- Die Absender-PLZ **vorbelegt das Suchfeld** im Empfänger-Schritt (bei Typen mit Suche;
  nur initial, überschreibbar). Manuell erfasste Empfänger-Daten liegen analog **pro Typ**
  unter `demokratiepost.empfaenger.<typ>.v1`.

**Datenschutz**

- Die Daten verlassen das Gerät nie: kein Backend, keine Übertragung, kein Tracking.
- Die UI weist darauf hin, dass die Eingaben nur lokal im Browser gespeichert werden.

## Geplante Repo-Struktur

```
demokratiepost/
├── .github/workflows/deploy.yml      # Build + Deploy nach GitHub Pages
├── campaigns/                        # Content (versioniert, von Hand pflegbar)
│   └── stromnetz-2026/
│       ├── campaign.yaml
│       └── templates/mdb.md
├── scripts/                          # Datenpipeline (Build-Zeit, nicht im Client)
│   ├── fetch-bundestag.mjs           # bundestag.de-Profile → data/mdb.json
│   ├── build-plz-index.ts            # PLZ→Wahlkreis → data/plz/<prefix>.json
│   ├── fetch-landtag.mjs             # Landtags-Roster (abgeordnetenwatch) → mandates-landtag.json
│   ├── fetch-plz-landtag.mjs         # PLZ→Landtagswahlkreis → source/plz-landtag/
│   ├── build-landtag.mjs             # Konsistenzcheck + Shards → data/landtag/ + plz-landtag/
│   └── fetch-landtag-nrw.mjs         # NRW-Anreicherung (E-Mail + Wahlkreisbüro)
├── public/data/                      # Laufzeit-Daten, lazy geladen
│   ├── mdb.json
│   ├── plz/10.json, 11.json, …
│   ├── landtag/<staat>.json          # Roster je Bundesland (nur stimmige Länder)
│   └── plz-landtag/10.json, 11.json, …
├── src/
│   ├── App.tsx      (Fünf-Schritte-Ablauf, siehe *User-Workflow*)
│   ├── components/  (PlzInput, SenderForm, RecipientTypeSelect, RecipientList,
│   │                 ManualRecipientForm, LetterPreview)
│   ├── lib/         (campaigns, template, storage, lookup, recipientTypes, export)
│   └── types.ts     (ManualRecipient, Mandatstraeger (MdB/Landtag); Recipient-Union)
├── vite.config.ts                    # base: '/demokratiepost/'
└── README.md
```

## GitHub-Pages-Besonderheiten

- `vite.config.ts` braucht `base: '/demokratiepost/'` (Repo-Pfad), sonst laden
  Assets/Daten nicht.
- Daten- und Asset-URLs relativ über `import.meta.env.BASE_URL` bauen.
- Deploy: GitHub Actions (Build → `actions/upload-pages-artifact` → `actions/deploy-pages`).
- Kein SPA-Fallback nötig, solange Single-Page ohne Deep-Links.

## Meilensteine

1. **M1 — Gerüst** _(erledigt)_: Vite+React+TS, GitHub-Actions-Deploy, Kampagnen-Loader
   (`import.meta.glob`), Platzhalter-Engine.
2. **M2 — Bundestag end-to-end** _(erledigt)_: PLZ-Eingabe → Lookup → MdB-Liste
   (Mehrfachtreffer bei mehrdeutiger PLZ) → **Absenderformular mit localStorage** →
   Briefvorschau → PDF/Print + Kontaktformular/Copy.
3. **M3 — Content & UX**: Kails Schreiben als erste Kampagne, optionaler persönlicher
   Absatz, Feinschliff. **Workflow-Umbau** auf den Fünf-Schritte-Ablauf
   (Kampagne → Absender → **Empfängertyp** → Empfänger (Suche mit PLZ-Vorbelegung bzw.
   manuelle Erfassung pro Typ) → Vorschau); **Template pro Empfängertyp**;
   Typen-Registry `recipientTypes.ts` – _umgesetzt_; Einzel-Details im Abschnitt *User-Workflow*.
4. **M4 — Erweiterung**: Landtag _(geplant, Details im Abschnitt *M4 im Detail — Landtag*)_,
   danach Gemeinde-Ebene (Bürgermeister/Landrat).
5. **M5 — später**: Netzbetreiber/Stadtwerke (Grundversorger via BNetzA).

M1–M3 sind der Proof-of-Value. Erst danach lohnt sich die Datenbreite.

## M4 im Detail — Landtag (geplant)

**Ziel:** Landtagsabgeordnete als zweiter durchsuchbarer Empfängertyp – PLZ rein,
Direktmandat des zuständigen Landtags raus, Brief versandfertig.

**Recherche-Stand (Oktober 2026):** Die abgeordnetenwatch-API v2 deckt alle 16 Landtage
inklusive laufender Wahlperiode ab (Abschnitt *Datenpipeline*, Punkt 3). OpenWahlkreisMap
liefert die fertigen PLZ→Landtagswahlkreis-Zuordnungen für alle 16 Länder. Die Kontaktdaten
der Landtage sind uneinheitlich (NRW: E-Mail + Wahlkreisbüro per einfachem HTTP; Sachsen
u. a.: nur Kontaktformular-Token + Landtagssitz).

### Datenbasis (Build-Zeit)

1. `scripts/fetch-plz-landtag.mjs`: 16 CSVs + Configs vom gepinnten OpenWahlkreisMap-Commit,
   Filter `overlap ≥ 1 %`, normalisierte Kopie nach `scripts/source/plz-landtag/<staat>.csv`
   (Header-Kommentare wie beim Bund).
2. `scripts/fetch-landtag.mjs`: Roster je Land (Mandate, Mandatsart, Wahlkreis, Partei) +
   `sex`-Cache, Backoff bei 429 → `public/data/mandates-landtag.json` (inkl. `parliamentId`,
   `periodId`, `periodLabel`).
3. `scripts/source/landtage.csv` (neu, manuell): Sitzanschrift je Landtag als Brief-Fallback.
4. `scripts/build-landtag.mjs`: Konsistenzcheck (period_id **und** Label), Ausgabe
   `public/data/landtag/<staat>.json` (nur stimmige Länder) und
   `public/data/plz-landtag/<prefix>.json` (`{ plz: [{ staat, wahlkreise: [nr…] }] }`),
   Validierung (jede Direktmandats-WK in den Shards, `expected_wk_count`-Abgleich,
   Warnungen statt Abbruch).
5. npm-Scripts: `data:lt:plz`, `data:lt:aw`, `data:lt:build` – einzeln ausgeführt
   (kein Sammelbefehl).

### Client

- `src/types.ts`: `MdB` → generisches `Mandatstraeger` mit
  `parlament: 'bundestag' | 'landtag'` und `bundesland`;
  `Recipient = Mandatstraeger | ManualRecipient`; Guard `isMdB` → `isMandat`
  (Call Sites: `lookup.ts`, `recipientTypes.ts`, `App.tsx`, `RecipientList.tsx`).
- `src/lib/lookup.ts`: `findLandtagRecipientsByPlz(plz)` – PLZ-Shard → Bundesländer →
  Roster-Cache je Land → Filter `mandate === 'direct'`.
- `src/lib/recipientTypes.ts`: `landtag` mit Lookup; Registry-Feld `emptyFallback`
  (landtag: true, mdb: false).
- `src/App.tsx` Schritt 4: bei leerem Suchergebnis und `emptyFallback` zusätzlich
  `ManualRecipientForm` (Speicherung `demokratiepost.empfaenger.landtag.v1`; Empfänger =
  Suchtreffer ODER vollständige manuelle Daten). Hinweistext typsensitiv (Landtag: „Für
  deine PLZ liegen keine Landtagsdaten vor (Wahlperiode/Bundesland) – erfasse den Empfänger
  manuell."). `recipientContext()` um `bundesland` erweitern.
- Keine neuen Laufzeit-Netzwerkzugriffe außerhalb `public/data/`.

### Kampagne

- `campaigns/redispatch-2026-01/campaign.yaml`: `recipients: [mdb, landtag]`.
- `templates/landtag.md`: derselbe Kern (EU-Rechtsbruch, fossile Kostenfalle) auf
  Landesebene – Landtage/Landesregierungen gestalten Umsetzung, Bau- und Genehmigungsrecht
  sowie Landesenergiegesetze. Anrede `{{ empfaenger.anrede }}`, Bezug
  `{{ empfaenger.wahlkreis }}` / `{{ empfaenger.bundesland }}`,
  `<!-- kontaktformular:start/ende -->`-Marker. Betreff bleibt kampagnenweit.
  **Textentwurf wird vor Veröffentlichung mit dem Kampagnen-Autor (Kail) abgestimmt.**

### NRW-Anreicherung (direkt danach, eigener Commit)

- `scripts/fetch-landtag-nrw.mjs` (einfacher `fetch`, kein `puppeteer`): Abgeordnetensuche +
  Detailseiten crawlen, Join über normalisierten Namen und Wahlkreis-Label; setzt `email`
  und `address` (Wahlkreisbüro, Fallback Sitzanschrift) im NRW-Roster. Wirkung: mailto-Button
  + vorbefüllte Nachricht für NRW.
- Weitere Länder (Hamburg, Bremen, …) folgen als eigene Scraper nach demselben Muster.

### Doku, Lizenz, Abnahme

- `scripts/README.md`: Abschnitt „Landtag" (Quellen, Konsistenzregel, Cache/429, Befehle).
- Impressum: **ODbL-Attribution für yetzt/postleitzahlen** (PLZ-Polygone der
  Landtags-Zuordnung) ergänzen; „© GeoBasis-DE / BKG" bleibt.
- AGENTS.md-Konventionen nachziehen (Manual-Fallback-Ausnahme für `landtag`).
- Nach `data:lt:plz` Dev-Server neu starten (Vite liefert sonst alte Shards).
- Abnahme im Preview: je eine PLZ pro stimmigem Land (z. B. 40212 NRW, 80333 BY, 01067 SN,
  20095 HH, 28195 HB, 24103 SH, 14482 BB, 99084 TH, 66111 SL, 64283 HE, 30159 NI) → Treffer,
  manuelle Auswahl, Vorschau/Druck/mailto; Gegenprobe 19053 (MV) → Hinweis + manuelles
  Formular; `npm run build` sauber.

### Reihenfolge

LT1 PLZ-Daten + `landtage.csv` → LT2 Roster (Cache/Backoff) + Build inkl. Konsistenzcheck →
LT3 Client (Typen, Lookup, Fallback-UI) → LT4 Kampagne (`landtag.md`) → LT5 Doku/Lizenz →
LT6 NRW-Pilot. Risiken: Rate-Limits beim Vollaufbau (Backoff + Cache), Namensnormalisierung
bei Umlauten/Bindestrichen (`scripts/lib/names.mjs` wiederverwenden), kleine Länder (SL/HB)
mit wenigen Wahlkreisen (`expected_wk_count`-Sanity).

## Offene Punkte (entscheiden beim Bauen, blockieren nicht)

- **Kampagnen-Autor**: Wer schreibt die Templates — Nutzer oder strukturiert von Kail?
  (Gilt auch für das geplante `templates/landtag.md`.)
- **Bündel-Download**: Ein Brief pro MdB (Standard) oder „an alle im Wahlkreis" als Sammel-PDF?
- **Domain**: `*.github.io/demokratiepost` oder später eigene Domain?
- **PLZ→Wahlkreis-Pflege**: Die abgeleitete Zuordnung muss zu jeder neuen Wahlperiode
  aktualisiert werden (neuer Commit in `scripts/fetch-plz-wahlkreis.mjs`, dann
  `npm run data:plz`).
- **Landtags-Datenpflege**: Nach Landtagswahlen API-Stand und OpenWahlkreisMap-Commit
  aktualisieren (Landtag-Schritte einzeln, Abschnitt *Datenpipeline*, Punkt 3). Ausgeschlossene Länder (MV, ST, RP, BW, BE) erst
  reaktivieren, wenn Wahlperiode und Wahlkreiszuschnitt stimmig sind.
- **Kontaktdaten weiterer Landtage**: NRW ist der Pilot; weitere Länder brauchen je einen
  Scraper für E-Mail/Wahlkreisbüro – sonst bleibt es beim Sitzanschrift-Fallback.

## Nächster Schritt

M1–M3 sind umgesetzt: Der Fünf-Schritte-Ablauf steht, die MdB-Daten (Anschriften,
Kontaktformular-Links) kommen aus den bundestag.de-Profilen, die **PLZ→Wahlkreis-Zuordnung**
ist vollständig (8.218 PLZ, 299 Wahlkreise). Als Nächstes **M4 — Landtag** nach dem Abschnitt
*M4 im Detail — Landtag*: Roster und PLZ-Shards aus abgeordnetenwatch.de und
OpenWahlkreisMap für die 11 stimmigen Länder (MV, ST, RP, BW, BE zunächst manuell),
Client-Integration mit Manual-Fallback, `templates/landtag.md` in der Redispatch-Kampagne,
danach der NRW-Anreicherungs-Pilot (E-Mail + Wahlkreisbüro).
