// Autenticação própria: hash de senha com scrypt (node:crypto — funciona
// igual no Worker da Cloudflare com `nodejs_compat` e no Node; os hashes já
// gravados continuam valendo) e sessão por cookie httpOnly guardada no
// banco. Nunca existe senha nem token em texto no front-end.
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

export const SESSION_COOKIE = 'en_admin_sessao';
export const SESSION_DAYS = 7;

// Anti força-bruta: 5 erros seguidos para o mesmo usuário (ou 20 vindos do
// mesmo IP) dentro de 15 minutos bloqueiam novas tentativas por 15 minutos.
export const LOGIN_LIMITS = { perUser: 5, perIp: 20, windowMinutes: 15, lockMinutes: 15 };

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, hash) {
  const attempt = crypto.scryptSync(String(password), salt, 64);
  const real = Buffer.from(String(hash), 'hex');
  if (attempt.length !== real.length) return false;
  return crypto.timingSafeEqual(attempt, real);
}

export function generateTempPassword() {
  // 10 caracteres, fácil de ditar por telefone: sem 0/O/1/l/I.
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(10);
  for (let i = 0; i < 10; i++) out += alfabeto[bytes[i] % alfabeto.length];
  return out;
}

// SQLite guarda datas como 'AAAA-MM-DD HH:MM:SS' (UTC) — mesmo formato de
// datetime('now'), para as comparações em SQL funcionarem.
export function sqlDate(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

export async function createSession(db, userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = sqlDate(new Date(Date.now() + SESSION_DAYS * 86400000));
  await db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(id, userId, expires).run();
  return { id, expires };
}

export async function destroySession(db, id) {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
}

export async function destroyUserSessions(db, userId, exceptId = '') {
  await db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').bind(userId, exceptId).run();
}

export async function getUserBySession(db, sessionId) {
  if (!sessionId || !/^[0-9a-f]{64}$/.test(sessionId)) return null;
  return db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now') AND u.active = 1`
  ).bind(sessionId).first();
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) { try { out[k] = decodeURIComponent(v); } catch { out[k] = v; } }
  }
  return out;
}

export function sessionCookie(sessionId, { secure }) {
  const parts = [`${SESSION_COOKIE}=${sessionId}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie({ secure }) {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

// ---------- limite de tentativas de login ----------

function attemptKeys(ip, username) {
  return [`user:${String(username).toLowerCase()}`, `ip:${ip || 'desconhecido'}`];
}

/** Devolve quantos segundos faltam para liberar, ou 0 se pode tentar. */
export async function loginLockedFor(db, ip, username) {
  const keys = attemptKeys(ip, username);
  const row = await db.prepare(
    `SELECT MAX(CAST(strftime('%s', locked_until) AS INTEGER) - CAST(strftime('%s','now') AS INTEGER)) AS secs
       FROM login_attempts WHERE key IN (?, ?) AND locked_until > datetime('now')`
  ).bind(...keys).first();
  return row && row.secs > 0 ? row.secs : 0;
}

export async function registerLoginFailure(db, ip, username) {
  const [userKey, ipKey] = attemptKeys(ip, username);
  const { windowMinutes, lockMinutes } = LOGIN_LIMITS;
  const upsert = (key) => db.prepare(`
    INSERT INTO login_attempts (key, failures, window_start) VALUES (?1, 1, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      failures = CASE WHEN window_start < datetime('now', '-${windowMinutes} minutes') THEN 1 ELSE failures + 1 END,
      window_start = CASE WHEN window_start < datetime('now', '-${windowMinutes} minutes') THEN datetime('now') ELSE window_start END
  `).bind(key);
  const lock = (key, max) => db.prepare(
    `UPDATE login_attempts SET locked_until = datetime('now', '+${lockMinutes} minutes'), failures = 0, window_start = datetime('now')
      WHERE key = ? AND failures >= ?`
  ).bind(key, max);
  await db.batch([
    upsert(userKey), upsert(ipKey),
    lock(userKey, LOGIN_LIMITS.perUser), lock(ipKey, LOGIN_LIMITS.perIp),
  ]);
}

export async function clearLoginFailures(db, ip, username) {
  await db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(attemptKeys(ip, username)[0]).run();
}

/** Limpeza periódica (cron): sessões vencidas e contadores antigos. */
export async function purgeExpired(db) {
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')"),
    db.prepare("DELETE FROM login_attempts WHERE (locked_until IS NULL OR locked_until <= datetime('now')) AND window_start < datetime('now', '-1 day')"),
  ]);
}
