import { findLandtagRecipientsByPlz, findRecipientsByPlz } from './lookup';
import type { Mandatstraeger, Recipient } from '../types';

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
  lookup?: (plz: string) => Promise<Mandatstraeger[]>;
  /**
   * Bietet zusätzlich zum Suchfeld das manuelle Formular an, wenn die Suche
   * keine Treffer liefert (z. B. `landtag` für Bundesländer ohne Landtagsdaten
   * oder PLZ ohne besetztes Direktmandat). Die Eingaben werden dann – als
   * Ausnahme von der Regel – trotz Suche pro Typ gespeichert.
   */
  emptyFallback?: boolean;
}

/**
 * Registry der unterstützten Typen. Einzel-Details zum Ablauf: PLAN.md,
 * Abschnitt *User-Workflow (fünf Schritte)*.
 */
const RECIPIENT_TYPES: Record<string, RecipientTypeDef> = {
  mdb: { id: 'mdb', label: 'Bundestagsabgeordnete(r)', lookup: findRecipientsByPlz },
  landtag: {
    id: 'landtag',
    label: 'Landtagsabgeordnete(r)',
    lookup: findLandtagRecipientsByPlz,
    emptyFallback: true,
  },
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

/** true, wenn bei leerer Suche das manuelle Formular angeboten wird. */
export function hasEmptyFallback(recipientType: string | undefined): boolean {
  return Boolean(recipientTypeDef(recipientType).emptyFallback);
}

/** Sucht die zuständigen Empfänger eines durchsuchbaren Typs per PLZ. */
export async function lookupRecipients(
  recipientType: string | undefined,
  plz: string,
): Promise<Mandatstraeger[]> {
  const { lookup } = recipientTypeDef(recipientType);
  if (!lookup) return [];
  return lookup(plz);
}

/** Typguard: Suchtreffer (Mandatstraeger) – im Gegensatz zum manuell erfassten Empfänger. */
export function isMandat(recipient: Recipient): recipient is Mandatstraeger {
  return 'id' in recipient && 'mandate' in recipient;
}
