# Die Idee

**Demokratiepost** macht politische Musterschreiben in wenigen Sekunden versandfertig.

Gutachter Kail veröffentlicht auf YouTube Videos zu Stromnetzen und erneuerbaren Energien.
Zu seinen Videos stellt er **Musterschreiben** bereit, mit denen Bürgerinnen und Bürger sich
bei politischen Akteuren Gehör verschaffen sollen. Diese Schreiben sind allerdings
Rohvorlagen: Der passende Empfänger muss selbst gefunden, die eigenen Daten müssen
eingetragen und alles druckfertig aufbereitet werden.

Genau diese Hürden nimmt die Seite ab.

## Das Problem

Vor dem Versand steht man jedes Mal vor denselben Aufgaben:

1. den **richtigen Empfänger** für den eigenen Wohnort herausfinden,
2. **Absender- und Empfängerdaten** in die Vorlage eintragen,
3. das Ganze **druckfertig oder als Nachricht** aufbereiten.

Das kostet Zeit – und viele Schreiben erreichen ihr Ziel deshalb gar nicht erst.

## Die Lösung

> **Postleitzahl eingeben → Kampagne wählen → fertigen Brief erhalten.**

Anhand der Postleitzahl werden die zuständigen Empfänger automatisch ermittelt. Das passende
Musterschreiben wird mit den eigenen Daten befüllt und kann direkt gedruckt, kopiert oder über
das Kontaktformular versendet werden.

Das Ziel: **möglichst große Reichweite durch eine möglichst kleine Hürde.**

## So funktioniert es

1. **PLZ eingeben** – zum Beispiel `10115`.
2. **Kampagne auswählen** – das Thema, zu dem du schreiben möchtest.
3. **Empfänger anzeigen** – die zuständigen Akteure für deine PLZ werden aufgelistet.
4. **Schreiben prüfen** – die Vorlage wird automatisch mit Absender- und Empfängerdaten gefüllt.
5. **Versenden** – als PDF-Brief zum Ausdrucken, über das Kontaktformular oder als
   kopierbaren Text. Bei Empfängern mit reinem Webformular (z. B. dem Petitionsportal
   des Europäischen Parlaments) zeigt die App stattdessen eine Anleitung und die
   auszufüllenden Angaben.

## Was die Seite leistet

- **Kein Backend:** Alles läuft direkt im Browser.
- **Kein Tracking:** Es werden keine Nutzungsdaten erhoben.
- **Lokale Daten:** Absenderdaten bleiben auf deinem Gerät und lassen sich jederzeit löschen.
- **Freie Inhalte:** Kampagnen und Musterschreiben liegen als Dateien im Repository und können
  transparent nachvollzogen werden.

## Projektverlauf

Stand Oktober 2026: Der Fünf-Schritte-Ablauf steht, M1–M7 sind umgesetzt.

- **M1 – Gerüst:** Vite + React + TypeScript, GitHub-Pages-Deploy, Kampagnen-Loader,
  Platzhalter-Engine.
- **M2 – Bundestag:** PLZ → Wahlkreis → Direktmandat, Absenderdaten lokal gespeichert,
  Briefvorschau, PDF/Druck, Kontaktformular + „Nachricht kopieren“.
- **M3 – Content & UX:** erste Kampagne (Redispatch), fünf nummerierte Schritte,
  Empfängertyp-Auswahl, Template pro Typ, Geschlecht in Anrede und Brieftext.
- **M4 – Landtag:** 16 Länder im Roster, 11 durchsuchbar, 6.027 PLZ; NRW mit E-Mail und
  Wahlkreisbüro; manueller Fallback.
- **M5 – Kommunal:** Bürgermeister:in und Landrät:in; 401 Kreise, 1.202 Verbände,
  12.088 Gemeinden; PLZ-Verschnitt; GERDA-Namen als Vorschlag; vorbefülltes, editierbares
  Formular.
- **M6 – Netzbetreiber Strom:** Zuordnung aus MaStR-PV-Anlagen; 8.527 von 8.585 PLZ
  (99,3 %); Anteil und Quelle sichtbar; kein Grundversorger.
- **M7 – Anleitungs-Empfänger:** Empfänger mit reinem Webformular (z. B. Petition beim
  Europäischen Parlament) erhalten eine gepflegte Anleitung und Kopierfelder statt
  Adresse und Brief; kein Druck/PDF.

**Offen (G7):** Ersatzquellen für Stadtstaaten und Landrät:innen in BW/SH; weitere
Landtags-Kontakte nach dem NRW-Muster. Stadtwerke bleiben manuell.
