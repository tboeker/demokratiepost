import { useState } from 'react';
import { buildMailto, copyToClipboard, printLetter } from '../lib/export';

interface LetterPreviewProps {
  subject: string;
  body: string;
  recipientEmail?: string;
}

export function LetterPreview({ subject, body, recipientEmail }: LetterPreviewProps) {
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
        <a className="button button-secondary" href={buildMailto(recipientEmail, subject, body)}>
          Als E-Mail öffnen
        </a>
        <button className="button button-secondary" type="button" onClick={handleCopy}>
          {copied ? 'Kopiert!' : 'Text kopieren'}
        </button>
      </div>

      <div className="letter" id="letter">
        <pre className="letter-text">{body}</pre>
      </div>
    </div>
  );
}
