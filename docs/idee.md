# Die Idee

**Demokratiepost** macht politische Musterschreiben in wenigen Sekunden versandfertig.

Gutachter Kail veröffentlicht auf YouTube Videos zu Stromnetzen und erneuerbaren Energien.
Zu seinen Videos stellt er **Musterschreiben** bereit, mit denen Bürgerinnen und Bürger sich bei politischen Akteuren Gehör verschaffen sollen. Diese Schreiben sind allerdings Rohvorlagen: Der passende Empfänger muss selbst gefunden, die eigenen Daten müssen eingetragen und alles druckfertig aufbereitet werden.

Genau diese Hürden nimmt die Seite ab.

## Das Problem

Vor dem Versand steht man jedes Mal vor denselben Aufgaben:

1. den **richtigen Empfänger** für den eigenen Wohnort herausfinden,
2. **Absender- und Empfängerdaten** in die Vorlage eintragen,
3. das Ganze **druckfertig oder als Nachricht** aufbereiten.

Das kostet Zeit – und viele Schreiben erreichen ihr Ziel deshalb gar nicht erst.

## Die Lösung

> **Postleitzahl eingeben → Kampagne wählen → fertigen Brief erhalten.**

Anhand der Postleitzahl werden die zuständigen Empfänger automatisch ermittelt. Das passende Musterschreiben wird mit den eigenen Daten befüllt und kann direkt gedruckt, kopiert oder über das Kontaktformular versendet werden.

Das Ziel: **möglichst große Reichweite durch eine möglichst kleine Hürde.**

## So funktioniert es

1. **PLZ eingeben** – zum Beispiel `10115`.
2. **Kampagne auswählen** – das Thema, zu dem du schreiben möchtest.
3. **Empfänger anzeigen** – die zuständigen Akteure für deine PLZ werden aufgelistet.
4. **Schreiben prüfen** – die Vorlage wird automatisch mit Absender- und Empfängerdaten gefüllt.
5. **Versenden** – als PDF-Brief zum Ausdrucken, über das Kontaktformular oder als kopierbaren Text. Bei Empfängern mit reinem Webformular (z. B. dem Petitionsportal des Europäischen Parlaments) zeigt die App stattdessen eine Anleitung und die auszufüllenden Angaben.

## Was die Seite leistet

- **Kein Backend:** Alles läuft direkt im Browser.
- **Kein Tracking:** Es werden keine Nutzungsdaten erhoben.
- **Lokale Daten:** Absenderdaten bleiben auf deinem Gerät und lassen sich jederzeit löschen.
- **Freie Inhalte:** Kampagnen und Musterschreiben liegen als Dateien im Repository und können transparent nachvollzogen werden.

## Projektverlauf

Stand Oktober 2026: Der Fünf-Schritte-Ablauf steht, M1–M8 sind umgesetzt.

- **M1 – Gerüst:** Vite + React + TypeScript, GitHub-Pages-Deploy, Kampagnen-Loader, Platzhalter-Engine.
- **M2 – Bundestag:** PLZ → Wahlkreis → Direktmandat, Absenderdaten lokal gespeichert, Briefvorschau, PDF/Druck, Kontaktformular + „Nachricht kopieren“.
- **M3 – Content & UX:** erste Kampagne (Redispatch), fünf nummerierte Schritte, Empfängertyp-Auswahl, Template pro Typ, Geschlecht in Anrede und Brieftext.
- **M4 – Landtag:** 16 Länder im Roster, 11 durchsuchbar, 6.027 PLZ; NRW mit E-Mail und Wahlkreisbüro; manueller Fallback.
- **M5 – Kommunal:** Bürgermeister:in und Landrät:in; 401 Kreise, 1.202 Verbände, 12.088 Gemeinden; PLZ-Verschnitt; GERDA-Namen als Vorschlag; vorbefülltes, editierbares Formular.
- **M6 – Netzbetreiber Strom:** Zuordnung aus MaStR-PV-Anlagen; 8.527 von 8.585 PLZ (99,3 %); Anteil und Quelle sichtbar; kein Grundversorger.
- **M7 – Anleitungs-Empfänger:** Empfänger mit reinem Webformular (z. B. Petition beim Europäischen Parlament) erhalten eine gepflegte Anleitung und Kopierfelder statt
  Adresse und Brief; kein Druck/PDF.
- **M8 – Regierung/Opposition:** Bundestagsabgeordnete zusätzlich getrennt nach Regierungs-
  und Oppositionsfraktionen (`mdb-regierung`, `mdb-opposition`) mit eigenen Musterschreiben.

**Offen (G7):** Ersatzquellen für Stadtstaaten und Landrät:innen in BW/SH; weitere Landtags-Kontakte nach dem NRW-Muster. Stadtwerke bleiben manuell.

## Kampagnen

Eine Kampagne ist ein Ordner unter `campaigns/`. Alle Inhalte werden beim Build aus Dateien gelesen – es gibt keine Datenbank und keine Laufzeit-Schnittstelle. Eine neue Kampagne lässt sich daher allein durch Dateien ergänzen.

### Änderungen am Kampagnenmodell

**Pflege-Regel:** Jede Änderung am Kampagnenmodell wird in dieser Datei dokumentiert. Das betrifft neue, geänderte oder entfernte Felder in `campaign.yaml`, Empfängertypen, Platzhalter sowie die Struktur von Templates und Anleitungen.

- Neue Felder werden bei den Pflicht- oder optionalen Feldern ergänzt und im Beispiel gezeigt.
- Geänderte Bedeutung eines Feldes wird an der bisherigen Stelle angepasst.
- Entfallene Felder und Empfängertypen werden gestrichen, damit die Referenz den tatsächlichen Stand beschreibt.

