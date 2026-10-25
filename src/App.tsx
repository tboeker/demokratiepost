import { useEffect, useMemo, useState } from 'react';
import { DatenspeicherungView } from './components/DatenspeicherungView';
import { DocView } from './components/DocView';
import { InstructionCard, InstructionFields } from './components/InstructionCard';
import { LetterPreview } from './components/LetterPreview';
import { ManualRecipientForm } from './components/ManualRecipientForm';
import { PlzInput } from './components/PlzInput';
import { RecipientList } from './components/RecipientList';
import { RecipientTypeSelect } from './components/RecipientTypeSelect';
import { SenderForm } from './components/SenderForm';
import { loadCampaigns } from './lib/campaigns';
import { isDocKey, type DocKey } from './lib/docs';
import {
  genericSalutation,
  isValidPlz,
  kommuneSalutation,
  salutation,
} from './lib/lookup';
import {
  hasEmptyFallback,
  hasInstruction,
  hasPrefillForm,
  isKommune,
  isMandat,
  isNetzbetreiber,
  isSearchable,
  lookupRecipients,
  recipientTypeLabel,
} from './lib/recipientTypes';
import { recipientRole } from './lib/recipientRoles';
import { senderContext } from './lib/sender';
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
import type {
  Kommune,
  ManualRecipient,
  Netzbetreiber,
  Recipient,
  RecipientCandidate,
  Sender,
  TemplateContext,
} from './types';

type SearchStatus = 'idle' | 'loading' | 'done' | 'empty' | 'error';

type ActiveView = DocKey | 'datenspeicherung' | null;

function getActiveViewFromHash(): ActiveView {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash === 'datenspeicherung') return 'datenspeicherung';
  if (isDocKey(hash)) return hash;
  return null;
}

/** Füllt die empfaenger.*-Platzhalter aus Suchtreffern oder manuellen Daten. */
function recipientContext(
  recipient: Recipient | null,
  recipientType?: string,
  selectedCandidate?: RecipientCandidate | null,
): Record<string, string> {
  if (!recipient) return {};

  const rolle = recipientRole(recipient, recipientType);

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
      amt: '',
      strasse: recipient.address?.strasse ?? '',
      plz: recipient.address?.plz ?? '',
      ort: recipient.address?.ort ?? '',
      email: recipient.email ?? '',
      rolle,
    };
  }

  if (isKommune(recipient)) {
    return {
      anrede: kommuneSalutation(recipient),
      name: recipient.name ?? '',
      partei: recipient.partei ?? '',
      wahlkreis: '',
      bundesland: recipient.land ?? '',
      organisation: recipient.behoerde,
      amt: recipient.amt ?? '',
      strasse: recipient.address.strasse ?? '',
      plz: recipient.address.plz ?? '',
      ort: recipient.address.ort ?? '',
      email: recipient.email ?? '',
      ebene: recipient.ebene,
      wahljahr: recipient.wahljahr ? String(recipient.wahljahr) : '',
      hinweis: recipient.hinweis ?? '',
      rolle,
    };
  }

  if (isNetzbetreiber(recipient)) {
    return {
      anrede: 'Sehr geehrte Damen und Herren',
      name: '',
      partei: '',
      wahlkreis: '',
      bundesland: '',
      organisation: recipient.name,
      amt: '',
      strasse: recipient.address.strasse ?? '',
      plz: recipient.address.plz ?? '',
      ort: recipient.address.ort ?? '',
      email: recipient.email ?? '',
      netzgebiet: recipient.gemeinde ?? '',
      anteil:
        typeof recipient.anteil === 'number' ? `${Math.round(recipient.anteil * 100)} %` : '',
      quelle: recipient.quelle === 'gemeinde' ? 'Gemeindeebene' : 'PLZ-Ebene',
      rolle: '',
    };
  }

  return {
    anrede: recipient.anrede.trim() || genericSalutation(recipient.name),
    name: recipient.name,
    partei: '',
    wahlkreis: '',
    bundesland: '',
    organisation: recipient.organisation,
    amt: recipient.amt ?? '',
    strasse: recipient.strasse,
    plz: recipient.plz,
    ort: recipient.ort,
    email: recipient.email,
    rolle,
    // Metadaten des Suchtreffers bleiben auch nach dem Bearbeiten im Formular
    // erhalten (z. B. Netzgebiet/Anteil beim Netzbetreiber, Wahljahr bei M5).
    ...(selectedCandidate && isNetzbetreiber(selectedCandidate)
      ? {
          netzgebiet: selectedCandidate.gemeinde ?? '',
          anteil:
            typeof selectedCandidate.anteil === 'number'
              ? `${Math.round(selectedCandidate.anteil * 100)} %`
              : '',
          quelle:
            selectedCandidate.quelle === 'gemeinde' ? 'Gemeindeebene' : 'PLZ-Ebene',
        }
      : {}),
    ...(selectedCandidate && isKommune(selectedCandidate)
      ? {
          ebene: selectedCandidate.ebene,
          wahljahr: selectedCandidate.wahljahr ? String(selectedCandidate.wahljahr) : '',
          hinweis: selectedCandidate.hinweis ?? '',
        }
      : {}),
  };
}

