// Quick round: a mixed set of T/F questions across due items.
import { finish } from "../screens/verdict.js";
import { state } from "../state.js";
import { due, nextNew, ticketFor } from "../store.js";
import { ui } from "../ui.js";
import { shuffle } from "../util.js";
import { runGap } from "./fill-gap.js";
import { buildTF, clozeQs, runTF } from "./true-false.js";

export function quick() {
  const d = due()
    .slice(0, 3)
    .map((i) => i.id);
  const nn = nextNew();
  const ids = d.length ? d : nn ? [nn.id] : [17];
  state.combo = 0;
  const qs = buildTF(ids, 8);
  runTF(
    qs,
    (acc) => {
      const ts = ids.map(ticketFor).filter(Boolean);
      const gq = shuffle(ts.flatMap((t) => clozeQs(t))).slice(0, 5);
      runGap(gq, (g) =>
        finish(
          ids[0],
          "quick",
          acc.correct + g.correct,
          qs.length + g.total,
          acc.xp + g.xp,
          ids,
          acc.missedQ.concat(g.missedQ),
        ),
      );
    },
    ui().quick,
  );
}
