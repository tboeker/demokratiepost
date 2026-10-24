import { recipientTypeLabel } from '../lib/recipientTypes';

interface RecipientTypeSelectProps {
  /** In der Kampagne unterstützte Empfängertypen (`campaign.yaml` → recipients). */
  types: string[];
  value: string;
  onChange: (recipientType: string) => void;
}

/** Schritt 3: Wahl des Empfängertyps – bestimmt das Template für die Vorschau. */
export function RecipientTypeSelect({ types, value, onChange }: RecipientTypeSelectProps) {
  return (
    <div className="field">
      <label className="label" htmlFor="recipient-type">
        Empfängertyp
      </label>
      <select
        id="recipient-type"
        className="select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {types.map((type) => (
          <option key={type} value={type}>
            {recipientTypeLabel(type)}
          </option>
        ))}
      </select>
    </div>
  );
}
