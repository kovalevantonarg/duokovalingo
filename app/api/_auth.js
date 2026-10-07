// @ts-check
// Sign-in with Google (OpenID Connect, authorization-code flow) and the session cookie.
// Pure functions except for randomness; unit-tested in test/auth.test.mjs.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_DAYS = 90;
const DAY = 864e5;
const b64 = (s) => Buffer.from(s).toString("base64url");
const unb64 = (s) => Buffer.from(s, "base64url").toString("utf8");
const hmac = (secret, s) => createHmac("sha256", secret).update(s).digest("base64url");
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Read one cookie from a Cookie header. */
export const cookie = (header, name) =>
  (String(header || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)) || [])[1] || "";

/**
 * Session cookie value: base64url(JSON { id, email, name, exp }) + "." + HMAC. Signed, not encrypted: it holds
 * nothing the user doesn't already know about themselves.
 * @param {{ id: string, email: string, name?: string }} user
 */
export function sessionToken(user, secret, now = Date.now()) {
  const body = b64(
    JSON.stringify({ id: user.id, email: user.email, name: user.name || "", exp: now + SESSION_DAYS * DAY }),
  );
  return `${body}.${hmac(secret, "v2:" + body)}`;
}

/** The signed-in user from a Cookie header, or null (missing, forged, expired, or an old v1 cookie). */
export function readSession(cookieHeader, secret, now = Date.now()) {
  const v = cookie(cookieHeader, "drill");
  const [body, sig] = v.split(".");
  if (!body || !sig || !secret || !safeEq(sig, hmac(secret, "v2:" + body))) return null;
  try {
    const s = JSON.parse(unb64(body));
    return s && typeof s.id === "string" && s.exp > now ? { id: s.id, email: s.email, name: s.name } : null;
  } catch {
    return null;
  }
}

/**
 * One-time `state` for the Google round trip. The state itself is signed (nonce.exp.sig), and the browser that
 * started the sign-in holds a cookie named after its nonce, so a second click or a second tab can't clobber it.
 */
export function newState(secret, now = Date.now()) {
  const nonce = randomBytes(12).toString("hex");
  const exp = now + 15 * 60e3;
  return { state: `${nonce}.${exp}.${hmac(secret, `st:${nonce}:${exp}`)}`, cookieName: stateCookie(nonce) };
}
export const stateCookie = (nonce) => `drill_st_${nonce}`;

/** null when the state checks out, otherwise why not: "state_invalid", "state_expired", "state_cookie". */
export function stateError(stateParam, cookieHeader, secret, now = Date.now()) {
  const [nonce, exp, sig] = String(stateParam || "").split(".");
  if (!nonce || !/^[0-9a-f]+$/.test(nonce) || !sig || !safeEq(sig, hmac(secret, `st:${nonce}:${exp}`)))
    return "state_invalid";
  if (!(Number(exp) > now)) return "state_expired";
  if (cookie(cookieHeader, stateCookie(nonce)) !== "1") return "state_cookie";
  return null;
}

export function googleAuthUrl({ clientId, redirectUri, state }) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/**
 * Claims of an ID token received straight from Google's token endpoint over TLS. Google's OpenID Connect docs
 * allow skipping the signature check in that case; issuer, audience, expiry and a verified email are checked.
 */
export function idTokenClaims(idToken, clientId, now = Date.now()) {
  const part = String(idToken || "").split(".")[1];
  if (!part) throw new Error("no id_token");
  const c = JSON.parse(unb64(part));
  if (!["https://accounts.google.com", "accounts.google.com"].includes(c.iss)) throw new Error("bad issuer");
  if (c.aud !== clientId) throw new Error("bad audience");
  if (!(c.exp * 1000 > now)) throw new Error("expired");
  if (!c.sub || !c.email || c.email_verified !== true) throw new Error("email not verified");
  return { id: String(c.sub), email: String(c.email).toLowerCase(), name: String(c.name || "") };
}

/** Exchange the authorization code for tokens and return the user. */
export async function googleUser({
  code,
  clientId,
  clientSecret,
  redirectUri,
  fetch: doFetch = globalThis.fetch,
}) {
  const r = await doFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || "token " + r.status);
  return idTokenClaims(j.id_token, clientId);
}
