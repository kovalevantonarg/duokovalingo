// Hash router. Tabs: #home, #tickets, #learn, #words, #progress. Inside them: #t/<n> (ticket), #ref/<n>, #learn/<n>.
// My words: #words (?w=<word> opens one). Full-screen rounds: #exam/<n>, #play/<n>/<tf|gap|order|voice>, #session, #interview, #wplay.
import { ticketOfItem } from "../lib/srs.js";
import { playGap } from "./games/fill-gap.js";
import { interview } from "./games/interview.js";
import { playOrder } from "./games/order.js";
import { session } from "./games/session.js";
import { playTF } from "./games/true-false.js";
import { playVoice } from "./games/voice.js";
import { drawTicket, examScreen } from "./screens/exam.js";
import { home } from "./screens/home.js";
import { lessonScreen, lessonsIndex } from "./screens/learn.js";
import { loginScreen } from "./screens/login.js";
import { progress } from "./screens/progress.js";
import { closeSheet } from "./screens/settings.js";
import { hub, ticketList } from "./screens/tickets.js";
import { wordPlay, wordsScreen } from "./screens/words.js";
import { stopSpeaking } from "./speech.js";
import { state } from "./state.js";
import { tk } from "./store.js";
import { setTab } from "./ui.js";

const ROUNDS = new Set(["play", "session", "interview", "wplay", "exam"]);
let prev = "";

/** Old links: /exam-tickets.html#t12, /learn.html#t5, /map.html arrive as /?from=…#… (see vercel.json). */
export function upgradeOldLink() {
  const from = new URLSearchParams(location.search).get("from");
  if (!from) return;
  const n = (location.hash.match(/^#t(\d+)$/) || [])[1];
  const core = (location.hash.match(/^#core-(\d+)$/) || [])[1];
  const hash =
    from === "exam"
      ? n
        ? `exam/${n}`
        : core
          ? `t/${ticketOfItem(core)}`
          : "tickets"
      : from === "learn"
        ? n
          ? `learn/${n}`
          : "learn"
        : "progress";
  history.replaceState(null, "", "/#" + hash);
}

export function route() {
  closeSheet();
  state.leave?.(); // the screen being left saves what it tracks (lesson time, reading position)
  state.leave = null;
  document.onkeydown = null;
  state.rerender = null;
  stopSpeaking();
  if (state.needLogin) return loginScreen();
  const h = location.hash.slice(1) || "home";
  const [path, query] = h.split("?");
  const [scr, a, b] = path.split("/");
  // a round remembers where it was opened from, and returns there
  if (ROUNDS.has(scr) && !ROUNDS.has(prev.split("/")[0])) state.back = prev || "home";
  prev = h;
  setTab(scr);
  if (!(scr === "learn" && a)) window.scrollTo(0, 0);
  switch (scr) {
    case "play": {
      const play = { tf: playTF, gap: playGap, order: playOrder, voice: playVoice }[b];
      return play && tk(a) ? play(+a) : home();
    }
    case "session":
      return session();
    case "interview":
      return interview();
    case "tickets":
      return ticketList();
    case "t":
      return tk(a) ? hub(+a) : ticketList();
    case "exam": // the exam: speak or type, then the AI's grade or your own (games/voice.js)
      return tk(a) ? playVoice(+a) : void location.replace("#exam/" + drawTicket());
    case "ref": // reference with its source ledger and past attempts
      return tk(a) ? examScreen(+a) : ticketList();
    case "learn":
      return a && tk(a) ? lessonScreen(+a) : lessonsIndex();
    case "progress":
      return progress();
    case "words":
      return wordsScreen(new URLSearchParams(query || ""));
    case "wplay":
      return wordPlay();
    case "item": // links from before tickets were the unit of progress
      return void (location.hash = "t/" + (ticketOfItem(a) || ""));
    default:
      return home();
  }
}

/** Navigate with a cross-fade where the browser supports view transitions. */
export function go() {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduce) return route();
  document.startViewTransition(() => route());
}
