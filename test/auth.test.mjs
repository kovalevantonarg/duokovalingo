import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkState,
  cookie,
  googleAuthUrl,
  idTokenClaims,
  newState,
  readSession,
  sessionToken,
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

test("oauth state: matches its cookie, expires, can't be forged", () => {
  const st = newState(S, now);
  assert.equal(checkState(st.cookie, st.nonce, S, now), true);
  assert.equal(checkState(st.cookie, "other", S, now), false);
  assert.equal(checkState(st.cookie, st.nonce, S, now + 11 * 60e3), false);
  assert.equal(checkState(st.cookie.replace(/.$/, "x"), st.nonce, S, now), false);
  assert.match(
    googleAuthUrl({ clientId: "cid", redirectUri: "https://x/api/oauth", state: st.nonce }),
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
