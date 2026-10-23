import { useState } from 'react';
import { buildMailto, copyToClipboard, printLetter } from '../lib/export';

interface LetterPreviewProps {
  subject: string;
  body: string;
  recipientEmail?: string;
  contactFormUrl?: string;
  homepage?: string;
}

export function LetterPreview({
  subject,
  body,
  recipientEmail,
  contactFormUrl,
  homepage,
}: LetterPreviewProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(body);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 2000);
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

      {!recipientEmail && contactFormUrl && (
        <p className="hint">
          Der Bundestag veröffentlicht keine E-Mail-Adressen. Nutze das Kontaktformular oder
          verschicke den Brief per Post.
        </p>
      )}

      <div className="letter" id="letter">
        <pre className="letter-text">{body}</pre>
      </div>
    </div>
  );
}
