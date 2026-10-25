import { useState } from 'react';
import { copyToClipboard } from '../lib/export';
import { noAutofill } from '../lib/autofill';

/** Ein vorausgefülltes Feld mit eigenem Kopier-Button. */
export interface CopyField {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  /** Zusatzhinweis unter der Feldbezeichnung. */
  note?: string;
}

interface CopyFieldItemProps {
  field: CopyField;
  /** Präfix für die Feld-IDs, damit mehrere Formulare eindeutig bleiben. */
  idPrefix?: string;
}

/**
 * Ein einzelnes Feld zum Kopieren. Weil sich externe Formulare (Cross-Origin)
 * nicht direkt aus der App befüllen lassen, gibt es pro Feld einen eigenen
 * Kopier-Button; nach dem Kopieren erscheint ein grüner Haken.
 */
export function CopyFieldItem({ field, idPrefix = 'copy' }: CopyFieldItemProps) {
  const [copied, setCopied] = useState(false);
  const inputId = `${idPrefix}-${field.id}`;

  async function handleCopy() {
    const ok = await copyToClipboard(field.value);
    if (ok) setCopied(true);
  }

  return (
    <div className="copy-field">
      <label className="copy-field-label" htmlFor={inputId}>
        {field.label}
      </label>
      {field.note && <p className="copy-field-note">{field.note}</p>}
      <div className="copy-field-row">
        {field.multiline ? (
          <textarea
            id={inputId}
            className="input copy-field-value copy-field-textarea"
            value={field.value}
            readOnly
            rows={10}
            {...noAutofill}
          />
        ) : (
          <input
            id={inputId}
            className="input copy-field-value"
            value={field.value}
            readOnly
            {...noAutofill}
          />
        )}
        <div className="action-with-status">
          <button
            type="button"
            className="button button-secondary copy-field-button"
            onClick={handleCopy}
          >
            Kopieren
          </button>
          <span className="action-status" role="status">
            {copied && (
              <>
                <span className="action-check" aria-hidden="true">
                  ✓
                </span>
                <span className="visually-hidden">Kopiert</span>
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

interface CopyFieldsProps {
  title?: string;
  hint?: string;
  fields: CopyField[];
  /** Präfix für die Feld-IDs, damit mehrere Formulare eindeutig bleiben. */
  idPrefix?: string;
}

/**
 * Zeigt Felder eines externen Formulars vorausgefüllt an. Jedes Feld hat einen
 * eigenen Kopier-Button, weil sich externe Formulare (Cross-Origin) nicht
 * direkt aus der App befüllen lassen.
 */
export function CopyFields({ title, hint, fields, idPrefix = 'copy' }: CopyFieldsProps) {
  return (
    <div className="copy-form">
      {title && <h3>{title}</h3>}
      {hint && <p className="hint">{hint}</p>}

      <div className="copy-fields">
        {fields.map((field) => (
          <CopyFieldItem key={field.id} field={field} idPrefix={idPrefix} />
        ))}
      </div>
    </div>
  );
}
