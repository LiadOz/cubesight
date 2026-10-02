// A tiny, safe markdown renderer for gallery posts (dev only, no libraries).
// Everything is HTML-escaped first; only a fixed set of tags is ever produced, and links/images are
// limited to http(s), '/', '#', and relative paths.

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const safeUrl = url => {
  const u = url.trim();
  return /^(?:https?:\/\/|\/(?!\/)|#|[\w.~%@-]+(?:[/?#][^\s]*)?$)/i.test(u) && !/^\s*(?:javascript|data|vbscript):/i.test(u) ? u : '';
};

/** Inline: `code`, **bold**, *italic*, ![alt](src), [text](href). `resolve` maps an image/link name to a URL. */
export function renderInline(raw, resolve = name => name) {
  const stash = [];
  const keep = html => `\uE000${stash.push(html) - 1}\uE000`;
  let text = escapeHtml(raw);
  text = text.replace(/`([^`]+)`/g, (_m, code) => keep(`<code>${code}</code>`));
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => {
    const url = safeUrl(src) && resolve(src.replace(/&amp;/g, '&'), 'image');
    return url ? keep(`<img src="${escapeHtml(url)}" alt="${alt}" loading="lazy" class="g-md-img">`) : alt;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
    const url = safeUrl(href) && resolve(href.replace(/&amp;/g, '&'), 'link');
    return url ? keep(`<a href="${escapeHtml(url)}"${/^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`) : label;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=$|[\s).,;:!?])/g, '$1<em>$2</em>');
  return text.replace(/\uE000(\d+)\uE000/g, (_m, i) => stash[Number(i)]);
}

/** Block level: headings, paragraphs, bullet/numbered lists, fenced code, blockquotes, rules. */
export function renderMarkdown(source, resolve = name => name) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const inline = text => renderInline(text, resolve);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const fence = /^```/.exec(line);
    if (fence) {
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i += 1; }
      i += 1;
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 5); // a post's own # is an h2 under the post title
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^(?:-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i += 1; continue; }
    const list = /^(\s*)([-*+]|\d+[.)])\s+/.exec(line);
    if (list) {
      const ordered = /\d/.test(list[2]);
      const items = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m && /\d/.test(m[2]) === ordered) { items.push(m[3]); i += 1; }
        else if (items.length && /^\s{2,}\S/.test(lines[i])) { items[items.length - 1] += ' ' + lines[i].trim(); i += 1; }
        else break;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map(item => `<li>${inline(item)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      out.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|>\s?|(\s*)([-*+]|\d+[.)])\s)/.test(lines[i])) { para.push(lines[i].trim()); i += 1; }
    if (!para.length) { para.push(line.trim()); i += 1; }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}
