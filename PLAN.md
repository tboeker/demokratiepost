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

Mögliche Empfängertypen: Bundestagsabgeordnete, Landtagsabgeordnete, Landrat, Bürgermeister, Stadtwerke, Netzbetreiber, Europäisches Parlament (Petition).

## Entscheidungen (fix)

| Thema | Entscheidung |
|---|---|
| Versandkanal | PDF-Brief (Druck) **und** Kontaktformular/mailto (E-Mail nur, wo vorhanden) |
| Reine Webformular-Empfänger | M7: Anleitung + Kopierfelder statt Adresse/Brief; Content je Typ in `campaigns/<id>/instructions/<typ>.md`; kein Druck/PDF. |
| MVP-Empfänger | Bundestagsabgeordnete |
| Letzter Empfängertyp | Europäisches Parlament – Petition (M7, umgesetzt – siehe *M7 im Detail — Anleitungs-Empfänger*) |
| Nächster Meilenstein | G7: Ersatzquellen für Stadtstaaten und Landrät:innen in BW/SH; weitere Landtags-Kontakte |
| Grundversorger | **nicht** Teil von M6: Die BNetzA führt keine bundesweite Grundversorger-Liste; der Grundversorger wird nach § 36 EnWG vom jeweiligen Netzbetreiber festgestellt und veröffentlicht. |
| Architektur | Statische Seite, 100 % clientseitig, kein Backend/Tracking |
| Stack | Vite + React + TypeScript |
| Hosting | GitHub Pages (Deploy via GitHub Actions) |
| Content/Pflege | Dateien im Repo + Build-Skripte |

## Architektur (statisch, clientseitig)

```
Browser (statische Seite) – Fünf-Schritte-Ablauf (siehe *User-Workflow*)
├── 1. Kampagne: campaigns/*/campaign.yaml (recipients + templates/<typ>.md
│      + instructions/<typ>.md für Webformular-Typen, M7)
├── 2. Absenderdaten: Eingabe + localStorage (demokratiepost.sender.v1)
├── 3. Empfängertyp: Auswahl aus campaign.recipients → bestimmt das Template
├── 4. Empfänger: Suche (mdb, landtag, landrat, buergermeister, netzbetreiber) mit PLZ-Vorbelegung
│      (Lookup: PLZ-Präfix → public/data/plz/<prefix>.json bzw.
│       public/data/plz-landtag/<prefix>.json + Roster public/data/landtag/<staat>.json
│       bzw. public/data/kommunen/plz-kommunen/<prefix>.json + Regionaleinheiten
│       public/data/kommunen/gemeinden-<land>.json (M5)
│       bzw. public/data/netzbetreiber/plz-netzbetreiber/<prefix>.json + Roster
│       public/data/netzbetreiber/netzbetreiber.json (M6), nur bei Bedarf geladen)
│      bzw. manuelles Formular (Typen ohne Suche; bei `landtag` als Fallback,
│      bei `landrat`/`buergermeister`/`netzbetreiber` als vorbefüllte Vorlage),
│      Speicherung pro Typ: demokratiepost.empfaenger.<typ>.v1 bzw.
│      ausgewählter Suchtreffer: demokratiepost.auswahl.<typ>.v1
│      bzw. Anleitung + Kopierfelder für Typen mit reinem Webformular (M7, ohne Adresse)
├── 5. Rendering: Markdown-Template + Platzhalter → HTML (Vorschau)
├── Ausgabe A: DIN-5008-Briefansicht → window.print() → "Als PDF speichern"
└── Ausgabe B: Kontaktformular-Link (bzw. mailto) + "Nachricht kopieren"
```

Für Anleitungstypen (M7) entfallen Ausgabe A und B: Schritt 4 zeigt die Anleitung samt
Link zum externen Webformular; die Formularfelder stehen mit eigenem Kopier-Button direkt
im jeweiligen Schritt.

- Kein Backend, kein Tracking. PLZ und Absenderdaten bleiben im Browser
  (`localStorage` für Komfort). Gleichzeitig das Datenschutz-Argument.
- PDF über eine per CSS gestylte Briefansicht + `window.print()` (beste Typografie,
  DIN 5008, keine PDF-Library nötig). Optional später `pdf-lib` für direkten `.pdf`-Download.
- Versand: Primär `mailto:` mit der E-Mail-Adresse aus dem offiziellen PDF-Sonderdruck
  „Kürschners Volkshandbuch“ (`fetch-mdb-emails.mjs`; Quelle und Stand werden in der App
  angezeigt). Liegt keine Adresse vor, wird **kein** „E-Mail senden“-Button gezeigt. Ist eine
  Adresse vorhanden, steht sie zusätzlich als Text direkt über den Versand-Aktionen, damit sie
  vor dem Klick sichtbar ist. Das
  **Kontaktformular** des Abgeordneten bleibt als zweite Option erhalten; zusätzlich
  „Nachricht kopieren“. Landtag Nordrhein-Westfalen nutzt denselben `mailto:`-Weg.
- Das Kontaktformular auf bundestag.de lässt sich **nicht** per URL vorbelegen (getestet) und
  ist wegen Cross-Origin/CSRF von der App aus nicht befüllbar. Beim Klick auf
  „Kontaktformular öffnen" wird deshalb die Nachricht automatisch in die Zwischenablage
  kopiert. Zusätzlich zeigt die App **Betreff und Nachricht** vorausgefüllt an – jeweils mit
  eigenem Kopier-Button. Die Kontaktdaten (Name, E-Mail, Anschrift) trägt der Nutzer direkt
  im Formular ein; sie stehen ohnehin unter der Nachricht.
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
   `prefillForm`, `instruction`):
   - **Typ mit Suche** (`mdb`, `landtag`, `landrat`, `buergermeister`, `netzbetreiber`):
     PLZ-Feld **mit `absender.plz` vorbelegt** (nur initiale Vorbelegung, der Nutzer kann
     überschreiben).
     Wie bisher mehrere Treffer bei mehrdeutiger PLZ; die Auswahl erfolgt **immer manuell** –
     auch bei nur einem Treffer wird nicht automatisch vorausgewählt.
     - `mdb`: PLZ → Bundestagswahlkreis → Direktmandat(e), Shards `public/data/plz/…`.
     - `landtag`: PLZ → Bundesland + Landtagswahlkreis → Direktmandat, Shards
       `public/data/plz-landtag/…` + Roster `public/data/landtag/<staat>.json`.
       Suche nur für Bundesländer, deren Datenstand zur laufenden Wahlperiode passt
       (Details: Abschnitt *M4 im Detail — Landtag*).
     - `landrat` / `buergermeister` (M5, umgesetzt): PLZ → Kreis bzw. Gemeinde (und deren
       Gemeindeverband), Shards `public/data/kommunen/plz-kommunen/…` + Regionaleinheiten
       `public/data/kommunen/gemeinden-<land>.json` (Details: Abschnitt
       *M5 im Detail — Gemeinde-Ebene*).
     - `netzbetreiber` (M6, umgesetzt): PLZ → zuständiger Verteilnetzbetreiber (Strom), Shards
       `public/data/netzbetreiber/plz-netzbetreiber/…` + Roster
       `public/data/netzbetreiber/netzbetreiber.json`. Die Zuordnung stammt aus dem
       Marktstammdatenregister und ist **keine amtliche Netzgebietsgrenze**; mehrere
       Betreiber je PLZ sind möglich. Das Formular ist immer sichtbar und beim Treffer
       vorbefüllt (`prefillForm`). Empfängerzeile: `organisation` (Unternehmen), kein
       Name/Amt (Details: Abschnitt *M6 im Detail — Netzbetreiber*).
   - **Typ ohne Suche** (alle übrigen/unbekannten Typen, z. B. `stadtwerke`):
     **manuelles Formular** mit für alle Typen gleichen
     Feldern: Anrede, Name, Behörde/Organisation, Straße, PLZ, Ort, E-Mail. Leere Anrede →
     automatische Anrede aus dem Namen. Die erfassten Daten werden **pro Typ** gespeichert:
     `demokratiepost.empfaenger.<typ>.v1` (versioniert wie der Absender, `src/lib/storage.ts`).
   - **Fallback für Typen mit `emptyFallback`** (`landtag`): Liefert die Suche keine Treffer
     (z. B. Bundesland ohne Landtagsdaten oder PLZ ohne besetztes Direktmandat), bietet
     Schritt 4 zusätzlich das manuelle Formular an – mit derselben Speicherung pro Typ.
   - **Vorbefüllte Vorlage für Typen mit `prefillForm`** (`landrat`, `buergermeister`,
     `netzbetreiber`): Das manuelle Formular ist **immer** sichtbar und wird beim Auswählen
     eines Treffers mit Behörde/Organisation, Anschrift, E-Mail und – soweit bekannt – Name
     vorbefüllt; der Nutzer korrigiert, die Daten werden pro Typ gespeichert. Grund: Die
     Amtsinhaber:innen-Daten sind forschungsdatenbasiert und lückenhaft, die
     Netzbetreiber-Zuordnung ist aus dem MaStR abgeleitet. Damit werden auch durchsuchbare
     Typen gespeichert – das Formular ist dort die gemerkte Auswahl.
   - **Gemerkte Auswahl** (alle Typen): Der zuletzt ausgewählte Empfänger bleibt beim Wechsel
     des Empfängertyps erhalten und wird sofort wieder angezeigt. Bei allen durchsuchbaren
     Typen liegt der Suchtreffer zusätzlich unter `demokratiepost.auswahl.<typ>.v1`; bei
     `mdb`/`landtag` erscheint er als „Aktuell ausgewählt“ über der Trefferliste, bei
     `prefillForm` bleibt das vorbefüllte Formular sichtbar und der Suchtreffer liefert die
     Metadaten (z. B. Wahljahr, Netzgebiet). Eine neue PLZ-Suche ist jederzeit möglich,
     ersetzt die Auswahl aber erst, wenn ein neuer Treffer gewählt wird. Auch der
     `landtag`-Fallback (manuelle Daten) erscheint wieder.
   - **Typ mit Anleitung** (`ep-petition`, M7): Der Empfänger ist nur über ein Webformular
     erreichbar. Statt Suche und Adressformular zeigt Schritt 4 die Anleitung aus
     `campaigns/<id>/instructions/<typ>.md` (Markdown mit YAML-Frontmatter) samt Link.
     Die Schritte sind strukturiert (`steps`); Felder erscheinen mit eigenem Kopier-Button
     direkt unter dem Schritt, in dem sie gebraucht werden. Kein Druck/PDF, kein `mailto`;
     es werden keine Empfängerdaten gespeichert.
   - `empfaenger.*` wird aus dem gewählten Suchtreffer oder den manuellen Daten gespeist;
     Organisation → `empfaenger.organisation`; Partei/Wahlkreis/Bundesland nur bei
     Suchtreffern gesetzt; `empfaenger.amt` (z. B. „Bürgermeisterin“) nur bei kommunalen
     Treffern (M5). Bei `netzbetreiber` ist `organisation` der Firmenname; `name` und `amt`
     bleiben leer, die Anrede ist „Sehr geehrte Damen und Herren“.
