/** Anzeigenamen für die Empfängertypen aus `campaign.yaml` (`recipients`). */
const RECIPIENT_TYPE_LABELS: Record<string, string> = {
  mdb: 'MdB',
};

/**
 * Liefert die sichtbare Bezeichnung eines Empfängertyps.
 * Unbekannte Typen werden unverändert in Großbuchstaben angezeigt.
 */
export function recipientTypeLabel(recipientType: string | undefined): string {
  if (!recipientType) return '';
  return RECIPIENT_TYPE_LABELS[recipientType] ?? recipientType.toUpperCase();
}
