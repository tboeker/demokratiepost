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
