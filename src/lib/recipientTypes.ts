import { findRecipientsByPlz } from './lookup';
import type { MdB, Recipient } from '../types';

/** Definition eines in der App unterstützten Empfängertyps. */
export interface RecipientTypeDef {
  /** Eindeutiger Schlüssel, z. B. "mdb". Entspricht `campaign.yaml` (`recipients`). */
  id: string;
  /** Sichtbarer Name in Typ-Auswahl und Vorschau. */
  label: string;
  /**
   * Lookup für die PLZ-Suche. Fehlt er (z. B. bei neuen Typen), werden die
   * Empfänger über das manuelle Formular erfasst – ohne Code-Änderung.
   */
  lookup?: (plz: string) => Promise<MdB[]>;
}

/**
 * Registry der unterstützten Typen. Einzel-Details zum Ablauf: PLAN.md,
 * Abschnitt *User-Workflow (fünf Schritte)*.
 */
const RECIPIENT_TYPES: Record<string, RecipientTypeDef> = {
  mdb: { id: 'mdb', label: 'Bundestagsabgeordnete(r)', lookup: findRecipientsByPlz },
  landtag: { id: 'landtag', label: 'Landtagsabgeordnete(r)' },
  landrat: { id: 'landrat', label: 'Landrätin / Landrat' },
  buergermeister: { id: 'buergermeister', label: 'Bürgermeister(in)' },
  ob: { id: 'ob', label: 'Oberbürgermeister(in)' },
  stadtwerke: { id: 'stadtwerke', label: 'Stadtwerke' },
  netzbetreiber: { id: 'netzbetreiber', label: 'Netzbetreiber' },
};

/** Liefert die Definition eines Typs; unbekannte Typen haben keinen Lookup. */
export function recipientTypeDef(recipientType: string | undefined): RecipientTypeDef {
  if (recipientType && RECIPIENT_TYPES[recipientType]) return RECIPIENT_TYPES[recipientType];
  return {
    id: recipientType ?? '',
    label: (recipientType ?? '').toUpperCase(),
  };
}

/** Anzeigename eines Empfängertyps (leer für undefinierten Typ). */
export function recipientTypeLabel(recipientType: string | undefined): string {
  return recipientTypeDef(recipientType).label;
}

/** true, wenn der Typ über die PLZ durchsucht werden kann (Lookup hinterlegt). */
export function isSearchable(recipientType: string | undefined): boolean {
  return Boolean(recipientTypeDef(recipientType).lookup);
}

/** Sucht die zuständigen Empfänger eines durchsuchbaren Typs per PLZ. */
export async function lookupRecipients(
  recipientType: string | undefined,
  plz: string,
): Promise<MdB[]> {
  const { lookup } = recipientTypeDef(recipientType);
  if (!lookup) return [];
  return lookup(plz);
}

/** Typguard: Suchtreffer (MdB) – im Gegensatz zum manuell erfassten Empfänger. */
export function isMdB(recipient: Recipient): recipient is MdB {
  return 'id' in recipient && 'mandate' in recipient;
}
