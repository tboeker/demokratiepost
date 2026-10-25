import { CopyFields, type CopyField } from './CopyFields';

interface ContactFormFieldsProps {
  subject: string;
  body: string;
}

/**
 * Zeigt die Felder des Kontaktformulars vorausgefüllt an. Zum Kopieren werden nur
 * Betreff und Nachricht angeboten – die Kontaktdaten trägt der Nutzer direkt im
 * Formular ein, sie stehen bereits unter der Nachricht.
 */
export function ContactFormFields({ subject, body }: ContactFormFieldsProps) {
  const fields: CopyField[] = [
    { id: 'betreff', label: 'Betreff', value: subject },
    { id: 'nachricht', label: 'Nachricht', value: body, multiline: true },
  ];

  return (
    <CopyFields
      title="Kontaktformular ausfüllen"
      hint="Die Felder sind aus deinem Brief übernommen. Die Nachricht enthält nur den Text und die Abschlussformel – Anschriften und Datum stehen nur im Brief. Kopiere Betreff und Nachricht einzeln und füge sie im Kontaktformular ein; Name, E-Mail und Anschrift trägst du dort direkt ein."
      fields={fields}
      idPrefix="kontakt"
    />
  );
}