/** Übernimmt eine kommunale Verwaltung in das editierbare Empfängerformular. */
function manualFromKommune(kommune: Kommune): ManualRecipient {
  return {
    anrede: kommuneSalutation(kommune),
    name: kommune.name ?? '',
    amt: kommune.amt ?? '',
    organisation: kommune.behoerde,
    strasse: kommune.address.strasse ?? '',
    plz: kommune.address.plz ?? '',
    ort: kommune.address.ort ?? '',
    email: kommune.email ?? '',
  };
}

/**
 * Übernimmt einen Netzbetreiber in das editierbare Empfängerformular:
 * Unternehmen als Organisation, neutrale Anrede, kein Name/kein Amt.
 */
function manualFromNetzbetreiber(operator: Netzbetreiber): ManualRecipient {
  return {
    anrede: 'Sehr geehrte Damen und Herren',
    name: '',
    amt: '',
    organisation: operator.name,
    strasse: operator.address.strasse ?? '',
    plz: operator.address.plz ?? '',
    ort: operator.address.ort ?? '',
    email: operator.email ?? '',
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
  const prefillForm = hasPrefillForm(activeType);
  const instructionMode = hasInstruction(activeType);

  // PLZ-Vorbelegung: initial aus den Absenderdaten, danach frei überschreibbar.
  const [plz, setPlz] = useState(() => sender.plz);
  const [recipients, setRecipients] = useState<RecipientCandidate[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientCandidate | null>(null);
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

  // Manuell erfasste Empfänger pro Typ speichern (Typen ohne Suche, den
  // landtag-Fallback und das vorbefüllte M5-Formular). Anleitungstypen (M7)
  // haben keine Empfängerdaten.
  useEffect(() => {
    if (instructionMode) return;
    if (searchable && !emptyFallback && !prefillForm) return;
    if (hasRecipientData(manual)) {
      saveRecipientData(activeType, manual);
    } else {
      clearRecipientData(activeType);
    }
  }, [manual, activeType, searchable, emptyFallback, prefillForm, instructionMode]);

  // `ob` ist ein Alias auf `buergermeister`; ein eigenes Template ist nicht nötig.
  const templateType = activeType === 'ob' ? 'buergermeister' : activeType;
  const template = campaign && templateType ? campaign.templates[templateType] : undefined;
  const instruction =
    instructionMode && templateType ? campaign?.instructions[templateType] : undefined;

  const recipient: Recipient | null = instructionMode
    ? null
    : prefillForm
      ? isRecipientComplete(manual)
        ? manual
        : null
      : searchable
        ? (selectedRecipient ??
          (emptyFallback && status === 'empty' && isRecipientComplete(manual) ? manual : null))
        : isRecipientComplete(manual)
          ? manual
          : null;
  const showManualForm =
    !instructionMode && (!searchable || prefillForm || (status === 'empty' && emptyFallback));

  async function handleSearch() {
    if (!isValidPlz(plz)) return;
    setStatus('loading');
    setError('');
    setSelectedRecipient(null);
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

  /** Auswahl eines Suchtreffers; bei M5/M6 wird das Formular vorbefüllt. */
  function handleSelectRecipient(candidate: RecipientCandidate) {
    setSelectedRecipient(candidate);
    if (prefillForm && isKommune(candidate)) {
      setManual(manualFromKommune(candidate));
    } else if (prefillForm && isNetzbetreiber(candidate)) {
      setManual(manualFromNetzbetreiber(candidate));
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
    setSelectedRecipient(null);
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
    setSelectedRecipient(null);
  }

  function handleClearAll() {
    handleClearSender();
    for (const item of campaigns) {
      for (const type of item.recipients) clearRecipientData(type);
    }
    setManual(emptyManualRecipient);
    setSelectedRecipient(null);
    setRecipients([]);
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
      absender: senderContext(sender),
      empfaenger: recipientContext(recipient, activeType, selectedRecipient),
    };
  }, [sender, recipient, campaign, activeType, selectedRecipient]);

  const templateParts = template ? splitTemplate(template) : { letter: '', contact: '' };
  const letterBody = renderTemplate(templateParts.letter, letterContext);
  const contactBody = renderTemplate(templateParts.contact, letterContext);
  // Anleitungstypen (M7): Der Nachrichtenteil des Templates ist der Text für
  // das Webformular – ohne Briefkopf; vorhandene Kontaktformular-Marker werden
  // dabei berücksichtigt.
  const instructionMessage = template
    ? renderTemplate(templateParts.contact, letterContext)
    : '';
  const instructionContext: TemplateContext = { ...letterContext, nachricht: instructionMessage };

  const recipientEmail = recipient ? recipient.email || undefined : undefined;
  const contactFormUrl = recipient && isMandat(recipient) ? recipient.contactFormUrl : undefined;
  const homepage = recipient && isMandat(recipient) ? recipient.homepage : undefined;
  const selectedKommune =
    selectedRecipient && isKommune(selectedRecipient) ? selectedRecipient : null;
  const selectedNetzbetreiber =
    selectedRecipient && isNetzbetreiber(selectedRecipient) ? selectedRecipient : null;
  const recipientHint = selectedKommune
    ? [
        selectedKommune.wahljahr
          ? `Amtsträger: Stand ${selectedKommune.wahljahr} – bitte prüfen.`
          : '',
        selectedKommune.hinweis ?? '',
      ]
        .filter(Boolean)
        .join(' ')
    : selectedNetzbetreiber
      ? [
          `Zuordnung aus dem Marktstammdatenregister${
            selectedNetzbetreiber.stand ? ` (Stand ${selectedNetzbetreiber.stand})` : ''
          }, keine amtliche Netzgebietsgrenze – bitte prüfen.`,
          selectedNetzbetreiber.hinweis ?? '',
        ]
          .filter(Boolean)
          .join(' ')
      : '';

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
        <p className="subtitle">In fünf Schritten zum versandfertigen Schreiben</p>
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
                {instructionMode
                  ? 'Für diesen Empfänger gibt es nur ein Webformular – Schritt 4 zeigt die ' +
                    'Anleitung, Schritt 5 die Angaben zum Einfügen.'
                  : prefillForm
                    ? 'Der Empfänger wird im nächsten Schritt über deine Postleitzahl gesucht; ' +
                      'die Angaben werden in ein vorbefülltes, editierbares Formular übernommen.'
                    : searchable
                      ? 'Der Empfänger wird im nächsten Schritt über deine Postleitzahl gesucht.'
                      : 'Für diesen Typ gibt es noch keine Suche – trage den Empfänger im nächsten Schritt manuell ein.'}
              </p>
            </>
          ) : (
            <p className="hint">Diese Kampagne hat keine Empfängertypen.</p>
          )}
        </section>

        <section className="card">
          <h2>
            4.{' '}
            {instructionMode
              ? 'Anleitung zur Einreichung'
              : searchable
                ? 'Empfänger suchen'
                : 'Empfänger erfassen'}
          </h2>

          {instructionMode ? (
            instruction ? (
              <InstructionCard
                instruction={instruction}
                fallbackTitle={recipientTypeLabel(activeType)}
              />
            ) : (
              <p className="hint">
                Für den Empfängertyp „{recipientTypeLabel(activeType)}“ ist in dieser Kampagne
                noch keine Anleitung hinterlegt.
              </p>
            )
          ) : (
            <>
              {searchable && (
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
                        : activeType === 'netzbetreiber'
                          ? `Für die PLZ ${plz} wurde kein zuständiger Netzbetreiber gefunden. ` +
                            'Prüfe die Eingabe oder erfasse das Unternehmen unten manuell.'
                          : prefillForm
                            ? `Für die PLZ ${plz} wurde keine zuständige Verwaltung gefunden. ` +
                              'Prüfe die Eingabe oder erfasse den Empfänger unten manuell.'
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
                        selectedId={selectedRecipient?.id ?? null}
                        onSelect={handleSelectRecipient}
                      />
                      {prefillForm && (
                        <p className="hint">
                          {activeType === 'netzbetreiber'
                            ? 'Die Zuordnung stammt aus dem Marktstammdatenregister (In-Betrieb-PV-Anlagen) ' +
                              'und ist keine amtliche Netzgebietsgrenze – bitte prüfe die Angaben im Formular.'
                            : 'Die Namen der Amtsinhaber:innen stammen aus Forschungsdaten und sind nicht ' +
                              'amtlich – bitte prüfe die Angaben im Formular.'}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}

              {showManualForm && (
                <>
                  {searchable && <hr className="divider" />}
                  <h3 className="subheading">
                    {prefillForm
                      ? 'Empfängerangaben prüfen / ergänzen'
                      : 'Empfänger manuell erfassen'}
                  </h3>
                  <ManualRecipientForm
                    recipientTypeLabel={recipientTypeLabel(activeType)}
                    recipient={manual}
                    onChange={setManual}
                    onClear={handleClearManual}
                    prefill={prefillForm}
                    fallback={status === 'empty' && (emptyFallback || prefillForm)}
                  />
                </>
              )}
            </>
          )}
        </section>

        {template && instruction && (
          <section className="card">
            <h2>5. Angaben zum Einfügen</h2>
            {!isSenderComplete(sender) && (
              <p className="hint">
                Tipp: Fülle oben deine Absenderdaten aus, damit die Felder vollständig sind.
              </p>
            )}
            <InstructionFields instruction={instruction} context={instructionContext} />
          </section>
        )}

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
              recipientHint={recipientHint}
            />
          </section>
        )}

        {campaign && activeType && !template && (
          <section className="card">
            <h2>5. {instructionMode ? 'Angaben zum Einfügen' : 'Briefvorschau'}</h2>
            <p className="hint">
              {instructionMode
                ? `Für den Empfängertyp „${recipientTypeLabel(activeType)}“ gibt es in dieser ` +
                  'Kampagne noch keinen Text für das Webformular.'
                : `Für den Empfängertyp „${recipientTypeLabel(activeType)}“ gibt es in dieser ` +
                  'Kampagne noch kein Musterschreiben.'}
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
