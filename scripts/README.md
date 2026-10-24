# Datenpipeline

Die Anwendung lädt zur Laufzeit zwei Arten von Daten aus `public/data/`:

| Datei | Inhalt |
|---|---|
| `public/data/mdb.json` | Alle Bundestagsabgeordneten (Direkt- + Listenmandate) inkl. Anschrift und Kontaktformular-Link |
| `public/data/plz/<prefix>.json` | Zuordnung `PLZ -> [Wahlkreis-Nummern]`, aufgeteilt nach den ersten zwei PLZ-Ziffern |

## 1. Abgeordnete (drei Schritte)

Die MdB-Daten entstehen aus **zwei Quellen**, die sich ergänzen:

| Quelle | Liefert | Warum |
|---|---|---|
| abgeordnetenwatch.de (API v2, CC0) | Wer ist **aktuell** Mitglied, Mandatsart, Wahlkreis, Landesliste, Partei | bundestag.de lässt Profile ausgeschiedener Abgeordneter online (639 Profile für 630 Mandate) |
| bundestag.de (Profile) | Anschriften (Bundestags- und Wahlkreisbüro), Kontaktformular-Link, Homepage, Geschlecht | Nur der Bundestag veröffentlicht die Büroanschriften |

```bash
npm run data:aw          # 1. laufende Mandate  -> public/data/mandates.json
npm run data:bundestag   # 2. Profile           -> public/data/mdb-profiles.json
npm run data:build       # 3. zusammenführen    -> public/data/mdb.json
```

Die Schritte laufen **einzeln und in dieser Reihenfolge** (kein Sammelbefehl).

### Schritt 1: `fetch-abgeordnetenwatch.mjs`

Holt die laufende Wahlperiode des Bundestages und alle `mandate` daraus (aktuell
**630**). Kein Browser, kein API-Schlüssel, ein paar Requests. Ergebnis pro Mandat:
Name, Partei, Mandatsart (`direct`/`list`), Wahlkreis (Nummer + Name) bzw. Landesliste,
Profil-URL und – bei Nachrückern – ein Hinweistext.

### Schritt 2: `fetch-bundestag.mjs`

Liest die Abgeordneten-Profile von bundestag.de aus. Pro Profil werden gelesen:

- **`constituencyInfo`-Block**: `Wahlkreismandat` (mit Wahlkreisnummer) oder
  `Gewählt über Landesliste` – die verlässliche Quelle für die Mandatsart
- **JSON-LD**: Name, Geschlecht, Fraktion, Homepage (Wahlkreis nur als Fallback)
- **Anschriftenblock**: Bundestagsbüro und **Wahlkreisbüro(s)**
- **Kontaktformular-Link** (`/services/formular/contactform?mdbId=…`)

Fehlt einem Profil die Anschrift (manche Abgeordnete geben keine Kontaktdaten an), wird die
Standard-**Bundestagsadresse** (`Platz der Republik 1, 11011 Berlin`) als Fallback gesetzt.
Der **Kontaktformular-Link** wird notfalls aus der `mdbId` (letzte Zahl der Profil-URL) gebildet.

```bash
node scripts/fetch-bundestag.mjs
# nur zum Testen:
CHROME_PATH=/pfad/zu/chrome MAX_PROFILES=5 node scripts/fetch-bundestag.mjs
```

### Schritt 3: `build-mdb.mjs`

Verknüpft Profile und Mandate über den normalisierten Namen (Titel, Adelspartikel,
Mittelnamen und Umlautschreibweisen werden ignoriert), **behält nur laufende Mandate** und
schreibt `public/data/mdb.json`. Jeder Eintrag hat ein Feld `mandate`:

- `direct` – Direktmandat, mit `wahlkreis` (Nummer + Name). Nur diese finden bei der
  PLZ-Suche Verwendung.
- `list` – Listenmandat, mit `state` (Bundesland). Kein Wahlkreis, daher nicht über die PLZ
  auffindbar.

Bei abweichender Mandatsart gewinnt bundestag.de (die Quelle mit dem `Wahlkreismandat`-Block);
das Skript protokolliert solche Fälle. Aktuell betrifft das nur Nachrücker, die einen
Wahlkreis übernommen haben.

