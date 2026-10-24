# Plan: Demokratiepost Prototyp

## Idee (Kurzfassung)

Fulfillment-Layer für politische Musterschreiben von Gutachter Kail (YouTube, Stromnetze/Erneuerbare Energien).

Kernversprechen:

> **PLZ rein → korrekte Empfänger raus → fertiger, personalisierter Brief.**

Der Nutzer gibt eine Postleitzahl ein und wählt eine Kampagne. Anhand der PLZ werden die
zuständigen Empfänger ermittelt, und passende Musterschreiben (Absender + Empfänger bereits
eingesetzt) werden versandfertig aufbereitet. Ziel: maximale Reichweite durch minimale Hürde.

Mögliche Empfängertypen: Bundestagsabgeordnete, Landtagsabgeordnete, Landrat, Bürgermeister,
Stadtwerke, Netzbetreiber.

## Entscheidungen (fix)

| Thema | Entscheidung |
|---|---|
| Versandkanal | PDF-Brief (Druck) **und** Kontaktformular/mailto (E-Mail nur, wo vorhanden) |
| MVP-Empfänger | Bundestagsabgeordnete |
| Architektur | Statische Seite, 100 % clientseitig, kein Backend/Tracking |
| Stack | Vite + React + TypeScript |
| Hosting | GitHub Pages (Deploy via GitHub Actions) |
| Content/Pflege | Dateien im Repo + Build-Skripte |

## Architektur (statisch, clientseitig)

```
Browser (statische Seite)
├── PLZ-Eingabe
├── Lookup: PLZ-Präfix → public/data/plz/<prefix>.json   (nur bei Bedarf geladen)
├── Kampagnen: campaigns/*/campaign.yaml + templates/*.md
├── Rendering: Markdown-Template + Platzhalter → HTML
├── Ausgabe A: DIN-5008-Briefansicht → window.print() → "Als PDF speichern"
└── Ausgabe B: Kontaktformular-Link (bzw. mailto) + "Nachricht kopieren"
```

- Kein Backend, kein Tracking. PLZ und Absenderdaten bleiben im Browser
  (`localStorage` für Komfort). Gleichzeitig das Datenschutz-Argument.
- PDF über eine per CSS gestylte Briefansicht + `window.print()` (beste Typografie,
  DIN 5008, keine PDF-Library nötig). Optional später `pdf-lib` für direkten `.pdf`-Download.
- Versand: Der Bundestag veröffentlicht **keine E-Mail-Adressen**. Die App führt daher direkt
  zum **Kontaktformular** des Abgeordneten; zusätzlich „Nachricht kopieren". Wo eine E-Mail-Adresse
  vorliegt (spätere Empfängertypen), wird ein `mailto:`-Link angeboten.
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

## Datenpipeline (kritischer Teil)

Zwei getrennte Baustellen mit je einem Build-Skript:

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

## Kampagnen-Format (Dateien im Repo)

```
campaigns/
  stromnetz-2026/
    campaign.yaml        # id, titel, betreff, thema, beschreibung, empfängertypen, laufzeit
    templates/
      mdb.md             # Musterschreiben für Bundestagsabgeordnete
```

Platzhalter: `{{ absender.* }}`, `{{ empfaenger.anrede|name|partei|wahlkreis }}`,
`{{ datum }}`, `{{ betreff }}` + optionaler **persönlicher Absatz** des Nutzers
(erhöht die Wirkung gegenüber 1:1-Kopien deutlich).

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
│   └── build-plz-index.ts            # PLZ→Wahlkreis → data/plz/<prefix>.json
├── public/data/                      # Laufzeit-Daten, lazy geladen
│   ├── mdb.json
│   └── plz/10.json, 11.json, …
├── src/
│   ├── App.tsx
│   ├── components/  (PlzInput, SenderForm, RecipientList, LetterPreview)
│   ├── lib/         (campaigns, template, storage, lookup, export)
│   └── types.ts
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
   Absatz, Feinschliff.
4. **M4 — Erweiterung**: Landtag, danach Gemeinde-Ebene (Bürgermeister/Landrat).
5. **M5 — später**: Netzbetreiber/Stadtwerke (Grundversorger via BNetzA).

M1–M3 sind der Proof-of-Value. Erst danach lohnt sich die Datenbreite.

## Offene Punkte (entscheiden beim Bauen, blockieren nicht)

- **Kampagnen-Autor**: Wer schreibt die Templates — Nutzer oder strukturiert von Kail?
- **Bündel-Download**: Ein Brief pro MdB (Standard) oder „an alle im Wahlkreis" als Sammel-PDF?
- **Domain**: `*.github.io/demokratiepost` oder später eigene Domain?
- **PLZ→Wahlkreis-Pflege**: Die abgeleitete Zuordnung muss zu jeder neuen Wahlperiode
  aktualisiert werden (neuer Commit in `scripts/fetch-plz-wahlkreis.mjs`, dann
  `npm run data:plz`).

## Nächster Schritt

M1 und M2 sind umgesetzt. Die echten MdB-Daten (inkl. Anschriften und Kontaktformular-Links)
kommen aus den bundestag.de-Profilen. Die **PLZ→Wahlkreis-Zuordnung** ist vollständig
(8.218 PLZ, 299 Wahlkreise) und wird aus amtlichen Geodaten abgeleitet. Als Nächstes **M3**:
Kails Schreiben als erste Kampagne, optionaler persönlicher Absatz, Feinschliff.
