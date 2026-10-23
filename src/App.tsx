import { useMemo, useState } from 'react';
import { loadCampaigns } from './lib/campaigns';
import { listPlaceholders, renderTemplate } from './lib/template';
import type { TemplateContext } from './types';

// Beispieldaten, damit das Grundgerüst (M1) den kompletten Ablauf zeigt.
// Ab M2 kommen diese Werte aus PLZ-Lookup und Nutzereingabe.
const demoContext: TemplateContext = {
  datum: new Date().toLocaleDateString('de-DE'),
  betreff: 'Beispiel-Betreff',
  absender: {
    name: 'Erika Mustermann',
    strasse: 'Musterstraße 1',
    plz: '10115',
    ort: 'Berlin',
    email: 'erika@example.org',
  },
  empfaenger: {
    anrede: 'Sehr geehrte Frau',
    name: 'Max Musterfrau',
    partei: 'Beispielpartei',
    wahlkreis: 'Wahlkreis 42 – Berlin-Mitte',
    strasse: 'Platz der Republik 1',
    plz: '11011',
    ort: 'Berlin',
  },
};

export default function App() {
  const campaigns = useMemo(() => loadCampaigns(), []);
  const [selectedId, setSelectedId] = useState(campaigns[0]?.id ?? '');

  const campaign = campaigns.find((c) => c.id === selectedId);
  const recipientType = campaign?.recipients[0];
  const template = campaign && recipientType ? campaign.templates[recipientType] : undefined;

  const placeholders = useMemo(
    () => (template ? listPlaceholders(template) : []),
    [template],
  );

  const rendered = useMemo(
    () => (template ? renderTemplate(template, demoContext) : ''),
    [template],
  );

  return (
    <div className="page">
      <header className="header">
        <h1>Meine Beschwerde</h1>
        <p className="subtitle">Prototyp – Grundgerüst (M1)</p>
      </header>

      <main className="main">
        <section className="card">
          <label className="label" htmlFor="campaign">
            Kampagne
          </label>
          <select
            id="campaign"
            className="select"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
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
              <p className="hint">Empfängertypen: {campaign.recipients.join(', ')}</p>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Platzhalter im Template</h2>
          {placeholders.length === 0 ? (
            <p className="hint">Keine Platzhalter gefunden.</p>
          ) : (
            <ul className="placeholders">
              {placeholders.map((placeholder) => (
                <li key={placeholder}>
                  <code>{`{{ ${placeholder} }}`}</code>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Vorschau (mit Beispieldaten)</h2>
          <pre className="preview">{rendered}</pre>
        </section>
      </main>
    </div>
  );
}
