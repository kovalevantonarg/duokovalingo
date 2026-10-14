// Saving words while reading: select an English word or phrase anywhere in the app and a small button offers to
// add it to the dictionary, with the sentence it came from. Saved words are underlined in lessons and answers;
// tapping one shows its translation.
import { savable, wordKey } from "../lib/words.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { dropWord, saveWord, savedWord } from "./store.js";
import { ui } from "./ui.js";
import { esc } from "./util.js";

let pop = null;
const hide = () => {
  if (pop) pop.remove();
  pop = null;
};

/** The ticket the current screen is about, if any (#t/12, #learn/12, #exam/12, #play/12/tf). */
const ticketHere = () =>
  Number((location.hash.match(/^#(?:t|learn|exam|play)\/(\d+)/) || [])[1]) || undefined;

/** The sentence around the selection, for context on the flashcard. */
function sentenceOf(range, text) {
  const block = (
    range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement
  )?.closest("p, li, dd, td, q, .stmt, .q, .box, .vp, .cloze, .why, .tt, .sub, h1, h2, h3");
  const all = (block?.textContent || text).replace(/\s+/g, " ").trim();
  const low = text.toLowerCase();
  return all.split(/(?<=[.!?])\s+/).find((s) => s.toLowerCase().includes(low)) || all.slice(0, 300);
}

function place(el, rect) {
  document.body.appendChild(el);
  const w = el.offsetWidth,
    h = el.offsetHeight;
  // below the selection: on phones the system menu sits above it
  let top = rect.bottom + 10;
  if (top + h > innerHeight - 70) top = Math.max(8, rect.top - h - 10);
  top = Math.min(Math.max(8, top), innerHeight - h - 8);
  el.style.left = Math.max(8, Math.min(innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)) + "px";
  el.style.top = top + "px";
}

function wordCard(word, key) {
  return `<div class="wc"><b>${esc(word.w)}</b>${word.ipa ? `<span class="ipa">${esc(word.ipa)}</span>` : ""}</div>${word.tr ? `<div class="wtr">${esc(word.tr)}</div>` : `<div class="wtr wdim">${ui().noTr}</div>`}${word.def ? `<div class="wdef">${esc(word.def)}</div>` : ""}
    <div class="wact"><a href="#words?w=${encodeURIComponent(key)}">${ui().openDict}</a><button data-rm="${esc(key)}">${ui().remove}</button></div>`;
}

function showPill(text, range) {
  hide();
  const rect = range.getBoundingClientRect();
  const known = savedWord(text);
  pop = document.createElement("div");
  pop.className = "wpop v-app";
  pop.innerHTML = known
    ? wordCard(known, wordKey(text))
    : `<button class="wadd">${icon.plus}${ui().addWord}</button>`;
  place(pop, rect);
  const add = pop.querySelector(".wadd");
  if (add) {
    const ctx = sentenceOf(range, text);
    add.onmousedown = (e) => e.preventDefault(); // keep the selection while tapping
    add.onclick = async () => {
      add.disabled = true;
      add.innerHTML = icon.check + ui().adding;
      const key = await saveWord(text, ctx, ticketHere());
      getSelection()?.removeAllRanges();
      const w = state.db.words?.[key];
      if (!pop) return;
      pop.innerHTML = w
        ? `<div class="wok">${icon.check}${ui().added}</div>` + wordCard(w, key)
        : `<div class="wok">${ui().addFailed}</div>`;
      wireCard();
      markWords(document.getElementById("app"));
    };
  }
  wireCard();
}

function wireCard() {
  pop?.querySelectorAll("[data-rm]").forEach(
    (b) =>
      (b.onclick = async () => {
        await dropWord(b.dataset.rm);
        hide();
        unmark(b.dataset.rm);
      }),
  );
  pop?.querySelectorAll("a").forEach((a) => a.addEventListener("click", hide));
}

let timer = null;
function onSelect() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const sel = getSelection();
    // a collapsed selection keeps the button: on phones tapping it can clear the selection first; a tap elsewhere hides it
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const host =
      range.commonAncestorContainer.nodeType === 1
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    if (!host?.closest("#app") || host.closest("input, textarea, [contenteditable], pre, .wpop")) return;
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (savable(text)) showPill(text, range);
  }, 280);
}

// ---- saved words underlined in reading text ----

const SKIP = "pre, code, a, button, input, textarea, .wpop, mark.vw, .kbd, .h1, h1, h2, h3";
export function markWords(root) {
  if (!root || !state.db.words) return;
  const keys = Object.keys(state.db.words).filter((k) => k.length > 1);
  if (!keys.length) return;
  // the word and its common endings: "token" also marks "tokens"
  const alt = keys
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const rx = new RegExp(`(?<![\\p{L}\\p{N}])(${alt})(?:s|es|d|ed|ing)?(?![\\p{L}\\p{N}])`, "giu");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest(SKIP) || !/[A-Za-z]/.test(n.nodeValue)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const t = node.nodeValue;
    rx.lastIndex = 0;
    if (!rx.test(t)) continue;
    rx.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let i = 0;
    for (const m of t.matchAll(rx)) {
      frag.append(t.slice(i, m.index));
      const mk = document.createElement("mark");
      mk.className = "vw";
      mk.dataset.w = m[1].toLowerCase();
      mk.textContent = m[0];
      frag.append(mk);
      i = m.index + m[0].length;
    }
    frag.append(t.slice(i));
    node.replaceWith(frag);
  }
}
function unmark(key) {
  document
    .querySelectorAll(`mark.vw[data-w="${CSS.escape(key)}"]`)
    .forEach((m) => m.replaceWith(m.textContent));
}

export function initVocab() {
  document.addEventListener("selectionchange", onSelect);
  document.addEventListener("click", (e) => {
    const mk = e.target.closest("mark.vw");
    if (mk && getSelection()?.isCollapsed !== false) {
      const w = savedWord(mk.dataset.w);
      if (!w) return;
      hide();
      pop = document.createElement("div");
      pop.className = "wpop v-app";
      pop.innerHTML = wordCard(w, wordKey(mk.dataset.w));
      place(pop, mk.getBoundingClientRect());
      wireCard();
      return;
    }
    if (pop && !e.target.closest(".wpop")) hide();
  });
  addEventListener("scroll", () => pop?.querySelector(".wok, .wc") || hide(), { passive: true });
  addEventListener("hashchange", hide);
  addEventListener("keydown", (e) => e.key === "Escape" && pop && hide());
}
