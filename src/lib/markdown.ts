/**
 * Wandelt eine kleine, bewusst überschaubare Markdown-Teilmenge in HTML um.
 *
 * Unterstützt: Überschriften (#, ##, ###), Absätze, ungeordnete und geordnete
 * Listen, Fettschrift, Inline-Code und Links. Mehr wird in den Dokumenten und
 * Anleitungen nicht verwendet.
 */
function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      const external = /^https?:\/\//i.test(href);
      const attrs = external ? ' target="_blank" rel="noreferrer"' : '';
      return `<a href="${href}"${attrs}>${label}</a>`;
    })
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];
  let paragraph: string[] = [];

  function flushList() {
    if (!listType || listItems.length === 0) return;
    blocks.push(
      `<${listType}>${listItems.map((item) => `<li>${item}</li>`).join('')}</${listType}>`,
    );
    listType = null;
    listItems = [];
  }

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    // Fortsetzungszeile einer Liste (eingerückt) gehört zum letzten Punkt.
    if (listType && listItems.length > 0 && /^\s{2,}\S/.test(line)) {
      listItems[listItems.length - 1] += ' ' + inline(trimmed);
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);

    if (ordered || unordered) {
      flushParagraph();
      const type: 'ul' | 'ol' = ordered ? 'ol' : 'ul';
      if (listType && listType !== type) flushList();
      listType = type;
      listItems.push(inline((ordered ?? unordered)![1]));
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();

  return blocks.join('\n');
}
