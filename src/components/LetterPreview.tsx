import { useState } from 'react';
import { buildMailto, copyToClipboard, copyToClipboardSync, printLetter } from '../lib/export';
import type { Sender } from '../types';
import { ContactFormFields } from './ContactFormFields';

interface LetterPreviewProps {
  subject: string;
  body: string;
  sender: Sender;
  recipientEmail?: string;
  contactFormUrl?: string;
  homepage?: string;
}

type ContactStatus = 'idle' | 'copied' | 'failed';

export function LetterPreview({
  subject,
  body,
  sender,
  recipientEmail,
  contactFormUrl,
  homepage,
}: LetterPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [contactStatus, setContactStatus] = useState<ContactStatus>('idle');

  async function handleCopy() {
    const ok = await copyToClipboard(body);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 2000);
  }

  /**
   * Kopiert den Brieftext, bevor der Link das Kontaktformular in einem neuen Tab öffnet.
   * Der Klick-Handler läuft synchron, damit die Zwischenablage trotz Tab-Wechsel gefüllt wird.
   */
  function handleContactFormClick() {
    const ok = copyToClipboardSync(body);
    setContactStatus(ok ? 'copied' : 'failed');
  }

  return (
    <div className="letter-block">
      <div className="letter-actions">
        <button className="button" type="button" onClick={printLetter}>
          Drucken / als PDF speichern
        </button>

        {recipientEmail ? (
          <a className="button button-secondary" href={buildMailto(recipientEmail, subject, body)}>
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
          {copied ? 'Kopiert!' : 'Text kopieren'}
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
          Kontaktformular geöffnet – der Brieftext liegt in der Zwischenablage. Füge ihn im
          Feld „Nachricht“ mit <kbd>Strg</kbd>+<kbd>V</kbd> (Mac: <kbd>⌘</kbd>+<kbd>V</kbd>) ein.
          Die übrigen Felder findest du unten zum Kopieren.
        </p>
      )}

      {!recipientEmail && contactFormUrl && contactStatus === 'failed' && (
        <p className="hint">
          Kontaktformular geöffnet. Automatisches Kopieren hat nicht geklappt – nutze
          „Text kopieren“ oder die Felder unten.
        </p>
      )}

      {!recipientEmail && contactFormUrl && (
        <p className="hint">
          Der Bundestag veröffentlicht keine E-Mail-Adressen. Nutze das Kontaktformular oder
          verschicke den Brief per Post.
        </p>
      )}

      <div className="letter" id="letter">
        <pre className="letter-text">{body}</pre>
      </div>

      {!recipientEmail && contactFormUrl && (
        <ContactFormFields subject={subject} body={body} sender={sender} />
      )}
    </div>
  );
}
