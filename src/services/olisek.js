// OliSek — fala com a API oficial da OliSek (liberada em 05/10/2026,
// ver docs/OLISEK-INTEGRATION.md). Único arquivo que faz chamada de rede pra
// OliSek — sempre servidor->servidor, nunca do navegador do cliente.
//
// Credenciais vêm só da configuração do ambiente (secrets do Worker na
// Cloudflare, ou variáveis de ambiente no Node local):
//   OLISEK_API_URL  (opcional; padrão https://olisek.com.br/api/v1)
//   OLISEK_LOGIN, OLISEK_PASSWORD
// Sem login/senha, apiConfigured() é false e nenhuma chamada é feita — a
// importação manual (relatório colado) continua funcionando.

export const DEFAULT_API_URL = 'https://olisek.com.br/api/v1';

export function apiConfigured(config) {
  return Boolean(config && config.olisekLogin && config.olisekPassword);
}

function apiBaseUrl(config) {
  return (config.olisekApiUrl || DEFAULT_API_URL).replace(/\/+$/, '');
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

function fail(message, status, extra) {
  return Object.assign(new Error(message), { status }, extra);
}

// Token JWT válido por 24h. Guardado em memória (por instância do Worker /
// processo Node) e renovado sozinho quando vence ou quando a OliSek
// devolve 401 no meio de uma chamada.
let cachedToken = null; // { token, expiresAt, login }
const RENOVA_ANTES_DE_VENCER_MS = 60 * 1000;

async function authenticate(config, fetchImpl) {
  if (!apiConfigured(config)) throw fail('olisek_api_not_configured', 501);
  let res;
  try {
    res = await fetchImpl(`${apiBaseUrl(config)}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: config.olisekLogin, password: config.olisekPassword }),
    });
  } catch (e) {
    throw fail('olisek_unreachable', 502, { cause: e });
  }
  const body = await safeJson(res);
  if (!res.ok || !body?.success) {
    throw fail(body?.error?.message || `olisek_auth_failed (HTTP ${res.status})`, 502, { olisekError: body?.error || null });
  }
  const { token, expires_in } = body.data;
  cachedToken = {
    token,
    login: config.olisekLogin,
    expiresAt: Date.now() + Math.max(0, (Number(expires_in) || 0) * 1000 - RENOVA_ANTES_DE_VENCER_MS),
  };
  return token;
}

async function getToken(config, fetchImpl) {
  if (cachedToken && cachedToken.login === config.olisekLogin && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  return authenticate(config, fetchImpl);
}

/** Chamada autenticada. Num 401, autentica de novo e tenta só mais uma vez. */
async function apiRequest(config, pathAndQuery, { retry = true, fetchImpl = fetch } = {}) {
  const token = await getToken(config, fetchImpl);
  let res;
  try {
    res = await fetchImpl(`${apiBaseUrl(config)}${pathAndQuery}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    throw fail('olisek_unreachable', 502, { cause: e });
  }
  if (res.status === 401 && retry) {
    cachedToken = null;
    return apiRequest(config, pathAndQuery, { retry: false, fetchImpl });
  }
  const body = await safeJson(res);
  if (!res.ok || !body?.success) {
    throw fail(body?.error?.message || `olisek_api_error (HTTP ${res.status})`, 502, { olisekError: body?.error || null });
  }
  return body.data;
}

export async function getProductFromApi(config, olisekId, opts) {
  if (!olisekId) throw fail('olisek_id_required', 400);
  return apiRequest(config, `/getProduct?id=${encodeURIComponent(olisekId)}`, opts);
}

export async function getStockFromApi(config, olisekId, opts) {
  const data = await getProductFromApi(config, olisekId, opts);
  return Math.max(0, parseInt(data.stock, 10) || 0);
}

export async function listProductsFromApi(config, { page = 1, limit = 20, search } = {}, opts) {
  const params = new URLSearchParams({
    page: String(Math.max(1, parseInt(page, 10) || 1)),
    limit: String(Math.min(100, Math.max(1, parseInt(limit, 10) || 20))),
  });
  if (search) params.set('search', String(search));
  return apiRequest(config, `/listProducts?${params.toString()}`, opts);
}

/** Relatório colado no admin (id;nome;estoque ou id,nome,estoque, com ou
 *  sem cabeçalho). Não escreve no banco. */
export function parseReport(text) {
  const linhas = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const linha of linhas) {
    const sep = linha.includes(';') ? ';' : ',';
    const partes = linha.split(sep).map((p) => p.trim());
    if (partes.length < 3) continue;
    const olisekId = parseInt(partes[0].replace(/\D/g, ''), 10);
    if (!olisekId || Number.isNaN(olisekId)) continue;
    const stock = parseInt(partes[2].replace(/\D/g, ''), 10) || 0;
    out.push({ olisekId, olisekName: partes[1], stock });
  }
  return out;
}

/** Só para testes. */
export function _resetTokenCache() { cachedToken = null; }
