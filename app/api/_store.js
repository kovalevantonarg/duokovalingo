// @ts-check
/**
 * Progress storage in Supabase, one row per user. The tables live in the private `drill` schema; the function
 * talks to them only through security-definer RPCs that check DRILL_DB_KEY (see supabase/migrations/).
 *
 * Writes use optimistic concurrency: read the progress with its version, change it, write it back only if the
 * version is unchanged, otherwise read again and retry. Two devices saving at the same moment can't overwrite
 * each other's attempts.
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
    if (!r.ok)
      throw Object.assign(new Error(`rpc ${fn} ${r.status}: ${text.slice(0, 200)}`), {
        status: r.status,
        body: text,
      });
    return text ? JSON.parse(text) : null;
  }

  /** Create or refresh a user at sign-in. `owner` takes over the single-user progress on first sign-in. */
  const login = (id, email, name, owner) =>
    rpc("drill_user_login", { p_id: id, p_email: email, p_name: name, p_owner: !!owner });

  /** Count one AI call for today; false when the user is over `limit`. */
  const useAi = async (user, day, limit) =>
    (await rpc("drill_ai_use", { p_user: user, p_day: day, p_limit: limit })) !== null;

  /** [{ user, data }] for every user with push subscriptions. */
  const withPush = () => rpc("drill_progress_with_push");

  /** Storage scoped to one user. @param {string} user */
  function forUser(user) {
    async function read() {
      const r = await rpc("drill_progress_get", { p_user: user });
      return { db: r.data ?? empty(), version: r.version };
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
        const v = await rpc("drill_progress_put", { p_user: user, p_data: db, p_version: version });
        if (v !== null) return { db, changed: true, result };
      }
      throw new Error("progress was saved from another device at the same moment, try again");
    }

    /** Store one graded exam attempt. */
    const addExam = (exam) => rpc("drill_user_exam_add", { p_user: user, p_exam: exam });

    /**
     * Exam attempts, oldest first. With a ticket number: that ticket's attempts with answer and verdict text;
     * without: every attempt, without the texts (enough for scores).
     * @param {number | null} [ticket]
     */
    const exams = (ticket = null) =>
      rpc("drill_user_exams", { p_user: user, p_ticket: ticket, p_full: ticket !== null });

    return { read, update, addExam, exams };
  }

  return { rpc, login, useAi, withPush, forUser };
}
