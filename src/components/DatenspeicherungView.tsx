import { RECIPIENT_STORAGE_PREFIX, SENDER_STORAGE_KEY } from '../lib/storage';

interface DatenspeicherungViewProps {
  hasSenderData: boolean;
  hasRecipientData: boolean;
  onClear: () => void;
  onBack: () => void;
}

export function DatenspeicherungView({
  hasSenderData,
  hasRecipientData,
  onClear,
  onBack,
}: DatenspeicherungViewProps) {
  return (
    <div className="page">
      <header className="header">
        <h1>Datenspeicherung</h1>
        <p className="subtitle">Demokratiepost</p>
      </header>

      <main className="main">
        <section className="card">
          <p className="hint">
            Diese Seite läuft vollständig in deinem Browser – ohne Server, ohne Tracking.
          </p>

          <dl className="storage-list">
            <div>
              <dt>Was gespeichert wird</dt>
              <dd>
                Deine Absenderdaten (Name, Anschrift, optional E-Mail und Telefon) sowie die
                manuell erfassten Empfängerdaten – damit du sie beim nächsten Besuch nicht erneut
                eingeben musst.
              </dd>
            </div>
            <div>
              <dt>Wo gespeichert wird</dt>
              <dd>
                Nur lokal in diesem Browser: Absender unter <code>{SENDER_STORAGE_KEY}</code>,
                manuell erfasste Empfänger pro Typ unter <code>{RECIPIENT_STORAGE_PREFIX}.&lt;typ&gt;.v1</code>{' '}
                (localStorage). Die Daten verlassen dein Gerät nicht.
              </dd>
            </div>
            <div>
              <dt>Was nicht gespeichert wird</dt>
              <dd>
                Die Postleitzahl der Empfängersuche wird nicht gespeichert, ebenso wenig
                ausgewählte Suchtreffer. Es werden keine Daten an einen Server übertragen.
              </dd>
            </div>
            <div>
              <dt>Daten löschen</dt>
              <dd>
                {hasSenderData || hasRecipientData
                  ? 'Aktuell sind Daten gespeichert. Du kannst sie jederzeit entfernen.'
                  : 'Aktuell sind keine Daten gespeichert.'}
                {hasSenderData ? ' Absenderdaten: gespeichert.' : ''}
                {hasRecipientData ? ' Empfängerdaten: gespeichert.' : ''}
              </dd>
            </div>
          </dl>

          <button
            className="button button-secondary"
            type="button"
            onClick={onClear}
            disabled={!hasSenderData && !hasRecipientData}
          >
            Gespeicherte Daten löschen
          </button>
        </section>
      </main>

      <footer className="footer">
        <button className="button button-secondary" type="button" onClick={onBack}>
          Zurück zur Startseite
        </button>
      </footer>
    </div>
  );
}
