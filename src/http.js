// Respostas HTTP e cabeçalhos de segurança — padrão Web (Request/Response),
// o mesmo no Worker da Cloudflare e no servidor Node local.

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export function json(status, data, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function html(status, body, headers = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...headers },
  });
}

export function redirect(location, status = 302, headers = {}) {
  return new Response(null, { status, headers: { Location: location, ...headers } });
}

export async function readJson(request, limit = 8 * 1024 * 1024) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > limit) throw new HttpError(413, 'payload_too_large');
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, 'payload_too_large');
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'invalid_json'); }
}

// O site carrega só arquivos próprios + Google Fonts + o contador de visitas
// da própria Cloudflare (Web Analytics: static.cloudflareinsights.com envia
// para cloudflareinsights.com). Scripts inline existem
// (JSON-LD, páginas do admin, `onerror` das imagens) — por isso
// 'unsafe-inline' em script-src; o resto fica fechado em 'self'.
// Manter igual ao arquivo `_headers` (arquivos estáticos servidos direto
// pela Cloudflare) — tests/security.test.js confere os dois.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://cloudflareinsights.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/** Devolve uma cópia da resposta com os cabeçalhos de segurança (respostas
 *  de `fetch`/ASSETS têm cabeçalhos imutáveis, por isso a cópia). */
export function withSecurityHeaders(response, { https = true } = {}) {
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (k === 'Strict-Transport-Security' && !https) continue;
    if (!res.headers.has(k)) res.headers.set(k, v);
  }
  return res;
}

export function notFoundPage() {
  return html(404, '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página não encontrada — Essência Natural</title><meta name="robots" content="noindex"></head><body style="font-family:sans-serif;padding:60px;text-align:center;background:#0b0906;color:#f4ecd8">Página não encontrada. <a href="/" style="color:#c9a44c">Voltar ao início</a></body></html>');
}
