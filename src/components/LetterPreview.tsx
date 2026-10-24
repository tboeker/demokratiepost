import { useState } from 'react';
import { buildMailto, copyToClipboard, copyToClipboardSync, printLetter } from '../lib/export';
import { recipientTypeLabel } from '../lib/recipientTypes';
import type { Sender } from '../types';
import { ContactFormFields } from './ContactFormFields';

interface LetterPreviewProps {
  subject: string;
  /** Empfängertyp aus der Kampagne, z. B. "mdb". */
  recipientType?: string;
  /** Vollständiger Brief für Vorschau und Druck. */
  body: string;
  /** Nur Text und Abschlussformel für Kontaktformular/E-Mail. */
  contactBody: string;
  sender: Sender;
  recipientEmail?: string;
  contactFormUrl?: string;
  homepage?: string;
  /** Hinweis zur Amtsinhaber:in (z. B. „Stand 2021 – bitte prüfen“). */
  recipientHint?: string;
}

type ContactStatus = 'idle' | 'copied' | 'failed';

export function LetterPreview({
  subject,
  recipientType,
  body,
  contactBody,
  sender,
  recipientEmail,
  contactFormUrl,
  homepage,
  recipientHint,
}: LetterPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [contactStatus, setContactStatus] = useState<ContactStatus>('idle');

  async function handleCopy() {
    const ok = await copyToClipboard(contactBody);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 2000);
  }

  /**
   * Kopiert die Nachricht, bevor der Link das Kontaktformular in einem neuen Tab öffnet.
   * Der Klick-Handler läuft synchron, damit die Zwischenablage trotz Tab-Wechsel gefüllt wird.
   */
  function handleContactFormClick() {
    const ok = copyToClipboardSync(contactBody);
    setContactStatus(ok ? 'copied' : 'failed');
  }

  return (
    <div className="letter-block">
      <div className="letter-actions">
        <button className="button" type="button" onClick={printLetter}>
          Drucken / als PDF speichern
        </button>

        {recipientEmail ? (
          <a
            className="button button-secondary"
            href={buildMailto(recipientEmail, subject, contactBody)}
          >
            Als E-Mail öffnen
          </a>
        ) : (
          contactFormUrl && (
            <a
              className="button button-secondary"
              href={contactFormUrl}
              target="_blank"
              rel="noreferrer"
              onClick={handleContactFormClick}
            >
              Kontaktformular öffnen
            </a>
          )
        )}

        <button className="button button-secondary" type="button" onClick={handleCopy}>
          {copied ? 'Kopiert!' : 'Nachricht kopieren'}
        </button>

        {homepage && (
          <a
            className="button button-secondary"
            href={homepage}
            target="_blank"
            rel="noreferrer"
          >
            Website
          </a>
        )}
      </div>

      {!recipientEmail && contactFormUrl && contactStatus === 'copied' && (
        <p className="hint">
          Kontaktformular geöffnet – die Nachricht liegt in der Zwischenablage. Füge sie im
          Feld „Nachricht“ mit <kbd>Strg</kbd>+<kbd>V</kbd> (Mac: <kbd>⌘</kbd>+<kbd>V</kbd>) ein.
          Die übrigen Felder findest du unten zum Kopieren.
        </p>
      )}

      {!recipientEmail && contactFormUrl && contactStatus === 'failed' && (
        <p className="hint">
          Kontaktformular geöffnet. Automatisches Kopieren hat nicht geklappt – nutze
          „Nachricht kopieren“ oder die Felder unten.
        </p>
      )}

      {!recipientEmail && contactFormUrl && (
        <p className="hint">
          Der Bundestag veröffentlicht keine E-Mail-Adressen. Nutze das Kontaktformular oder
          verschicke den Brief per Post. Für das Kontaktformular wird nur der Nachrichtentext
          mit Abschlussformel verwendet – Anschriften und Datum stehen nur im Brief.
        </p>
      )}

      {!recipientEmail && !contactFormUrl && (
        <p className="hint">
          Für diesen Empfänger ist keine E-Mail-Adresse hinterlegt. Nutze den Brief
          (Drucken / als PDF speichern) oder kopiere die Nachricht für das Kontaktformular der
          Behörde.
        </p>
      )}

      {recipientHint && <p className="hint">{recipientHint}</p>}

      <div className="letter-preview">
        <div className="letter-preview-header">
          <span className="letter-preview-title">Vorschau</span>
          {recipientType && (
            <span className="tag">Empfängertyp: {recipientTypeLabel(recipientType)}</span>
          )}
        </div>
        <div className="letter" id="letter">
          <pre className="letter-text">{body}</pre>
        </div>
      </div>

      {!recipientEmail && contactFormUrl && (
        <ContactFormFields subject={subject} body={contactBody} sender={sender} />
      )}
    </div>
  );
}
