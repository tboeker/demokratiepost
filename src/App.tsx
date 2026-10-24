import { useEffect, useMemo, useState } from 'react';
import { DatenspeicherungView } from './components/DatenspeicherungView';
import { DocView } from './components/DocView';
import { LetterPreview } from './components/LetterPreview';
import { ManualRecipientForm } from './components/ManualRecipientForm';
import { PlzInput } from './components/PlzInput';
import { RecipientList } from './components/RecipientList';
import { RecipientTypeSelect } from './components/RecipientTypeSelect';
import { SenderForm } from './components/SenderForm';
import { loadCampaigns } from './lib/campaigns';
import { isDocKey, type DocKey } from './lib/docs';
import { genericSalutation, isValidPlz, salutation } from './lib/lookup';
import {
  hasEmptyFallback,
  isMandat,
  isSearchable,
  lookupRecipients,
  recipientTypeLabel,
} from './lib/recipientTypes';
import {
  clearRecipientData,
  clearSender,
  emptyManualRecipient,
  emptySender,
  hasRecipientData,
  hasSenderData,
  hasStoredRecipientData,
  isRecipientComplete,
  isSenderComplete,
  loadRecipientData,
  loadSender,
  prefilledSender,
  saveRecipientData,
  saveSender,
} from './lib/storage';
import { renderTemplate, splitTemplate } from './lib/template';
import type { ManualRecipient, Mandatstraeger, Recipient, Sender, TemplateContext } from './types';

type SearchStatus = 'idle' | 'loading' | 'done' | 'empty' | 'error';

type ActiveView = DocKey | 'datenspeicherung' | null;

function getActiveViewFromHash(): ActiveView {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash === 'datenspeicherung') return 'datenspeicherung';
  if (isDocKey(hash)) return hash;
  return null;
}

/** Füllt die empfaenger.*-Platzhalter aus Suchtreffern oder manuellen Daten. */
function recipientContext(recipient: Recipient | null): Record<string, string> {
  if (!recipient) return {};

  if (isMandat(recipient)) {
    return {
      anrede: salutation(recipient),
      name: recipient.name,
      partei: recipient.party,
      wahlkreis: recipient.wahlkreis
        ? `Wahlkreis ${recipient.wahlkreis.number} – ${recipient.wahlkreis.name}`
        : (recipient.bundesland ?? recipient.state ?? ''),
      bundesland: recipient.bundesland ?? recipient.state ?? '',
      organisation: '',
      strasse: recipient.address?.strasse ?? '',
      plz: recipient.address?.plz ?? '',
      ort: recipient.address?.ort ?? '',
      email: recipient.email ?? '',
    };
  }

  return {
    anrede: recipient.anrede.trim() || genericSalutation(recipient.name),
    name: recipient.name,
    partei: '',
    wahlkreis: '',
    organisation: recipient.organisation,
    strasse: recipient.strasse,
    plz: recipient.plz,
    ort: recipient.ort,
    email: recipient.email,
  };
}