5. **Vorschau** – `renderTemplate()` füllt die Platzhalter dynamisch. Zuerst erscheint die
   Briefvorschau, darunter die Aktionen (Druck/PDF, Kontaktformular/mailto, „Nachricht
   kopieren“) und bei Kontaktformular-Empfängern die Kopierfelder. Bei Anleitungstypen (M7)
   entfällt der Brief: Schritt 4 enthält die Anleitung mit den Feldern direkt im
   jeweiligen Schritt.

**Fehlerfall:** Ist ein Typ in `recipients` gelistet, aber es existiert kein
`templates/<typ>.md` (bzw. bei Anleitungstypen keine `instructions/<typ>.md`), zeigt die
App einen Hinweis statt einer Vorschau.

## Datenpipeline (kritischer Teil)

Zwei getrennte Baustellen für den Bundestag (Punkt 1–2), dazu der Landtag (Punkt 3, M4),
die Gemeinde-/Kreisebene (Punkt 4, M5) und die Netzbetreiber (Punkt 5, M6):

**1. Empfänger (MdB) — abgeordnetenwatch.de + bundestag.de**
- **Wer ist aktuell Mitglied**: abgeordnetenwatch.de-API v2 (CC0, ohne Schlüssel). Sie liefert
  die laufenden Mandate des Bundestages (aktuell 630) mit Mandatsart, Wahlkreis, Landesliste
  und Partei. Nötig, weil bundestag.de Profile ausgeschiedener Abgeordneter online lässt
  (aktuell 639 Profile für 630 Mandate).
- **Anschriften**: Scraping der Profile auf bundestag.de (`/abgeordnete/biografien/…`).
  Die Mandatsart kommt dort aus dem `constituencyInfo`-Block (`Wahlkreismandat` /
  `Gewählt über Landesliste`); das JSON-LD enthält den Wahlkreis nicht zuverlässig.
- Liefert: Name, Fraktion, Geschlecht, Wahlkreis/Bundesland, Homepage,
  **E-Mail-Adresse**, **Wahlkreisbüro-Anschrift** und **Kontaktformular-Link**. Nur
  Direktmandate sind über die PLZ auffindbar.
- **E-Mail-Adressen**: Die Profile und die Open-Data-Stammdaten enthalten keine Kontakte.
  Der Bundestag veröffentlicht die Adressen aber im offiziellen PDF-Sonderdruck
  „Kürschners Volkshandbuch“ (unter jeder Biografie). `fetch-mdb-emails.mjs` liest das PDF,
  ordnet die Adressen über Nachname + Partei den laufenden Mandaten zu und ergänzt Nachrücker
  über deren persönliche Homepage (nur Adressen mit passendem Nachnamen im lokalen Teil).
  Geprüfte Sonderfälle stehen in `scripts/source/mdb-emails-ergaenzungen.json`. Das
  Kontaktformular bleibt als zweite Option; für Briefe gilt die Wahlkreisbüro-Anschrift.
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

**4. Gemeinde- und Kreisebene (M5, umgesetzt)**
- **Wer ist die Verwaltungsspitze**: Es gibt keine amtliche, bundesweit maschinenlesbare Quelle.
  Basis sind die Amtsinhaber:innen aus den Direktwahlen (GERDA); fehlende oder veraltete
  Einträge bleiben beim Behördenbrief ohne Namen. AGS-Stände driften zwischen Destatis, VG250
  und GERDA – der Build gleicht daher zusätzlich über den normalisierten Ortsnamen ab
  (Details und Zahlen: Abschnitt *M5 im Detail — Gemeinde-Ebene*).
- **Anschriften und dienstliche E-Mail**: Das Statistikportal veröffentlicht das
  *Anschriftenverzeichnis* „Anschriften der Gemeinde- und Stadtverwaltungen in Deutschland“
  (Excel, jährlich, Stichtag 31.01.) mit Name, ARS, AGS, Zustell-PLZ, Straße/Hausnummer und
  E-Mail je Land, Regierungsbezirk, Region, **Kreis**, **Gemeindeverband** und **Gemeinde**.
  Damit sind Rathaus- und Landratsamtanschrift inklusive Kontakt in allen Ländern abgedeckt.
- **PLZ → Gemeinde/Kreis**: Es gibt keine amtliche offene 1:1-Tabelle; das BKG-PLZ-Produkt
  liegt nicht im offenen BKG-Spiegel. Die Zuordnung entsteht daher wie beim Bund über einen
  geometrischen Verschnitt der PLZ-Polygone (`yetzt/postleitzahlen`, ODbL) mit den
  Gemeindegrenzen der VG250 (BKG Open Data), Überlappung ≥ 1 %, alle Treffer (vergleiche
  Punkt 2). Ergänzt wird sie über die Zustell-PLZ der Gemeindeverwaltung und eine kleine,
  geprüfte Liste für PLZ, die in keiner der beiden Quellen vorkommen
  (`scripts/source/kommunen-plz-ergaenzungen.csv`).

```bash
npm run data:kom:verwaltung  # 1. Anschriftenverzeichnis -> scripts/source/gemeinde-verwaltungen.csv
npm run data:kom:plz         # 2. Geometrie-Join       -> scripts/source/plz-gemeinde.csv
npm run data:kom:koepfe      # 3. Amtsinhaber:innen   -> scripts/source/gemeinde-koepfe.csv
npm run data:kom:build       # 4. Join + Validierung  -> public/data/kommunen/
```

Die Schritte werden **einzeln und in dieser Reihenfolge** ausgeführt (großer Download,
Geometrie-Laufzeit, Datenstände). Nach `data:kom:plz`/`data:kom:build` den Dev-Server neu
starten (Vite-Cache).

**5. Netzbetreiber (Strom) — M6, umgesetzt**
- **Wer ist zuständig**: Das Marktstammdatenregister (MaStR) der Bundesnetzagentur ist die
  amtliche Quelle für Stromnetzbetreiber. Eine amtliche **PLZ → Netzbetreiber**-Tabelle gibt
  es nicht; die Zuordnung wird aus den in Betrieb befindlichen PV-Anlagen abgeleitet
  (Details: Abschnitt *M6 im Detail — Netzbetreiber*).
- **Kein Grundversorger**: Die BNetzA führt keine bundesweite Grundversorger-Liste. Der
  Grundversorger wird nach § 36 EnWG vom jeweiligen Netzbetreiber festgestellt und
  veröffentlicht; eine belastbare bundesweite offene Quelle gibt es nicht. M6 liefert
  deshalb den **Verteilnetzbetreiber**, nicht den Grundversorger.
- **Datenbasis**: MaStR-Gesamtdatenexport (gepinnter Quartalsstand), Dateien
  `Marktakteure.xml`, `Netze.xml`, `Netzanschlusspunkte.xml`, `EinheitenSolar.xml` sowie
  `Marktrollen.xml`/`Marktfunktionen.xml`; Join über `LokationMaStRNummer`.
  Aggregation pro `(PLZ, AGS)` und `AGS`; Top-1 plus weitere
  Betreiber ab 10 % Anteil. PLZ ohne eigene Anlagen fallen auf die Gemeindeebene zurück
  (M5-Shards `plz-kommunen`).
- **Ausgabe**: `scripts/source/mastr-netzbetreiber-{operators,plz,ags}.csv` (committet) →
  `public/data/netzbetreiber/netzbetreiber.json`, `meta.json` und
  `plz-netzbetreiber/<prefix>.json`.

```bash
npm run data:netz:mastr   # 1. MaStR-Export → scripts/source/mastr-netzbetreiber-*.csv (3 GB, selten)
npm run data:netz:build   # 2. Join + Validierung → public/data/netzbetreiber/
```

Die Schritte werden **einzeln und in dieser Reihenfolge** ausgeführt. Nach
`data:netz:build` den Dev-Server neu starten (Vite-Cache). Der 3-GB-Download ist
nur für `data:netz:mastr` nötig; die daraus erzeugten CSVs sind committet.

## Kampagnen-Format (Dateien im Repo)

```
campaigns/
  stromnetz-2026/
    campaign.yaml        # id, titel, betreff, betreff je empfängertyp, thema, beschreibung, empfängertypen, aktiv, laufzeit
    templates/
      mdb.md             # Musterschreiben für Bundestagsabgeordnete (Typ "mdb")
      landtag.md         # weiteres Schreiben pro Empfängertyp (Typ "landtag", M4)
      landrat.md         # Gemeinde-Ebene: Kreisverwaltung (Typ "landrat", M5)
      buergermeister.md  # Gemeinde-Ebene: Rathaus/Gemeindeverwaltung (Typ "buergermeister", M5)
      netzbetreiber.md   # Verteilnetzbetreiber Strom (Typ "netzbetreiber", M6)
      ep-petition.md     # Petitionstext für das EP-Petitionsportal (Typ "ep-petition", M7)
    instructions/
      ep-petition.md     # Anleitung + Formularfelder (Webformular-Typ, M7)
```

