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

## 3. Landtag (M4)

Für die Landtage gibt es kein bundestag.de-Äquivalent. Wer aktuell Mitglied ist, Mandatsart,
Wahlkreis und Fraktion kommen aus derselben abgeordnetenwatch.de-API (CC0). Die
PLZ→Landtagswahlkreis-Zuordnung stammt aus OpenWahlkreisMap (gepinnt auf denselben Commit
wie beim Bund).

```bash
npm run data:lt:plz     # 1. 16 CSVs + Configs -> scripts/source/plz-landtag/
npm run data:lt:aw      # 2. Roster + sex-Cache   -> public/data/mandates-landtag.json
npm run data:lt:build   # 3. Konsistenz + Shards  -> public/data/landtag/ + public/data/plz-landtag/
npm run data:lt:nrw     # 4. (optional) NRW-Anreicherung -> scripts/source/landtag-contact… (nrw.json)
```

Die Schritte laufen **einzeln und in dieser Reihenfolge** (kein Sammelbefehl). Nach `data:lt:nrw`
erneut `data:lt:build` ausführen, damit die Kontakte im Roster landen.

### Schritt 1: `fetch-plz-landtag.mjs`

Lädt je Land `configs/landtag/<staat>.yaml` und `data/landtag/<staat>/plz-wahlkreis.csv` vom
gepinnten OpenWahlkreisMap-Commit. Überlappungen **≥ 1 %** werden übernommen (Mikro-Überlappungen
verworfen) und als normalisierte CSV `scripts/source/plz-landtag/<staat>.csv`
(`plz,wk,wahlkreis_name`) abgelegt; die Config-Teilmenge (`period_id`, `election`,
`expected_wk_count`) wandert nach `configs.json`.

### Schritt 2: `fetch-landtag.mjs`

Holt je Parlament die **laufende Wahlperiode** und alle Mandate. Als Direktmandat gilt nur
`mandate_won = constituency`; Listenmandate und Nachrücker werden mitgeführt, aber nicht gesucht.
Die Anrede (`sex`) steht nur an der Politiker:in. Statt ~1.900 Einzelabfragen filtert die API
Mandate nach `politician[entity.sex]` (drei Abrufe je Wahlperiode); das Ergebnis wird im
inkrementellen Cache `scripts/source/cache/politicians/<id>.json` gehalten
(`--force` ignoriert den Cache). Die API drosselt mit HTTP 429 → Backoff.

### Schritt 3: `build-landtag.mjs`

**Konsistenzregel:** Ein Land wird nur durchsuchbar, wenn laufende API-Wahlperiode und
OpenWahlkreisMap-Config in `period_id` **und** Label (Bundesland + Wahljahr) übereinstimmen
(Details `periodMatchesConfig` in `scripts/lib/landtag.mjs`). Die Id allein genügt nicht, weil
OWM dieselbe Id für das *Wahl*-Projekt meinen kann, die API für die *auslaufende* Legislatur
(z. B. Berlin 2026). Ausgabe:

- `public/data/landtag/<staat>.json` – Roster (Direkt- + Listenmandate) je stimmigem Land,
  mit Sitzanschrift aus `scripts/source/landtage.csv` als Brief-Fallback.
- `public/data/plz-landtag/<prefix>.json` – `{ "<plz>": [{ staat, wahlkreise }] }`.

Validierung (Warnungen statt Abbruch): `expected_wk_count` gegen die CSV, und jedes Direktmandat
muss über die PLZ-CSV auffindbar sein. Stand Oktober 2026 sind 11 Länder stimmig; MV, ST, RP, BW
und BE bleiben manuell erfassbar (Grund im Build-Log).

Sonderfälle:

- **Wahlkreis-Nummerierung:** SH nummeriert in der amtlichen Quelle 101–135, die API 1–35 →
  `LANDTAG_WK_OFFSET` in `scripts/lib/landtag.mjs`.
- **Saarland** hat seit 2022 keine ausgewiesenen Direktmandate (Wahlkreislisten, `mandate_won`
  ist `null`). Dort dient die Wahlkreis-Zuordnung als Suchschlüssel.

### Schritt 4: `fetch-landtag-nrw.mjs` (Pilot)

Die NRW-Detailseiten (`landtag.nrw.de/.../abgeordnetendetail.html?k=…`) sind per einfachem HTTP
abrufbar und liefern die dienstliche E-Mail sowie – sofern angegeben – ein Wahlkreisbüro. Join
zum Roster über den normalisierten Namen (`scripts/lib/names.mjs`), als Fallback über den
Wahlkreis. Ausgabe `scripts/source/landtag-contacts/nrw.json`; `build-landtag.mjs` mischt
E-Mail und Wahlkreisbüro ins NRW-Roster (sonst Sitzanschrift). Ist-Stand: 195 E-Mail-Adressen,
28 Wahlkreisbüros. Weitere Länder folgen nach demselben Muster (je Land ein eigener Scraper).

### Lizenz

- **abgeordnetenwatch.de** – CC0 1.0 (laufende Mandate, Fraktion, Wahlkreis).
- **Landtagswahlkreise** – amtliche Werke der jeweiligen Landeswahlleiter:innen.
- **PLZ-Polygone** – [yetzt/postleitzahlen](https://github.com/yetzt/postleitzahlen) (ODbL);
  Aufbereitung [OpenWahlkreisMap](https://github.com/maximilion-ai/OpenWahlkreisMap) (MIT).
- **Kontakte NRW** – landtag.nrw.de.
