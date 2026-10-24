import { recipientTypeLabel } from '../lib/recipientTypes';
import type { Mandatstraeger } from '../types';

interface RecipientListProps {
  recipients: Mandatstraeger[];
  /** Empfängertyp aus der Kampagne, z. B. "mdb". */
  recipientType?: string;
  selectedId: string | null;
  onSelect: (mandat: Mandatstraeger) => void;
}

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
      {recipients.map((mandat) => (
        <li key={mandat.id}>
          <button
            type="button"
            className={`recipient ${selectedId === mandat.id ? 'recipient-active' : ''}`}
            onClick={() => onSelect(mandat)}
          >
            <span className="recipient-head">
              <span className="recipient-name">{mandat.name}</span>
              {recipientType && (
                <span className="tag">{recipientTypeLabel(recipientType)}</span>
              )}
            </span>
            <span className="recipient-meta">
              {mandat.party} ·{' '}
              {mandat.wahlkreis
                ? `Wahlkreis ${mandat.wahlkreis.number} – ${mandat.wahlkreis.name}`
                : (mandat.bundesland ?? mandat.state ?? '')}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
