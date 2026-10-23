# Plan: Meine Beschwerde Prototyp

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
| Versandkanal | PDF-Brief (Druck) **und** E-Mail/mailto |
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
└── Ausgabe B: mailto:-Link + "Text kopieren"
```

- Kein Backend, kein Tracking. PLZ und Absenderdaten bleiben im Browser
  (`localStorage` für Komfort). Gleichzeitig das Datenschutz-Argument.
- PDF über eine per CSS gestylte Briefansicht + `window.print()` (beste Typografie,
  DIN 5008, keine PDF-Library nötig). Optional später `pdf-lib` für direkten `.pdf`-Download.
- E-Mail als `mailto:` mit vorbelegtem Betreff/Text, plus „In Zwischenablage kopieren"
  als Fallback (viele Abgeordnete nutzen Kontaktformulare → Copy/Paste).

## Datenpipeline (kritischer Teil)

Zwei getrennte Baustellen, die ein Build-Skript zusammenführt:

**1. Empfänger (MdB) — via abgeordnetenwatch.de API v2**
- Kostenloser API-Key, Abruf **zur Build-Zeit** (Key bleibt aus dem Client).
- Endpunkte `candidacies-mandates` (Bundestag, aktuelle Wahlperiode) + `politicians`
  + `constituencies` + `parties`.
- Liefert: Name, Partei, Wahlkreis, E-Mail, Website, ggf. Anschrift.

**2. PLZ → Wahlkreis — eigentlicher Daten-Risikopunkt**
- abgeordnetenwatch hat Wahlkreise, aber **kein PLZ-Mapping**. Zweite Quelle nötig.
- Kette: `PLZ → Gemeinde (AGS) → Wahlkreis`.
  Quellen: OSM-Grenzen bzw. Destatis-Gemeindeverzeichnis für PLZ↔Gemeinde,
  Bundeswahlleiterin-Liste für Gemeinde↔Wahlkreis.
- PLZ und Wahlkreis sind **nicht** 1:1. Eine PLZ kann mehrere Wahlkreise umfassen.
  Bei Mehrdeutigkeit werden **alle** passenden MdB angezeigt (Feature, kein Bug).

Ergebnis wird als **Shards** (`public/data/plz/10.json`, `11.json`, …) ausgeliefert,
damit pro Anfrage nur wenige KB geladen werden.

## Kampagnen-Format (Dateien im Repo)

```
campaigns/
  stromnetz-2026/
    campaign.yaml        # id, titel, thema, beschreibung, empfängertypen, laufzeit
    templates/
      mdb.md             # Musterschreiben für Bundestagsabgeordnete
```

Platzhalter: `{{ absender.* }}`, `{{ empfaenger.anrede|name|partei|wahlkreis }}`,
`{{ datum }}`, `{{ betreff }}` + optionaler **persönlicher Absatz** des Nutzers
(erhöht die Wirkung gegenüber 1:1-Kopien deutlich).

## Geplante Repo-Struktur

```
meine-beschwerde/
├── .github/workflows/deploy.yml      # Build + Deploy nach GitHub Pages
├── campaigns/                        # Content (versioniert, von Hand pflegbar)
│   └── stromnetz-2026/
│       ├── campaign.yaml
│       └── templates/mdb.md
├── scripts/                          # Datenpipeline (Build-Zeit, nicht im Client)
│   ├── fetch-mdb.ts                  # abgeordnetenwatch API → data/mdb.json
│   └── build-plz-index.ts            # PLZ→Wahlkreis → data/plz/<prefix>.json
├── public/data/                      # Laufzeit-Daten, lazy geladen
│   ├── mdb.json
│   └── plz/10.json, 11.json, …
├── src/
│   ├── App.tsx
│   ├── components/  (PlzInput, SenderForm, RecipientList, LetterPreview)
│   ├── lib/         (campaigns, template, lookup, export)
│   └── types.ts
├── vite.config.ts                    # base: '/meine-beschwerde/'
└── README.md
```

## GitHub-Pages-Besonderheiten

- `vite.config.ts` braucht `base: '/meine-beschwerde/'` (Repo-Pfad), sonst laden
  Assets/Daten nicht.
- Daten- und Asset-URLs relativ über `import.meta.env.BASE_URL` bauen.
- Deploy: GitHub Actions (Build → `actions/upload-pages-artifact` → `actions/deploy-pages`).
- Kein SPA-Fallback nötig, solange Single-Page ohne Deep-Links.

## Meilensteine

1. **M1 — Gerüst**: Vite+React+TS, GitHub-Actions-Deploy, Kampagnen-Loader
   (`import.meta.glob`), Platzhalter-Engine.
2. **M2 — Bundestag end-to-end**: PLZ-Eingabe → Lookup → MdB-Liste (Mehrfachtreffer
   bei mehrdeutiger PLZ) → Briefvorschau → PDF/Print + mailto/Copy.
3. **M3 — Content & UX**: Kails Schreiben als erste Kampagne, Absenderdaten in
   `localStorage`, optionaler persönlicher Absatz.
4. **M4 — Erweiterung**: Landtag, danach Gemeinde-Ebene (Bürgermeister/Landrat).
5. **M5 — später**: Netzbetreiber/Stadtwerke (Grundversorger via BNetzA).

M1–M3 sind der Proof-of-Value. Erst danach lohnt sich die Datenbreite.

## Offene Punkte (entscheiden beim Bauen, blockieren nicht)

- **Kampagnen-Autor**: Wer schreibt die Templates — Nutzer oder strukturiert von Kail?
- **Bündel-Download**: Ein Brief pro MdB (Standard) oder „an alle im Wahlkreis" als Sammel-PDF?
- **Domain**: `*.github.io/meine-beschwerde` oder später eigene Domain?
- **PLZ→Wahlkreis-Quelle**: muss in M2 verifiziert werden (OSM/Destatis +
  Bundeswahlleiterin) — einziges echtes Datenrisiko.

## Nächster Schritt

Umsetzung M1: Projektgerüst, Vite-Config für GitHub Pages, Actions-Workflow,
Kampagnen-Loader und Platzhalter-Engine — plus ein Beispiel-Template als Platzhalter
für Kails Schreiben.
