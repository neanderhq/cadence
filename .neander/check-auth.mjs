// Runtime verification only; run exclusively against a disposable development database.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { Client } from "pg";

const origin = process.argv[2];
assert.ok(origin, "Pass the isolated test app origin");
if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) {
  throw new Error("DATABASE_URL and BETTER_AUTH_SECRET are required");
}

const database = new Client({ connectionString: process.env.DATABASE_URL });
await database.connect();
const userId = randomUUID();
const token = randomUUID();
const signedToken = encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(token).digest("base64")}`);
const cookie = `better-auth.session_token=${signedToken}`;

try {
  await database.query('INSERT INTO "user" (id,name,email,email_verified) VALUES ($1,$2,$3,true)', [userId, "Session test", `${userId}@example.invalid`]);
  await database.query('INSERT INTO "session" (id,token,user_id,expires_at,created_at,updated_at) VALUES ($1,$2,$3,NOW()+INTERVAL \'1 day\',NOW(),NOW())', [randomUUID(), token, userId]);
  assert.equal((await fetch(`${origin}/api/me`)).status, 401);
  assert.equal((await fetch(`${origin}/api/me`, { headers: { cookie: `${cookie}tampered` } })).status, 401);
  const authenticated = await fetch(`${origin}/api/me`, { headers: { cookie } });
  assert.equal(authenticated.status, 200, await authenticated.text());
  const csrf = await fetch(`${origin}/api/auth/sign-out`, {
    method: "POST",
    headers: { cookie, origin: "https://attacker.invalid", "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(csrf.status, 403);
  const logout = await fetch(`${origin}/api/auth/sign-out`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(logout.status, 200, await logout.text());
  assert.equal((await fetch(`${origin}/api/me`, { headers: { cookie } })).status, 401);
  console.log("Better Auth anonymous, tampered-cookie, persisted-session, CSRF, and logout checks passed");
} finally {
  await database.query('DELETE FROM "user" WHERE id=$1', [userId]);
  await database.end();
}