**Pro Empfängertyp aus `recipients` gibt es genau ein Template** `templates/<typ>.md`;
die Typ-Auswahl im Workflow (Schritt 3) bestimmt, welches Template gerendert wird.
Der Betreff (`subject`, Platzhalter `{{ betreff }}`) ist kampagnenweit; mit `subjects`
lässt er sich pro Empfängertyp überschreiben. Fehlt der Typ in der Map, gilt `subject`:

```yaml
subject: "Allgemeiner Betreff"
subjects:
  mdb: "Betreff für Bundestagsabgeordnete"
  landtag: "Betreff für Landtagsabgeordnete"
```

Der Schlüssel entspricht `templates/<typ>.md` (Alias `ob` → `buergermeister`).

`active: false` deaktiviert eine Kampagne: `loadCampaigns()` überspringt sie, die Dateien
bleiben aber im Repo und können jederzeit wieder aktiviert werden. Ohne Angabe ist eine
Kampagne aktiv. Sind alle Kampagnen deaktiviert, zeigt Schritt 1 einen Hinweis statt der
Auswahl; die kampagnenabhängigen Schritte werden ausgeblendet.

Für **Anleitungstypen** (M7, z. B. `ep-petition`) kommt statt des Briefes eine Anleitung
hinzu: `instructions/<typ>.md` mit YAML-Frontmatter (`title`, `url`, `linkLabel`,
`fields`) und Markdown-Text (Schritte und Hinweise). Die Feldwerte dürfen Platzhalter
enthalten (`{{ absender.* }}`, `{{ nachricht }}` = gerenderter Template-Text, `{{ betreff }}`);
der Markdown-Text selbst bleibt statisch. Das Template `<typ>.md` liefert den Text für
das Webformular und enthält keinen Briefkopf und keine `kontaktformular`-Marker.

Platzhalter: `{{ absender.* }}`,
`{{ empfaenger.anrede|name|partei|wahlkreis|bundesland|rolle }}`, `{{ datum }}`,
`{{ betreff }}` + optionaler **persönlicher Absatz** des Nutzers (erhöht die Wirkung
gegenüber 1:1-Kopien deutlich). Die vollständige Menge der `empfaenger.*`-Felder (inkl.
`organisation`, `strasse`, `plz`, `ort`, `email`) ergibt sich aus `recipientContext()` in
`src/App.tsx`. `{{ empfaenger.rolle }}` ist die geschlechtsbezogene Rollenbezeichnung
(„Landrätin“/„Landrat“/„Landrät:in“, „Bürgermeisterin“/…, „Landtagsabgeordnete:r“ usw.)
aus `amt`/`sex`; bei manuell erfassten Empfängern aus der Amtsbezeichnung, sonst
typbezogener neutraler Fallback (`src/lib/recipientRoles.ts`). Für die Selbstbezeichnung
des Absenders gibt es `{{ absender.buerger }}`: je nach optionaler Geschlechtsangabe
„Bürgerin“, „Bürger“ oder „Bürger:in“, ohne Angabe „Bürgerin/Bürger“. Abgeleitet wird
das Feld in `senderContext()` (`src/lib/sender.ts`).

## Absenderdaten (Eingabe + localStorage)

Der Nutzer gibt seine Absenderdaten **einmal** ein. Sie werden lokal im Browser gespeichert
und beim nächsten Besuch automatisch vorausgefüllt – kein erneutes Tippen.

**Felder**

- Pflicht: Name, Straße/Hausnummer, PLZ, Ort
- Optional: E-Mail, Telefon
- Optional: Geschlecht (weiblich/männlich/divers) für die Selbstbezeichnung im Brieftext;
  ohne Angabe bleibt „Bürgerin/Bürger“ stehen

**Speicherung**

- Key: `demokratiepost.sender.v1` (versioniert, damit spätere Schemaänderungen sauber
  migrierbar sind)
- Format: JSON
- Das optionale Feld `geschlecht` ist abwärtskompatibel: ältere `sender.v1`-Daten ohne
  das Feld laden weiterhin und fallen auf „Bürgerin/Bürger“ zurück.
- Laden beim Start, Speichern bei jeder Eingabe; „Absenderdaten löschen“ ist ein rotes
  Papierkorb-Symbol in der Kopfzeile der Absenderkarte (nur Icon mit Tooltip, bewusst
  unauffällig, damit es nicht versehentlich geklickt wird)
- Startwerte: gespeicherte Daten, sonst leer. **Nur im Entwicklungsserver** (`npm run dev`)
  ist das Formular mit erfundenen Demo-Daten vorbelegt (`prefilledSender` über
  `initialSender()`, `import.meta.env.DEV`) – der Produktions-Build startet immer leer und
  enthält die Demo-Daten auch nicht im Bundle.
- Umsetzung: `src/lib/storage.ts` (lesen/schreiben/validieren) + `SenderForm`-Komponente
- Der `TemplateContext` (`absender.*`) wird direkt aus diesen Werten gespeist.
- Die Absender-PLZ **vorbelegt das Suchfeld** im Empfänger-Schritt (bei Typen mit Suche;
  nur initial, überschreibbar). Manuell erfasste Empfänger-Daten liegen analog **pro Typ**
  unter `demokratiepost.empfaenger.<typ>.v1`, der zuletzt ausgewählte Suchtreffer bei allen
  durchsuchbaren Typen unter `demokratiepost.auswahl.<typ>.v1`.

**Autofill durch Browser und Passwort-Manager**

- Alle Eingabefelder – Absender, PLZ-Suche, manuelles Empfängerformular und Kopierfelder –
  sind über `noAutofill` (`src/lib/autofill.ts`) markiert: `autocomplete="off"` plus
  `data-bwignore` (Bitwarden), `data-1p-ignore` (1Password), `data-lpignore` (LastPass),
  `data-protonpass-ignore` (Proton Pass) und `data-form-type="other"` (Dashlane). Dadurch
  bieten Passwort-Manager auf keinem Feld ihr Inline-Menü an.
- Bewusster Verzicht: Auch die Absenderfelder sind gesperrt, damit keine Identitäts- oder
  Adress-Plugins fremde Daten einsetzen. Die Werte kommen ausschließlich aus der Eingabe
  bzw. dem lokalen Speicher (`demokratiepost.sender.v1`).
- `autocomplete="off"` wird von manchen Browsern bei Adressfeldern ignoriert; die
  Passwort-Manager-Marker greifen davon unabhängig. Das ist bekannt und bewusst in Kauf
  genommen – die App verlässt sich nicht auf Browser-Autofill.

**Datenschutz**

- Die Daten verlassen das Gerät nie: kein Backend, keine Übertragung, kein Tracking.
- Die UI weist darauf hin, dass die Eingaben nur lokal im Browser gespeichert werden.

## Geplante Repo-Struktur

```
demokratiepost/
├── .github/workflows/deploy.yml      # Build + Deploy nach GitHub Pages
├── campaigns/                        # Content (versioniert, von Hand pflegbar)
│   └── redispatch-2026-01/
│       ├── campaign.yaml
│       ├── templates/ (mdb.md, landtag.md, landrat.md, buergermeister.md,
│       │              netzbetreiber.md, ep-petition.md)
│       └── instructions/ (ep-petition.md – Anleitung + Formularfelder, M7)
├── scripts/                          # Datenpipeline (Build-Zeit, nicht im Client)
│   ├── fetch-bundestag.mjs           # bundestag.de-Profile → data/mdb-profiles.json
│   ├── fetch-mdb-emails.mjs          # Kürschner-PDF + Homepage-Fallback → source/mdb-emails.json
│   ├── build-mdb.mjs                 # Profile + Mandate + E-Mails → data/mdb.json
│   ├── build-plz-index.ts            # PLZ→Wahlkreis → data/plz/<prefix>.json
│   ├── fetch-landtag.mjs             # Landtags-Roster (abgeordnetenwatch) → mandates-landtag.json
│   ├── fetch-plz-landtag.mjs         # PLZ→Landtagswahlkreis → source/plz-landtag/
│   ├── build-landtag.mjs             # Konsistenzcheck + Shards → data/landtag/ + plz-landtag/
│   ├── fetch-landtag-nrw.mjs         # NRW-Anreicherung (E-Mail + Wahlkreisbüro)
│   ├── lib/kommunen.mjs              # gemeinsame M5-Helfer (CSV, Namen, Rollen)
│   ├── fetch-kommunen-verwaltung.mjs # Anschriftenverzeichnis (Destatis) → source/gemeinde-verwaltungen.csv
│   ├── fetch-plz-gemeinde.mjs        # PLZ→Gemeinde (VG250 × PLZ-Polygone) → source/plz-gemeinde.csv
│   ├── fetch-gemeinde-koepfe.mjs     # Amtsinhaber:innen (GERDA) → source/gemeinde-koepfe.csv
│   ├── source/kommunen-plz-ergaenzungen.csv # manuell geprüfte PLZ-Lücken (7)
│   ├── source/mastr-netzbetreiber-*.csv # Betreiber + PLZ/AGS-Anteile (M6, committet)
│   ├── build-kommunen.mjs            # Join + Validierung → data/kommunen/ (M5)
│   ├── fetch-mastr-netzbetreiber.mjs # MaStR-Export → source/mastr-netzbetreiber-*.csv (M6)
│   └── build-netzbetreiber.mjs       # Join + Validierung → data/netzbetreiber/ (M6)
├── public/data/                      # Laufzeit-Daten, lazy geladen
│   ├── mdb.json
│   ├── plz/10.json, 11.json, …
│   ├── landtag/<staat>.json          # Roster je Bundesland (nur stimmige Länder)
│   ├── plz-landtag/10.json, 11.json, …
│   ├── kommunen/
│   │   ├── gemeinden-<land>.json     # Kreis-, Verbands- und Gemeindeverwaltungen je Land (M5)
│   │   ├── kreise.json               # Kreisverwaltungen + Landrät:in (M5)
│   │   └── plz-kommunen/10.json, …   # PLZ → Gemeinden/Kreise (M5)
│   └── netzbetreiber/
│       ├── netzbetreiber.json        # Betreiberstammdaten (Name, Anschrift, E-Mail)
│       ├── meta.json                 # Stand, Quelle, Methodik
│       └── plz-netzbetreiber/10.json, … # PLZ → Betreiber + Anteil + Gemeinde
├── src/
│   ├── App.tsx      (Fünf-Schritte-Ablauf, siehe *User-Workflow*)
│   ├── components/  (PlzInput, SenderForm, RecipientTypeSelect, RecipientList,
│   │                 ManualRecipientForm, LetterPreview, CopyFields,
│   │                 ContactFormFields, InstructionCard)
│   ├── lib/         (campaigns, template, storage, lookup, recipientTypes,
│   │                 recipientRoles, sender, export, markdown)
│   └── types.ts     (ManualRecipient, Mandatstraeger (MdB/Landtag), Kommune (M5),
│                     Netzbetreiber (M6), Instruction (M7);
│                     Recipient/RecipientCandidate-Union)
├── vite.config.ts                    # base: '/' (eigene Domain demokratiepost.de)
└── README.md
```

