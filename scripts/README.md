# Datenpipeline

Die Anwendung lädt zur Laufzeit Daten aus `public/data/` (lazy, nach Bedarf):

| Datei | Inhalt |
|---|---|
| `public/data/mdb.json` | Alle Bundestagsabgeordneten (Direkt- + Listenmandate) inkl. Anschrift und Kontaktformular-Link |
| `public/data/plz/<prefix>.json` | Zuordnung `PLZ -> [Wahlkreis-Nummern]`, aufgeteilt nach den ersten zwei PLZ-Ziffern |
| `public/data/landtag/<staat>.json` + `plz-landtag/<prefix>.json` | Landtags-Roster je stimmigem Bundesland und PLZ→Landtagswahlkreis |
| `public/data/kommunen/gemeinden-<land>.json` + `kreise.json` + `plz-kommunen/<prefix>.json` | Kommunale Verwaltungen (Kreis/Verband/Gemeinde) und PLZ→Gemeinde/Kreis |
| `public/data/netzbetreiber/netzbetreiber.json` + `meta.json` + `plz-netzbetreiber/<prefix>.json` | Verteilnetzbetreiber Strom (M6) und PLZ→Netzbetreiber |

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

## 4. Gemeinde- und Kreisebene (M5)

Die kommunale Verwaltungsspitze besteht aus zwei durchsuchbaren Empfängertypen:

| Typ | Suche | Empfänger |
|---|---|---|
| `buergermeister` | PLZ → Gemeinde (und deren Gemeindeverband) | Leitung der Gemeinde-/Stadtverwaltung |
| `landrat` | PLZ → Kreis | Leitung der Kreisverwaltung |

Die Daten entstehen in vier Schritten. Sie laufen **einzeln und in dieser Reihenfolge**
(großer Download, Geometrie-Laufzeit, Datenstände):

```bash
npm run data:kom:verwaltung   # 1. Anschriftenverzeichnis -> source/gemeinde-verwaltungen.csv
npm run data:kom:plz          # 2. Geometrie-Join        -> source/plz-gemeinde.csv
npm run data:kom:koepfe       # 3. GERDA-Amtsträger:innen -> source/gemeinde-koepfe.csv
npm run data:kom:build        # 4. Join + Validierung    -> public/data/kommunen/
```

Nach `data:kom:plz`/`data:kom:build` den **Dev-Server neu starten** (Vite-Cache).

### Schritt 1: `fetch-kommunen-verwaltung.mjs`

Lädt das amtliche *Anschriftenverzeichnis „Anschriften der Gemeinde- und Stadtverwaltungen
in Deutschland“* (Statistisches Bundesamt / Statistikportal, Stand 31.01.2026, XLSX) und
normalisiert es nach `scripts/source/gemeinde-verwaltungen.csv`:

```csv
satzart,art,ars,ags,name,verwaltungssitz,strasse,plz,ort,email,flaeche,einwohner
```

- `satzart` 40 = Kreis, 50 = Gemeindeverband, 60 = Gemeinde; `art` ist die lesbare
  Bezeichnung (z. B. „Kreisfreie Stadt“, „Verbandsgemeinde“).
- `ags` wird bei Kreisen aus dem 5-stelligen ARS abgeleitet (→ 8 Stellen), bei
  Gemeindeverbänden aus den ersten 8 ARS-Stellen; bei Gemeinden steht der amtliche AGS.
- Das Verzeichnis enthält **keine Namen** der Bürgermeister:innen/Landrät:innen – nur
  Anschrift und E-Mail. Ist-Stand: 401 Kreise, 1.202 Gemeindeverbände, 12.088 Gemeinden;
  E-Mail in 12.526 von 13.691 Zeilen (~91 %).

### Schritt 2: `fetch-plz-gemeinde.mjs`

Erzeugt die Zuordnung PLZ → Gemeinde/Kreis durch einen geometrischen Verschnitt:

