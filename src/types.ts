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

/** Geschlecht für Anrede und Selbstbezeichnung im Brieftext. */
export type Geschlecht = 'f' | 'm' | 'd';

/** Absenderdaten des Nutzers (lokal im Browser gespeichert). */
export interface Sender {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  email?: string;
  telefon?: string;
  /**
   * Optional: Geschlecht für „Bürgerin“/„Bürger“ im Brieftext.
   * Ohne Angabe bleibt die neutrale Form „Bürgerin/Bürger“ stehen.
   */
  geschlecht?: Geschlecht;
}

/** Ein Bundestags- oder Landtagswahlkreis. */
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

/**
 * Ein Mandatsträger – Ergebnis der Empfängersuche. Deckt Bundestags- und
 * Landtagsabgeordnete ab (`parlament`). Nur Direktmandate (`mandate: 'direct'`)
 * sind über die PLZ auffindbar; Listenmandate werden mitgeführt.
 */
export interface Mandatstraeger {
  id: string;
  name: string;
  party: string;
  /** Geschlecht für die Anrede, falls bekannt. */
  sex?: Geschlecht;
  /** Fertige Anrede, überschreibt die automatische Bildung. */
  anrede?: string;
  /** Art des Mandats: Direktmandat (Wahlkreis) oder Listenmandat. */
  mandate: 'direct' | 'list';
  /** Wahlkreis – nur bei Direktmandat gesetzt. */
  wahlkreis?: Wahlkreis;
  /** Bundesland – bei Listenmandat (Bundestag: Landesliste). */
  state?: string;
  /** Bundesland – bei Landtagsmandaten immer gesetzt. */
  bundesland?: string;
  /** Parlament, zu dem das Mandat gehört. */
  parlament: 'bundestag' | 'landtag';
  /** Primäre Briefanschrift (Wahlkreisbüro, sonst Parlaments-/Sitzanschrift). */
  address?: Address;
  /** Alle bekannten Büros (Bundestag + Wahlkreisbüros). */
  offices?: Address[];
  /** Link zum Kontaktformular des Bundestags (ersetzt die E-Mail). */
  contactFormUrl?: string;
  /** Persönliche Homepage, falls bekannt. */
  homepage?: string;
  /** Profil beim jeweiligen Parlament bzw. auf abgeordnetenwatch.de. */
  profileUrl?: string;
  /** E-Mail-Adresse, falls für einen Empfängertyp vorhanden (z. B. NRW-Landtag). */
  email?: string;
}

/** Abwärtskompatibler Alias für {@link Mandatstraeger}. */
export type MdB = Mandatstraeger;

/** Ebene einer kommunalen Verwaltung. */
export type KommuneEbene = 'gemeinde' | 'verband' | 'kreis';

/**
 * Kommunale Verwaltung (M5) – Ergebnis der Suche nach Bürgermeister:in oder
 * Landrät:in. Die Behördenanschrift und E-Mail stammen aus dem amtlichen
 * Anschriftenverzeichnis, der Name (soweit vorhanden) aus GERDA. Der Name ist
 * ein Vorschlag, nie amtlich – das Formular bleibt immer editierbar.
 */
export interface Kommune {
  id: string;
  /** Behördenzeile, z. B. "Stadt Köln", "Landratsamt Musterkreis". */
  behoerde: string;
  /** Amtsbezeichnung, z. B. "Bürgermeisterin", "Landrät:in". */
  amt?: string;
  /** Name der Amtsinhaber:in, falls verifiziert. */
  name?: string;
  partei?: string;
  /** Geschlecht nur bei verlässlicher Quelle (für die Anrede). */
  sex?: Geschlecht;
  /** Fertige Anrede, z. B. "Sehr geehrte Frau Bürgermeisterin Berger". */
  anrede?: string;
  address: Address;
  email?: string;
  ebene: KommuneEbene;
  /** Jahr der letzten Wahl der Amtsinhaber:in. */
  wahljahr?: number;
  /** Datenquelle, z. B. "GERDA mayoral_candidates.csv (…)". */
  quelle?: string;
  /** Hinweis zur Verlässlichkeit/Prüfung, z. B. "nicht verifiziert". */
  hinweis?: string;
  einwohner?: number;
  /** Amtlicher Regionalschlüssel (Kreis 5-, Verband 9-, Gemeinde 12-stellig). */
  ars: string;
  /** Amtlicher Gemeindeschlüssel (8-stellig), soweit vorhanden. */
  ags?: string;
  /** Kreis-ARS (5-stellig). */
  kreisArs?: string;
  /** Verbands-ARS (9-stellig), falls die Gemeinde in einem Verband liegt. */
  verbandArs?: string;
  /** Bundesland. */
  land?: string;
  /** Nur bei Kreisen: true, wenn dort eine Landrätin/ein Landrat amtiert. */
  landratCapable?: boolean;
}

/** Suchtreffer: Mandatsträger oder kommunale Verwaltung. */
export type RecipientCandidate = Mandatstraeger | Kommune;

/**
 * Manuell erfasster Empfänger – für Typen ohne PLZ-Suche (z. B. Stadtwerke)
 * sowie als vorbefülltes, editierbares Formular für kommunale Typen (M5).
 */
export interface ManualRecipient {
  /** Fertige Anrede; leer → automatische Anrede aus dem Namen. */
  anrede: string;
  name: string;
  /** Amtsbezeichnung, z. B. "Bürgermeisterin". */
  amt?: string;
  /** Behörde/Organisation, z. B. "Landkreis Musterstadt". */
  organisation: string;
  strasse: string;
  plz: string;
  ort: string;
  email: string;
}

/** Empfänger: Suchtreffer (Mandat/Kommune) oder manuell erfasst. */
export type Recipient = RecipientCandidate | ManualRecipient;

/** Zuordnung Postleitzahl -> Liste von Wahlkreis-Nummern. */
export type PlzIndex = Record<string, number[]>;
