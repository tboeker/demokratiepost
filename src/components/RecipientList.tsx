import { isKommune, recipientTypeLabel } from '../lib/recipientTypes';
import type { RecipientCandidate } from '../types';

interface RecipientListProps {
  recipients: RecipientCandidate[];
  /** Empfängertyp aus der Kampagne, z. B. "mdb". */
  recipientType?: string;
  selectedId: string | null;
  onSelect: (recipient: RecipientCandidate) => void;
}

const EBENE_LABEL: Record<string, string> = {
  gemeinde: 'Gemeinde',
  verband: 'Gemeindeverband',
  kreis: 'Kreis',
};

export function RecipientList({
  recipients,
  recipientType,
  selectedId,
  onSelect,
}: RecipientListProps) {
  if (recipients.length === 0) {
    return <p className="hint">Keine Empfänger gefunden.</p>;
  }

  return (
    <ul className="recipient-list">
      {recipients.map((recipient) => {
        const active = selectedId === recipient.id;
        if (isKommune(recipient)) {
          const address = [
            recipient.address.strasse,
            [recipient.address.plz, recipient.address.ort].filter(Boolean).join(' '),
          ]
            .filter(Boolean)
            .join(', ');
          const person = [recipient.amt, recipient.name].filter(Boolean).join(' ');
          return (
            <li key={recipient.id}>
              <button
                type="button"
                className={`recipient ${active ? 'recipient-active' : ''}`}
                onClick={() => onSelect(recipient)}
              >
                <span className="recipient-head">
                  <span className="recipient-name">{recipient.behoerde}</span>
                  <span className="tag">{recipientTypeLabel(recipientType)}</span>
                </span>
                <span className="recipient-meta">
                  {EBENE_LABEL[recipient.ebene] ?? recipient.ebene}
                  {person ? ` · ${person}` : ' · Name nicht in den Daten'}
                </span>
                {address && <span className="recipient-meta">{address}</span>}
                {recipient.email && (
                  <span className="recipient-meta">E-Mail: {recipient.email}</span>
                )}
                {recipient.wahljahr && (
                  <span className="recipient-meta">
                    Amtsträger: Stand {recipient.wahljahr} – bitte prüfen
                  </span>
                )}
                {recipient.hinweis && (
                  <span className="recipient-hint">{recipient.hinweis}</span>
                )}
              </button>
            </li>
          );
        }

        return (
          <li key={recipient.id}>
            <button
              type="button"
              className={`recipient ${active ? 'recipient-active' : ''}`}
              onClick={() => onSelect(recipient)}
            >
              <span className="recipient-head">
                <span className="recipient-name">{recipient.name}</span>
                {recipientType && (
                  <span className="tag">{recipientTypeLabel(recipientType)}</span>
                )}
              </span>
              <span className="recipient-meta">
                {recipient.party} ·{' '}
                {recipient.wahlkreis
                  ? `Wahlkreis ${recipient.wahlkreis.number} – ${recipient.wahlkreis.name}`
                  : (recipient.bundesland ?? recipient.state ?? '')}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
