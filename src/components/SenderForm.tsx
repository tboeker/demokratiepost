import type { Sender } from '../types';

interface SenderFormProps {
  sender: Sender;
  onChange: (sender: Sender) => void;
  onClear: () => void;
}

export function SenderForm({ sender, onChange, onClear }: SenderFormProps) {
  function update<K extends keyof Sender>(key: K, value: Sender[K]) {
    onChange({ ...sender, [key]: value });
  }

  return (
    <div className="sender-form">
      <div className="field-grid">
        <div className="field field-wide">
          <label className="label" htmlFor="sender-name">
            Name
          </label>
          <input
            id="sender-name"
            className="input"
            value={sender.name}
            onChange={(event) => update('name', event.target.value)}
            autoComplete="name"
          />
        </div>

        <div className="field field-wide">
          <label className="label" htmlFor="sender-strasse">
            Straße und Hausnummer
          </label>
          <input
            id="sender-strasse"
            className="input"
            value={sender.strasse}
            onChange={(event) => update('strasse', event.target.value)}
            autoComplete="street-address"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="sender-plz">
            PLZ
          </label>
          <input
            id="sender-plz"
            className="input"
            value={sender.plz}
            onChange={(event) => update('plz', event.target.value.replace(/\D/g, ''))}
            maxLength={5}
            autoComplete="postal-code"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="sender-ort">
            Ort
          </label>
          <input
            id="sender-ort"
            className="input"
            value={sender.ort}
            onChange={(event) => update('ort', event.target.value)}
            autoComplete="address-level2"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="sender-email">
            E-Mail <span className="optional">(optional)</span>
          </label>
          <input
            id="sender-email"
            className="input"
            type="email"
            value={sender.email ?? ''}
            onChange={(event) => update('email', event.target.value)}
            autoComplete="email"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="sender-telefon">
            Telefon <span className="optional">(optional)</span>
          </label>
          <input
            id="sender-telefon"
            className="input"
            value={sender.telefon ?? ''}
            onChange={(event) => update('telefon', event.target.value)}
            autoComplete="tel"
          />
        </div>
      </div>

      <div className="sender-actions">
        <button className="button button-secondary" type="button" onClick={onClear}>
          Absenderdaten löschen
        </button>
        <p className="hint">
          Deine Angaben werden nur lokal in deinem Browser gespeichert und nicht übertragen.
        </p>
      </div>
    </div>
  );
}
