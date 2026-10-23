/** Metadaten einer Kampagne, wie sie in `campaign.yaml` steht. */
export interface CampaignMeta {
  /** Eindeutige ID, z. B. "stromnetz-2026". */
  id: string;
  /** Anzeigetitel der Kampagne. */
  title: string;
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

/** Ein Bundestagsabgeordneter (Empfänger). */
export interface MdB {
  id: string;
  name: string;
  party: string;
  /** Geschlecht für die Anrede, falls bekannt. */
  sex?: 'm' | 'f';
  /** Fertige Anrede, überschreibt die automatische Bildung. */
  anrede?: string;
  wahlkreis: Wahlkreis;
  /** Primäre Briefanschrift (Wahlkreisbüro, sonst Bundestagsbüro). */
  address?: Address;
  /** Alle bekannten Büros (Bundestag + Wahlkreisbüros). */
  offices?: Address[];
  /** Link zum Kontaktformular des Bundestags (ersetzt die E-Mail). */
  contactFormUrl?: string;
  /** Persönliche Homepage, falls bekannt. */
  homepage?: string;
  /** E-Mail-Adresse, falls für einen Empfängertyp vorhanden. */
  email?: string;
}

/** Zuordnung Postleitzahl -> Liste von Wahlkreis-Nummern. */
export type PlzIndex = Record<string, number[]>;
