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
