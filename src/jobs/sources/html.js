// Small HTML -> markdown converter for job listings. Job ads use a handful of tags (headings,
// paragraphs, lists, bold); anything else is reduced to its text.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', pound: '£' };

export function decodeEntities(s) {
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToMarkdown(input) {
  // Greenhouse double-encodes: the content is entity-escaped HTML.
  let html = /&lt;\w/.test(input) ? decodeEntities(input) : input;
  html = html
    .replace(/\r/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, t) => `\n\n### ${inline(t)}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${inline(t)}`)
    .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `\n\n${inline(t)}\n\n`)
    .replace(/<div[^>]*>|<\/div>/gi, '\n');
  html = inline(html, true);
  return html
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/^(\*\*[^*]+\*\*)$/gm, '### $1') // a paragraph that is only bold text is a heading in practice
    .replace(/^### \*\*(.+)\*\*$/gm, '### $1')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^(- .*)\n\n(?=- )/gm, '$1\n') // list items that were wrapped in <p>
    .trim();
}

function inline(s, keepNewlines = false) {
  let out = s
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => (t.trim() ? `**${t.trim()}**` : t))
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => (t.trim() ? `*${t.trim()}*` : t))
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => `[${t.trim()}](${href})`)
    .replace(/<[^>]+>/g, '');
  out = decodeEntities(out);
  return keepNewlines ? out : out.replace(/\s+/g, ' ').trim();
}