## GitHub-Pages-Besonderheiten

- Eigene Domain `https://demokratiepost.de` → `vite.config.ts` mit `base: '/'`.
  (Ohne eigene Domain wäre der Repo-Pfad `/demokratiepost/` nötig.)
- `public/CNAME` enthält `demokratiepost.de` und landet so im Deploy-Artefakt;
  ohne die Datei verliert der Actions-Deploy die Domain wieder.
- Daten- und Asset-URLs relativ über `import.meta.env.BASE_URL` bauen.
- Deploy: GitHub Actions (Build → `actions/upload-pages-artifact` → `actions/deploy-pages`).
- **Doku-Seiten mit eigenen URLs**: `docs/idee.md`, `docs/impressum.md` und
  `docs/datenschutz.md` werden clientseitig gerendert und sind unter `/idee`,
  `/impressum` und `/datenschutz` erreichbar (zusätzlich `/datenspeicherung`).
  Die Navigation nutzt die History-API und ausschließlich Pfade; Hash-Links
  (`#idee` usw.) werden nicht mehr unterstützt. Der Build erzeugt für jede Route
  eine eigene `index.html` sowie eine `404.html`-Kopie als Fallback
  (`routePages()` in `vite.config.ts`).

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
5. **M5 — Gemeinde-Ebene** _(umgesetzt, Details im Abschnitt *M5 im Detail — Gemeinde-Ebene*)_:
   Bürgermeister:in und Landrät:in bundesweit, inkl. vorbefülltem Formular.
6. **M6 — Netzbetreiber (Strom)** _(umgesetzt, Details im Abschnitt
   *M6 im Detail — Netzbetreiber*)_: PLZ → zuständiger Verteilnetzbetreiber aus dem
   Marktstammdatenregister, inkl. vorbefülltem, editierbarem Formular.
   **Kein Grundversorger** (keine bundesweite BNetzA-Liste); `stadtwerke` bleibt manuell.
7. **M7 — Anleitungs-Empfänger** _(umgesetzt, Details im Abschnitt
   *M7 im Detail — Anleitungs-Empfänger*)_: Empfänger mit reinem Webformular (erster Fall:
   Europäisches Parlament – Petition) erhalten eine Anleitung plus Kopierfelder statt
   Adresse/Brief; kein Druck/PDF.

M1–M7 sind umgesetzt. Offen ist G7 (Ersatzquellen für Stadtstaaten und Landrät:innen in
BW/SH) sowie weitere Landtags-Kontakt-Scraper nach dem NRW-Muster.

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

## M5 im Detail — Gemeinde-Ebene (Bürgermeister:in / Landrät:in) (umgesetzt)

**Ziel:** Die kommunale Verwaltungsspitze als dritte durchsuchbare Empfängergruppe – PLZ rein,
zuständige Verwaltung raus, Brief versandfertig. Zwei Typen:

| Typ-ID | Label | Suche | Empfänger |
|---|---|---|---|
| `buergermeister` | Bürgermeister(in) | PLZ → Gemeinde | Leitung der Gemeindeverwaltung (Bürgermeister:in, ggf. Oberbürgermeister:in, ggf. Verbandsgemeinde) |
| `landrat` | Landrätin / Landrat | PLZ → Kreis | Leitung der Kreisverwaltung |

`ob` (Oberbürgermeister(in)) bleibt als **Alias** auf `buergermeister` bestehen; die
Amtsbezeichnung kommt aus den Daten, nicht aus dem Typ.

### Umsetzungsstand (Oktober 2026)

Umgesetzt. Ist-Stand der Daten:

- **Anschriftenverzeichnis:** 401 Kreise, 1.202 Gemeindeverbände, 12.088 Gemeinden;
  E-Mail in 12.526 von 13.691 Zeilen (~91 %).
- **PLZ → Gemeinde/Kreis:** 21.219 Zuordnungen für 8.585 PLZ – 14.581 aus dem
  Geometrie-Verschnitt (davon 4 unter 1 % als bester Treffer), 5.014 Zustell-PLZ,
  1.193 Verbands-, 401 Kreis- und 23 Sitz-Ergänzungen sowie 7 manuell geprüfte PLZ.
  Der Bundestags-PLZ-Index (8.218 PLZ) ist vollständig abgedeckt.
- **GERDA:** 8.462 Bürgermeister:innen- und 255 Landrät:innen-Einträge. 2.606 Einträge
  bleiben ohne Zuordnung (historische AGS-/Gemeindestände, aufgelöste Verbände); dort
  bleibt der Name leer, der Behördenbrief ist der Standardfall.
- **Namen:** nur bei plausibler Amtszeit (Wahl ≤ 9 Jahre zurück) angezeigt; Geschlecht
  nur bei GERDA-Quelle `raw` (kein `predicted`). Sonderformen: Region Hannover
  („Regionspräsident:in“), Regionalverband Saarbrücken („Regionalverbandspräsident:in“).
- **Laufzeitdaten:** 8,8 MB unter `public/data/kommunen/` (größte Land-Datei Bayern
  ~1,5 MB, 95 PLZ-Shards ~1,9 MB, `kreise.json` 210 KB).
- **Postfach-PLZ:** 56 PLZ (überwiegend Postfach-PLZ von Kreisverwaltungen) haben nur eine
  Kreiszuordnung; die Bürgermeister-Suche bietet dort den manuellen Fallback, die
  Landrat-Suche liefert den Kreis.
- **Abnahme:** `npm run build` sauber; im Preview geprüft: Köln (OB), Prenzlau
  (Landgemeinde), Kiel (kreisfrei), Hannover (Region), Saarbrücken (Regionalverband),
  Hamburg/Bremen (Stadtstaat, manuell), Adenau (Verbandsgemeinde RP), 19053 (MV,
  Bürgermeister-Suche), Mehrfachtreffer je PLZ.

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
nicht aus Schätzungen. Sie sind beim Bauen bestätigt; die bereinigten Ist-Zahlen stehen im
Abschnitt *Umsetzungsstand* (GERDA 8.462/255 nach Entfernen zukünftiger Termine und Dubletten).

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
   nach `scripts/source/gemeinde-verwaltungen.csv` (`satzart, art, ars, ags, name,
   verwaltungssitz, strasse, plz, ort, email, flaeche, einwohner`). `art` ist die lesbare
   Bezeichnung („Kreisfreie Stadt“, „Verbandsgemeinde“ …); AGS werden bei Kreisen aus dem
   5-stelligen ARS und bei Verbänden aus den ersten 8 ARS-Stellen abgeleitet. Stand im
   Kopfkommentar gepinnt.
2. `scripts/fetch-plz-gemeinde.mjs`: lädt VG250 (GEM + KRS, UTM32-Shapefile) und die
   PLZ-Topologie (yetzt/postleitzahlen 2026.02), verschneidet sie (devDependencies:
   `shapefile`, `proj4`, `polygon-clipping`, `topojson-client`, `fflate`; **nichts davon im
   Client**) und schreibt `scripts/source/plz-gemeinde.csv` (`plz, ags, kreis_ars,
   verband_ars, overlap, quelle`). Überlappung ≥ 1 %, 10-km-Raster als räumlicher Index;
   Lücken aus den Zustell-PLZ und der geprüften Liste `kommunen-plz-ergaenzungen.csv`.
3. `scripts/fetch-gemeinde-koepfe.mjs`: lädt die GERDA-Dateien (gepinnter Commit, LFS),
   filtert `is_winner`, entfernt zukünftige Termine und Dubletten, nimmt je AGS die jüngste
   Wahl und schreibt `scripts/source/gemeinde-koepfe.csv` (`typ, ebene, ags, ags_name,
   state_name, amt, name, partei, geschlecht, geschlecht_quelle, wahljahr, verifiziert,
   quelle, hinweis`). Geschlecht nur bei `raw`; Veraltet-Regel ≤ 9 Jahre.
4. `scripts/build-kommunen.mjs`: Join über AGS und – bei AGS-Drift – über den normalisierten
   `ags_name` (SN, ST, RP, NI u. a.), Validierung (Warnungen statt Abbruch):
   Satzart-Zahlen (401 / 1.202 / 12.088), jede PLZ aus `public/data/plz/` ≥ 1 Gemeinde,
   Zustell-PLZ ⊆ Geometrie-PLZ, Stichproben (Kiel, Flensburg kreisfrei, Adenau RP),
   Abdeckungsreport Namen je Land und Liste nicht zugeordneter GERDA-Köpfe. Ausgabe:
   - `public/data/kommunen/plz-kommunen/<prefix>.json` → `{ "<plz>": [{ ags, kreisArs,
     verbandArs, overlap }] }`
   - `public/data/kommunen/gemeinden-<land>.json` → alle Regionaleinheiten des Landes
     (Kreis, Gemeindeverband, Gemeinde) mit Behördenzeile, ARS/AGS, Anschrift, E-Mail,
     Einwohner und Amtsinhaber:in (`amt`, `name`, `partei`, `wahljahr`, `hinweis`,
     `landratCapable`)
   - `public/data/kommunen/kreise.json` → Kreisverwaltungen + Landrät:in
