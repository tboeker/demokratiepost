import type { Sender } from '../types';

// Versionierter Schlüssel: erlaubt später saubere Migrationen bei Schemaänderungen.
export const SENDER_STORAGE_KEY = 'demokratiepost.sender.v1';

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
