// olisekService — hoje é um STUB/adaptador. Não existe chave de API da
// OliSek disponível ainda (ver docs/OLISEK-INTEGRATION.md), então este
// serviço não faz nenhuma chamada de rede: ele só sabe importar um
// relatório que alguém colou/exportou manualmente (CSV ou JSON) e devolver
// o estoque que já está guardado no nosso banco.
//
// Quando a Essência Natural conseguir acesso oficial à API da OliSek, só
// este arquivo muda: `getStockFromApi` passa a fazer o fetch de verdade, e
// nada no resto do site (catalogService, rotas, admin) precisa ser tocado
// — todos eles só conhecem esta interface.
'use strict';

const db = require('../db');

/** true assim que houver uma URL/chave configurada (variáveis de ambiente).
 *  Hoje sempre falso: ainda não há credencial oficial da OliSek. */
function apiConfigured() {
  return Boolean(process.env.OLISEK_API_URL && process.env.OLISEK_API_KEY);
}

/** Pego só do nosso banco (o que veio do último import manual). Isto
 *  NUNCA é chamado a partir do navegador do cliente — só do backend. */
function getLocalStock(olisekId) {
  if (!olisekId) return null;
  const row = db.prepare('SELECT stock FROM products WHERE olisek_id = ?').get(olisekId);
  return row ? row.stock : null;
}

/** Ponto de extensão futuro: quando `apiConfigured()` for true, trocar o
 *  corpo desta função por uma chamada HTTP real à OliSek (servidor->
 *  servidor, com a chave em variável de ambiente, nunca no front-end). */
async function getStockFromApi(olisekId) {
  if (!apiConfigured()) {
    throw Object.assign(new Error('olisek_api_not_configured'), { status: 501 });
  }
  // TODO(V3): fetch(`${process.env.OLISEK_API_URL}/produtos/${olisekId}`, { headers: { Authorization: `Bearer ${process.env.OLISEK_API_KEY}` } })
  throw Object.assign(new Error('not_implemented'), { status: 501 });
}

/** Interpreta um relatório colado no admin (CSV simples: id;nome;estoque
 *  ou id,nome,estoque — com ou sem cabeçalho) e devolve linhas normalizadas.
 *  Não escreve no banco: quem chama decide o que fazer com cada linha. */
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

module.exports = { apiConfigured, getLocalStock, getStockFromApi, parseReport };
