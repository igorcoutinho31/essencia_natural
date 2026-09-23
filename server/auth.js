// Autenticação própria, sem framework: hash de senha com scrypt (nativo do
// Node, tão seguro quanto bcrypt para este caso) e sessão por cookie
// httpOnly guardada no banco. Nunca existe senha nem token em texto no
// front-end — o cliente só recebe um cookie de sessão opaco.
'use strict';

const crypto = require('node:crypto');
const db = require('./db');

const SESSION_COOKIE = 'en_admin_sessao';
const SESSION_DAYS = 7;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, hash) {
  const attempt = crypto.scryptSync(String(password), salt, 64);
  const real = Buffer.from(hash, 'hex');
  if (attempt.length !== real.length) return false;
  return crypto.timingSafeEqual(attempt, real);
}

function generateTempPassword() {
  // 10 caracteres, fácil de ditar por telefone: sem 0/O/1/l/I.
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(10);
  for (let i = 0; i < 10; i++) out += alfabeto[bytes[i] % alfabeto.length];
  return out;
}

function createSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, expires);
  return { id, expires };
}

function destroySession(id) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

function getUserBySession(sessionId) {
  if (!sessionId) return null;
  const row = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now') AND u.active = 1`
  ).get(sessionId);
  return row || null;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function setSessionCookie(res, sessionId, { secure } = {}) {
  const maxAge = SESSION_DAYS * 86400;
  const parts = [
    `${SESSION_COOKIE}=${sessionId}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

/** Lê a sessão do request (se houver) e anexa req.user. */
function attachUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies[SESSION_COOKIE];
  req.sessionId = sid || null;
  req.user = sid ? getUserBySession(sid) : null;
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  generateTempPassword,
  createSession,
  destroySession,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  attachUser,
};
