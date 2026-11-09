// Sign in with Google, for one person (or a short list of approved emails).
//
// How it works:
//   1. The page shows Google's "Sign in with Google" button (redirect mode, which also
//      works when the app is installed on a phone's home screen).
//   2. Google sends a signed ID token to POST /auth/google.
//   3. We check Google's signature, that the token was issued for OUR client id,
//      that the email is verified, and that it is on ALLOWED_EMAILS.
//   4. We set our own signed, httpOnly session cookie (30 days). Every /api request
//      needs it. Nothing is stored server-side, so it works on serverless hosting.
//
// Locally (no GOOGLE_CLIENT_ID, not hosted) login is off, as before.
// When hosted, login is REQUIRED: missing settings make the API refuse to serve data.

import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'ww_session';
const SESSION_DAYS = 30;
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
let googleKeys = null;

export function authConfig(env = process.env) {
  const clientId = (env.GOOGLE_CLIENT_ID || '').trim();
  const allowed = (env.ALLOWED_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const secret = env.SESSION_SECRET || '';
  const hosted = Boolean(env.VERCEL || env.NODE_ENV === 'production');
  if (!clientId && !hosted) return { mode: 'off' };
  const missing = [];
  if (!clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!allowed.length) missing.push('ALLOWED_EMAILS');
  if (secret.length < 32) missing.push('SESSION_SECRET (at least 32 characters)');
  if (missing.length) return { mode: 'misconfigured', missing };
  return { mode: 'google', clientId, allowed, secret, secureCookie: hosted || env.COOKIE_SECURE === '1' };
}

// ---------- Google ID token ----------

export async function verifyGoogleCredential(credential, { clientId, keys } = {}) {
  if (typeof credential !== 'string' || credential.length > 4096) throw new Error('Missing credential');
  googleKeys ||= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  const { payload } = await jwtVerify(credential, keys || googleKeys, { issuer: GOOGLE_ISSUERS, audience: clientId, clockTolerance: 60 });
  if (payload.email_verified !== true || typeof payload.email !== 'string') throw new Error('Email not verified');
  return { email: payload.email.toLowerCase(), name: typeof payload.name === 'string' ? payload.name : payload.email };
}

// ---------- session cookie ----------

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

export function createSession(user, secret, now = Date.now()) {
  const body = b64(JSON.stringify({ email: user.email, name: user.name, exp: now + SESSION_DAYS * 86400000 }));
  return `${body}.${sign(body, secret)}`;
}

/** Returns the session's user, or null if missing, tampered with, expired or no longer allowed. */
export function readSession(token, config, now = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = sign(body, config.secret);
  const a = Buffer.from(mac || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!data || typeof data.exp !== 'number' || data.exp < now) return null;
  if (!config.allowed.includes(String(data.email).toLowerCase())) return null; // removing an email signs it out
  return { email: data.email, name: data.name, exp: data.exp };
}

export function sessionCookie(token, config) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${config.secureCookie ? '; Secure' : ''}`;
}

export function clearedCookie(config) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.secureCookie ? '; Secure' : ''}`;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ---------- security headers (also mirrored in vercel.json for static files) ----------

export const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com/gsi/client",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://*.googleusercontent.com",
    "frame-src https://accounts.google.com/gsi/",
    "connect-src 'self' https://accounts.google.com/gsi/",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
