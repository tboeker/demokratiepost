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

/**
 * Kopiert Text synchron in die Zwischenablage.
 *
 * Wird benötigt, wenn im selben Klick ein neuer Tab geöffnet wird: Die asynchrone
 * Clipboard-API verweigert danach oft den Dienst, weil das Dokument den Fokus verliert.
 */
export function copyToClipboardSync(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  document.body.removeChild(textarea);
  return ok;
}

/** Öffnet den Druckdialog (→ "Als PDF speichern" oder direkt drucken). */
export function printLetter(): void {
  window.print();
}
