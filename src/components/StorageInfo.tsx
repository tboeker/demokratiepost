import { SENDER_STORAGE_KEY } from '../lib/storage';

interface StorageInfoProps {
  /** Ob aktuell Absenderdaten im Browser gespeichert sind. */
  hasSenderData: boolean;
  /** Löscht die gespeicherten Absenderdaten. */
  onClear: () => void;
}

/**
 * Transparenzhinweis zur Datenspeicherung. Die Anwendung läuft vollständig im Browser;
 * gespeichert werden nur die Absenderdaten (localStorage).
 */
export function StorageInfo({ hasSenderData, onClear }: StorageInfoProps) {
  return (
    <section className="card" id="datenspeicherung">
      <h2>Datenspeicherung</h2>
      <p className="hint">
        Diese Seite läuft vollständig in deinem Browser – ohne Server, ohne Tracking.
      </p>

      <dl className="storage-list">
        <div>
          <dt>Was gespeichert wird</dt>
          <dd>
            Deine Absenderdaten (Name, Anschrift, optional E-Mail und Telefon), damit du sie beim
            nächsten Besuch nicht erneut eingeben musst.
          </dd>
        </div>
        <div>
          <dt>Wo gespeichert wird</dt>
          <dd>
            Nur lokal in diesem Browser unter dem Schlüssel{' '}
            <code>{SENDER_STORAGE_KEY}</code> (localStorage). Die Daten verlassen dein Gerät
            nicht.
          </dd>
        </div>
        <div>
          <dt>Was nicht gespeichert wird</dt>
          <dd>
            Die eingegebene Postleitzahl wird nicht gespeichert. Es werden keine Daten an einen
            Server übertragen.
          </dd>
        </div>
        <div>
          <dt>Daten löschen</dt>
          <dd>
            {hasSenderData
              ? 'Aktuell sind Absenderdaten gespeichert. Du kannst sie jederzeit entfernen.'
              : 'Aktuell sind keine Absenderdaten gespeichert.'}
          </dd>
        </div>
      </dl>

      <button
        className="button button-secondary"
        type="button"
        onClick={onClear}
        disabled={!hasSenderData}
      >
        Gespeicherte Daten löschen
      </button>
    </section>
  );
}
