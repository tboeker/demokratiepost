import { useEffect, useMemo, useState } from 'react';
import { LetterPreview } from './components/LetterPreview';
import { PlzInput } from './components/PlzInput';
import { RecipientList } from './components/RecipientList';
import { SenderForm } from './components/SenderForm';
import { loadCampaigns } from './lib/campaigns';
import { findRecipientsByPlz, isValidPlz, salutation } from './lib/lookup';
import { clearSender, emptySender, isSenderComplete, loadSender, saveSender } from './lib/storage';
import { renderTemplate } from './lib/template';
import type { MdB, Sender, TemplateContext } from './types';

type SearchStatus = 'idle' | 'loading' | 'done' | 'empty' | 'error';

export default function App() {
  const campaigns = useMemo(() => loadCampaigns(), []);
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id ?? '');
  const [sender, setSender] = useState<Sender>(() => loadSender() ?? emptySender);
  const [plz, setPlz] = useState('');
  const [recipients, setRecipients] = useState<MdB[]>([]);
  const [selectedMdB, setSelectedMdB] = useState<MdB | null>(null);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState('');

  const campaign = campaigns.find((item) => item.id === selectedCampaignId);
  const recipientType = campaign?.recipients[0];
  const template = campaign && recipientType ? campaign.templates[recipientType] : undefined;

  // Absenderdaten bei jeder Änderung lokal speichern.
  useEffect(() => {
    saveSender(sender);
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

  const letterContext: TemplateContext = useMemo(() => {
    return {
      datum: new Date().toLocaleDateString('de-DE'),
      betreff: campaign?.title ?? '',
      absender: { ...sender },
      empfaenger: selectedMdB
        ? {
            anrede: salutation(selectedMdB),
            name: selectedMdB.name,
            partei: selectedMdB.party,
            wahlkreis: `Wahlkreis ${selectedMdB.wahlkreis.number} – ${selectedMdB.wahlkreis.name}`,
            strasse: selectedMdB.address?.strasse ?? '',
            plz: selectedMdB.address?.plz ?? '',
            ort: selectedMdB.address?.ort ?? '',
            email: selectedMdB.email ?? '',
          }
        : {},
    };
  }, [sender, selectedMdB, campaign]);

  const letterBody = template ? renderTemplate(template, letterContext) : '';

  return (
    <div className="page">
      <header className="header">
        <h1>Meine Beschwerde</h1>
        <p className="subtitle">In vier Schritten zum versandfertigen Brief</p>
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
              Für die PLZ {plz} wurden keine Empfänger gefunden. Probiere in den Demo-Daten
              z. B. <strong>10115</strong> oder <strong>24937</strong>.
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
                selectedId={selectedMdB?.id ?? null}
                onSelect={setSelectedMdB}
              />
            </>
          )}
        </section>

        {template && selectedMdB && (
          <section className="card">
            <h2>4. Briefvorschau</h2>
            {!isSenderComplete(sender) && (
              <p className="hint">
                Tipp: Fülle oben deine Absenderdaten aus, damit der Brief vollständig ist.
              </p>
            )}
            <LetterPreview
              subject={campaign?.title ?? ''}
              body={letterBody}
              recipientEmail={selectedMdB.email}
            />
          </section>
        )}
      </main>
    </div>
  );
}
