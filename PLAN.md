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
| Nächster Empfängertyp | Landtagsabgeordnete (M4, umgesetzt – siehe *M4 im Detail — Landtag*) |
| Nächster Meilenstein | Gemeinde-Ebene (M5): Bürgermeister:in + Landrät:in |
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
├── 4. Empfänger: Suche (mdb, landtag, landrat, buergermeister) mit PLZ-Vorbelegung
│      (Lookup: PLZ-Präfix → public/data/plz/<prefix>.json bzw.
│       public/data/plz-landtag/<prefix>.json + Roster public/data/landtag/<staat>.json
│       bzw. public/data/kommunen/plz-kommunen/<prefix>.json + Regionaleinheiten
│       public/data/kommunen/gemeinden-<land>.json (M5), nur bei Bedarf geladen)
│      bzw. manuelles Formular (Typen ohne Suche; bei `landtag` als Fallback,
│      bei `landrat`/`buergermeister` als vorbefüllte Vorlage),
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
   (`src/lib/recipientTypes.ts`: Label, `searchable`, Lookup-Funktion, `emptyFallback`,
   `prefillForm`):
   - **Typ mit Suche** (`mdb`, `landtag`, `landrat`, `buergermeister`): PLZ-Feld **mit
     `absender.plz` vorbelegt** (nur initiale Vorbelegung, der Nutzer kann überschreiben).
     Wie bisher mehrere Treffer bei mehrdeutiger PLZ; die Auswahl erfolgt **immer manuell** –
     auch bei nur einem Treffer wird nicht automatisch vorausgewählt.
     - `mdb`: PLZ → Bundestagswahlkreis → Direktmandat(e), Shards `public/data/plz/…`.
     - `landtag`: PLZ → Bundesland + Landtagswahlkreis → Direktmandat, Shards
       `public/data/plz-landtag/…` + Roster `public/data/landtag/<staat>.json`.
       Suche nur für Bundesländer, deren Datenstand zur laufenden Wahlperiode passt
       (Details: Abschnitt *M4 im Detail — Landtag*).
     - `landrat` / `buergermeister` (M5, geplant): PLZ → Kreis bzw. Gemeinde (und deren
       Gemeindeverband), Shards `public/data/kommunen/plz-kommunen/…` + Regionaleinheiten
       `public/data/kommunen/gemeinden-<land>.json` (Details: Abschnitt
       *M5 im Detail — Gemeinde-Ebene*).
   - **Typ ohne Suche** (alle übrigen/unbekannten Typen, z. B. `stadtwerke`,
     `netzbetreiber`): **manuelles Formular** mit für alle Typen gleichen
     Feldern: Anrede, Name, Behörde/Organisation, Straße, PLZ, Ort, E-Mail. Leere Anrede →
     automatische Anrede aus dem Namen. Die erfassten Daten werden **pro Typ** gespeichert:
     `demokratiepost.empfaenger.<typ>.v1` (versioniert wie der Absender, `src/lib/storage.ts`).
   - **Fallback für Typen mit `emptyFallback`** (`landtag`): Liefert die Suche keine Treffer
     (z. B. Bundesland ohne Landtagsdaten oder PLZ ohne besetztes Direktmandat), bietet
     Schritt 4 zusätzlich das manuelle Formular an – mit derselben Speicherung pro Typ.
   - **Vorbefüllte Vorlage für Typen mit `prefillForm`** (`landrat`, `buergermeister`):
     Das manuelle Formular ist **immer** sichtbar und wird beim Auswählen eines Treffers mit
     Behörde, Anschrift, E-Mail und – soweit bekannt – Name vorbefüllt; der Nutzer korrigiert,
     die Daten werden pro Typ gespeichert. Grund: Die Amtsinhaber:innen-Daten sind
     forschungsdatenbasiert und lückenhaft. Damit werden auch durchsuchbare Typen gespeichert –
     bewusste Erweiterung der Regel, dass durchsuchbare Typen nicht gespeichert werden.
   - `empfaenger.*` wird aus dem gewählten Suchtreffer oder den manuellen Daten gespeist;
     Organisation → `empfaenger.organisation`; Partei/Wahlkreis/Bundesland nur bei
     Suchtreffern gesetzt; `empfaenger.amt` (z. B. „Bürgermeisterin“) nur bei kommunalen
     Treffern (M5).
