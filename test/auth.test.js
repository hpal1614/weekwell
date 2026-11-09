import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { SECURITY_HEADERS, authConfig, createSession, readSession } from '../lib/auth.js';
import { createApp } from '../lib/app.js';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const SECRET = 'x'.repeat(40);
const auth = { mode: 'google', clientId: CLIENT_ID, allowed: ['me@example.com'], secret: SECRET, secureCookie: false };

// A fake database: enough for /api/state to start blank.
const memory = { row: null };
const db = {
  query: async (text) => (text.startsWith('SELECT payload') && memory.row ? [{ payload: memory.row }] : []),
  batch: async (statements) => { const s = statements.find((x) => x.text.includes('weekwell_state')); if (s) memory.row = JSON.parse(s.params[0]); return []; },
};

let server, base, googleKey, otherKey, keys;

async function googleToken(claims = {}, key = googleKey) {
  return new SignJWT({ email: 'me@example.com', email_verified: true, name: 'Me', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(claims.iss || 'https://accounts.google.com')
    .setAudience(claims.aud || CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(claims.expired ? Math.floor(Date.now() / 1000) - 3600 : '1h')
    .sign(key);
}

async function login(token) {
  return fetch(`${base}/auth/google`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ credential: token }),
  });
}

before(async () => {
  const pair = await generateKeyPair('RS256');
  googleKey = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'test', alg: 'RS256' }] });
  server = createApp(db, { auth, googleKeys: keys, logErrors: false }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

test('login is off locally, required when hosted, and fails closed if half set up', () => {
  assert.equal(authConfig({}).mode, 'off');
  const hosted = authConfig({ VERCEL: '1' });
  assert.equal(hosted.mode, 'misconfigured');
  assert.deepEqual(hosted.missing, ['GOOGLE_CLIENT_ID', 'ALLOWED_EMAILS', 'SESSION_SECRET (at least 32 characters)']);
  assert.equal(authConfig({ GOOGLE_CLIENT_ID: 'x' }).mode, 'misconfigured');
  const ok = authConfig({ VERCEL: '1', GOOGLE_CLIENT_ID: 'id', ALLOWED_EMAILS: ' Me@Example.com , you@x.com', SESSION_SECRET: SECRET });
  assert.equal(ok.mode, 'google');
  assert.deepEqual(ok.allowed, ['me@example.com', 'you@x.com']);
  assert.equal(ok.secureCookie, true);
});

test('session cookies cannot be forged, reused after expiry, or kept after removal from the list', () => {
  const token = createSession({ email: 'me@example.com', name: 'Me' }, SECRET);
  assert.equal(readSession(token, auth).email, 'me@example.com');
  const [body, mac] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ email: 'me@example.com', exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal(readSession(`${forged}.${mac}`, auth), null);
  assert.equal(readSession(`${body}.${mac.slice(0, -2)}xx`, auth), null);
  assert.equal(readSession(createSession({ email: 'me@example.com' }, 'y'.repeat(40)), auth), null);
  assert.equal(readSession(createSession({ email: 'me@example.com' }, SECRET, Date.now() - 31 * 86400000), auth), null);
  assert.equal(readSession(token, { ...auth, allowed: ['someone@else.com'] }), null);
  assert.equal(readSession(undefined, auth), null);
});

test('no data without signing in', async () => {
  for (const path of ['/api/state', '/api/transactions', '/api/export', '/api/health', '/api/me']) {
    assert.equal((await fetch(base + path)).status, 401, path);
  }
  assert.equal((await fetch(`${base}/api/state`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  const config = await (await fetch(`${base}/auth/config`)).json();
  assert.deepEqual(config, { mode: 'google', clientId: CLIENT_ID });
});

test('signing in with the approved Google account works end to end', async () => {
  const res = await login(await googleToken());
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/');
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /^ww_session=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);
  const jar = cookie.split(';')[0];
  const me = await (await fetch(`${base}/api/me`, { headers: { cookie: jar } })).json();
  assert.deepEqual(me, { email: 'me@example.com', name: 'Me' });
  const state = await fetch(`${base}/api/state`, { headers: { cookie: jar } });
  assert.equal(state.status, 200);
  assert.equal((await state.json()).version, 3);

  // Changes from the app itself are fine; from another site they are blocked.
  const st = memory.row;
  const same = await fetch(`${base}/api/state`, { method: 'PUT', headers: { cookie: jar, 'Content-Type': 'application/json', Origin: base, 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify(st) });
  assert.equal(same.status, 200);
  const evil = await fetch(`${base}/api/state`, { method: 'PUT', headers: { cookie: jar, 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify(st) });
  assert.equal(evil.status, 403);
  const crossSite = await fetch(`${base}/api/transactions/1`, { method: 'DELETE', headers: { cookie: jar, 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(crossSite.status, 403);
});

test('other accounts and bad tokens are turned away without a session', async () => {
  const cases = [
    [await googleToken({ email: 'stranger@example.com' }), 'denied'],
    [await googleToken({ email_verified: false }), 'failed'],
    [await googleToken({ aud: 'someone-elses-client' }), 'failed'],
    [await googleToken({ iss: 'https://evil.example' }), 'failed'],
    [await googleToken({ expired: true }), 'failed'],
    [await googleToken({}, otherKey), 'failed'],
    ['not-a-token', 'failed'],
  ];
  for (const [token, reason] of cases) {
    const res = await login(token);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), `/?login=${reason}`);
    assert.equal(res.headers.get('set-cookie'), null);
  }
});

test('a hosted server with missing login settings refuses to serve data', async () => {
  const s = createApp(db, { auth: { mode: 'misconfigured', missing: ['GOOGLE_CLIENT_ID'] }, logErrors: false }).listen(0);
  const res = await fetch(`http://127.0.0.1:${s.address().port}/api/state`);
  s.close();
  assert.equal(res.status, 503);
});

test('security headers are sent, and vercel.json sends the same ones for static files', async () => {
  const res = await fetch(`${base}/auth/config`);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(res.headers.get(k), v, k);
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sent = Object.fromEntries(vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]));
  assert.deepEqual(sent, SECURITY_HEADERS);
});
