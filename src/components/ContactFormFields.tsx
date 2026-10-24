import { useState } from 'react';
import { copyToClipboard } from '../lib/export';
import type { Sender } from '../types';

interface ContactFormFieldsProps {
  subject: string;
  body: string;
  sender: Sender;
}

interface Field {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
}

/**
 * Zeigt die Felder des Bundestag-Kontaktformulars vorausgefüllt an.
 * Jedes Feld hat einen eigenen Kopier-Button, weil sich das externe Formular
 * nicht direkt aus der App befüllen lässt (Cross-Origin).
 */
export function ContactFormFields({ subject, body, sender }: ContactFormFieldsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fields: Field[] = [
    { id: 'betreff', label: 'Betreff', value: subject },
    { id: 'nachricht', label: 'Nachricht', value: body, multiline: true },
    { id: 'name', label: 'Name, Vorname', value: sender.name },
    { id: 'strasse', label: 'Straße und Hausnummer', value: sender.strasse },
    { id: 'plz', label: 'Postleitzahl', value: sender.plz },
    { id: 'ort', label: 'Ort', value: sender.ort },
    { id: 'land', label: 'Land', value: 'Deutschland' },
    ...(sender.email
      ? [{ id: 'email', label: 'E-Mail', value: sender.email }]
      : []),
    ...(sender.telefon
      ? [{ id: 'telefon', label: 'Telefon', value: sender.telefon }]
      : []),
  ];

  async function handleCopy(field: Field) {
    const ok = await copyToClipboard(field.value);
    if (!ok) return;

    setCopiedId(field.id);
    window.setTimeout(() => {
      setCopiedId((current) => (current === field.id ? null : current));
    }, 2000);
  }

  return (
    <div className="copy-form">
      <h3>Kontaktformular ausfüllen</h3>
      <p className="hint">
        Die Felder sind aus deinem Brief übernommen. Kopiere sie einzeln und füge sie im
        Kontaktformular auf bundestag.de ein.
      </p>

      <div className="copy-fields">
        {fields.map((field) => (
          <div className="copy-field" key={field.id}>
            <label className="copy-field-label" htmlFor={`copy-${field.id}`}>
              {field.label}
            </label>
            <div className="copy-field-row">
              {field.multiline ? (
                <textarea
                  id={`copy-${field.id}`}
                  className="input copy-field-value copy-field-textarea"
                  value={field.value}
                  readOnly
                  rows={8}
                />
              ) : (
                <input
                  id={`copy-${field.id}`}
                  className="input copy-field-value"
                  value={field.value}
                  readOnly
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
        ))}
      </div>
    </div>
  );
}
