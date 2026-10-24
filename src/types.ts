/** Metadaten einer Kampagne, wie sie in `campaign.yaml` steht. */
export interface CampaignMeta {
  /** Eindeutige ID, z. B. "stromnetz-2026". */
  id: string;
  /** Anzeigetitel der Kampagne. */
  title: string;
  /** Betreff des Briefes (Platzhalter `{{ betreff }}` und Formularfeld „Betreff“). */
  subject: string;
  /** Übergeordnetes Thema, z. B. "Energiewende". */
  theme?: string;
  /** Kurzbeschreibung für die Auswahl. */
  description?: string;
  /** Unterstützte Empfängertypen, z. B. ["mdb"]. */
  recipients: string[];
}

/** Eine vollständig geladene Kampagne inkl. ihrer Template-Texte. */
export interface Campaign extends CampaignMeta {
  /** Ordnername der Kampagne (für Debug/Anzeige). */
  dir: string;
  /** Empfängertyp -> Markdown-Template. */
  templates: Record<string, string>;
}

/** Daten, mit denen Platzhalter in einem Template gefüllt werden. */
export type TemplateContext = Record<string, unknown>;

/** Absenderdaten des Nutzers (lokal im Browser gespeichert). */
export interface Sender {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  email?: string;
  telefon?: string;
}

/** Ein Bundestagswahlkreis. */
export interface Wahlkreis {
  number: number;
  name: string;
}

/** Eine Postanschrift. */
export interface Address {
  strasse?: string;
  plz?: string;
  ort?: string;
  /** Bezeichnung, z. B. "Wahlkreisbüro Köln-Innenstadt". */
  label?: string;
}

/** Ein Bundestagsabgeordneter (Ergebnis der Empfängersuche, Typ "mdb"). */
export interface MdB {
  id: string;
  name: string;
  party: string;
  /** Geschlecht für die Anrede, falls bekannt. */
  sex?: 'm' | 'f';
  /** Fertige Anrede, überschreibt die automatische Bildung. */
  anrede?: string;
  /** Art des Mandats: Direktmandat (Wahlkreis) oder Listenmandat (Landesliste). */
  mandate: 'direct' | 'list';
  /** Wahlkreis – nur bei Direktmandat gesetzt. */
  wahlkreis?: Wahlkreis;
  /** Bundesland – nur bei Listenmandat gesetzt. */
  state?: string;
  /** Primäre Briefanschrift (Wahlkreisbüro, sonst Bundestagsbüro). */
  address?: Address;
  /** Alle bekannten Büros (Bundestag + Wahlkreisbüros). */
  offices?: Address[];
  /** Link zum Kontaktformular des Bundestags (ersetzt die E-Mail). */
  contactFormUrl?: string;
  /** Persönliche Homepage, falls bekannt. */
  homepage?: string;
  /** Profil auf bundestag.de. */
  profileUrl?: string;
  /** E-Mail-Adresse, falls für einen Empfängertyp vorhanden. */
  email?: string;
}

/**
 * Manuell erfasster Empfänger – für Typen ohne PLZ-Suche (z. B. Landrat,
 * Bürgermeister, Stadtwerke). Felder sind für alle Typen gleich (siehe PLAN.md).
 */
export interface ManualRecipient {
  /** Fertige Anrede; leer → automatische Anrede aus dem Namen. */
  anrede: string;
  name: string;
  /** Behörde/Organisation, z. B. "Landkreis Musterstadt". */
  organisation: string;
  strasse: string;
  plz: string;
  ort: string;
  email: string;
}

/** Empfänger: Suchtreffer (MdB) oder manuell erfasst. */
export type Recipient = MdB | ManualRecipient;

/** Zuordnung Postleitzahl -> Liste von Wahlkreis-Nummern. */
export type PlzIndex = Record<string, number[]>;
