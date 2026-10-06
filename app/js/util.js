// Small helpers with no app state: DOM lookup, local dates, shuffling, HTML escaping.
export const $ = (s) => document.querySelector(s);
export const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const TODAY = iso(new Date());
export const dLocal = (s) => new Date(s + "T12:00:00");
export const days = (f) => Math.round((dLocal(TODAY) - dLocal(f)) / 864e5);
export const shuffle = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// wrap code-ish tokens (max_tokens, tool_result, text/event-stream, temperature = 0) in <code>
export const codify = (s) =>
  esc(s).replace(
    /\b([a-z]+_[a-z_]+|text\/event-stream|[A-Za-z]+\.[a-z]+\(\)|temperature = 0|temp 0|top_p|top_k|BM25|HNSW|pgvector)\b/g,
    "<code>$1</code>",
  );
