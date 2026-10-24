import type { DocKey } from '../lib/docs';
import { getDoc } from '../lib/docs';
import { renderTemplate } from '../lib/template';

interface DocViewProps {
  doc: DocKey;
  onBack: () => void;
}

function markdownToHtml(markdown: string): string {
  const html = markdown
    // Headings
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Paragraphs - wrap non-empty lines not starting with tags
    .split('\n\n')
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<li') || trimmed.startsWith('<ul')) {
        // Handle lists
        if (trimmed.startsWith('<li')) {
          return '<ul>' + trimmed + '</ul>';
        }
        return trimmed;
      }
      // Convert single newlines to <br> in paragraphs
      const withBreaks = trimmed.replace(/\n/g, '<br>');
      return `<p>${withBreaks}</p>`;
    })
    .filter(Boolean)
    .join('\n');
  return html;
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