export default function App() {
  const campaigns = useMemo(() => loadCampaigns(), []);
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id ?? '');
  const [sender, setSender] = useState<Sender>(() => {
    const stored = loadSender();
    return stored && hasSenderData(stored) ? stored : prefilledSender;
  });
  const [recipientType, setRecipientType] = useState(() => campaigns[0]?.recipients[0] ?? '');
  const campaign = campaigns.find((item) => item.id === selectedCampaignId);
  // Aktiver Typ: aus der Kampagne abgeleitet, damit ein Wechsel der Kampagne
  // nie auf einen dort nicht unterstützten Typ zeigt.
  const activeType =
    campaign && campaign.recipients.includes(recipientType)
      ? recipientType
      : (campaign?.recipients[0] ?? '');
  const searchable = isSearchable(activeType);
  const emptyFallback = hasEmptyFallback(activeType);

  // PLZ-Vorbelegung: initial aus den Absenderdaten, danach frei überschreibbar.
  const [plz, setPlz] = useState(() => sender.plz);
  const [recipients, setRecipients] = useState<Mandatstraeger[]>([]);
  const [selectedMandat, setSelectedMandat] = useState<Mandatstraeger | null>(null);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState('');
  const [manual, setManual] = useState<ManualRecipient>(
    () => loadRecipientData(activeType) ?? emptyManualRecipient,
  );
  const [activeView, setActiveView] = useState<ActiveView>(getActiveViewFromHash);

  useEffect(() => {
    function onHashChange() {
      setActiveView(getActiveViewFromHash());
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Absenderdaten bei jeder Änderung lokal speichern (leere Daten entfernen den Eintrag).
  useEffect(() => {
    if (hasSenderData(sender)) {
      saveSender(sender);
    } else {
      clearSender();
    }
  }, [sender]);

  // Manuell erfasste Empfänger pro Typ speichern (für Typen ohne Suche sowie
  // für durchsuchbare Typen mit Fallback, z. B. landtag).
  useEffect(() => {
    if (searchable && !emptyFallback) return;
    if (hasRecipientData(manual)) {
      saveRecipientData(activeType, manual);
    } else {
      clearRecipientData(activeType);
    }
  }, [manual, activeType, searchable, emptyFallback]);

  const template = campaign && activeType ? campaign.templates[activeType] : undefined;

  const recipient: Recipient | null = searchable
    ? (selectedMandat ??
      (emptyFallback && status === 'empty' && isRecipientComplete(manual) ? manual : null))
    : isRecipientComplete(manual)
      ? manual
      : null;

  async function handleSearch() {
    if (!isValidPlz(plz)) return;
    setStatus('loading');
    setError('');
    setSelectedMandat(null);
    try {
      const found = await lookupRecipients(activeType, plz);
      setRecipients(found);
      // Auswahl immer manuell – auch bei genau einem Treffer.
      setStatus(found.length === 0 ? 'empty' : 'done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler.');
      setStatus('error');
    }
  }

  /** Wechsel der Kampagne: Typ und Empfängerauswahl zurücksetzen. */
  function handleCampaignChange(id: string) {
    setSelectedCampaignId(id);
    const next = campaigns.find((item) => item.id === id);
    const type = next?.recipients[0] ?? '';
    setRecipientType(type);
    resetRecipientState(type);
  }

  /** Wechsel des Empfängertyps: gespeicherte Daten des neuen Typs laden. */
  function handleTypeChange(type: string) {
    setRecipientType(type);
    resetRecipientState(type);
  }

  function resetRecipientState(type: string) {
    setRecipients([]);
    setSelectedMandat(null);
    setStatus('idle');
    setError('');
    setManual(loadRecipientData(type) ?? emptyManualRecipient);
  }

  function handleClearSender() {
    clearSender();
    setSender(emptySender);
  }

  function handleClearManual() {
    clearRecipientData(activeType);
    setManual(emptyManualRecipient);
  }

  function handleClearAll() {
    handleClearSender();
    for (const item of campaigns) {
      for (const type of item.recipients) clearRecipientData(type);
    }
    setManual(emptyManualRecipient);
  }

  function goToDoc(doc: DocKey) {
    window.location.hash = doc;
  }

  function goToDatenspeicherung() {
    window.location.hash = 'datenspeicherung';
  }

  function goHome() {
    window.location.hash = '';
    setActiveView(null);
  }

  const letterContext: TemplateContext = useMemo(() => {
    return {
      datum: new Date().toLocaleDateString('de-DE'),
      betreff: campaign?.subject ?? campaign?.title ?? '',
      absender: { ...sender },
      empfaenger: recipientContext(recipient),
    };
  }, [sender, recipient, campaign]);

  const templateParts = template ? splitTemplate(template) : { letter: '', contact: '' };
  const letterBody = renderTemplate(templateParts.letter, letterContext);
  const contactBody = renderTemplate(templateParts.contact, letterContext);

  const recipientEmail = recipient ? recipient.email || undefined : undefined;
  const contactFormUrl = recipient && isMandat(recipient) ? recipient.contactFormUrl : undefined;
  const homepage = recipient && isMandat(recipient) ? recipient.homepage : undefined;

  if (activeView === 'datenspeicherung') {
    return (
      <DatenspeicherungView
        hasSenderData={hasSenderData(sender)}
        hasRecipientData={hasStoredRecipientData(campaigns.flatMap((item) => item.recipients))}
        onClear={handleClearAll}
        onBack={goHome}
      />
    );
  }

  if (activeView) {
    return <DocView doc={activeView} onBack={goHome} />;
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Demokratiepost</h1>
        <p className="subtitle">In fünf Schritten zum versandfertigen Brief</p>
        <p className="hint">Hinweis: Der Quellcode dieser App wurde mit AI Tools erstellt.</p>
        <button type="button" className="footer-link" onClick={() => goToDoc('idee')}>
          Beschreibung der Idee
        </button>

      </header>

      <main className="main">
        <section className="card">
          <h2>1. Kampagne wählen</h2>
          <select
            id="campaign"
            className="select"
            value={selectedCampaignId}
            onChange={(event) => handleCampaignChange(event.target.value)}
          >
            {campaigns.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          {campaign && (
            <div className="campaign-meta">
              {campaign.theme && <span className="tag">{campaign.theme}</span>}
              {campaign.description && <p>{campaign.description}</p>}
            </div>
          )}
        </section>

        <section className="card">
          <h2>2. Deine Absenderdaten</h2>
          <SenderForm sender={sender} onChange={setSender} onClear={handleClearSender} />
        </section>

        <section className="card">
          <h2>3. Empfängertyp wählen</h2>
          {campaign && campaign.recipients.length > 0 ? (
            <>
              <RecipientTypeSelect
                types={campaign.recipients}
                value={activeType}
                onChange={handleTypeChange}
              />
              <p className="hint">
                {searchable
                  ? 'Der Empfänger wird im nächsten Schritt über deine Postleitzahl gesucht.'
                  : 'Für diesen Typ gibt es noch keine Suche – trage den Empfänger im nächsten Schritt manuell ein.'}
              </p>
            </>
          ) : (
            <p className="hint">Diese Kampagne hat keine Empfängertypen.</p>
          )}
        </section>

        <section className="card">
          <h2>4. {searchable ? 'Empfänger suchen' : 'Empfänger erfassen'}</h2>
          {searchable ? (
            <>
              <PlzInput
                value={plz}
                onChange={setPlz}
                onSubmit={handleSearch}
                loading={status === 'loading'}
              />
              <p className="hint">Vorausgefüllt mit deiner PLZ – passe sie bei Bedarf an.</p>

              {status === 'empty' && (
                <p className="hint">
                  {activeType === 'landtag'
                    ? `Für die PLZ ${plz} liegen keine Landtagsdaten vor – entweder gibt es für ` +
                      'dieses Bundesland (noch) keine Zuordnung oder der Wahlkreis hat kein ' +
                      'besetztes Direktmandat. Erfasse den Empfänger unten manuell.'
                    : `Für die PLZ ${plz} wurde kein Direktmandat gefunden. Prüfe die Eingabe – ` +
                      'oder der Wahlkreis hat derzeit keine direkt gewählte Person ' +
                      '(Zweitstimmendeckung oder vakantes Mandat).'}
                </p>
              )}
              {status === 'error' && <p className="error">{error}</p>}
              {status === 'done' && (
                <>
                  <p className="hint">
                    {recipients.length} Empfänger gefunden – bitte auswählen:
                  </p>
                  <RecipientList
                    recipients={recipients}
                    recipientType={activeType}
                    selectedId={selectedMandat?.id ?? null}
                    onSelect={setSelectedMandat}
                  />
                </>
              )}

              {status === 'empty' && emptyFallback && (
                <>
                  <hr className="divider" />
                  <h3 className="subheading">Empfänger manuell erfassen</h3>
                  <ManualRecipientForm
                    recipientTypeLabel={recipientTypeLabel(activeType)}
                    recipient={manual}
                    onChange={setManual}
                    onClear={handleClearManual}
                  />
                </>
              )}
            </>
          ) : (
            <ManualRecipientForm
              recipientTypeLabel={recipientTypeLabel(activeType)}
              recipient={manual}
              onChange={setManual}
              onClear={handleClearManual}
            />
          )}
        </section>

        {template && recipient && (
          <section className="card letter-card">
            <h2>5. Briefvorschau</h2>
            {!isSenderComplete(sender) && (
              <p className="hint">
                Tipp: Fülle oben deine Absenderdaten aus, damit der Brief vollständig ist.
              </p>
            )}
            <LetterPreview
              subject={campaign?.subject ?? campaign?.title ?? ''}
              recipientType={activeType}
              body={letterBody}
              contactBody={contactBody}
              sender={sender}
              recipientEmail={recipientEmail}
              contactFormUrl={contactFormUrl}
              homepage={homepage}
            />
          </section>
        )}

        {campaign && activeType && !template && (
          <section className="card">
            <h2>5. Briefvorschau</h2>
            <p className="hint">
              Für den Empfängertyp „{recipientTypeLabel(activeType)}“ gibt es in dieser Kampagne
              noch kein Musterschreiben.
            </p>
          </section>
        )}

        <section className="card">
          <h2>Datenspeicherung</h2>
          <p className="hint">
            Diese Seite läuft vollständig in deinem Browser – ohne Server, ohne Tracking.
            Absenderdaten und manuell erfasste Empfänger werden nur lokal im{' '}
            <code>localStorage</code> gespeichert.
          </p>
          <button className="button button-secondary" type="button" onClick={goToDatenspeicherung}>
            Details zur Datenspeicherung
          </button>
        </section>
      </main>

      <footer className="footer">
        <nav className="footer-nav">
          <button type="button" className="footer-link" onClick={() => goToDoc('idee')}>
            Idee
          </button>
          <span className="footer-sep">·</span>
          <button type="button" className="footer-link" onClick={() => goToDoc('impressum')}>
            Impressum
          </button>
          <span className="footer-sep">·</span>
          <button type="button" className="footer-link" onClick={() => goToDoc('datenschutz')}>
            Datenschutz
          </button>
          <span className="footer-sep">·</span>
          <button type="button" className="footer-link" onClick={goToDatenspeicherung}>
            Datenspeicherung
          </button>
        </nav>
      </footer>
    </div>
  );
}
