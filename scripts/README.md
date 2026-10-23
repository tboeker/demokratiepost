# Datenpipeline

Die Anwendung lädt zur Laufzeit zwei Arten von Daten aus `public/data/`:

| Datei | Inhalt |
|---|---|
| `public/data/mdb.json` | Alle Bundestagsabgeordneten (Direkt- + Listenmandate) inkl. Anschrift und Kontaktformular-Link |
| `public/data/plz/<prefix>.json` | Zuordnung `PLZ -> [Wahlkreis-Nummern]`, aufgeteilt nach den ersten zwei PLZ-Ziffern |

## 1. Abgeordnete holen (`fetch-bundestag.mjs`)

Liest die Abgeordneten-Profile von bundestag.de aus. Pro Profil werden gelesen:

- **JSON-LD**: Name, Geschlecht, Fraktion, **Wahlkreis (Nummer + Name)** oder **Bundesland**, Homepage
- **Anschriftenblock**: Bundestagsbüro und **Wahlkreisbüro(s)**
- **Kontaktformular-Link** (`/services/formular/contactform?mdbId=…`)

Es werden **alle** Abgeordneten erfasst. Jeder Eintrag hat ein Feld `mandate`:

- `direct` – Direktmandat, mit `wahlkreis` (Nummer + Name). Nur diese finden bei der
  PLZ-Suche Verwendung.
- `list` – Listenmandat, mit `state` (Bundesland). Kein Wahlkreis, daher nicht über die PLZ
  auffindbar.

Fehlt einem Profil die Anschrift (manche Abgeordnete geben keine Kontaktdaten an), wird die
Standard-**Bundestagsadresse** (`Platz der Republik 1, 11011 Berlin`) als Fallback gesetzt.
Der **Kontaktformular-Link** wird notfalls aus der `mdbId` (letzte Zahl der Profil-URL) gebildet.

> Hinweis: Wegen der Wahlrechtsreform (Zweitstimmendeckung) sind im 21. Bundestag nicht alle
> 299 Wahlkreise besetzt – 23 Wahlkreissieger zogen nicht ein. Es gibt daher weniger als 299
> Direktmandate (aktuell ~278), der Rest sind Listenmandate.

```bash
node scripts/fetch-bundestag.mjs
# nur zum Testen:
CHROME_PATH=/pfad/zu/chrome MAX_PROFILES=5 node scripts/fetch-bundestag.mjs
```

Ergebnis: `public/data/mdb.json`.

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

## 2. PLZ → Wahlkreis (`build-plz-index.ts`)

Wandelt eine CSV-Quelle in die Laufzeit-Shards um:

```bash
node --experimental-strip-types scripts/build-plz-index.ts
# oder mit eigener Quelle:
PLZ_SOURCE=/pfad/plz-wahlkreis.csv node --experimental-strip-types scripts/build-plz-index.ts
```

CSV-Format (Kopfzeile optional):

```csv
plz,wk
10115,74
10117,74
```

Ergebnis: `public/data/plz/<prefix>.json`.

### Woher kommt die CSV?

PLZ und Bundestagswahlkreis sind **nicht** 1:1 – eine PLZ kann mehrere Wahlkreise umfassen.
Die CSV wird aus zwei Quellen zusammengeführt:

1. **PLZ → Gemeinde** (Amtlicher Gemeindeschlüssel): z. B. über OpenStreetMap-Grenzen
   oder das Gemeindeverzeichnis (Destatis).
2. **Gemeinde → Wahlkreis**: Wahlkreiseinteilung der Bundeswahlleiterin.

Diese Vorarbeit ist der eigentliche Aufwand; das Skript übernimmt nur den letzten Schritt
(CSV → Shards). Aktuell liegt `scripts/source/plz-wahlkreis.csv` mit **Demo-Zuordnungen** bei.

> Hinweis: Der Bundestag bietet eine Wahlkreissuche mit PLZ/Ort-Autocomplete
> (`/ajax/filterlist/de/533302-533302/plz-ort-autocomplete`). Das könnte künftig eine
> direkte PLZ→Wahlkreis-Quelle liefern.
