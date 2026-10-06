// @ts-check
// Web Push helpers for the drill API: subscription storage in the progress row and the morning reminder text.
// Pure functions only (no web-push import), so they are unit-tested in test/push.test.mjs.
import { dueTickets } from "../lib/srs.js";

export const MAX_SUBS = 5;
const MIN_PER_TICKET = 3;

/** Russian plural: plural(3, ["билет", "билета", "билетов"]) → "билета". */
export function plural(n, [one, few, many]) {
  const m10 = n % 10,
    m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** YYYY-MM-DD in a time zone (history dates are the client's local dates). */
export const dayIn = (tz, now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);

/**
 * Should the morning reminder go out, and with what text? null = don't send.
 * Skips when nothing is due or when there's already activity on `today`.
 * @param {any} db progress (schema 2)
 * @param {string} today YYYY-MM-DD in the user's time zone
 */
export function reminder(db, today) {
  if ((db.history || []).some((h) => h && h.d === today)) return null;
  // srs counts days with local-date getters; noon of `today` keeps that right whatever the server's zone
  const due = dueTickets(db, new Date(`${today}T12:00:00`)).length;
  if (!due) return null;
  const min = Math.max(5, Math.ceil((due * MIN_PER_TICKET) / 5) * 5);
  const body = `${due} ${plural(due, ["билет", "билета", "билетов"])} на повтор · ${min} ${plural(min, ["минута", "минуты", "минут"])}`;
  return { title: "duokovalingo", body, url: "/#session", due };
}

const str = (s, max) => typeof s === "string" && s.length > 0 && s.length <= max;

/** A PushSubscription as JSON from the browser → { endpoint, keys: { p256dh, auth } }, or null if malformed. */
export function cleanSub(sub) {
  if (!sub || typeof sub !== "object") return null;
  const { endpoint, keys } = sub;
  if (!str(endpoint, 1000) || !keys || !str(keys.p256dh, 200) || !str(keys.auth, 100)) return null;
  try {
    if (new URL(endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/** Add (or refresh) a subscription, newest last, at most MAX_SUBS. Mutates db. */
export function addSub(db, sub) {
  const subs = (Array.isArray(db.pushSubs) ? db.pushSubs : []).filter((s) => s.endpoint !== sub.endpoint);
  subs.push(sub);
  db.pushSubs = subs.slice(-MAX_SUBS);
  return true;
}

/** Remove subscriptions by endpoint. Returns false when none matched (nothing to write). */
export function removeSubs(db, endpoints) {
  const gone = new Set(endpoints);
  const subs = Array.isArray(db.pushSubs) ? db.pushSubs : [];
  const keep = subs.filter((s) => !gone.has(s.endpoint));
  if (keep.length === subs.length) return false;
  if (keep.length) db.pushSubs = keep;
  else delete db.pushSubs;
  return true;
}
