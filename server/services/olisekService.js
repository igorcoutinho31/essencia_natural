// olisekService — fala com a API oficial da OliSek (liberada em 05/10/2026,
// ver docs/OLISEK-INTEGRATION.md e https://olisek.com.br/api). Único arquivo
// que faz chamada de rede pra OliSek — sempre servidor->servidor, nunca do
// navegador do cliente. O resto do site (catalogService, rotas, admin) só
// conhece esta interface (getLocalStock, getStockFromApi, getProductFromApi,
// listProductsFromApi, parseReport) — não sabe se o dado veio da API ou de
// uma importação manual antiga.
//
// Credenciais (login/senha da conta da OliSek) vêm só de variáveis de
// ambiente — nunca ficam neste arquivo nem em nenhum outro do repositório:
//   OLISEK_API_URL  (opcional; padrão https://olisek.com.br/api/v1)
//   OLISEK_LOGIN
//   OLISEK_PASSWORD
// Enquanto OLISEK_LOGIN/OLISEK_PASSWORD estiverem em branco, apiConfigured()
// devolve false e nenhuma chamada é feita — a integração manual (relatório
// colado) continua funcionando normalmente.
'use strict';

const db = require('../db');

const DEFAULT_API_URL = 'https://olisek.com.br/api/v1';

function apiBaseUrl() {
  return (process.env.OLISEK_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
}

function apiConfigured() {
  return Boolean(process.env.OLISEK_LOGIN && process.env.OLISEK_PASSWORD);
}

/** Pego só do nosso banco (o que veio do último import/sync). */
function getLocalStock(olisekId) {
  if (!olisekId) return null;
  const row = db.prepare('SELECT stock FROM products WHERE olisek_id = ?').get(olisekId);
  return row ? row.stock : null;
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

// ---------- autenticação ----------
// Token JWT válido por 24h (`expires_in`, em segundos — ver POST /v1/auth).
// Guardado em memória do processo (não no banco: é só uma credencial de
// sessão, não um dado do site) e renovado sozinho quando vence ou quando a
// OliSek devolve 401 no meio de uma chamada.
let cachedToken = null; // { token, expiresAt }
const RENOVA_ANTES_DE_VENCER_MS = 60 * 1000; // margem de segurança de 1 min

async function authenticate() {
  if (!apiConfigured()) {
    throw Object.assign(new Error('olisek_api_not_configured'), { status: 501 });
  }
  let res;
  try {
    res = await fetch(`${apiBaseUrl()}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: process.env.OLISEK_LOGIN, password: process.env.OLISEK_PASSWORD }),
    });
  } catch (e) {
    throw Object.assign(new Error('olisek_unreachable'), { status: 502, cause: e });
  }
  const body = await safeJson(res);
  if (!res.ok || !body?.success) {
    throw Object.assign(
      new Error(body?.error?.message || `olisek_auth_failed (HTTP ${res.status})`),
      { status: 502, olisekError: body?.error || null },
    );
  }
  const { token, expires_in } = body.data;
  cachedToken = {
    token,
    expiresAt: Date.now() + Math.max(0, (Number(expires_in) || 0) * 1000 - RENOVA_ANTES_DE_VENCER_MS),
  };
  return cachedToken.token;
}

async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  return authenticate();
}

/** Chamada autenticada genérica. Se a OliSek devolver 401 (token expirado
 *  antes da hora, ou revogado), autentica de novo e tenta só mais uma vez —
 *  nunca entra em loop. */
async function apiRequest(pathAndQuery, { retry = true } = {}) {
  const token = await getToken();
  let res;
  try {
    res = await fetch(`${apiBaseUrl()}${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    throw Object.assign(new Error('olisek_unreachable'), { status: 502, cause: e });
  }
  if (res.status === 401 && retry) {
    cachedToken = null;
    return apiRequest(pathAndQuery, { retry: false });
  }
  const body = await safeJson(res);
  if (!res.ok || !body?.success) {
    throw Object.assign(
      new Error(body?.error?.message || `olisek_api_error (HTTP ${res.status})`),
      { status: 502, olisekError: body?.error || null },
    );
  }
  return body.data;
}

/** Produto específico na OliSek pelo `id_product` (é o que guardamos como
 *  `olisek_id` no nosso banco). Devolve o objeto bruto da API — quem chama
 *  decide o que aproveitar (stock, price_sale, name, ...). */
async function getProductFromApi(olisekId) {
  if (!olisekId) throw Object.assign(new Error('olisek_id_required'), { status: 400 });
  return apiRequest(`/getProduct?id=${encodeURIComponent(olisekId)}`);
}

/** Mantido pelo nome/contrato já documentado (docs/OLISEK-INTEGRATION.md):
 *  só o número de estoque. */
async function getStockFromApi(olisekId) {
  const data = await getProductFromApi(olisekId);
  return Math.max(0, parseInt(data.stock, 10) || 0);
}

/** Busca paginada na OliSek (usada por uma tela de busca/match manual —
 *  nunca escreve no banco sozinha). `search` filtra por nome ou código. */
async function listProductsFromApi({ page = 1, limit = 20, search } = {}) {
  const params = new URLSearchParams({
    page: String(Math.max(1, parseInt(page, 10) || 1)),
    limit: String(Math.min(100, Math.max(1, parseInt(limit, 10) || 20))),
  });
  if (search) params.set('search', String(search));
  return apiRequest(`/listProducts?${params.toString()}`);
}

/** Interpreta um relatório colado no admin (CSV simples: id;nome;estoque
 *  ou id,nome,estoque — com ou sem cabeçalho) e devolve linhas normalizadas.
 *  Não escreve no banco: quem chama decide o que fazer com cada linha.
 *  Continua existindo mesmo com a API ligada — é o caminho de fallback para
 *  quando alguém só tem um relatório exportado em mãos. */
function parseReport(text) {
  const linhas = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const linha of linhas) {
    const sep = linha.includes(';') ? ';' : ',';
    const partes = linha.split(sep).map((p) => p.trim());
    if (partes.length < 3) continue;
    const olisekId = parseInt(partes[0].replace(/\D/g, ''), 10);
    if (!olisekId || Number.isNaN(olisekId)) continue; // pula cabeçalho ou linha inválida
    const olisekName = partes[1];
    const stock = parseInt(partes[2].replace(/\D/g, ''), 10) || 0;
    out.push({ olisekId, olisekName, stock });
  }
  return out;
}

module.exports = {
  apiConfigured, getLocalStock, getStockFromApi, getProductFromApi,
  listProductsFromApi, parseReport,
};
