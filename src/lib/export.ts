/** Baut einen mailto-Link mit Betreff und Text. */
export function buildMailto(to: string | undefined, subject: string, body: string): string {
  const address = to ?? '';
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${address}?${query}`;
}

/** Kopiert Text in die Zwischenablage und meldet Erfolg. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Öffnet den Druckdialog (→ "Als PDF speichern" oder direkt drucken). */
export function printLetter(): void {
  window.print();
}
