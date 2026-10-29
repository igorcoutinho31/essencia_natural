// Utilidades sem estado, iguais no Worker (Cloudflare) e no Node local.
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

export function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

/** `exists` pode ser síncrona ou assíncrona (consulta ao D1). */
export async function uniqueSlug(base, exists) {
  let slug = slugify(base);
  let i = 2;
  while (await exists(slug)) { slug = `${slugify(base)}-${i}`; i += 1; }
  return slug;
}

export function escapeHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

export function mimeFor(name) {
  const i = String(name).lastIndexOf('.');
  return MIME_BY_EXT[i === -1 ? '' : String(name).slice(i).toLowerCase()] || 'application/octet-stream';
}

/** Detecta o formato real pela assinatura dos bytes — nunca confia no
 *  mime/extensão que o navegador declarar, porque isso pode ser forjado. */
export function sniffImage(bytes) {
  const sig = Buffer.from(bytes.subarray(0, 12));
  if (sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff) return 'jpg';
  if (sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47) return 'png';
  if (sig.subarray(0, 4).toString('ascii') === 'RIFF' && sig.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

/** data:image/...;base64,... -> { bytes, ext } validado, ou null. */
export function decodeImageDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  const bytes = new Uint8Array(Buffer.from(m[2], 'base64'));
  const ext = sniffImage(bytes);
  return ext ? { bytes, ext } : null;
}

export function randomId(n = 8) {
  return crypto.randomBytes(n).toString('hex');
}

export function normalizeText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