- **PLZ-Polygone:** [yetzt/postleitzahlen](https://github.com/yetzt/postleitzahlen),
  Release 2026.02 (ODbL), TopoJSON.
- **Gemeindegrenzen:** BKG **VG250**, Ebenen 01.01.2026, UTM32-Shapefile
  (© GeoBasis-DE / BKG, dl-de/by-2-0).
- Beide Quellen werden im Cache `scripts/source/cache/kommunen/` gehalten
  (`--force` lädt neu). Der Verschnitt läuft in ETRS89/UTM32; ein 10-km-Raster
  reduziert die Kandidatenpaare. Übernommen werden alle Gemeinden mit
  **Überlappung ≥ 1 %** der PLZ-Fläche (Methodik wie OpenWahlkreisMap, MIT).
- Lücken werden aus den **Zustell-PLZ** des Anschriftenverzeichnisses ergänzt
  (`quelle = zustell-plz`, `zustell-plz-verband`, `zustell-plz-kreis`,
  `zustell-plz-kreis-sitz`). Das fängt Postfach-PLZ und nicht im Polygon enthaltene
  Verwaltungssitze ab; bei Kreis-Postfach-PLZ wird zusätzlich die Gemeinde am
  Verwaltungssitz zugeordnet.
- Für PLZ, die in keiner der beiden Quellen vorkommen, gibt es die kleine,
  geprüfte Liste `scripts/source/kommunen-plz-ergaenzungen.csv`
  (`quelle = manuell`, `overlap = 0`). Ist-Stand: 7 PLZ (u. a. 91051 Erlangen,
  94158 Philippsreut).

Ausgabe `scripts/source/plz-gemeinde.csv`:

```csv
plz,ags,kreis_ars,verband_ars,overlap,quelle
```

Ist-Stand: 21.219 Zuordnungen für 8.585 PLZ, davon 14.581 aus der Geometrie
(4 davon unter 1 % als bester Treffer), 5.014 Zustell-PLZ, 1.193 Verbands-,
401 Kreis- und 23 Sitz-Ergänzungen sowie 7 manuelle.
Die kommunalen Shards enthalten damit auch Postfach-PLZ; der Bundestags-PLZ-Index
(8.218 PLZ) ist vollständig abgedeckt. 56 PLZ (überwiegend Postfach-PLZ von
Kreisverwaltungen) haben nur eine Kreiszuordnung – dort bietet die Bürgermeister-Suche
den manuellen Fallback, die Landrat-Suche liefert den Kreis.

### Schritt 3: `fetch-gemeinde-koepfe.mjs`

Lädt die GERDA-Dateien `mayoral_candidates.csv` und `landrat_candidates.csv`
(Commit gepinnt, Git LFS über den Media-Endpunkt) und wählt je AGS die **jüngste
Wahl mit `is_winner = TRUE`**. Doppelte Zeilen derselben Wahl werden über den
Namen entdoppelt; zukünftige Wahltermine werden ignoriert.

- `amt` wird aus dem Wahltyp abgeleitet (Oberbürgermeister-, Bürgermeister-,
  Samt-/Verbandsgemeindewahl bzw. Landratswahl); Sonderformen Region Hannover
  und Regionalverband Saarbrücken erhalten „Regionspräsident:in“ bzw.
  „Regionalverbandspräsident:in“.
- **Geschlecht** wird nur bei GERDA-Quelle `raw` übernommen. `predicted` ist zu
  unsicher für eine geschlechtsspezifische Anrede; dann bleibt die Anrede neutral.
- **Veraltet-Regel:** Ein Name wird nur angezeigt, wenn die Wahl nicht länger als
  9 Jahre zurückliegt (reguläre Amtszeit + Puffer). Ältere Einträge bleiben als
  „nicht verifiziert“ mit Wahljahr erhalten; der Name wird weggelassen.
- **AGS-Drift:** GERDA führt teils andere AGS-Stände als das Anschriftenverzeichnis
  (u. a. Sachsen, Sachsen-Anhalt, Rheinland-Pfalz, Niedersachsen). Deshalb enthält
  die CSV zusätzlich `ags_name` und `state_name`; `build-kommunen.mjs` gleicht
  zuerst über den AGS und dann über den normalisierten Namen ab.

Ausgabe `scripts/source/gemeinde-koepfe.csv`:

```csv
typ,ebene,ags,ags_name,state_name,amt,name,partei,geschlecht,geschlecht_quelle,wahljahr,verifiziert,quelle,hinweis
```

Ist-Stand: 8.462 Bürgermeister:innen-Einträge und 255 Landrät:innen-Einträge.
Nicht zugeordnet bleiben 2.606 Einträge – überwiegend historische AGS-/Gemeindestände
und aufgelöste Verbände (z. B. alte Verbandsgemeinden in Rheinland-Pfalz).

### Schritt 4: `build-kommunen.mjs`

Führt Anschriften, PLZ-Zuordnung und GERDA-Köpfe zusammen:

- `public/data/kommunen/gemeinden-<land>.json` – alle Kreis-, Verbands- und
  Gemeindeverwaltungen eines Landes mit Behördenzeile, Anschrift, E-Mail,
  Einwohnerzahl und Amtsinhaber:in (Name, Partei, Amtsbezeichnung, Wahljahr,
  Hinweis). Ist-Stand: 8,8 MB gesamt, größte Datei Bayern ~1,5 MB.
- `public/data/kommunen/kreise.json` – alle 401 Kreisverwaltungen (für `landrat`),
  inkl. `landratCapable` (bei kreisfreien Städten `false`).
- `public/data/kommunen/plz-kommunen/<prefix>.json` – `{ "<plz>": [{ ags,
  kreisArs, verbandArs, overlap }] }`, 8.585 PLZ in 95 Shards (~1,9 MB).

Validierung (Warnungen statt Abbruch):

- Satzart-Zahlen (401 / 1.202 / 12.088) gegen die Erwartung.
- Jede PLZ aus `public/data/plz/` hat mindestens eine kommunale Zuordnung.
- Zustell-PLZ ⊆ Geometrie-PLZ (Postfach-PLZ werden als Lücke ausgewiesen).
- Stichproben: Kiel (Gemeinde/OB), Flensburg (kreisfrei), Adenau
  (Verbandsgemeinde).
- Abdeckungsreport Namen je Land sowie Liste der nicht zugeordneten GERDA-Köpfe.

### Client-Verhalten

- `buergermeister` und `landrat` sind durchsuchbar; das manuelle Formular ist
  **immer** sichtbar (`prefillForm`). Beim Auswählen eines Treffers werden
  Behörde, Anschrift, E-Mail und – soweit bekannt – Name/Amtsbezeichnung
  vorbefüllt; das Formular ist die Quelle für den Brief und wird pro Typ unter
  `demokratiepost.empfaenger.<typ>.v1` gespeichert.
- Kreisfreie Städte: Der Typ `landrat` liefert die Stadtverwaltung mit Hinweis
  (keine Landrätin/kein Landrat). Stadtstaaten (BE/HH/HB) liefern die
  Stadtverwaltung ohne Namen mit Hinweis; die Amtsbezeichnung bleibt leer.
- Eine PLZ kann mehrere Gemeinden und deren Gemeindeverband treffen – alle
  Treffer werden angezeigt, die Auswahl bleibt manuell.
- `ob` ist ein Alias auf die Bürgermeister-Suche; die konkrete Amtsbezeichnung
  kommt aus den Daten.

### Lizenz

- **Anschriftenverzeichnis** – Statistisches Bundesamt / Statistikportal,
  Stand 31.01.2026; Vervielfältigung/Verbreitung mit Quellenangabe gestattet.
- **VG250** – © GeoBasis-DE / BKG, Datenlizenz Deutschland – Namensnennung 2.0.
- **PLZ-Polygone** – yetzt/postleitzahlen (ODbL).
- **GERDA** – Heddesheimer, Hilbig, Sichart & Wiedemann (2025), *GERDA: German
  Election Database*, Nature: Scientific Data 12: 618,
  [doi:10.1038/s41597-025-04811-5](https://doi.org/10.1038/s41597-025-04811-5),
  CC BY 4.0. Hessen-Namen 1993–2012: Hessami (2018), CC0.

## 5. Netzbetreiber Strom (M6)

Der Typ `netzbetreiber` liefert den **Verteilnetzbetreiber Strom** für eine PLZ. Es ist
bewusst **nicht** der Grundversorger und nicht die Stadtwerke als solche: Adressiert wird
das Unternehmen, das vor Ort das Stromverteilnetz betreibt. Eine amtliche
PLZ→Netzbetreiber-Tabelle gibt es nicht; die Zuordnung wird aus dem
Marktstammdatenregister abgeleitet.

Die Daten entstehen in zwei Schritten (einzeln, kein Sammelbefehl):

```bash
npm run data:netz:mastr   # 1. MaStR-Export -> source/mastr-netzbetreiber-*.csv
npm run data:netz:build   # 2. Join + Validierung -> public/data/netzbetreiber/
```

Nach `data:netz:build` den **Dev-Server neu starten** (Vite-Cache).

### Schritt 1: `fetch-mastr-netzbetreiber.mjs`

- Lädt den gepinnten Gesamtdatenexport
  `Gesamtdatenexport_20261001_26.1.zip` (**ca. 3 GB**) nach
  `scripts/source/cache/mastr/` (gitignored) und setzt abgebrochene Downloads per
  HTTP-Range fort. `MASTR_ZIP=/pfad/export.zip` nutzt einen lokalen Export,
  `--force` lädt neu.
- Liest das ZIP **streaming** über `yauzl` (ZIP64) und parst die XML-Records mit einem
  schlanken Streaming-Parser – kein DOM, kein vollständiges Entpacken.
- Verwendete Dateien: `Marktakteure.xml` (Betreiberstammdaten), `Netze.xml`
  (geschlossene Verteilnetze, angeschlossene Kunden), `Netzanschlusspunkte.xml`
  (`LokationMaStRNummer` → `NetzbetreiberMaStRNummer`), `EinheitenSolar.xml`
  (Standort und Betriebsstatus) sowie `Marktrollen.xml`/`Marktfunktionen.xml`
  (Rollen-Code „Stromnetzbetreiber“, nicht hart kodiert).
- Filter: aktive Marktakteure im Exportzeitraum, `NochInPlanung = 0` bei
  Netzanschlusspunkten, `EinheitBetriebsstatus = 35` („In Betrieb“), gültige PLZ und
  achtstelliger Gemeindeschlüssel. Anlagen ohne aktiven Netzanschlusspunkt werden
  verworfen. Geschlossene Verteilnetze (§ 110 EnWG) werden ausgeschlossen.
- Ausgabe (committet, ca. 1,5 MB):
  - `scripts/source/mastr-netzbetreiber-operators.csv`
    (`id,name,strasse,plz,ort,bundesland,email,telefon,geschlossen,kunden100k`)
  - `scripts/source/mastr-netzbetreiber-plz.csv`
    (`plz,ags,gemeinde,netzbetreiber_id,anzahl`)
  - `scripts/source/mastr-netzbetreiber-ags.csv`
    (`ags,gemeinde,netzbetreiber_id,anzahl`)

Laufzeit/Risiko: 3-GB-Download, Parsen von 6,5 Mio. Anlagen; 8 GB RAM und
ca. 5–10 Minuten einplanen (Abnahme: ca. 5 Minuten). Der npm-Alias setzt dafür 8 GB Heap
(`node --max-old-space-size=8192`); bei direktem Aufruf entsprechend setzen. Der
Quartalsstand ist im Skript gepinnt.

### Schritt 2: `build-netzbetreiber.mjs`

- Liest die drei CSVs und die M5-Shards `public/data/kommunen/plz-kommunen/…`.
- Pro PLZ:
  - PLZ-Verteilung, wenn dort mindestens **10** In-Betrieb-Anlagen liegen;
  - sonst **Gemeinde-Fallback** über den AGS mit der größten Flächenüberlappung
    (z. B. Innenstadt-PLZ ohne eigene PV-Anlagen);
  - sonst kein Treffer → die App bietet das manuelle Formular an.
- Top-1 wird immer übernommen, weitere Betreiber ab **10 %** Anteil; pro Betreiber-ID
  wird dedupliziert (höchster Anteil bleibt). Anteil, Anzahl und Quelle (`plz`/`gemeinde`)
  werden mitgeliefert.
- Ausgabe:
  - `public/data/netzbetreiber/netzbetreiber.json` – Betreiberstammdaten
    (Name, Anschrift, E-Mail, Telefon)
  - `public/data/netzbetreiber/meta.json` – Stand, Quelle, Methodik, Kennzahlen
  - `public/data/netzbetreiber/plz-netzbetreiber/<prefix>.json` – pro PLZ:
    `[{ id, ags, gemeinde, anteil, anzahl, quelle }]`
  - `scripts/source/netzbetreiber-prueffaelle.csv` – unsichere Fälle
    (Anteil < 70 % oder Gemeinde-Fallback) für die manuelle Prüfung.
- Validierung (Warnungen statt Abbruch): PLZ-Abdeckung gegen `public/data/plz/`,
  Top-10-Betreiber nach Anlagen, Verteilung der Top-1-Anteile, Gemeinde-Fallbacks und
  PLZ ohne Treffer, Roster-/Shard-Konsistenz, Stichproben (Berlin, München, Köln,
  Dresden, Kiel, Freiburg, Leipzig, Hamburg, Bremen, Hannover, Saarbrücken).

Ist-Stand (Export 01.10.2026): 5.469.488 ausgewertete In-Betrieb-Anlagen (von 6.535.547;
902.481 ohne aktiven Netzanschlusspunkt), 813 Betreiber mit Anlagen und im Roster,
26 geschlossene Netze ausgeschlossen. 8.527 von 8.585 PLZ mit Treffer (8.139 PLZ-Ebene,
388 Gemeinde-Fallback, 58 ohne Treffer); 592 PLZ mit mehreren Betreibern, davon 273 mit
Top-1-Anteil < 70 %. Laufzeitdaten 1,25 MB (Roster 187 KB, 95 Shards 1,06 MB), Quell-CSVs
1,47 MB. Im Bundestags-PLZ-Index fehlen nur 25869, 78266 und 83256.

### Client-Verhalten

- `netzbetreiber` ist durchsuchbar; das manuelle Formular ist **immer** sichtbar
  (`prefillForm`). Beim Auswählen eines Treffers werden Firmenname, Anschrift und
  E-Mail vorbefüllt; das Formular ist die Quelle für den Brief und wird unter
  `demokratiepost.empfaenger.netzbetreiber.v1` gespeichert.
- Die Empfängerzeile besteht aus `organisation`, Straße und PLZ/Ort – **ohne**
  Name/Amtsbezeichnung; die Anrede ist „Sehr geehrte Damen und Herren“.
- Die App zeigt Gemeinde/Netzgebiet, Anteil, Quelle und einen Prüfhinweis an:
  „Zuordnung aus dem Marktstammdatenregister, keine amtliche Netzgebietsgrenze“.
  Unter 70 % Anteil oder beim Gemeinde-Fallback erscheint zusätzlich eine Warnung.
- Wo eine E-Mail vorliegt, bietet die App `mailto:` an; sonst Druck/PDF und
  „Nachricht kopieren“.

### Lizenz

- **Marktstammdatenregister** – © Bundesnetzagentur für Elektrizität, Gas,
  Telekommunikation, Post und Eisenbahnen, Gesamtdatenexport 01.10.2026,
  Datenlizenz Deutschland – Namensnennung 2.0 (dl-de/by-2-0).
- Die PLZ→Netzbetreiber-Zuordnung ist eine eigene Auswertung der in Betrieb befindlichen
  PV-Anlagen und **keine amtliche Netzgebietsgrenze**.
