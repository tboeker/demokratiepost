import { useRef, useState } from 'react';
import { buildMailto, copyToClipboard, copyToClipboardSync, printLetter } from '../lib/export';
import { recipientTypeLabel } from '../lib/recipientTypes';
import { ContactFormFields } from './ContactFormFields';

interface LetterPreviewProps {
  subject: string;
  /** Empfängertyp aus der Kampagne, z. B. "mdb". */
  recipientType?: string;
  /** Vollständiger Brief für Vorschau und Druck. */
  body: string;
  /** Nur Text und Abschlussformel für Kontaktformular/E-Mail. */
  contactBody: string;
  recipientEmail?: string;
  /** Quelle der E-Mail-Adresse, z. B. "Kürschners Volkshandbuch". */
  recipientEmailQuelle?: string;
  /** Link zur Quelle (PDF oder persönliche Website). */
  recipientEmailQuelleUrl?: string;
  /** Stand der E-Mail-Adresse, z. B. "8. Juni 2026". */
  recipientEmailStand?: string;
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
  recipientEmail,
  recipientEmailQuelle,
  recipientEmailQuelleUrl,
  recipientEmailStand,
  contactFormUrl,
  homepage,
  recipientHint,
}: LetterPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [subjectCopied, setSubjectCopied] = useState(false);
  const [contactStatus, setContactStatus] = useState<ContactStatus>('idle');
  const contactFieldsRef = useRef<HTMLDivElement>(null);

  async function handleCopy() {
    const ok = await copyToClipboard(contactBody);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopySubject() {
    const ok = await copyToClipboard(subject);
    setSubjectCopied(ok);
    window.setTimeout(() => setSubjectCopied(false), 2000);
  }

  /**
   * Kopiert die Nachricht, bevor der Link das Kontaktformular in einem neuen Tab öffnet.
   * Der Klick-Handler läuft synchron, damit die Zwischenablage trotz Tab-Wechsel gefüllt wird.
   * Anschließend springt die Seite zu den kopierbaren Feldern, damit sie beim Zurückwechseln
   * direkt sichtbar sind.
   */
  function handleContactFormClick() {
    const ok = copyToClipboardSync(contactBody);
    setContactStatus(ok ? 'copied' : 'failed');

    window.setTimeout(() => {
      contactFieldsRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, 0);
  }

  const emailQuelle = [
    recipientEmailQuelle,
    recipientEmailStand ? `Stand ${recipientEmailStand}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="letter-block">
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

      {recipientHint && <p className="hint">{recipientHint}</p>}

      {recipientEmail && recipientEmailQuelle && (
        <p className="hint">
          Quelle der E-Mail-Adresse: {emailQuelle} – bitte vor dem Versand prüfen.
          {recipientEmailQuelleUrl && (
            <>
              {' '}
              <a href={recipientEmailQuelleUrl} target="_blank" rel="noreferrer">
                Quelle öffnen
              </a>
            </>
          )}
        </p>
      )}

      {recipientEmail && contactFormUrl && (
        <p className="hint">
          Alternativ kannst du das Kontaktformular nutzen; die Nachricht wird dabei in die
          Zwischenablage kopiert.
        </p>
      )}

      {!recipientEmail && contactFormUrl && (
        <p className="hint">
          Für diesen Empfänger ist keine E-Mail-Adresse hinterlegt. Nutze das Kontaktformular oder
          verschicke den Brief per Post. Für das Kontaktformular wird nur der Nachrichtentext
          mit Abschlussformel verwendet – Anschriften und Datum stehen nur im Brief.
        </p>
      )}

      {!recipientEmail && !contactFormUrl && (
        <p className="hint">
          Für diesen Empfänger ist keine E-Mail-Adresse hinterlegt. Nutze den Brief
          (Drucken / als PDF speichern) oder kopiere die Nachricht für das Kontaktformular der
          Behörde bzw. des Unternehmens.
        </p>
      )}

      {recipientEmail && (
        <p className="hint letter-email">
          E-Mail-Adresse des Empfängers:{' '}
          <strong className="letter-email-address">{recipientEmail}</strong>
        </p>
      )}

      <div className="letter-actions">
        {recipientEmail && (
          <a className="button" href={buildMailto(recipientEmail, subject, contactBody)}>
            E-Mail senden
          </a>
        )}

        <button
          className={recipientEmail ? 'button button-secondary' : 'button'}
          type="button"
          onClick={printLetter}
        >
          Drucken / als PDF speichern
        </button>

        {contactFormUrl && (
          <a
            className="button button-secondary"
            href={contactFormUrl}
            target="_blank"
            rel="noreferrer"
            onClick={handleContactFormClick}
          >
            Kontaktformular öffnen
          </a>
        )}

        <div className="action-with-status">
          <button className="button button-secondary" type="button" onClick={handleCopySubject}>
            Betreff kopieren
          </button>
          <span className="action-status" role="status">
            {subjectCopied && (
              <>
                <span className="action-check" aria-hidden="true">
                  ✓
                </span>
                <span className="visually-hidden">Betreff kopiert</span>
              </>
            )}
          </span>
        </div>

        <div className="action-with-status">
          <button className="button button-secondary" type="button" onClick={handleCopy}>
            Nachricht kopieren
          </button>
          <span className="action-status" role="status">
            {copied && (
              <>
                <span className="action-check" aria-hidden="true">
                  ✓
                </span>
                <span className="visually-hidden">Nachricht kopiert</span>
              </>
            )}
          </span>
        </div>

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

      {contactFormUrl && contactStatus === 'copied' && (
        <p className="hint">
          Kontaktformular geöffnet – die Nachricht liegt in der Zwischenablage. Füge sie im
          Feld „Nachricht“ mit <kbd>Strg</kbd>+<kbd>V</kbd> (Mac: <kbd>⌘</kbd>+<kbd>V</kbd>) ein.
          Den Betreff kannst du unten kopieren.
        </p>
      )}

      {contactFormUrl && contactStatus === 'failed' && (
        <p className="hint">
          Kontaktformular geöffnet. Automatisches Kopieren hat nicht geklappt – nutze
          „Nachricht kopieren“ oder kopiere Betreff und Nachricht unten.
        </p>
      )}

      {contactFormUrl && (!recipientEmail || contactStatus !== 'idle') && (
        <div ref={contactFieldsRef} className="contact-form-fields">
          <ContactFormFields subject={subject} body={contactBody} />
        </div>
      )}
    </div>
  );
}