5. **Vorschau** – `renderTemplate()` füllt die Platzhalter dynamisch; Brief, Druck/PDF,
   Kontaktformular/mailto und „Nachricht kopieren" wie bisher.

**Fehlerfall:** Ist ein Typ in `recipients` gelistet, aber es existiert kein
`templates/<typ>.md`, zeigt die App einen Hinweis statt einer Vorschau.

## Datenpipeline (kritischer Teil)

Zwei getrennte Baustellen für den Bundestag (Punkt 1–2), dazu der Landtag (Punkt 3, M4) und
die Gemeinde-/Kreisebene (Punkt 4, M5):

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

**3. Landtag — 16 Bundesländer (M4, umgesetzt)**
- **Wer ist aktuell Mitglied**: dieselbe abgeordnetenwatch.de-API v2. `GET /parliaments`
  listet die 16 Landtage (ids 2–4, 6–18; ohne Bundestag 5 und EU-Parlament 1) inklusive
  `current_project` = laufende Wahlperiode. `candidacies-mandates?parliament_period=…&type=mandate&range_end=1000`
  liefert je Land die laufenden Mandate (~1.900 insgesamt, ~1.200 Direktmandate) mit
  Mandatsart (`constituency`/`list`/`moved_up`), Wahlkreis-Label (z. B.
  „39 - Mettmann III - Mülheim II (Nordrhein-Westfalen 2022 - 2027)") und Fraktion.
  Nur `mandate_won = constituency` gilt als Direktmandat (nur diese sind über die PLZ
  auffindbar); Listenmandate werden mitgeführt, aber nicht gesucht.
- **Anrede (`sex`)**: steht nur pro Person (`/politicians?id=…`); das Bündeln von Ids ist nicht
  möglich. Die API erlaubt aber, Mandate über das Referenzfeld zu filtern
  (`…&politician[entity.sex]=m|f|d`) – drei Abrufe je Wahlperiode statt ~1.900 Einzelabfragen.
  Das Ergebnis wird im **inkrementellen Cache** `scripts/source/cache/politicians/<id>.json`
  gehalten; die API drosselt (HTTP 429) → Build-Skript mit Backoff. `--force` baut neu auf.
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

**4. Gemeinde- und Kreisebene (M5, geplant)**
- **Wer ist die Verwaltungsspitze**: Es gibt keine amtliche, bundesweit maschinenlesbare Quelle.
  Basis sind die Amtsinhaber:innen aus den Direktwahlen; fehlende oder veraltete Einträge
  bleiben beim Behördenbrief ohne Namen (Details und Zahlen: Abschnitt *M5 im Detail —
  Gemeinde-Ebene*).
- **Anschriften und dienstliche E-Mail**: Das Statistikportal veröffentlicht das
  *Anschriftenverzeichnis* „Anschriften der Gemeinde- und Stadtverwaltungen in Deutschland“
  (Excel, jährlich, Stichtag 31.01.) mit Name, ARS, AGS, Zustell-PLZ, Straße/Hausnummer und
  E-Mail je Land, Regierungsbezirk, Region, **Kreis**, **Gemeindeverband** und **Gemeinde**.
  Damit sind Rathaus- und Landratsamtanschrift inklusive Kontakt in allen Ländern abgedeckt.
- **PLZ → Gemeinde/Kreis**: Es gibt keine amtliche offene 1:1-Tabelle; das BKG-PLZ-Produkt
  liegt nicht im offenen BKG-Spiegel. Die Zuordnung entsteht daher wie beim Bund über einen
  geometrischen Verschnitt der PLZ-Polygone (`yetzt/postleitzahlen`, ODbL) mit den
  Gemeindegrenzen der VG250 (BKG Open Data), Überlappung ≥ 1 %, alle Treffer (vergleiche
  Punkt 2). Ergänzt wird sie über die amtliche PLZ der Gemeindeverwaltung.

```bash
npm run data:kom:verwaltung  # 1. Anschriftenverzeichnis -> scripts/source/gemeinde-verwaltungen.csv
npm run data:kom:plz         # 2. Geometrie-Join       -> scripts/source/plz-gemeinde.csv
npm run data:kom:koepfe      # 3. Amtsinhaber:innen   -> scripts/source/gemeinde-koepfe.csv
npm run data:kom:build       # 4. Join + Validierung  -> public/data/kommunen/
```

Die Schritte werden **einzeln und in dieser Reihenfolge** ausgeführt (großer Download,
Geometrie-Laufzeit, Datenstände). Nach `data:kom:plz`/`data:kom:build` den Dev-Server neu
starten (Vite-Cache).

## Kampagnen-Format (Dateien im Repo)

```
campaigns/
  stromnetz-2026/
    campaign.yaml        # id, titel, betreff, thema, beschreibung, empfängertypen, laufzeit
    templates/
      mdb.md             # Musterschreiben für Bundestagsabgeordnete (Typ "mdb")
      landtag.md         # weiteres Schreiben pro Empfängertyp (Typ "landtag", M4)
      landrat.md         # Gemeinde-Ebene: Kreisverwaltung (Typ "landrat", M5)
      buergermeister.md  # Gemeinde-Ebene: Rathaus/Gemeindeverwaltung (Typ "buergermeister", M5)
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
│   ├── fetch-landtag-nrw.mjs         # NRW-Anreicherung (E-Mail + Wahlkreisbüro)
│   ├── fetch-kommunen-verwaltung.mjs # Anschriftenverzeichnis (Destatis) → source/gemeinde-verwaltungen.csv
│   ├── fetch-plz-gemeinde.mjs        # PLZ→Gemeinde (VG250 × PLZ-Polygone) → source/plz-gemeinde.csv
│   ├── fetch-gemeinde-koepfe.mjs     # Amtsinhaber:innen (GERDA) → source/gemeinde-koepfe.csv
│   └── build-kommunen.mjs            # Join + Validierung → data/kommunen/ (M5)
├── public/data/                      # Laufzeit-Daten, lazy geladen
│   ├── mdb.json
│   ├── plz/10.json, 11.json, …
│   ├── landtag/<staat>.json          # Roster je Bundesland (nur stimmige Länder)
│   ├── plz-landtag/10.json, 11.json, …
│   └── kommunen/
│       ├── gemeinden-<land>.json     # Kreis-, Verbands- und Gemeindeverwaltungen je Land (M5)
│       ├── kreise.json               # Kreisverwaltungen + Landrät:in (M5)
│       └── plz-kommunen/10.json, …   # PLZ → Gemeinden/Kreise (M5)
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
4. **M4 — Landtag** _(umgesetzt, Details im Abschnitt *M4 im Detail — Landtag*)_.
5. **M5 — Gemeinde-Ebene**: Bürgermeister:in und Landrät:in _(geplant, Details im Abschnitt
   *M5 im Detail — Gemeinde-Ebene*)_.
6. **M6 — später**: Netzbetreiber/Stadtwerke (Grundversorger via BNetzA).

M1–M3 sind der Proof-of-Value. Erst danach lohnt sich die Datenbreite.

## M4 im Detail — Landtag (umgesetzt)

**Ziel:** Landtagsabgeordnete als zweiter durchsuchbarer Empfängertyp – PLZ rein,
Direktmandat des zuständigen Landtags raus, Brief versandfertig.

**Recherche-Stand (Oktober 2026):** Die abgeordnetenwatch-API v2 deckt alle 16 Landtage
inklusive laufender Wahlperiode ab (Abschnitt *Datenpipeline*, Punkt 3). OpenWahlkreisMap
liefert die fertigen PLZ→Landtagswahlkreis-Zuordnungen für alle 16 Länder. Die Kontaktdaten
der Landtage sind uneinheitlich (NRW: E-Mail + Wahlkreisbüro per einfachem HTTP; Sachsen
u. a.: nur Kontaktformular-Token + Landtagssitz).

**Umsetzungsstand (Oktober 2026):** Umgesetzt. Ist-Stand der Daten:

- 16 Landtage, 1.876 Mandate (866 als Direktmandat eingeordnet), 11 Länder durchsuchbar,
  85 PLZ-Shards mit 6.027 PLZ. Quellen-Commit wie beim Bund gepinnt.
- **sex** wird nicht mehr einzeln, sondern über den API-Filter `politician[entity.sex]`
  (drei Abrufe je Wahlperiode) ermittelt; der Per-Person-Cache bleibt erhalten.
- **Konsistenz:** stimmig/„Treffer“ sind SH, SN, BB, TH, SL, BY, NI, HE, HB, HH, NRW; nicht
  durchsuchbar (manueller Fallback) MV, ST, RP (Daten noch Wahl 2021), BW (Perioden-Id-Drift
  163/165) und BE (Legislaturwechsel noch nicht in der API abgebildet).
- **Saarland** hat seit 2022 keine ausgewiesenen Direktmandate (Wahlkreislisten, `mandate_won`
  ist `null`). `build-landtag.mjs` nutzt dort die Wahlkreis-Zuordnung als Suchschlüssel, damit
  die PLZ-Suche trotzdem Treffer liefert.
- **Wahlkreis-Nummerierung:** SH wird in der amtlichen Quelle 101–135 geführt, in der API 1–35
  → `LANDTAG_WK_OFFSET` (in `scripts/lib/landtag.mjs`) rechnet um.
- **NRW-Kontakte:** Die Detailseiten liefern die dienstliche E-Mail und – nur wo angegeben –
  ein Wahlkreisbüro. Sonst bleibt es bei der Landtagssitz als Briefanschrift. Ist-Stand:
  195 E-Mail-Adressen, 28 Wahlkreisbüros.

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
  sowie Landesenergiegesetze. Anrede `{{ empfaenger.anrede }}`, Ortsbezug `{{ absender.ort }}`
  (funktioniert auch beim manuellen Fallback, wo kein Bundesland bekannt ist), Empfänger-
  anschrift aus `empfaenger.*`, `<!-- kontaktformular:start/ende -->`-Marker. Betreff bleibt
  kampagnenweit. **Textentwurf wird vor Veröffentlichung mit dem Kampagnen-Autor (Kail)
  abgestimmt.**

### NRW-Anreicherung (umgesetzt)

- `scripts/fetch-landtag-nrw.mjs` (einfacher `fetch`, kein `puppeteer`): liest die A-Z-Liste und
  die Detailseiten von landtag.nrw.de, Join über normalisierten Namen (`scripts/lib/names.mjs`);
  schreibt `scripts/source/landtag-contacts/nrw.json`. `build-landtag.mjs` merge-t das ins
  NRW-Roster: `email` (dienstlich) und – nur wo angegeben – `address` (Wahlkreisbüro, sonst
  Sitzanschrift). Wirkung: mailto-Button + vorbefüllte Nachricht für NRW (nach `data:lt:nrw`
  erneut `data:lt:build` ausführen).
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

## M5 im Detail — Gemeinde-Ebene (Bürgermeister:in / Landrät:in)

**Ziel:** Die kommunale Verwaltungsspitze als dritte durchsuchbare Empfängergruppe – PLZ rein,
zuständige Verwaltung raus, Brief versandfertig. Zwei Typen:

| Typ-ID | Label | Suche | Empfänger |
|---|---|---|---|
| `buergermeister` | Bürgermeister(in) | PLZ → Gemeinde | Leitung der Gemeindeverwaltung (Bürgermeister:in, ggf. Oberbürgermeister:in, ggf. Verbandsgemeinde) |
| `landrat` | Landrätin / Landrat | PLZ → Kreis | Leitung der Kreisverwaltung |

`ob` (Oberbürgermeister(in)) bleibt als **Alias** auf `buergermeister` bestehen; die
Amtsbezeichnung kommt aus den Daten, nicht aus dem Typ.

### Entscheidungen (fix)

| Thema | Entscheidung |
|---|---|
| Umfang | beide Typen bundesweit; Name „soweit vorhanden“, sonst Behördenbrief ohne Namen |
| PLZ → Gemeinde/Kreis | geometrischer Verschnitt (PLZ-Polygone × VG250), Überlappung ≥ 1 %, alle Treffer |
| Datenmodell | neue Empfänger-Art `Kommune` (neben `Mandatstraeger` und `ManualRecipient`) |
| Anrede | rollenbezogen neutral; geschlechtsspezifisch nur bei verlässlicher Quelle, im Formular editierbar |
| Name | Vorschlag, nie Wahrheit: Wahljahr wird mitgeführt und angezeigt; Formular immer vorbefüllt und editierbar |

### Datenlage (Vorprüfung Oktober 2026)

Die Zahlen unten stammen aus einer Vorprüfung der Quellen (Dateien geladen und ausgewertet),
nicht aus Schätzungen. Sie sind beim Bauen zu bestätigen.

**a) Anschriften und E-Mail – amtlich und vollständig**

Quelle: Statistisches Bundesamt / Statistikportal, *Anschriften der Gemeinde- und
Stadtverwaltungen in Deutschland*, Stand 31.01.2026, Excel, kostenfrei, „Vervielfältigung und
Verbreitung, auch auszugsweise, sind mit Quellenangabe gestattet“.
<https://www.statistikportal.de/de/veroeffentlichungen/anschriftenverzeichnis>

- Inhalt je Regionaleinheit: Name, **ARS**, **AGS**, Verwaltungssitz, Straße/Hausnummer,
  **Zustell-PLZ**, Ort, **E-Mail**, Fläche, Bevölkerung.
- Geprüfte Struktur: 13.748 Datenzeilen – 16 Länder, 22 Regierungsbezirke, 12 Regionen,
  **401 Kreise**, **1.202 Gemeindeverbände**, **12.088 Gemeinden**; E-Mail in **12.513 Zeilen
  (~91 %)**.
- Damit sind **Rathaus- und Landratsamtanschrift plus dienstliche E-Mail in allen Ländern**
  abgedeckt – M5 wird damit auch außerhalb NRWs `mailto:`-fähig (M4 kann das nur für NRW).
- Ausdrückliche Grenze der Quelle: „Angaben zu Telefonnummer, Internetadresse, **Name der
  Bürgermeisterin/des Bürgermeisters** sowie zum Ortsteil liegen uns nicht vor.“ Namen kommen
  daher aus b).
- Offen für G1: 12.088 Gemeinde-Zeilen liegen über den ~10.700 politisch selbstständigen
  Gemeinden – vermutlich Satzart-Varianten (z. B. `41`/`61` „Kreisfreie Stadt“). Beim Bauen
  aufklären, damit nicht doppelt gezählt wird.

**b) Amtsinhaber:innen – forschungsdatenbasiert, lückenhaft**

Quelle: GERDA – German Election Database, `mayoral_candidates.csv` und
`landrat_candidates.csv` (CC BY 4.0, Nature Scientific Data 2025).
<https://github.com/awiedem/german_election_data> – Dateien liegen in Git-LFS (Download über
den Media-Endpunkt, Commit pinnen).

- Felder u. a.: `ags`, `ags_name`, `election_year`, `election_type`, `candidate_name`
  („Nachname, Vorname“), `candidate_gender` (teils *predicted*), `candidate_party`,
  `is_winner`.
- **Bürgermeister:innen:** 8.604 Gemeinden mit einem aktuellen Wahlsieger. Verteilung sehr
  ungleich: BY 2.056, BW 1.101, SN 1.028, ST 2.057 (dort offenbar Ortsteil-/Verbandsebene,
  also mehr AGS als Gemeinden), NRW 397, HE 428, NI 444, TH 602, RP 242, BB 142, SH 44,
  MV 15, SL 48. Keine Daten für Berlin, Hamburg, Bremen.
- **Landrät:innen:** 264 Kreise. **BW und SH fehlen vollständig** (dort wählt der Kreistag).
  Geschlecht ist bei 180 von 264 Einträgen leer.
- `election_type` trennt Oberbürgermeister- (382), Bürgermeister- (7.885),
  Samtgemeinde- (144) und Verbandsgemeindewahl (193) – die Verbandsebene ist also mit
  Namen unterlegt.
- Konsequenz: Name nur anzeigen, wenn der Wahljahr-Stand plausibel ist (nicht älter als
  reguläre Amtszeit + Puffer), sonst „nicht verifiziert“. Keine Namenszeile ohne Daten.

**c) PLZ → Gemeinde/Kreis – warum der Geometrie-Weg nötig ist**

- Es gibt keine amtliche offene 1:1-Tabelle; das BKG-PLZ-Produkt ist **nicht** im offenen
  BKG-Spiegel (`daten.gdz.bkg.bund.de/produkte/` enthält kein `plz/`), OpenDataSoft hat keinen
  Deutschland-PLZ-Datensatz.
- Der bequeme Weg über die Zustell-PLZ aus a) deckt nur **4.952 der 8.218 gelieferten PLZ**
  (~60 %) ab; die fehlenden ~3.300 sind die Zweit- und Dritt-PLZ der Städte.
- Daher derselbe Weg wie beim Bund: PLZ-Polygone (`yetzt/postleitzahlen`, ODbL, bereits für M4
  im Einsatz) verschnitten mit den Gemeindegrenzen der VG250 (BKG Open Data, dl-de/by-2-0,
  `vg250_ebenen_0101/aktuell/`, Stand 21.07.2026, shp/gpkg 64 MB), Überlappung ≥ 1 %.
  Methodik wie OpenWahlkreisMap (MIT). Ergänzt um die amtliche PLZ der Gemeindeverwaltung.
- Eine PLZ kann mehrere Gemeinden umfassen → **alle** Treffer anzeigen, Auswahl immer manuell
  (wie bei mehrdeutigen Wahlkreisen: Feature, kein Bug).

### Datenbasis (Build-Zeit)

1. `scripts/fetch-kommunen-verwaltung.mjs`: lädt das Anschriftenverzeichnis (XLSX), normalisiert
   nach `scripts/source/gemeinde-verwaltungen.csv` (`satzart, ars, ags, name, verwaltungssitz,
   strasse, plz, ort, email, einwohner`), Stand im Kopfkommentar gepinnt.
2. `scripts/fetch-plz-gemeinde.mjs`: lädt VG250 (GEM + KRS) und die PLZ-Geometrien, verschneidet
   sie (devDependencies: Shapefile-/GeoJSON-Parser + `polygon-clipping`; **nichts davon im
   Client**) und schreibt `scripts/source/plz-gemeinde.csv` (`plz, ags, overlap`), Lücken
   ergänzt aus den Zustell-PLZ.
3. `scripts/fetch-gemeinde-koepfe.mjs`: lädt die GERDA-Dateien, filtert `is_winner`, nimmt je AGS
   die jüngste Wahl und schreibt `scripts/source/gemeinde-koepfe.csv`
   (`ags, amt, name, partei, geschlecht, geschlecht_quelle, wahljahr, quelle`).
4. `scripts/build-kommunen.mjs`: Join über AGS/ARS und Validierung (Warnungen statt Abbruch):
   jede Gemeinde hat eine Verwaltung, jede PLZ ≥ 1 Gemeinde, Kreis-/kreisfrei-Plausibilität
   (294 Landkreise + kreisfreie Städte + Sonderformen ≈ 401), Zustell-PLZ ⊆ Geometrie-PLZ,
   Stichproben (Kiel → Oberbürgermeister, Flensburg kreisfrei, Verbandsgemeinde in RP),
   Abdeckungsreport Namen je Land. Ausgabe:
   - `public/data/kommunen/plz-kommunen/<prefix>.json` → `{ "<plz>": [{ ags, kreisAgs, overlap }] }`
   - `public/data/kommunen/gemeinden-<land>.json` → alle Regionaleinheiten des Landes
     (Kreis, Gemeindeverband, Gemeinde) mit Name, ARS, AGS, Anschrift, E-Mail, Einwohner und
     Amtsinhaber:in (`amt`, `name`, `partei`, `wahljahr`)
   - `public/data/kommunen/kreise.json` → Kreisverwaltungen + Landrät:in
5. npm-Aliase: `data:kom:verwaltung`, `data:kom:plz`, `data:kom:koepfe`, `data:kom:build` –
   einzeln ausgeführt, kein Sammelbefehl.

### Client

- `src/types.ts`: neue Art `Kommune` in der `Recipient`-Union – `behoerde` („Stadt Köln“,
  „Landratsamt Musterkreis“, „Verbandsgemeinde X“), `amt` („Bürgermeisterin“, „Landrat“),
  `name?`, `partei?`, `address`, `email`, `ebene` (`gemeinde`/`verband`/`kreis`), `wahljahr?`,
  `quelle?`, `hinweis?`. Gemeinsamer Suchtyp `RecipientCandidate = Mandatstraeger | Kommune`,
  Guard `isKommune` analog `isMandat`.
- `src/lib/lookup.ts`: `findBuergermeisterByPlz(plz)` (PLZ-Shard → Gemeinden und deren
  Gemeindeverband → Regionaleinheiten des Landes) und `findLandratByPlz(plz)` (PLZ-Shard →
  Kreis-AGS → Kreis + Landrät:in). Beide cachen je Land wie `loadLandtagRoster`.
- `src/lib/recipientTypes.ts`: `buergermeister` und `landrat` mit Lookup; neues Feld
  `prefillForm: true` – das manuelle Formular bleibt **immer** sichtbar und wird beim Auswählen
  eines Treffers vorbefüllt (Behörde, Anschrift, E-Mail, Name soweit vorhanden). Speicherung
  wie gehabt `demokratiepost.empfaenger.<typ>.v1`. `ob` → Alias auf `buergermeister`.
- `src/App.tsx` Schritt 4: Trefferliste wie bei mdb/landtag, zusätzlich das vorbefüllte
  Formular. Hinweise: „Amtsträger: Stand <Wahljahr> – bitte prüfen“, „Name nicht verifiziert“.
- Sonderfälle: kreisfreie Stadt + Typ `landrat` → Hinweis und Stadtverwaltung/OB als Alternative;
  Stadtstaaten (BE/HH/HB) → Hinweis und manuelles Formular; mehrere Gemeinden je PLZ → Auswahl.
- Anrede: `Sehr geehrte Damen und Herren` als Standard; rollenbezogen („Sehr geehrte Frau
  Bürgermeisterin …“) nur bei verlässlicher Geschlechtsquelle. Empfängerzeile im Brief:
  ```
  {{ empfaenger.organisation }}
  {{ empfaenger.amt }} {{ empfaenger.name }}
  {{ empfaenger.strasse }}
  {{ empfaenger.plz }} {{ empfaenger.ort }}
  ```
- `RecipientList`: Behörde, Anschrift, E-Mail und Stand statt Wahlkreis/Partei.
- Keine neuen Laufzeit-Netzwerkzugriffe außerhalb `public/data/`.

### Kampagne

- `campaigns/redispatch-2026-01/campaign.yaml`: `recipients: [mdb, landtag, landrat, buergermeister]`.
- Neue Templates `landrat.md` und `buergermeister.md` mit demselben Kern auf kommunaler Ebene
  (Wärmeplanung, Bauleitplanung, Netzentgelte vor Ort, Konzessions-/Beteiligungsfragen),
  Anrede `{{ empfaenger.anrede }}`, Ortsbezug `{{ absender.ort }}`,
  `<!-- kontaktformular:start/ende -->`-Marker. Betreff bleibt kampagnenweit.
  **Textentwürfe vor Veröffentlichung mit Kail abstimmen.**

### Doku, Lizenz, Abnahme

- `scripts/README.md`: neuer Abschnitt „Gemeinde- und Kreisebene“ (Quellen, Geometrie-Join,
  Datenstände, Befehle, Lizenz).
- AGENTS.md: Befehle ergänzen; Gotchas (keine amtlichen Namen, `predicted`-Geschlecht,
  Satzart-Zählung, Geometrie-Tooling nur Build-Zeit, Dev-Server-Neustart).
- Impressum: **Destatis** (dl-de/by-2-0), „© GeoBasis-DE / BKG“ (VG250; bleibt), yetzt/ODbL
  (bleibt), **GERDA CC BY 4.0** inkl. Zitationshinweis (Hessen-Wahldaten: Hessami 2018).
- Nach `data:kom:plz`/`data:kom:build` Dev-Server neu starten.
- Abnahme im Preview: je eine PLZ pro Fall – Großstadt (z. B. 50667 Köln → OB), Landgemeinde
  (z. B. 17291 Prenzlau), kreisfreie Stadt + Typ `landrat` (Hinweis), Verbandsgemeinde (RP),
  Stadtstaat (Hinweis + manuell), PLZ mit mehreren Gemeinden (Auswahl); `npm run build` sauber;
  Datenmenge/Shard-Größen prüfen.

### Reihenfolge und Risiken

G1 Vorprüfung (Satzart-Zählung, GERDA-Abdeckung im Join je Land, Veraltet-Regel, Geometrie-
Prototyp für ein Land, Lizenztexte) → G2 Pipeline → G3 Client → G4 Templates → G5 Doku/Lizenz →
G6 Abnahme. Danach optional G7: Ersatzquellen für Stadtstaaten und für die Landrät:innen in
BW/SH (Wahl durch den Kreistag).

Risiken: Namen sind nicht amtlich und teils alt (deshalb ist der Behördenbrief ohne Namen ein
gleichwertiger Standardfall); Geometrie-Join ist neues Build-Tooling (nur devDependencies);
AGS-Stände driften zwischen Destatis (31.01.2026), VG250 (2026) und GERDA-Wahljahren –
deshalb Validierung mit Report statt stillem Merge.

## Offene Punkte (entscheiden beim Bauen, blockieren nicht)

- **Kampagnen-Autor**: Wer schreibt die Templates — Nutzer oder strukturiert von Kail?
  (Der `templates/landtag.md`-Entwurf wird vor Veröffentlichung mit Kail abgestimmt.)
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
- **M5 – Namen der Verwaltungsspitzen**: GERDA deckt 13 Länder (Bürgermeister:innen) bzw.
  11 Länder (Landrät:innen) ab; für Berlin, Hamburg, Bremen sowie die Landrät:innen in BW und
  SH (Wahl durch den Kreistag) fehlt eine Quelle. Bis dahin: Behördenbrief ohne Namen bzw.
  manuelle Ergänzung. Ersatzquellen (Landeslisten, Kreistagsbeschlüsse) sind G7.
- **M5 – Veraltete Wahldaten**: Einzelne GERDA-Einträge reichen bis 1994 zurück (u. a. weil
  Amtsinhaber:innen im Amt bestätigt wurden). Regel beim Bauen festlegen: Name nur bei
  plausibler Amtszeit anzeigen, sonst „nicht verifiziert“.
- **M5 – Geschlecht/Anrede**: `candidate_gender` ist teils vorhergesagt und bei Landrät:innen
  oft leer → keine automatische geschlechtsspezifische Anrede ohne verlässliche Quelle.

## Nächster Schritt

M1–M4 sind umgesetzt: Der Fünf-Schritte-Ablauf steht, MdB- und Landtagsdaten sind
vollständig (Bund: 630 Mandate, 299 Wahlkreise; Landtage: 16 Roster, davon 11 durchsuchbar,
6.027 PLZ in 85 Shards), Client inkl. Manual-Fallback und `templates/landtag.md` in der
Redispatch-Kampagne.

Als Nächstes **M5 — Gemeinde-Ebene** (Bürgermeister:in und Landrät:in, Abschnitt
*M5 im Detail — Gemeinde-Ebene*): mit **G1** beginnen (Satzart-Zählung des
Anschriftenverzeichnisses, GERDA-Abdeckung im Join je Land, Veraltet-Regel, Geometrie-Prototyp
für ein Land), dann G2 Pipeline, G3 Client, G4 Templates, G5 Doku/Lizenz, G6 Abnahme.
Danach **M6 — Netzbetreiber/Stadtwerke**; daneben weiterhin offen: weitere
Landtags-Kontakt-Scraper nach dem NRW-Muster (Abschnitt *M4 im Detail — Landtag*).
