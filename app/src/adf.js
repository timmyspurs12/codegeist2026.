/**
 * Atlassian Document Format (ADF) → plain text.
 *
 * Jira Cloud returns comment bodies as ADF (API v3). Relay's central claim is
 * that a commitment is anchored to an exact sentence of what a person wrote, so
 * it needs one deterministic text projection of that document — the same one
 * every time — and it must say so rather than pretending the text is the
 * document.
 *
 * Offsets stored in evidence are offsets into the string this function returns,
 * and evidence records `bodyFormat: 'adf-text'` plus a hash of the source. If
 * ADF changes shape between Jira versions, the hash changes and a re-scan
 * produces new evidence instead of silently re-pointing an old quotation.
 */

const BLOCK = new Set([
  'paragraph', 'heading', 'blockquote', 'panel', 'listItem', 'codeBlock',
  'mediaSingle', 'mediaGroup', 'rule', 'table', 'tableRow', 'tableCell', 'tableHeader',
]);

function inlineText(node) {
  if (!node || typeof node !== 'object') return '';
  switch (node.type) {
    case 'text': return typeof node.text === 'string' ? node.text : '';
    case 'hardBreak': return '\n';
    case 'mention': return node.attrs?.text ?? `@${node.attrs?.displayName ?? 'someone'}`;
    case 'emoji': return node.attrs?.text ?? node.attrs?.shortName ?? '';
    case 'inlineCard': return node.attrs?.url ?? '';
    case 'date': return node.attrs?.timestamp ? new Date(Number(node.attrs.timestamp)).toISOString().slice(0, 10) : '';
    case 'status': return node.attrs?.text ?? '';
    default: return (node.content ?? []).map(inlineText).join('');
  }
}

/**
 * @param {any} doc ADF document (or any node)
 * @returns {string} plain text with paragraphs separated by a single newline
 */
export function adfToText(doc) {
  if (!doc) return '';
  if (typeof doc === 'string') return doc;
  const blocks = [];

  const walk = (node, prefix = '') => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'text' || node.type === 'hardBreak' || node.type === 'mention'
      || node.type === 'emoji' || node.type === 'inlineCard' || node.type === 'date' || node.type === 'status') {
      blocks.push(prefix + inlineText(node));
      return;
    }
    if (node.type === 'listItem') {
      const text = (node.content ?? []).map((c) => inlineText(c)).join(' ').trim();
      if (text) blocks.push(`${prefix}• ${text}`);
      return;
    }
    if (BLOCK.has(node.type)) {
      const text = (node.content ?? [])
        .filter((c) => c.type === 'text' || c.type === 'hardBreak' || c.type === 'mention' || c.type === 'inlineCard')
        .map(inlineText)
        .join('');
      const nested = (node.content ?? []).filter((c) => c.type === 'listItem' || c.type === 'bulletList' || c.type === 'orderedList');
      if (text.trim()) blocks.push(prefix + text.trim());
      for (const child of nested) walk(child, node.type === 'listItem' ? prefix : prefix);
      // Recurse into non-list children so nested content is not lost.
      for (const child of node.content ?? []) {
        if (child.type === 'listItem') walk(child, prefix);
        else if (child.type === 'bulletList' || child.type === 'orderedList') for (const li of child.content ?? []) walk(li, prefix);
        else if (!['text', 'hardBreak', 'mention', 'inlineCard'].includes(child.type) && !BLOCK.has(child.type)) walk(child, prefix);
      }
      return;
    }
    for (const child of node.content ?? []) walk(child, prefix);
  };

  walk(doc);
  return blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Jira API v2 returns a plain string body; v3 returns ADF. Accept both. */
export function commentBodyToText(body) {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && body.type) return adfToText(body);
  return '';
}
