import type { Sender } from '../types';
import { CopyFields, type CopyField } from './CopyFields';

interface ContactFormFieldsProps {
  subject: string;
  body: string;
  sender: Sender;
}

/**
 * Zeigt die Felder des Bundestag-Kontaktformulars vorausgefüllt an.
 * Die Felder sind aus deinem Brief übernommen; die Nachricht enthält nur den
 * Text und die Abschlussformel.
 */
export function ContactFormFields({ subject, body, sender }: ContactFormFieldsProps) {
  const fields: CopyField[] = [
    { id: 'betreff', label: 'Betreff', value: subject },
    { id: 'nachricht', label: 'Nachricht', value: body, multiline: true },
    { id: 'name', label: 'Name, Vorname', value: sender.name },
    { id: 'strasse', label: 'Straße und Hausnummer', value: sender.strasse },
    { id: 'plz', label: 'Postleitzahl', value: sender.plz },
    { id: 'ort', label: 'Ort', value: sender.ort },
    { id: 'land', label: 'Land', value: 'Deutschland' },
    ...(sender.email ? [{ id: 'email', label: 'E-Mail', value: sender.email }] : []),
    ...(sender.telefon
      ? [{ id: 'telefon', label: 'Telefon', value: sender.telefon }]
      : []),
  ];

  return (
    <CopyFields
      title="Kontaktformular ausfüllen"
      hint="Die Felder sind aus deinem Brief übernommen. Die Nachricht enthält nur den Text und die Abschlussformel – Anschriften und Datum stehen nur im Brief. Kopiere die Felder einzeln und füge sie im Kontaktformular auf bundestag.de ein."
      fields={fields}
      idPrefix="kontakt"
    />
  );
}