5. npm-Aliase: `data:kom:verwaltung`, `data:kom:plz`, `data:kom:koepfe`, `data:kom:build` –
   einzeln ausgeführt, kein Sammelbefehl. Nach `data:kom:plz`/`data:kom:build` Dev-Server
   neu starten.

### Client

- `src/types.ts`: neue Art `Kommune` in der `Recipient`-Union – `behoerde` („Stadt Köln“,
  „Landratsamt Musterkreis“, „Verbandsgemeinde X“), `amt` („Bürgermeisterin“, „Landrät:in“),
  `name?`, `partei?`, `sex?`, `anrede?`, `address`, `email`, `ebene`
  (`gemeinde`/`verband`/`kreis`), `wahljahr?`, `quelle?`, `hinweis?`, `einwohner?`,
  `ars`, `ags?`, `kreisArs?`, `verbandArs?`, `land?`, `landratCapable?`. Gemeinsamer Suchtyp
  `RecipientCandidate = Mandatstraeger | Kommune`, Guards `isKommune`/`isMandat`.
- `ManualRecipient` erhält ein optionales `amt` (Amtsbezeichnung), damit die vorbefüllte
  Empfängerzeile auch nach dem Bearbeiten vollständig bleibt. `isRecipientComplete` akzeptiert
  einen Behördenbrief ohne Namen, wenn `organisation` gesetzt ist.
- `src/lib/lookup.ts`: `findBuergermeisterByPlz(plz)` (PLZ-Shard → Gemeinde + Gemeindeverband
  → Land-Datei) und `findLandratByPlz(plz)` (PLZ-Shard → Kreis-ARS → `kreise.json`). Beide
  cachen je Land bzw. global; `kommuneSalutation()` bildet die Anrede.
- `src/lib/recipientTypes.ts`: `buergermeister` und `landrat` mit Lookup; neues Feld
  `prefillForm: true` – das manuelle Formular bleibt **immer** sichtbar und wird beim Auswählen
  eines Treffers vorbefüllt (Behörde, Anschrift, E-Mail, Name/Amt soweit vorhanden). Speicherung
  wie gehabt `demokratiepost.empfaenger.<typ>.v1`. `ob` → Alias auf `buergermeister`.
- `src/App.tsx` Schritt 4: Trefferliste wie bei mdb/landtag, zusätzlich das vorbefüllte
  Formular (auch bei Treffern). Hinweise: „Amtsträger: Stand <Wahljahr> – bitte prüfen“,
  „nicht verifiziert“, „Geschlecht nur geschätzt“; bei leerer Suche bleibt das Formular
  sichtbar. `landtag` nutzt weiterhin `emptyFallback`, aber mit eigenem Fallback-Hinweis.
- Sonderfälle: kreisfreie Stadt + Typ `landrat` → Stadtverwaltung mit Hinweis (keine
  Landrätin/kein Landrat; ggf. Typ wechseln); Stadtstaaten (BE/HH/HB) → Stadtverwaltung ohne
  Namen/Amtsbezeichnung mit Hinweis; mehrere Gemeinden je PLZ → alle Treffer, Auswahl manuell.
- Anrede: `Sehr geehrte Damen und Herren` als Standard; rollenbezogen („Sehr geehrte Frau
  Bürgermeisterin …“) nur bei verlässlicher Geschlechtsquelle. Empfängerzeile im Brief:
  ```
  {{ empfaenger.organisation }}
  {{ empfaenger.amt }} {{ empfaenger.name }}
  {{ empfaenger.strasse }}
  {{ empfaenger.plz }} {{ empfaenger.ort }}
  ```
- `RecipientList`: Behörde, Ebene, Amtsinhaber:in, Anschrift, E-Mail und Stand statt
  Wahlkreis/Partei.
- Keine neuen Laufzeit-Netzwerkzugriffe außerhalb `public/data/`.

### Kampagne

- `campaigns/redispatch-2026-01/campaign.yaml`: `recipients: [mdb, landtag, landrat, buergermeister]`
  (umgesetzt).
- Templates `landrat.md` und `buergermeister.md` mit demselben Kern auf kommunaler Ebene
  (Wärmeplanung, Bauleitplanung, Netzentgelte vor Ort, Konzessions-/Beteiligungsfragen),
  Anrede `{{ empfaenger.anrede }}`, Ortsbezug `{{ absender.ort }}`,
  `<!-- kontaktformular:start/ende -->`-Marker. Betreff bleibt kampagnenweit.
  **Textentwürfe vor Veröffentlichung mit Kail abstimmen.**

### Doku, Lizenz, Abnahme (umgesetzt)

- `scripts/README.md`: Abschnitt „Gemeinde- und Kreisebene (M5)“ (Quellen, Geometrie-Join,
  Datenstände, Befehle, Lizenz).
- AGENTS.md: Befehle ergänzt; Gotchas (keine amtlichen Namen, `predicted`-Geschlecht,
  AGS-Drift/Name-Join, Satzart-Zählung, Geometrie-Tooling nur Build-Zeit, manuelle
  PLZ-Ergänzungen, Sonderfälle, Dev-Server-Neustart).
- Impressum: **Destatis**-Anschriftenverzeichnis, „© GeoBasis-DE / BKG“ (VG250; bleibt),
  yetzt/ODbL (bleibt), **GERDA CC BY 4.0** inkl. Zitationshinweis (Hessen-Wahldaten:
  Hessami 2018).
- Nach `data:kom:plz`/`data:kom:build` Dev-Server neu starten.
- Abnahme im Preview: je eine PLZ pro Fall – Großstadt (50667 Köln → OB), Landgemeinde
  (17291 Prenzlau), kreisfreie Stadt + Typ `landrat` (Hinweis), Verbandsgemeinde (Adenau, RP),
  Stadtstaat (Hamburg/Bremen, Hinweis + manuell), PLZ mit mehreren Gemeinden (Auswahl);
  `npm run build` sauber; Datenmenge/Shard-Größen geprüft (8,8 MB).

### Reihenfolge und Risiken

G1–G6 sind umgesetzt: Vorprüfung → Pipeline → Client → Templates → Doku/Lizenz → Abnahme.
Offen bleibt **G7**: Ersatzquellen für Stadtstaaten (BE/HH/HB) und für die Landrät:innen in
BW/SH (Wahl durch den Kreistag).

Risiken: Namen sind nicht amtlich und teils alt (deshalb ist der Behördenbrief ohne Namen ein
gleichwertiger Standardfall); Geometrie-Join ist neues Build-Tooling (nur devDependencies);
AGS-Stände driften zwischen Destatis (31.01.2026), VG250 (2026) und GERDA-Wahljahren –
deshalb der Name-Fallback und die Validierung mit Report statt stillem Merge. Die
Zustell-PLZ-Ergänzung kann Postfach-PLZ auf die zentrale Verwaltung abbilden; das ist
gewollt, aber im Einzelfall zu prüfen.

## M6 im Detail — Netzbetreiber (Strom) (umgesetzt)

**Ziel:** Der zuständige **Verteilnetzbetreiber Strom** als weiterer durchsuchbarer
Empfängertyp – PLZ rein, Netzbetreiber raus, Brief versandfertig. Der Typ ist bewusst
**nicht** der Grundversorger und **nicht** die Stadtwerke als solches: Adressiert wird das
Unternehmen, das vor Ort das Stromverteilnetz betreibt und damit für Netzanschluss,
Redispatch-Umsetzung und Netzentgelte verantwortlich ist.

**Status:** umgesetzt. Die Ist-Zahlen werden nach dem Build im Abschnitt
*Umsetzungsstand* festgehalten; die ursprünglichen Ziel- und Prüfwerte stehen in
diesem Abschnitt weiterhin als Vergleichsmaßstab.

### Umsetzungsstand (Oktober 2026)

Umgesetzt. Ist-Stand der Daten (Build-Log):

- **Anlagen/Betreiber:** 5.469.488 In-Betrieb-PV-Anlagen ausgewertet (von 6.535.547;
  902.481 ohne aktiven Netzanschlusspunkt). 813 Betreiber mit Anlagen und im
  Laufzeit-Roster; 26 geschlossene Verteilnetze ausgeschlossen.
- **PLZ:** 8.527 von 8.585 PLZ mit Treffer (8.139 PLZ-Ebene, 388 Gemeinde-Fallback,
  58 ohne Treffer → manuelles Formular). Im Bundestags-PLZ-Index fehlen nur 3 PLZ
  (25869, 78266, 83256); dort gibt es keine auswertbaren Anlagen.
- **Anteile:** Top-1 ≥ 95 % in 7.789 PLZ, 70–95 % in 465, < 70 % in 273; 592 PLZ mit
  mehreren Betreibern. 1.252 unsichere Fälle stehen in
  `scripts/source/netzbetreiber-prueffaelle.csv`.
- **Laufzeitdaten:** 1,25 MB (`netzbetreiber.json` 187 KB, 95 Shards 1,06 MB,
  `meta.json` < 1 KB); die drei Quell-CSVs sind zusammen 1,47 MB.
- **Abnahme:** `npm run build` sauber; die Stichproben 10115, 80331, 50667, 01067,
  24103, 79098, 04109, 20095, 28195, 30159 und 66111 liefern die erwarteten Betreiber
  (Stromnetz Berlin, SWM Infrastruktur, RheinNetz, SachsenNetze, SWKiel, badenova,
  Netz Leipzig, Hamburger Energienetze, wesernetz, enercity, Stadtwerke Saarbrücken).

### Warum nicht „Grundversorger via BNetzA“?

Die ursprüngliche Idee „Grundversorger via BNetzA“ trägt nicht:

- Die **Bundesnetzagentur führt keine bundesweite Grundversorger-Liste**. Der
  Grundversorger wird nach § 36 EnWG vom jeweiligen Netzbetreiber festgestellt und
  veröffentlicht; eine zentrale, offene, bundesweite Quelle existiert nicht.
