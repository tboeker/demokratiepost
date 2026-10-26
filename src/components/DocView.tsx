import type { DocKey } from '../lib/docs';
import { getDoc } from '../lib/docs';
import { markdownToHtml } from '../lib/markdown';

interface DocViewProps {
  doc: DocKey;
  onBack: () => void;
}

export function DocView({ doc, onBack }: DocViewProps) {
  const content = getDoc(doc);
  // Dokumente sind statisch; Platzhalter werden nur in Kampagnen-Templates ersetzt.
  const html = markdownToHtml(content);

  const titles: Record<DocKey, string> = {
    idee: 'Idee',
    impressum: 'Impressum',
    datenschutz: 'Datenschutz',
  };

  return (
    <div className="page">
      <header className="header">
        <h1>{titles[doc]}</h1>
        <p className="subtitle">Demokratiepost</p>
      </header>

      <main className="main">
        <section className="card">
          <div className="doc-content" dangerouslySetInnerHTML={{ __html: html }} />
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
