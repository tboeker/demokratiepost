import type { ManualRecipient, RecipientCandidate, Sender } from '../types';

// Versionierter Schlüssel: erlaubt später saubere Migrationen bei Schemaänderungen.
export const SENDER_STORAGE_KEY = 'demokratiepost.sender.v1';

/** Präfix für die pro Empfängertyp gespeicherten, manuell erfassten Empfänger. */
export const RECIPIENT_STORAGE_PREFIX = 'demokratiepost.empfaenger';

/** Präfix für den zuletzt ausgewählten Suchtreffer pro Empfängertyp. */
export const SELECTED_RECIPIENT_STORAGE_PREFIX = 'demokratiepost.auswahl';

/** localStorage-Key für die Empfängerdaten eines Typs, z. B. "landrat". */
export function recipientStorageKey(recipientType: string): string {
  return `${RECIPIENT_STORAGE_PREFIX}.${recipientType}.v1`;
}

/** localStorage-Key für den ausgewählten Suchtreffer eines Typs, z. B. "mdb". */
export function selectedRecipientStorageKey(recipientType: string): string {
  return `${SELECTED_RECIPIENT_STORAGE_PREFIX}.${recipientType}.v1`;
}

export const emptySender: Sender = {
  name: '',
  strasse: '',
  plz: '',
  ort: '',
  email: '',
  telefon: '',
};

/**
 * Vorbelegung, wenn noch keine Absenderdaten gespeichert sind.
 * Erleichtert Test und Demo – die Werte sind frei erfunden.
 */
export const prefilledSender: Sender = {
  name: 'Max Mustermann',
  strasse: 'Musterstraße 1',
  plz: '10115',
  ort: 'Berlin',
  email: 'max.mustermann@example.org',
  telefon: '030 12345678',
};

/** Prüft, ob überhaupt Absenderdaten eingegeben wurden (für den Speicher-Hinweis). */
export function hasSenderData(sender: Sender): boolean {
  return [sender.name, sender.strasse, sender.plz, sender.ort, sender.email, sender.telefon].some(
    (value) => (value ?? '').trim() !== '',
  );
}

/** Prüft, ob alle Pflichtfelder des Absenders gefüllt sind. */
export function isSenderComplete(sender: Sender): boolean {
  return Boolean(
    sender.name.trim() &&
      sender.strasse.trim() &&
      sender.plz.trim() &&
      sender.ort.trim(),
  );
}

/** Liest die gespeicherten Absenderdaten aus dem localStorage. */
export function loadSender(): Sender | null {
  try {
    const raw = localStorage.getItem(SENDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Sender>;
    return { ...emptySender, ...parsed };
  } catch {
    // Defekte oder nicht lesbare Daten ignorieren.
    return null;
  }
}

/** Speichert die Absenderdaten im localStorage. */
export function saveSender(sender: Sender): void {
  try {
    localStorage.setItem(SENDER_STORAGE_KEY, JSON.stringify(sender));
  } catch {
    // z. B. wenn localStorage voll oder deaktiviert ist – still ignorieren.
  }
}

/** Löscht die gespeicherten Absenderdaten. */
export function clearSender(): void {
  try {
    localStorage.removeItem(SENDER_STORAGE_KEY);
  } catch {
    // ignorieren
  }
}

/** Leere Vorlage für einen manuell erfassten Empfänger. */
export const emptyManualRecipient: ManualRecipient = {
  anrede: '',
  name: '',
  amt: '',
  organisation: '',
  strasse: '',
  plz: '',
  ort: '',
  email: '',
};

/** Prüft, ob in einem manuellen Empfängerform überhaupt etwas eingegeben wurde. */
export function hasRecipientData(recipient: ManualRecipient): boolean {
  return Object.values(recipient).some((value) => (value ?? '').trim() !== '');
}

/**
 * Prüft, ob der manuelle Empfänger für den Brief ausreicht. Ein Behördenbrief
 * ohne Namen ist ein gültiger Standardfall – dann muss die Organisation
 * (Behörde) gesetzt sein. Anschrift ist immer erforderlich.
 */
export function isRecipientComplete(recipient: ManualRecipient): boolean {
  const hasAddressee = Boolean(recipient.name.trim() || recipient.organisation.trim());
  return Boolean(
    hasAddressee && recipient.strasse.trim() && recipient.plz.trim() && recipient.ort.trim(),
  );
}

/** Liest die gespeicherten Empfängerdaten eines Typs aus dem localStorage. */
export function loadRecipientData(recipientType: string): ManualRecipient | null {
  try {
    const raw = localStorage.getItem(recipientStorageKey(recipientType));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ManualRecipient>;
    return { ...emptyManualRecipient, ...parsed };
  } catch {
    // Defekte oder nicht lesbare Daten ignorieren.
    return null;
  }
}

/** Speichert die Empfängerdaten eines Typs im localStorage. */
export function saveRecipientData(recipientType: string, recipient: ManualRecipient): void {
  try {
    localStorage.setItem(recipientStorageKey(recipientType), JSON.stringify(recipient));
  } catch {
    // z. B. wenn localStorage voll oder deaktiviert ist – still ignorieren.
  }
}

/** Löscht die gespeicherten Empfängerdaten eines Typs. */
export function clearRecipientData(recipientType: string): void {
  try {
    localStorage.removeItem(recipientStorageKey(recipientType));
  } catch {
    // ignorieren
  }
}

/**
 * Liest den zuletzt ausgewählten Suchtreffer eines Typs. Der Treffer wird
 * unverändert gespeichert und beim Zurückwechseln zum Typ wieder angezeigt.
 */
export function loadSelectedRecipient(recipientType: string): RecipientCandidate | null {
  try {
    const raw = localStorage.getItem(selectedRecipientStorageKey(recipientType));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.id !== 'string') return null;
    // Nur bekannte Suchtreffer-Formen akzeptieren (Mandat, Kommune, Netzbetreiber).
    const known =
      'mandate' in parsed || 'behoerde' in parsed || parsed.art === 'netzbetreiber';
    if (!known) return null;
    return parsed as unknown as RecipientCandidate;
  } catch {
    // Defekte oder nicht lesbare Daten ignorieren.
    return null;
  }
}

/** Speichert den ausgewählten Suchtreffer eines Typs im localStorage. */
export function saveSelectedRecipient(
  recipientType: string,
  recipient: RecipientCandidate,
): void {
  try {
    localStorage.setItem(selectedRecipientStorageKey(recipientType), JSON.stringify(recipient));
  } catch {
    // z. B. wenn localStorage voll oder deaktiviert ist – still ignorieren.
  }
}

/** Löscht den gespeicherten Suchtreffer eines Typs. */
export function clearSelectedRecipient(recipientType: string): void {
  try {
    localStorage.removeItem(selectedRecipientStorageKey(recipientType));
  } catch {
    // ignorieren
  }
}

/** true, wenn für mindestens einen der Typen Empfängerdaten gespeichert sind. */
export function hasStoredRecipientData(recipientTypes: string[]): boolean {
  return recipientTypes.some((type) => {
    const stored = loadRecipientData(type);
    if (stored !== null && hasRecipientData(stored)) return true;
    return loadSelectedRecipient(type) !== null;
  });
}