- Die amtliche Quelle für **Netzbetreiber** ist das **Marktstammdatenregister (MaStR)**.
- Eine amtliche **PLZ → Netzbetreiber**-Tabelle gibt es nicht. Die Zuordnung muss aus dem
  MaStR abgeleitet werden.

Die Methode ist etabliert: [EMA Energiewelt](https://ema-energiewelt.de/netzbetreiber)
leitet die Zuordnung ebenfalls aus Marktakteuren, Netzanschlusspunkten und EinheitenSolar
ab und kommt nach eigenen Angaben auf **741 Netzbetreiber** und **95,2 % eindeutige
Gemeindezuordnungen**. Das ist eine externe Validierung, keine Datenquelle für dieses
Projekt. Der eigene Build kommt auf **813 Betreiber mit Anlagen** (alle im Roster) und
**8.527 von 8.585 PLZ mit Treffer** (99,3 %).

### Entscheidungen (fix)

| Thema | Entscheidung |
|---|---|
| Umfang | Genau ein neuer Typ `netzbetreiber` (Strom, Verteilnetz). `stadtwerke` bleibt manuell; `grundversorger` kommt nicht in M6. |
| Datenquelle | MaStR-Gesamtdatenexport, gepinnter Quartalsstand (01.10.2026, Revision 26.1, ca. 3 GB ZIP). |
| Zuordnung | Aggregation pro `(PLZ, AGS)` und pro `AGS`; Top-1 immer, weitere Betreiber ab **10 %** Anteil. |
| PLZ ohne eigene Anlagen | Fallback auf die **Gemeindeebene** über die M5-Shards `plz-kommunen` (z. B. Innenstadt-PLZ ohne PV). |
| Datenmodell | Neue Empfänger-Art `Netzbetreiber` (Unternehmen, keine Person); `organisation` = Firmenname, `name`/`amt` leer. |
| Formular | Immer sichtbar und beim Treffer vorbefüllt (`prefillForm`), editierbar; Speicherung `demokratiepost.empfaenger.netzbetreiber.v1`. |
| Unsicherheit | Anteil und Quelle (`plz`/`gemeinde`) werden angezeigt; unter 70 % Warnung „Grenzgebiet“. |
| Übertragungsnetz | Kein eigener Empfängertyp; die Regelzone/der ÜNB kann später als Metadatum ergänzt werden. |
| Laufzeit | Keine neuen Netzwerkzugriffe außerhalb `public/data/`. |

### Datenlage (Vorprüfung Oktober 2026)

**a) MaStR-Gesamtdatenexport**

- Download: `https://download.marktstammdatenregister.de/Stichtag/Gesamtdatenexport_20261001_26.1.zip`
- ca. **3,0 GB ZIP**, Stand 01.10.2026, Revision 26.1; Doku im gleichnamigen
  Dokumentations-ZIP.
- Lizenz: **Datenlizenz Deutschland – Namensnennung 2.0** (dl-de/by-2-0).
- Benötigt werden:
  - `Marktakteure.xml` – Betreiberstammdaten (Name, Anschrift, E-Mail, Telefon,
    Marktfunktion, Marktrollen, Tätigkeitszeitraum)
  - `Netze.xml` – geschlossene Verteilnetze und angeschlossene Kunden
  - `Netzanschlusspunkte.xml` – Join `LokationMaStRNummer` → `NetzbetreiberMaStRNummer`
  - `EinheitenSolar.xml` – Standort (PLZ, Gemeinde, Gemeindeschlüssel) und Betriebsstatus
  - `Marktrollen.xml` / `Marktfunktionen.xml` – Code-Zuordnung „Stromnetzbetreiber“
    (nicht hart kodieren)

**b) Warum EinheitenSolar?**

- Jede in Betrieb befindliche PV-Anlage hängt an einem Netzanschlusspunkt und dieser an
  genau einem Netzbetreiber. Über Millionen Anlagen ergibt sich eine statistisch
  belastbare Karte – nicht die amtliche Netzgebietsgrenze, aber die beste öffentlich
  verfügbare Näherung.
- Nur `EinheitBetriebsstatus = 35` („In Betrieb“) zählt; Planungen und Stilllegungen
  bleiben außen vor. Anlagen ohne abgeschlossenen Netzanschlusspunkt werden verworfen
  (MaStR-typisches Bearbeitungs-Lag; laut EMA ca. 13 % der jüngsten Anmeldungen).
- Für Innenstadt-PLZ ohne eigene PV-Anlagen greift der Gemeinde-Fallback: Die
  Gemeinde hat fast immer Anlagen in anderen PLZ; der Betreiber ist dort in der Regel
  derselbe. Das ist weniger präzise und wird in der UI als „Zuordnung auf
  Gemeindeebene“ gekennzeichnet.

**c) Grenzfälle**

- Eine PLZ kann mehrere Betreiber treffen (z. B. Stadtwerk im Zentrum, Flächen-VNB am
  Rand; oder Bahn-/Industrienetz). Deshalb: Top-1 plus weitere Betreiber ab 10 %,
  Auswahl immer manuell.
- Geschlossene Verteilnetze (§ 110 EnWG) werden gekennzeichnet und aus der Zuordnung
  ausgeschlossen; sie betreffen in der Regel Industrie-/Bahnflächen, nicht Haushalte.
- Betreiberstammdaten enthalten E-Mail und Telefon, aber keine Website. Wo keine E-Mail
  vorliegt, bleibt Druck/PDF + „Nachricht kopieren“.
- Einzelne PLZ (insbesondere reine Postfach-/Kreis-PLZ aus M5) haben keine
  Gemeindezuordnung; dort bleibt nur das manuelle Formular.

### Datenbasis (Build-Zeit)

1. **`scripts/fetch-mastr-netzbetreiber.mjs`** (schwerer Schritt, selten)
   - lädt den gepinnten Quartalsexport nach `scripts/source/cache/mastr/` (gitignored)
   - **Streaming-Unzip** (z. B. `yauzl`, ZIP64-fähig) und **SAX-Parser** (`sax`); kein DOM,
     kein Entpacken aller Dateien
   - zwei Durchläufe:
     1. Marktakteure + Netzanschlusspunkte → Betreiber-Map und `Lokation → Betreiber`
     2. EinheitenSolar → Aggregation
   - Filter: aktive Stromnetzbetreiber, `NochInPlanung = 0` bei Netzanschlusspunkten,
     `EinheitBetriebsstatus = 35`, PLZ und Gemeindeschlüssel vorhanden
   - Ausgabe:
     - `scripts/source/mastr-netzbetreiber-operators.csv`
       (`id,name,strasse,plz,ort,bundesland,email,telefon,geschlossen,kunden100k`)
     - `scripts/source/mastr-netzbetreiber-plz.csv`
       (`plz,ags,gemeinde,netzbetreiber_id,anzahl`)
     - `scripts/source/mastr-netzbetreiber-ags.csv`
       (`ags,gemeinde,netzbetreiber_id,anzahl`)
   - Die CSVs werden **committet** (ca. 1,5 MB), damit der Client-Build ohne den
     3-GB-Download reproduzierbar ist.

2. **`scripts/build-netzbetreiber.mjs`**
   - liest die drei CSVs und die M5-Shards `public/data/kommunen/plz-kommunen/…`
   - pro PLZ und AGS:
     - PLZ-spezifische Verteilung nutzen, wenn dort mindestens `MIN_PLZ_UNITS`
       (Vorschlag: 10) Anlagen liegen
     - sonst Gemeinde-Fallback über den AGS
     - sonst kein Treffer → manuelles Formular
   - Top-1 immer, weitere Betreiber nur ab 10 %; pro PLZ nach Betreiber-ID deduplizieren
     (höchsten Anteil behalten)
   - Ausgabe:
     - `public/data/netzbetreiber/netzbetreiber.json` – Betreiberstammdaten
     - `public/data/netzbetreiber/meta.json` – Stand, Quelle, Methodik
     - `public/data/netzbetreiber/plz-netzbetreiber/<prefix>.json` – pro PLZ:
       `{ id, ags, gemeinde, anteil, anzahl, quelle }`
   - Validierung (Warnungen statt Abbruch):
     - Abdeckung aller PLZ aus `public/data/plz/` und aller AGS aus `plz-kommunen`
     - Top-10-Betreiber nach Gemeinden/Anlagen (Vergleich mit der EMA-Referenzliste:
       Westnetz, Bayernwerk, SH Netz, Netze BW, E.DIS, TEN, MITNETZ, Pfalzwerke, Syna,
       EWE)
     - Verteilung der Top-1-Anteile: ≥ 95 %, 70–95 %, < 70 %
     - Anzahl Gemeinde-Fallbacks und PLZ ohne Treffer
     - jede Betreiber-ID im Shard existiert im Roster; jeder Betreiber mit Anlagen hat
       einen Eintrag
     - Stichproben (siehe Abnahme)
     - Liste der unsicheren Fälle für die manuelle Prüfung

3. **npm-Aliase** (einzeln, kein Sammelbefehl):
   ```bash
   npm run data:netz:mastr   # 1. MaStR-Export → source/mastr-netzbetreiber-*.csv
   npm run data:netz:build   # 2. Join + Validierung → public/data/netzbetreiber/
   ```
   Nach `data:netz:build` den Dev-Server neu starten (Vite-Cache).

**Datenmenge:** Roster 187 KB, 95 Shards 1,06 MB, `meta.json` < 1 KB –
zusammen 1,25 MB, also deutlich unter 3 MB.

**Laufzeit/Risiko:** Download 3 GB, Parsen von 6,5 Mio. Anlagen; in der Abnahme
ca. 5 Minuten mit 8 GB Heap (`--max-old-space-size=8192`).
Die NAP-Map (`Lokation → Betreiber`) ist der größte Speicherposten; 8 GB RAM empfohlen.
Der Quartalsstand wird im Skript gepinnt und bei Bedarf (neuer Export) aktualisiert.

### Client

