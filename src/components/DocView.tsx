import type { DocKey } from '../lib/docs';
import { getDoc } from '../lib/docs';
import { markdownToHtml } from '../lib/markdown';
import { renderTemplate } from '../lib/template';

interface DocViewProps {
  doc: DocKey;
  onBack: () => void;
}

export function DocView({ doc, onBack }: DocViewProps) {
  const content = getDoc(doc);
  // Use renderTemplate for consistency with the project (though docs have no placeholders)
  const rendered = renderTemplate(content, {
    datum: '',
    betreff: '',
    absender: {},
    empfaenger: {},
  });
  const html = markdownToHtml(rendered);

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
