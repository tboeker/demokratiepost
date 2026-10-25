import { useState } from 'react';
import { copyToClipboard } from '../lib/export';

/** Ein vorausgefülltes Feld mit eigenem Kopier-Button. */
export interface CopyField {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  /** Zusatzhinweis unter der Feldbezeichnung. */
  note?: string;
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCopy(field: CopyField) {
    const ok = await copyToClipboard(field.value);
    if (!ok) return;

    setCopiedId(field.id);
    window.setTimeout(() => {
      setCopiedId((current) => (current === field.id ? null : current));
    }, 2000);
  }

  return (
    <div className="copy-form">
      {title && <h3>{title}</h3>}
      {hint && <p className="hint">{hint}</p>}

      <div className="copy-fields">
        {fields.map((field) => {
          const inputId = `${idPrefix}-${field.id}`;
          return (
            <div className="copy-field" key={field.id}>
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
                    autoComplete="off"
                    data-bwignore="true"
                  />
                ) : (
                  <input
                    id={inputId}
                    className="input copy-field-value"
                    value={field.value}
                    readOnly
                    autoComplete="off"
                    data-bwignore="true"
                  />
                )}
                <button
                  type="button"
                  className="button button-secondary copy-field-button"
                  onClick={() => handleCopy(field)}
                >
                  {copiedId === field.id ? 'Kopiert!' : 'Kopieren'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