- `src/types.ts`: neue Art `Netzbetreiber` mit `art: 'netzbetreiber'`, `id`, `name`,
  `address`, `email?`, `telefon?`, `gemeinde?`, `ags?`, `anteil?`, `anzahl?`,
  `quelle?`, `hinweis?`; `RecipientCandidate = Mandatstraeger | Kommune | Netzbetreiber`;
  Guard `isNetzbetreiber()`.
- `src/lib/lookup.ts`: `findNetzbetreiberByPlz(plz)` – Shard + Roster (gecacht), Sortierung
  nach Anteil, Hinweis je nach Anteil/Quelle.
- `src/lib/recipientTypes.ts`:
  ```ts
  netzbetreiber: {
    id: 'netzbetreiber',
    label: 'Netzbetreiber (Strom)',
    lookup: findNetzbetreiberByPlz,
    prefillForm: true,
  }
  ```
- `src/App.tsx`:
  - `manualFromNetzbetreiber()`: Anrede „Sehr geehrte Damen und Herren“,
    `organisation` = Firmenname, `name`/`amt` leer, Anschrift/E-Mail übernehmen
  - `handleSelectRecipient()`: Prefill auch für Netzbetreiber
  - `recipientContext()`: neuer Zweig mit `organisation`, `netzgebiet`, `anteil`,
    `quelle`; `rolle` bleibt leer (Unternehmen)
  - `recipientHint`: „Zuordnung aus dem Marktstammdatenregister (Stand …), keine amtliche
    Netzgebietsgrenze – bitte prüfen.“
  - leerer Treffer: typspezifischer Hinweis + manuelles Formular
- `src/components/RecipientList.tsx`: neuer Zweig; Firmenname, „Netzbetreiber (Strom)“,
  Gemeinde/Netzgebiet, Anteil, Anschrift, E-Mail; Warnung bei < 70 % oder
  `quelle = gemeinde`.
- `src/components/ManualRecipientForm.tsx`: neutralere Texte („Organisation/Unternehmen“
  statt nur „Behörde“), Prefill-Hinweis für Firmen.
- `src/components/LetterPreview.tsx`: Textfeinschliff („Behörde“ → „Empfänger/Unternehmen“).
- Keine Änderung an `storage.ts`: Das Formular wird wie bei M5 pro Typ gespeichert.

**Briefkontext für Netzbetreiber:**

```text
{{ empfaenger.organisation }}
{{ empfaenger.strasse }}
{{ empfaenger.plz }} {{ empfaenger.ort }}
```

Also **ohne** `{{ empfaenger.amt }}`/`{{ empfaenger.name }}`; die Anrede ist neutral.
`isRecipientComplete()` akzeptiert das bereits, weil `organisation` gesetzt ist.
Die vorhandenen Platzhalter `{{ absender.buerger }}` und `{{ empfaenger.rolle }}` bleiben
unverändert; `rolle` ist bei Netzbetreibern leer.

### Kampagne

- `campaigns/redispatch-2026-01/campaign.yaml`:
  ```yaml
  recipients:
    - mdb
    - landtag
    - landrat
    - buergermeister
    - netzbetreiber
  ```
- Neues Template `campaigns/redispatch-2026-01/templates/netzbetreiber.md`:
  - Kern wie bei den anderen Templates (EU-Rechtsbruch, fossile Kostenfalle,
    Speicherblockade)
  - Ansprache an den **Anschlussnetzbetreiber**: eigene Verantwortung für
    Netzanschluss, Redispatch-Umsetzung und transparente Anschlussregeln
  - Forderungen: keine pauschale Blockade von Speichern, veröffentlichte
    Anschlussbedingungen, öffentliche Positionierung gegen den Redispatch-Vorbehalt
  - `{{ absender.buerger }}` verwenden; Empfängerzeile über `organisation`
  - **Textentwurf vor Veröffentlichung mit Kail abstimmen.**
- `stadtwerke.md` kommt nicht in M6. Wenn der lokale Netzbetreiber die Stadtwerke sind,
  zeigt die Suche sie als Betreiber an.

### Doku, Lizenz, Abnahme

- `PLAN.md`: dieser Abschnitt; Meilensteine, Datenpipeline, Struktur, Workflow,
  offene Punkte und „Nächster Schritt“ nachziehen.
- `scripts/README.md`: Abschnitt „Netzbetreiber (M6)“ (Quelle, Methode, Befehle,
  Datenstände, Lizenz).
- `AGENTS.md`: Befehle `data:netz:mastr`/`data:netz:build`; Gotchas (3 GB, 8 GB RAM,
  Quartals-Pin, abgeleitete Zuordnung, kein Grundversorger, Dev-Server-Neustart).
- `README.md`: Netzbetreiber als durchsuchbarer Typ und MaStR als Quelle.
- `docs/impressum.md`: „© Bundesnetzagentur, Marktstammdatenregister
  (dl-de/by-2-0), Stand 01.10.2026“ plus Hinweis, dass die PLZ→Netzbetreiber-Zuordnung
  eine eigene Auswertung der In-Betrieb-PV-Anlagen und **keine amtliche
  Netzgebietsgrenze** ist.

**Abnahme im Preview (Erwartung, im Build bestätigen):**

| PLZ | Erwartung |
|---|---|
| 10115 Berlin | Stromnetz Berlin GmbH |
| 80331 München | SWM Infrastruktur (Gemeinde-Fallback, da kaum PV im PLZ-Gebiet) |
| 50667 Köln | RheinNetz GmbH |
| 01067 Dresden | SachsenNetze GmbH |
| 24103 Kiel | SWKiel Netz GmbH |
| 79098 Freiburg | badenovaNETZE GmbH |
| 04109 Leipzig | Netz Leipzig GmbH |
| 20095 Hamburg | Hamburger Energienetze GmbH |
| 28195 Bremen | wesernetz Bremen GmbH |
| 30159 Hannover | enercity Netz GmbH (97 %); DB Energie unter 10 % und daher nicht angezeigt |
| 66111 Saarbrücken | Stadtwerke Saarbrücken Netz AG |

Zusätzlich: PLZ ohne Treffer → Hinweis + manuelles Formular; Betreiber mit E-Mail →
mailto; ohne E-Mail → Druck/Kopieren; Mehrfachtreffer → Anteile und Warnung sichtbar;
`npm run build` sauber; Shard-Größen und Gesamtdatenmenge geprüft.

### Reihenfolge und Risiken

M6.0–M6.4 sind umgesetzt: Methodenprüfung am gepinnten Export (Rollen-/Netzfilter,
Stichproben) → Pipeline → Client → Template → Doku/Lizenz/Abnahme.

Risiken:

- **3-GB-Download / RAM / Laufzeit:** Der Schritt ist der schwerste der Pipeline. Er wird
  selten ausgeführt; die abgeleiteten CSVs sind committet, der Client-Build bleibt leicht.
- **Abgeleitete Zuordnung, keine amtliche Grenze:** Deshalb Anteil, Quelle und
  Unsicherheitshinweis anzeigen; das Formular bleibt immer editierbar.
- **Stadtzentren ohne PV:** Gemeinde-Fallback; als solcher kennzeichnen.
- **Gemischte Netze:** Top-1 plus ≥ 10 %, keine automatische Auswahl; Warnung bei < 70 %.
- **Kein Grundversorger:** Nicht versprechen; eigener Typ erst mit belastbarer Quelle.
- **Datenpflege:** Quartalsstand pinnen; nach neuem Export `data:netz:mastr` und
  `data:netz:build` erneut ausführen, Dev-Server neu starten.

## M7 im Detail — Anleitungs-Empfänger (manuelle Einreichung) (umgesetzt)

**Ziel:** Empfänger, die nur ein Webformular anbieten, bekommen keine Adresse und keinen
Brief, sondern eine gepflegte **Anleitung** plus Kopierfelder. Erster Fall ist die
**Petition beim Europäischen Parlament**: Das Petitionsportal bietet weder eine
E-Mail-Adresse noch ein vorbelegbares Formular; alle Angaben müssen von Hand eingetragen
werden.

**Status:** umgesetzt. `ep-petition` ist Teil der Redispatch-Kampagne.

### Entscheidungen (fix)

| Thema | Entscheidung |
|---|---|
| Erster Fall | Europäisches Parlament – Petition über das Petitionsportal (`https://www.europarl.europa.eu/petitions/de/home`). |
| Versandweg | Nur Webformular; **kein** Druck/PDF und **kein** `mailto` für diesen Typ. |
| Content | Je Typ eine Datei `campaigns/<id>/instructions/<typ>.md` (Markdown + YAML-Frontmatter). |
| Template | `templates/<typ>.md` liefert den Text für das Webformular (kein Briefkopf, keine Kontaktformular-Marker). |
| Datenmodell | Neuer Registry-Schalter `instruction`; `Instruction`, `InstructionStep`, `InstructionField` in `src/types.ts`. |
| Speicherung | Keine Empfängerdaten; die Absenderdaten bleiben wie bisher lokal gespeichert. |
| Laufzeit | Keine neuen Netzwerkzugriffe; der externe Link wird nur durch Klick geöffnet. |

### Content-Format

````markdown
---
title: Petition beim Europäischen Parlament einreichen
url: https://www.europarl.europa.eu/petitions/de/home
linkLabel: Petitionsportal öffnen
fields:
  - id: titel
    label: Titel der Petition
    value: "Redispatch-Vorbehalt verstößt gegen Art. 13 Abs. 7 VO (EU) 2019/943"
  - id: text
    label: Petitionstext
    value: "{{ nachricht }}"
    multiline: true
steps:
  - text: Öffne das Petitionsportal und registriere dich mit deiner E-Mail-Adresse.
    link: true
  - text: Wähle „Petition einreichen“ und als Sprache Deutsch.
  - text: Kopiere den Titel der Petition in das Formular.
    fields: [titel]
  - text: Kopiere den Petitionstext in das Formular.
    fields: [text]
---
## Wer kann eine Petition einreichen?
…
## Schritt für Schritt

<!-- schritte -->

