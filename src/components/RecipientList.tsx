import type { MdB } from '../types';

interface RecipientListProps {
  recipients: MdB[];
  selectedId: string | null;
  onSelect: (mdB: MdB) => void;
}

export function RecipientList({ recipients, selectedId, onSelect }: RecipientListProps) {
  if (recipients.length === 0) {
    return <p className="hint">Keine Empfänger gefunden.</p>;
  }

  return (
    <ul className="recipient-list">
      {recipients.map((mdB) => (
        <li key={mdB.id}>
          <button
            type="button"
            className={`recipient ${selectedId === mdB.id ? 'recipient-active' : ''}`}
            onClick={() => onSelect(mdB)}
          >
            <span className="recipient-name">{mdB.name}</span>
            <span className="recipient-meta">
              {mdB.party} ·{' '}
              {mdB.wahlkreis
                ? `Wahlkreis ${mdB.wahlkreis.number} – ${mdB.wahlkreis.name}`
                : (mdB.state ?? '')}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