> Hinweis: Wegen der Wahlrechtsreform (Zweitstimmendeckung) sind im 21. Bundestag nicht alle
> 299 Wahlkreise besetzt. Dazu kommen Wahlkreise, deren Direktmandat nach einem Ausscheiden
> vakant bleibt. Aktuell: 274 Direktmandate, 356 Listenmandate.

### Warum ein Browser?

bundestag.de schützt seine Seiten mit einer Bot-Challenge (Enodia). Ein einfacher
HTTP-Request wird auf `/.enodia/challenge` umgeleitet. Das Skript nutzt daher einen echten
(Headless-)Chrome über `puppeteer-core`. Voraussetzung ist ein installiertes
Chrome/Chromium (Standard-Pfad `/usr/bin/google-chrome`, sonst `CHROME_PATH` setzen).

### Keine E-Mail-Adressen

Der Bundestag **veröffentlicht keine E-Mail-Adressen** der Abgeordneten (nur
Kontaktformulare). Die offiziellen Stammdaten (Open Data, XML) enthalten ebenfalls keine
Kontakte. Deshalb speichert die App den **Kontaktformular-Link** statt einer E-Mail und
nutzt für Briefe die **Wahlkreisbüro-Anschrift** (Fallback: Bundestagsbüro).

## 2. PLZ → Wahlkreis (`fetch-plz-wahlkreis.mjs` + `build-plz-index.ts`)

Die Zuordnung wird in zwei Schritten erzeugt:

```bash
npm run data:plz
# entspricht:
node scripts/fetch-plz-wahlkreis.mjs
node --experimental-strip-types scripts/build-plz-index.ts
# oder mit eigener CSV:
PLZ_SOURCE=/pfad/plz-wahlkreis.csv node --experimental-strip-types scripts/build-plz-index.ts
```

`fetch-plz-wahlkreis.mjs` lädt die vollständige Zuordnung und schreibt die normalisierte CSV
nach `scripts/source/plz-wahlkreis.csv`. `build-plz-index.ts` erzeugt daraus die
Laufzeit-Shards `public/data/plz/<prefix>.json`.

CSV-Format (Kopfzeile und `#`-Kommentare optional):

```csv
plz,wk
10115,74
10117,74
```

Aktuell: **8.218 PLZ**, **8.961 Zuordnungen**, **299 Wahlkreise**. Eine PLZ kann mehrere
Wahlkreise überlappen; dann enthält der Shard alle Wahlkreisnummern (≥ 1 % Flächenanteil).
Die App zeigt bei Mehrdeutigkeit alle passenden Direktmandate an.

### Datenquelle und Lizenz

Es gibt keine amtliche 1:1-Tabelle „PLZ → Wahlkreis“, weil PLZ-Gebiete (Deutsche Post) und
Wahlkreisgrenzen (Bundeswahlleiterin) nicht deckungsgleich sind. Die CSV wird daher aus
amtlichen Geodaten abgeleitet:

1. **PLZ-Gebiete** inkl. Gemeindeschlüssel: Bundesamt für Kartographie und Geodäsie (BKG),
   Datenlizenz Deutschland – Namensnennung 2.0 („© GeoBasis-DE / BKG“).
2. **Wahlkreiseinteilung 2025**: Die Bundeswahlleiterin (amtliches Werk).
3. **Amtliche Gemeinde-Zuordnung**: Die Bundeswahlleiterin („Wahlkreise und zugeordnete
   Gemeinden“). Für Gemeinden mit genau einem Wahlkreis wird die dort genannte PLZ ergänzt;
   das füllt Lücken des räumlichen Verschnitts (z. B. 94158 Philippsreut) und fehlende
   Randgebiete (z. B. 56729 Nitz, 83256 Chiemsee).
4. **Aufbereitung**: [OpenWahlkreisMap](https://github.com/maximilion-ai/OpenWahlkreisMap)
   (MIT), Quelle auf einen festen Commit gepinnt, damit Builds reproduzierbar sind.

Die Attribution `© GeoBasis-DE / BKG` steht im Impressum der App und muss dort erhalten
bleiben. Zum Aktualisieren auf eine neue Wahlperiode: Commit in
`scripts/fetch-plz-wahlkreis.mjs` anpassen und `npm run data:plz` ausführen.
