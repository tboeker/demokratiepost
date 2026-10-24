import { useEffect, useMemo, useState } from 'react';
import { DatenspeicherungView } from './components/DatenspeicherungView';
import { DocView } from './components/DocView';
import { LetterPreview } from './components/LetterPreview';
import { PlzInput } from './components/PlzInput';
import { RecipientList } from './components/RecipientList';
import { SenderForm } from './components/SenderForm';
import { loadCampaigns } from './lib/campaigns';
import { isDocKey, type DocKey } from './lib/docs';
import { findRecipientsByPlz, isValidPlz, salutation } from './lib/lookup';
import {
  clearSender,
  emptySender,
  hasSenderData,
  isSenderComplete,
  loadSender,
  prefilledSender,
  saveSender,
} from './lib/storage';
import { renderTemplate, splitTemplate } from './lib/template';
import type { MdB, Sender, TemplateContext } from './types';

type SearchStatus = 'idle' | 'loading' | 'done' | 'empty' | 'error';

type ActiveView = DocKey | 'datenspeicherung' | null;

function getActiveViewFromHash(): ActiveView {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash === 'datenspeicherung') return 'datenspeicherung';
  if (isDocKey(hash)) return hash;
  return null;
}

export default function App() {
  const campaigns = useMemo(() => loadCampaigns(), []);
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id ?? '');
  const [sender, setSender] = useState<Sender>(() => {
    const stored = loadSender();
    return stored && hasSenderData(stored) ? stored : prefilledSender;
  });
  const [plz, setPlz] = useState('');
  const [recipients, setRecipients] = useState<MdB[]>([]);
  const [selectedMdB, setSelectedMdB] = useState<MdB | null>(null);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState<ActiveView>(getActiveViewFromHash);

  useEffect(() => {
    function onHashChange() {
      setActiveView(getActiveViewFromHash());
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const campaign = campaigns.find((item) => item.id === selectedCampaignId);
  const recipientType = campaign?.recipients[0];
  const template = campaign && recipientType ? campaign.templates[recipientType] : undefined;

  // Absenderdaten bei jeder Änderung lokal speichern (leere Daten entfernen den Eintrag).
  useEffect(() => {
    if (hasSenderData(sender)) {
      saveSender(sender);
    } else {
      clearSender();
    }
  }, [sender]);

  async function handleSearch() {
    if (!isValidPlz(plz)) return;
    setStatus('loading');
    setError('');
    setSelectedMdB(null);
    try {
      const found = await findRecipientsByPlz(plz);
      setRecipients(found);
      setStatus(found.length === 0 ? 'empty' : 'done');
      if (found.length === 1) setSelectedMdB(found[0]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler.');
      setStatus('error');
    }
  }

  function handleClearSender() {
    clearSender();
    setSender(emptySender);
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
      empfaenger: selectedMdB
        ? {
          anrede: salutation(selectedMdB),
          name: selectedMdB.name,
          partei: selectedMdB.party,
          wahlkreis: selectedMdB.wahlkreis
            ? `Wahlkreis ${selectedMdB.wahlkreis.number} – ${selectedMdB.wahlkreis.name}`
            : (selectedMdB.state ?? ''),
          strasse: selectedMdB.address?.strasse ?? '',
          plz: selectedMdB.address?.plz ?? '',
          ort: selectedMdB.address?.ort ?? '',
          email: selectedMdB.email ?? '',
        }
        : {},
    };
  }, [sender, selectedMdB, campaign]);

  const templateParts = template ? splitTemplate(template) : { letter: '', contact: '' };
  const letterBody = renderTemplate(templateParts.letter, letterContext);
  const contactBody = renderTemplate(templateParts.contact, letterContext);

  if (activeView === 'datenspeicherung') {
    return (
      <DatenspeicherungView
        hasSenderData={hasSenderData(sender)}
        onClear={handleClearSender}
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
        <p className="subtitle">In vier Schritten zum versandfertigen Brief</p>
        <p className="hint">Hinweis: Der Quellcode dieser App wurde mit AI Tools erstellt.</p>
      </header>

      <main className="main">
        <section className="card">
          <h2>1. Kampagne wählen</h2>
          <select
            id="campaign"
            className="select"
            value={selectedCampaignId}
            onChange={(event) => setSelectedCampaignId(event.target.value)}
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
          <h2>3. Empfänger ermitteln</h2>
          <PlzInput
            value={plz}
            onChange={setPlz}
            onSubmit={handleSearch}
            loading={status === 'loading'}
          />

          {status === 'empty' && (
            <p className="hint">
              Für die PLZ {plz} wurde kein Direktmandat gefunden. Prüfe die Eingabe – oder der
              Wahlkreis hat derzeit keine direkt gewählte Person (Zweitstimmendeckung oder
              vakantes Mandat).
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
                recipientType={recipientType}
                selectedId={selectedMdB?.id ?? null}
                onSelect={setSelectedMdB}
              />
            </>
          )}
        </section>

        {template && selectedMdB && (
          <section className="card letter-card">
            <h2>4. Briefvorschau</h2>
            {!isSenderComplete(sender) && (
              <p className="hint">
                Tipp: Fülle oben deine Absenderdaten aus, damit der Brief vollständig ist.
              </p>
            )}
            <LetterPreview
              subject={campaign?.subject ?? campaign?.title ?? ''}
              recipientType={recipientType}
              body={letterBody}
              contactBody={contactBody}
              sender={sender}
              recipientEmail={selectedMdB.email}
              contactFormUrl={selectedMdB.contactFormUrl}
              homepage={selectedMdB.homepage}
            />
          </section>
        )}

        <section className="card">
          <h2>Datenspeicherung</h2>
          <p className="hint">
            Diese Seite läuft vollständig in deinem Browser – ohne Server, ohne Tracking.
            Absenderdaten werden nur lokal im <code>localStorage</code> gespeichert.
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
