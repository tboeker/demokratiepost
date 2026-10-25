import type { ManualRecipient } from '../types';
import { noAutofill } from '../lib/autofill';

interface ManualRecipientFormProps {
  /** Anzeigename des gewählten Empfängertyps, z. B. "Landrätin / Landrat". */
  recipientTypeLabel: string;
  recipient: ManualRecipient;
  onChange: (recipient: ManualRecipient) => void;
  onClear: () => void;
  /**
   * M5: Das Formular ist immer sichtbar und wird beim Auswählen eines
   * Suchtreffers vorbefüllt. Der Hinweistext erklärt das.
   */
  prefill?: boolean;
  /** Die Suche war leer; das Formular ist der manuelle Fallback (z. B. landtag). */
  fallback?: boolean;
}

/**
 * Schritt 4 für Empfängertypen ohne PLZ-Suche: manuelles Empfängerformular.
 * Die Felder sind für alle Typen gleich; erfasst wird pro Typ im localStorage.
 */
export function ManualRecipientForm({
  recipientTypeLabel,
  recipient,
  onChange,
  onClear,
  prefill = false,
  fallback = false,
}: ManualRecipientFormProps) {
  function update<K extends keyof ManualRecipient>(key: K, value: ManualRecipient[K]) {
    onChange({ ...recipient, [key]: value });
  }

  return (
    <div className="sender-form">
      <p className="hint">
        {fallback
          ? `Die Suche hat für diese PLZ keine Treffer geliefert. Erfasse den Empfänger ` +
            `(Behörde oder Unternehmen) hier manuell; die Eingaben werden nur lokal in deinem ` +
            `Browser gespeichert.`
          : prefill
            ? `Wähle oben einen Treffer – Organisation, Anschrift, E-Mail und (soweit bekannt) ` +
              `Name werden hier vorbefüllt. Prüfe die Angaben und korrigiere sie bei Bedarf. ` +
              `Die Eingaben werden nur lokal in deinem Browser gespeichert.`
            : `Für ${recipientTypeLabel ? recipientTypeLabel : 'diesen Empfängertyp'} gibt es ` +
              `(noch) keine Suche – bitte Anschrift des Empfängers manuell erfassen. Die ` +
              `Eingaben werden nur lokal in deinem Browser gespeichert und beim nächsten Besuch ` +
              `dieses Typs vorausgefüllt.`}
      </p>

      <div className="field-grid">
        <div className="field field-wide">
          <label className="label" htmlFor="recipient-name">
            Name
          </label>
          <input
            id="recipient-name"
            className="input"
            value={recipient.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder="z. B. Anna Berger"
            {...noAutofill}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="recipient-anrede">
            Anrede <span className="optional">(optional)</span>
          </label>
          <input
            id="recipient-anrede"
            className="input"
            value={recipient.anrede}
            onChange={(event) => update('anrede', event.target.value)}
            placeholder="z. B. Sehr geehrte Frau Berger"
            {...noAutofill}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="recipient-organisation">
            Behörde / Organisation / Unternehmen <span className="optional">(optional)</span>
          </label>
          <input
            id="recipient-organisation"
            className="input"
            value={recipient.organisation}
            onChange={(event) => update('organisation', event.target.value)}
            placeholder="z. B. Landratsamt Musterkreis oder Netzbetreiber GmbH"
            {...noAutofill}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="recipient-amt">
            Amtsbezeichnung <span className="optional">(nur Personen, optional)</span>
          </label>
          <input
            id="recipient-amt"
            className="input"
            value={recipient.amt ?? ''}
            onChange={(event) => update('amt', event.target.value)}
            placeholder="z. B. Bürgermeisterin"
            {...noAutofill}
          />
        </div>

        <div className="field field-wide">
          <label className="label" htmlFor="recipient-strasse">
            Straße und Hausnummer
          </label>
          <input
            id="recipient-strasse"
            className="input"
            value={recipient.strasse}
            onChange={(event) => update('strasse', event.target.value)}
            placeholder="z. B. Bahnhofstraße 1"
            {...noAutofill}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="recipient-plz">
            PLZ
          </label>
          <input
            id="recipient-plz"
            className="input"
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={recipient.plz}
            onChange={(event) => update('plz', event.target.value.replace(/\D/g, ''))}
            placeholder="z. B. 10115"
            {...noAutofill}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="recipient-ort">
            Ort
          </label>
          <input
            id="recipient-ort"
            className="input"
            value={recipient.ort}
            onChange={(event) => update('ort', event.target.value)}
            placeholder="z. B. Musterstadt"
            {...noAutofill}
          />
        </div>

        <div className="field field-wide">
          <label className="label" htmlFor="recipient-email">
            E-Mail <span className="optional">(optional)</span>
          </label>
          <input
            id="recipient-email"
            className="input"
            type="email"
            value={recipient.email}
            onChange={(event) => update('email', event.target.value)}
            placeholder="z. B. poststelle@landkreis-musterkreis.de"
            {...noAutofill}
          />
        </div>
      </div>

      <div className="sender-actions">
        <button className="button button-secondary" type="button" onClick={onClear}>
          Empfängerdaten löschen
        </button>
      </div>
    </div>
  );
}