## Hinweise
…
````

- Jeder Schritt ist ein Eintrag in `steps`; über `fields: [id]` werden die Felder direkt
  unter dem Schritt zum Kopieren angeboten. Schritte ohne Feld brauchen keine Eingabe.
- `link: true` an einem Schritt zeigt den Portal-Button direkt unter diesem Schritt (z. B.
  „Öffne das Portal“); ohne diese Angabe steht der Button am Ende der Karte.
- `<!-- schritte -->` im Markdown markiert die Stelle der Schritte. Fehlt die Markierung,
  stehen die Schritte am Ende des Textes; nicht in einem Schritt referenzierte Felder
  erscheinen gesammelt darunter.
- Die Feldwerte werden mit `renderTemplate()` gefüllt. `{{ nachricht }}` ist der
  vollständig gerenderte Template-Text; `{{ absender.* }}` und `{{ betreff }}` stehen
  ebenfalls zur Verfügung.
- Zum Kopieren werden nur die inhaltlichen Felder angeboten (hier Titel und Petitionstext).
  Persönliche Angaben wie Name, Anschrift und E-Mail trägt der Nutzer direkt im Portal ein;
  sie stehen unter dem Petitionstext.
- Der Markdown-Text selbst bleibt statisch (keine Nutzereingaben als HTML).
- Feldbezeichnungen und Schritte liegen im Content, nicht im Code – Formularänderungen
  des Portals brauchen nur eine Markdown-Anpassung.
- Laut Portal sind Petitionen in jeder Amtssprache der EU möglich; vorausgesetzt werden
  EU-Bürgerschaft oder Wohnsitz in der EU und ein Anliegen im Tätigkeitsbereich der Union.
  Eine Registrierung im Portal ist nötig; es gibt keine Mindestzahl an Unterschriften.

### Client

- `src/lib/campaigns.ts`: zweiter `import.meta.glob` für `instructions/*.md`,
  Frontmatter über `yaml` parsen (`fields` mit `id`, `steps` mit Feld-Referenzen).
- `src/lib/recipientTypes.ts`: `instruction: true` für `ep-petition`, Helfer
  `hasInstruction()`.
- `src/App.tsx`: `instructionMode`; angepasste Texte in Schritt 3/4; PLZ-Suche und
  Adressformular entfallen; Schritt 4 rendert Anleitung und Felder in einer Karte.
- `src/lib/markdown.ts`: gemeinsamer Mini-Renderer (aus `DocView` extrahiert, geordnete
  Listen ergänzt; eingerückte Folgezeilen werden an den letzten Listenpunkt angehängt).
- `src/components/CopyFields.tsx`: generische Kopierfelder (`CopyFields`) und einzelnes
  Feld (`CopyFieldItem`); `ContactFormFields` ist ein Wrapper. Nach dem Kopieren erscheint
  ein grüner Haken neben dem Button (Platz ist reserviert, damit nichts springt). Für
  Screenreader wird „Kopiert“ ausgegeben.
- `src/components/InstructionCard.tsx`: Anleitung, strukturierte Schritte mit
  eingebetteten Feldern und Link in einer Karte (Schritt 4).

### Kampagne

- `recipients` enthält `ep-petition`.
- `templates/ep-petition.md`: Petitionstext zum Redispatch-Vorbehalt.
- `instructions/ep-petition.md`: Anleitung, Portal-Link und Formularfelder.
- **Textentwurf vor Veröffentlichung mit Kail abstimmen.**

### Abnahme

- `npm run build` sauber.
- Typ `ep-petition`: Anleitung, Link und Felder sichtbar; keine PLZ, kein Adressformular,
  kein Druck-Button; Titel und Petitionstext in den Kopierfeldern, persönliche Angaben
  direkt im Portal.
- Regression: `mdb`, `landtag`, `landrat`, `buergermeister`, `netzbetreiber` unverändert.
- Fehlende `instructions/<typ>.md` → Hinweis statt leerer Karte.

## Offene Punkte (entscheiden beim Bauen, blockieren nicht)

- **Kampagnen-Autor**: Wer schreibt die Templates — Nutzer oder strukturiert von Kail?
  (Die Entwürfe `templates/landtag.md` und `templates/netzbetreiber.md` werden vor
  Veröffentlichung mit Kail abgestimmt.)
- **Bündel-Download**: Ein Brief pro MdB (Standard) oder „an alle im Wahlkreis" als Sammel-PDF?
- **Domain**: eigene Domain `https://demokratiepost.de` (GitHub Pages, `base: '/'`,
  `public/CNAME`).
- **PLZ→Wahlkreis-Pflege**: Die abgeleitete Zuordnung muss zu jeder neuen Wahlperiode
  aktualisiert werden (neuer Commit in `scripts/fetch-plz-wahlkreis.mjs`, dann
  `npm run data:plz`).
- **Landtags-Datenpflege**: Nach Landtagswahlen API-Stand und OpenWahlkreisMap-Commit
  aktualisieren (Landtag-Schritte einzeln, Abschnitt *Datenpipeline*, Punkt 3). Ausgeschlossene Länder (MV, ST, RP, BW, BE) erst
  reaktivieren, wenn Wahlperiode und Wahlkreiszuschnitt stimmig sind.
- **Kontaktdaten weiterer Landtage**: NRW ist der Pilot; weitere Länder brauchen je einen
  Scraper für E-Mail/Wahlkreisbüro – sonst bleibt es beim Sitzanschrift-Fallback.
- **M5 – Namen der Verwaltungsspitzen**: GERDA liefert 8.462 Bürgermeister:innen- und 255
  Landrät:innen-Einträge; 2.606 Einträge bleiben ohne Zuordnung (historische AGS-/Gemeindestände,
  aufgelöste Verbände). Für Berlin, Hamburg, Bremen sowie die Landrät:innen in BW und SH (Wahl
  durch den Kreistag) fehlt eine Quelle. Bis dahin: Behördenbrief ohne Namen bzw. manuelle
  Ergänzung. Ersatzquellen (Landeslisten, Kreistagsbeschlüsse) sind G7.
- **M5 – Veraltete Wahldaten**: Die Regel ist umgesetzt: Name nur bei Wahl ≤ 9 Jahre zurück,
  sonst „nicht verifiziert“ mit Wahljahr. Einzelne Einträge reichen bis 1994 zurück; sie werden
  nicht als Name angezeigt.
- **M5 – Geschlecht/Anrede**: `candidate_gender` ist teils vorhergesagt und bei Landrät:innen
  oft leer → umgesetzt: Geschlecht nur bei GERDA-Quelle `raw`, sonst neutrale Anrede; das
  Formular bleibt editierbar.
- **M5 – AGS-/Datenpflege**: Nach kommunalen Neugliederungen Anschriftenverzeichnis und
  VG250-Stand aktualisieren, dann `data:kom:*` erneut ausführen. Der Name-Fallback fängt
  AGS-Drift, aber nicht jede Umbenennung; der Build-Report zeigt nicht zugeordnete Köpfe.
- **M5 – Postfach-/Zustell-PLZ**: Die Zustell-PLZ-Ergänzung kann eine Postfach-PLZ auf die
  zentrale Verwaltung abbilden. Im Einzelfall prüfen; die Anschrift im Formular ist editierbar.
- **M6 – MaStR-Export**: Der Gesamtdatenexport ist ca. 3 GB groß und wird quartalsweise
  gepinnt. Nach einem neuen Export `data:netz:mastr` und `data:netz:build` erneut ausführen;
  die committeten CSVs machen den Client-Build unabhängig vom Download.
- **M6 – Abgeleitete Zuordnung**: PLZ→Netzbetreiber ist keine amtliche Netzgebietsgrenze.
  Anteil und Quelle werden angezeigt; bei Unsicherheit bleibt das manuelle Formular.
- **M6 – Stadtzentren/Postfach-PLZ**: PLZ ohne eigene PV-Anlagen fallen auf die
  Gemeindeebene zurück; reine Postfach-/Kreis-PLZ ohne AGS bleiben manuell.
- **M6 – Grundversorger/Stadtwerke**: Nicht Teil von M6. Ein eigener Grundversorger-Typ
  bräuchte eine belastbare bundesweite Quelle (die BNetzA hat keine); `stadtwerke` bleibt
  manuell.
- **M6 – Übertragungsnetz**: Die Regelzone/der ÜNB ist nicht Teil der Suche; er kann später
  als Metadatum ergänzt werden.
- **M7 – EP-Petitionsportal**: Link, Feldbezeichnungen und Ablauf können sich ändern.
  Anleitung und Felder liegen in `campaigns/<id>/instructions/ep-petition.md` und werden
  dort gepflegt; der Petitionstext bleibt inhaltlich mit Kail abzustimmen.

## Nächster Schritt

M1–M7 sind umgesetzt: Der Fünf-Schritte-Ablauf steht, MdB-, Landtags-, kommunale und
Netzbetreiber-Daten sind vollständig (Bund: 630 Mandate, 299 Wahlkreise; Landtage: 16 Roster,
davon 11 durchsuchbar, 6.027 PLZ in 85 Shards; Kommunen: 401 Kreise, 1.202 Verbände,
12.088 Gemeinden, 8.585 PLZ in 95 Shards; Netzbetreiber: Zuordnung aus dem MaStR für die
PLZ des Bundestags-Index). Der Client bietet Suche, Manual-Fallback, das vorbefüllte
M5/M6-Formular und für `ep-petition` eine Anleitung mit Kopierfeldern; die
Redispatch-Kampagne enthält `mdb.md`, `landtag.md`, `landrat.md`, `buergermeister.md`,
`netzbetreiber.md` und `ep-petition.md` sowie `instructions/ep-petition.md`.

Offen ist **G7** (Ersatzquellen für Stadtstaaten und Landrät:innen in BW/SH) sowie weitere
Landtags-Kontakt-Scraper nach dem NRW-Muster. Ein Grundversorger-Typ bleibt bewusst außen
vor – die BNetzA führt keine bundesweite Liste; `stadtwerke` bleibt manuell.
