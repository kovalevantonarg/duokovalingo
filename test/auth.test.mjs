import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cookie,
  googleAuthUrl,
  idTokenClaims,
  newState,
  readSession,
  sessionToken,
  stateError,
} from "../app/api/_auth.js";

const S = "secret";
const jwt = (claims) => ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");
const now = Date.UTC(2026, 9, 7);

test("session cookie round trip, forgery and expiry", () => {
  const v = sessionToken({ id: "123", email: "a@b.c", name: "A" }, S, now);
  assert.deepEqual(readSession(`x=1; drill=${v}`, S, now), { id: "123", email: "a@b.c", name: "A" });
  assert.equal(readSession(`drill=${v}`, "other", now), null);
  const [body, sig] = v.split(".");
  const evil = Buffer.from(JSON.stringify({ id: "999", email: "x", exp: now + 1e9 })).toString("base64url");
  assert.equal(readSession(`drill=${evil}.${sig}`, S, now), null);
  assert.equal(readSession(`drill=${body}.${sig}`, S, now + 91 * 864e5), null);
  assert.equal(readSession("drill=1790000000000.abcdef", S, now), null, "old v1 cookie");
  assert.equal(cookie("a=1; b=2", "b"), "2");
});

test("oauth state: signed, bound to its own cookie, expires", () => {
  const st = newState(S, now);
  const ck = `${st.cookieName}=1`;
  assert.equal(stateError(st.state, ck, S, now), null);
  assert.equal(stateError(st.state, `other=1; ${ck}`, S, now), null);
  assert.equal(stateError(st.state, "", S, now), "state_cookie");
  assert.equal(stateError(st.state, ck, S, now + 16 * 60e3), "state_expired");
  assert.equal(
    stateError(
      st.state.replace(/.$/, (c) => (c === "A" ? "B" : "A")),
      ck,
      S,
      now,
    ),
    "state_invalid",
  );
  assert.equal(stateError("", ck, S, now), "state_invalid");
  // a second sign-in started meanwhile doesn't break the first one
  const st2 = newState(S, now);
  assert.equal(stateError(st.state, `${ck}; ${st2.cookieName}=1`, S, now), null);
  assert.match(
    googleAuthUrl({ clientId: "cid", redirectUri: "https://x/api/oauth", state: st.state }),
    /scope=openid\+email\+profile/,
  );
});

test("id token checks", () => {
  const ok = {
    iss: "https://accounts.google.com",
    aud: "cid",
    exp: now / 1000 + 60,
    sub: "42",
    email: "Me@Gmail.com",
    email_verified: true,
    name: "Me",
  };
  assert.deepEqual(idTokenClaims(jwt(ok), "cid", now), { id: "42", email: "me@gmail.com", name: "Me" });
  assert.throws(() => idTokenClaims(jwt({ ...ok, aud: "x" }), "cid", now), /audience/);
  assert.throws(() => idTokenClaims(jwt({ ...ok, iss: "evil" }), "cid", now), /issuer/);
  assert.throws(() => idTokenClaims(jwt({ ...ok, exp: now / 1000 - 1 }), "cid", now), /expired/);
  assert.throws(() => idTokenClaims(jwt({ ...ok, email_verified: false }), "cid", now), /verified/);
});