So bleibt diese Seite die verlässliche Beschreibung dessen, was eine Kampagne enthalten kann.

### Aufbau

- `campaigns/` – ein Unterordner pro Kampagne.
- `campaign.yaml` – Metadaten, Standardbetreff und Empfängertypen.
- `templates/empfaengertyp.md` – Brieftext für einen Empfängertyp; für jeden Typ in `recipients` gibt es eine Datei (der Alias `ob` nutzt `buergermeister.md`).
- `instructions/empfaengertyp.md` – Anleitung für Empfänger mit reinem Webformular (optional).

### campaign.yaml

Pflichtfelder:

- `id` – eindeutige Kennung der Kampagne; entspricht in der Regel dem Ordnernamen.
- `title` – Titel in der Kampagnenauswahl.
- `subject` – Standardbetreff; erscheint im Brief als `{{ betreff }}` und füllt das Formularfeld „Betreff“.
- `recipients` – Liste der unterstützten Empfängertypen in der Reihenfolge der Auswahl; der erste Typ ist vorausgewählt.

Optionale Felder:

- `subjects` – Betreff je Empfängertyp, z. B. `subjects.mdb` oder `subjects.landtag`. Fehlt ein Typ, gilt `subject`.
- `theme` – Thema als Tag über der Beschreibung.
- `description` – kurze Erläuterung in der Kampagnenauswahl.
- `active` – `false` blendet die Kampagne aus, ohne ihre Dateien zu löschen (Standard: `true`).
- `sort` – ganzzahlige Position in der Kampagnenauswahl, kleiner Wert zuerst. Ohne Angabe steht die Kampagne hinter den sortierten und wird dort nach Titel einsortiert.

Beispiel (gekürzt):

- `id: beispiel-kampagne`
- `sort: 1`
- `title: "Beispiel-Kampagne"`
- `subject: "Allgemeiner Betreff"`
- `subjects.mdb: "Betreff speziell für Bundestagsabgeordnete"`
- `theme: Energiewende`
- `recipients: [mdb, landtag, landrat, buergermeister, netzbetreiber]`
- `active: true`

### templates/empfaengertyp.md

- Der Dateiname entspricht dem Empfängertyp, z. B. `mdb.md` für `mdb`.
- Das Template enthält den vollständigen Brief; Absender, Empfängeranschrift, Datum und Betreff werden über Platzhalter eingesetzt.
- Der Abschnitt zwischen den Markern `kontaktformular:start` und `kontaktformular:ende` ist die Nachricht für Kontaktformular bzw. E-Mail. Fehlen die Marker, gilt der ganze Brief als Nachricht.
- `{{ betreff }}` wird mit dem Eintrag für den aktiven Empfängertyp aus `subjects` gefüllt; ohne Eintrag gilt `subject`.

### instructions/empfaengertyp.md

- Nur für Anleitungstypen wie `ep-petition`, die ausschließlich ein Webformular anbieten.
- YAML-Frontmatter: `title`, `url`, `linkLabel`, `fields` und `steps`.
- Der Markdown-Text beschreibt die Schritte; der Marker `schritte` markiert die Stelle der Schrittliste. Felder aus `fields` werden im jeweiligen Schritt direkt kopierbar angezeigt.
- Das zugehörige `templates/empfaengertyp.md` liefert den Text, der in das Webformular kopiert wird; es enthält keinen Briefkopf.

### Empfängertypen

- `mdb` – Bundestagsabgeordnete(r); Suche über die PLZ.
- `mdb-regierung` – Bundestagsabgeordnete der Regierungsfraktionen; Suche über die PLZ,
  gefiltert nach Fraktion.
- `mdb-opposition` – Bundestagsabgeordnete der Oppositionsfraktionen; Suche über die PLZ,
  gefiltert nach Fraktion, manueller Fallback.
- `landtag` – Landtagsabgeordnete(r); Suche über die PLZ, manueller Fallback.
- `landrat` – Landrätin/Landrat; Suche über die PLZ und vorbefülltes Formular.
- `buergermeister` – Bürgermeister(in); Suche über die PLZ und vorbefülltes Formular.
- `ob` – Oberbürgermeister(in); Alias auf `buergermeister`, nutzt `templates/buergermeister.md`.
- `stadtwerke` – Stadtwerke; nur manuelle Eingabe.
- `netzbetreiber` – Verteilnetzbetreiber Strom; Suche über die PLZ und vorbefülltes Formular.
- `ep-petition` – Petition beim Europäischen Parlament; Anleitung und Kopierfelder statt Brief.

### Platzhalter

- `{{ datum }}` – aktuelles Datum.
- `{{ betreff }}` – Betreff des aktiven Empfängertyps.
- `{{ absender.name }}`, `{{ absender.strasse }}`, `{{ absender.plz }}`, `{{ absender.ort }}` – Absenderdaten.
- `{{ absender.buerger }}` – Selbstbezeichnung („Bürgerin“, „Bürger“ oder „Bürger:in“).
- `{{ empfaenger.anrede }}`, `{{ empfaenger.name }}`, `{{ empfaenger.wahlkreis }}`, `{{ empfaenger.bundesland }}` – Angaben zum Empfänger.
- `{{ empfaenger.rolle }}` – geschlechtsbezogene Rollenbezeichnung, z. B. „Landrätin“/„Landrat“.
- `{{ empfaenger.organisation }}` und `{{ empfaenger.amt }}` – bei kommunalen Empfängern.
- `{{ empfaenger.netzgebiet }}`, `{{ empfaenger.anteil }}` und `{{ empfaenger.quelle }}` – bei Netzbetreibern.


