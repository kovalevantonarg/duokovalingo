// @ts-check
/**
 * Progress storage in Supabase. The tables live in the private `drill` schema; the function talks to them only
 * through security-definer RPCs that check DRILL_DB_KEY (see supabase/migrations/).
 *
 * Writes use optimistic concurrency: read the progress with its version, change it, write it back only if the
 * version is unchanged, otherwise read again and retry. Two devices saving at the same moment can't overwrite
 * each other's attempts.
 *
 * Until the migration is applied the old RPCs (drill_load / drill_save, exams inside the progress row) are used,
 * so deploying this code before running the SQL doesn't break anything.
 */

const empty = () => ({ items: [], history: [] });

/** @param {{ url: string, anonKey: string, dbKey: string, fetch?: typeof fetch }} cfg */
export function createStore({ url, anonKey, dbKey, fetch: doFetch = globalThis.fetch }) {
  /** @param {string} fn @param {object} [args] */
  async function rpc(fn, args = {}) {
    const r = await doFetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, "content-type": "application/json" },
      body: JSON.stringify({ p_key: dbKey, ...args }),
    });
    const text = await r.text();
    if (!r.ok) throw Object.assign(new Error(`rpc ${fn} ${r.status}: ${text.slice(0, 200)}`), { status: r.status, body: text });
    return text ? JSON.parse(text) : null;
  }
  /** PostgREST answers 404 / PGRST202 when a function doesn't exist (migration not applied yet). */
  const isMissing = (e) => e.status === 404 || /PGRST202|Could not find the function/.test(e.body || "");
  /** null until we know; then true = versioned RPCs exist, false = old RPCs only */
  let migrated = null;

  async function read() {
    if (migrated !== false) {
      try {
        const r = await rpc("drill_state_get");
        migrated = true;
        return { db: r.data ?? empty(), version: r.version };
      } catch (e) {
        if (!isMissing(e)) throw e;
        migrated = false;
      }
    }
    return { db: (await rpc("drill_load")) ?? empty(), version: null };
  }

  /** @returns {Promise<boolean>} false when someone else wrote since `version` was read */
  async function write(db, version) {
    if (version === null) {
      await rpc("drill_save", { p_data: db });
      return true;
    }
    return (await rpc("drill_state_put", { p_data: db, p_version: version })) !== null;
  }

  /**
   * Read, apply `change`, write back; retry from a fresh read if another write happened in between.
   * `change` mutates db and returns false to skip writing (nothing to change / invalid input).
   * @param {(db: any) => unknown} change
   */
  async function update(change, tries = 4) {
    for (let i = 0; i < tries; i++) {
      const { db, version } = await read();
      const result = change(db);
      if (result === false) return { db, changed: false, result };
      if (await write(db, version)) return { db, changed: true, result };
    }
    throw new Error("progress was saved from another device at the same moment, try again");
  }

  /** Store one graded exam attempt. Before the migration it goes into the progress row, as before. */
  async function addExam(exam) {
    if (migrated === null) await read();
    if (migrated) return void (await rpc("drill_exam_add", { p_exam: exam }));
    await update((db) => {
      db.exams = Array.isArray(db.exams) ? db.exams : [];
      db.exams.push(exam);
      if (db.exams.length > 400) db.exams.splice(0, db.exams.length - 400);
    });
  }

  /**
   * Exam attempts, oldest first. With a ticket number: that ticket's attempts with answer and verdict text;
   * without: every attempt, without the texts (enough for scores on the chips).
   * @param {number | null} [ticket]
   */
  async function exams(ticket = null) {
    if (migrated === null) await read();
    if (migrated) return rpc("drill_exams", { p_ticket: ticket, p_full: ticket !== null });
    const { db } = await read();
    const all = Array.isArray(db.exams) ? db.exams : [];
    return ticket === null ? all.map(({ answer, verdict, ...e }) => e) : all.filter((e) => e.n === ticket);
  }

  /** After the migration: move attempts an older deploy left inside the progress row into the exams table. */
  async function moveLeftoverExams(db) {
    if (!migrated || !Array.isArray(db.exams) || !db.exams.length) return;
    for (const e of db.exams) await rpc("drill_exam_add", { p_exam: e });
    await update((d) => (Array.isArray(d.exams) ? void delete d.exams : false));
  }

  return { rpc, read, update, addExam, exams, moveLeftoverExams };
}
