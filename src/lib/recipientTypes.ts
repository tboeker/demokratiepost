import {
  findBuergermeisterByPlz,
  findLandratByPlz,
  findLandtagRecipientsByPlz,
  findNetzbetreiberByPlz,
  findRecipientsByPlz,
} from './lookup';
import type {
  Kommune,
  Mandatstraeger,
  Netzbetreiber,
  Recipient,
  RecipientCandidate,
} from '../types';

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
  lookup?: (plz: string) => Promise<RecipientCandidate[]>;
  /**
   * Bietet zusätzlich zum Suchfeld das manuelle Formular an, wenn die Suche
   * keine Treffer liefert (z. B. `landtag` für Bundesländer ohne Landtagsdaten
   * oder PLZ ohne besetztes Direktmandat). Die Eingaben werden dann – als
   * Ausnahme von der Regel – trotz Suche pro Typ gespeichert.
   */
  emptyFallback?: boolean;
  /**
   * Das manuelle Formular ist immer sichtbar und wird beim Auswählen eines
   * Suchtreffers mit Behörde, Anschrift, E-Mail und – soweit bekannt – Name
   * vorbefüllt (M5: `landrat`, `buergermeister`). Die Daten werden pro Typ
   * gespeichert; das Formular ist die Quelle für den Brief.
   */
  prefillForm?: boolean;
  /**
   * Reiner Anleitungstyp (M7): Der Empfänger ist nur über ein Webformular
   * erreichbar. Statt Suche und Adressformular zeigt die App die Anleitung aus
   * `campaigns/<id>/instructions/<typ>.md` samt Kopierfeldern.
   */
  instruction?: boolean;
}

const BUERGERMEISTER: RecipientTypeDef = {
  id: 'buergermeister',
  label: 'Bürgermeister(in)',
  lookup: findBuergermeisterByPlz,
  prefillForm: true,
};

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
  landrat: {
    id: 'landrat',
    label: 'Landrätin / Landrat',
    lookup: findLandratByPlz,
    prefillForm: true,
  },
  buergermeister: BUERGERMEISTER,
  // Oberbürgermeister(in) bleibt als Alias auf die Bürgermeister-Suche bestehen;
  // die konkrete Amtsbezeichnung kommt aus den Daten.
  ob: { ...BUERGERMEISTER, id: 'ob', label: 'Oberbürgermeister(in)' },
  stadtwerke: { id: 'stadtwerke', label: 'Stadtwerke' },
  netzbetreiber: {
    id: 'netzbetreiber',
    label: 'Netzbetreiber (Strom)',
    lookup: findNetzbetreiberByPlz,
    prefillForm: true,
  },
  'ep-petition': {
    id: 'ep-petition',
    label: 'Europäisches Parlament – Petition',
    instruction: true,
  },
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

/** true, wenn das manuelle Formular immer sichtbar und vorbefüllt ist (M5). */
export function hasPrefillForm(recipientType: string | undefined): boolean {
  return Boolean(recipientTypeDef(recipientType).prefillForm);
}

/** true, wenn der Typ nur über ein Webformular erreichbar ist (Anleitung, M7). */
export function hasInstruction(recipientType: string | undefined): boolean {
  return Boolean(recipientTypeDef(recipientType).instruction);
}

/** Sucht die zuständigen Empfänger eines durchsuchbaren Typs per PLZ. */
export async function lookupRecipients(
  recipientType: string | undefined,
  plz: string,
): Promise<RecipientCandidate[]> {
  const { lookup } = recipientTypeDef(recipientType);
  if (!lookup) return [];
  return lookup(plz);
}

/** Typguard: Suchtreffer (Mandatstraeger) – im Gegensatz zum manuell erfassten Empfänger. */
export function isMandat(recipient: Recipient): recipient is Mandatstraeger {
  return 'id' in recipient && 'mandate' in recipient;
}

/** Typguard: Suchtreffer ist eine kommunale Verwaltung (M5). */
export function isKommune(recipient: Recipient): recipient is Kommune {
  return 'ebene' in recipient && 'behoerde' in recipient;
}

/** Typguard: Suchtreffer ist ein Verteilnetzbetreiber (M6). */
export function isNetzbetreiber(recipient: Recipient): recipient is Netzbetreiber {
  return 'art' in recipient && recipient.art === 'netzbetreiber';
}
