// The small Markdown subset the lab READMEs use: paragraphs, **bold**, `code`, [links](url), "- " lists,
// "> " quotes and ``` fences. Input is escaped first, so the text can't inject HTML.
import { esc } from "./util.js";

/** Inline marks inside one line or paragraph. */
export function mdInline(s) {
  const codes = [];
  let h = esc(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  h = h
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return h.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

/** Blocks: fenced code, lists, quotes, paragraphs. */
export function md(src) {
  const out = [];
  const lines = String(src || "")
    .replace(/\r/g, "")
    .split("\n");
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    const fence = l.match(/^```(\w*)/);
    if (fence) {
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) body.push(lines[i]);
      i++;
      out.push(
        `<pre class="mdpre">${fence[1] ? `<span class="lang">${esc(fence[1])}</span>` : ""}<code>${esc(body.join("\n"))}</code></pre>`,
      );
    } else if (/^- /.test(l)) {
      const items = [];
      for (; i < lines.length && /^- /.test(lines[i]); i++)
        items.push(`<li>${mdInline(lines[i].slice(2))}</li>`);
      out.push(`<ul>${items.join("")}</ul>`);
    } else if (/^>\s?/.test(l)) {
      const q = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]); i++) q.push(lines[i].replace(/^>\s?/, ""));
      out.push(`<blockquote>${mdInline(q.join(" "))}</blockquote>`);
    } else if (!l.trim()) i++;
    else {
      const p = [];
      for (; i < lines.length && lines[i].trim() && !/^(```|- |>)/.test(lines[i]); i++) p.push(lines[i]);
      out.push(`<p>${mdInline(p.join(" "))}</p>`);
    }
  }
  return out.join("");
}
