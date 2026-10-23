import type { Sender } from '../types';

// Versionierter Schlüssel: erlaubt später saubere Migrationen bei Schemaänderungen.
const STORAGE_KEY = 'meine-beschwerde.sender.v1';

export const emptySender: Sender = {
  name: '',
  strasse: '',
  plz: '',
  ort: '',
  email: '',
  telefon: '',
};

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
    const raw = localStorage.getItem(STORAGE_KEY);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sender));
  } catch {
    // z. B. wenn localStorage voll oder deaktiviert ist – still ignorieren.
  }
}

/** Löscht die gespeicherten Absenderdaten. */
export function clearSender(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignorieren
  }
}
