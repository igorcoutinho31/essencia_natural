// Estoque — livro-razão de movimentações (tabela stock_movements, ver
// migrations/0002_estoque_seguranca.sql). Nenhum código muda
// products.stock direto: tudo passa por `movementStatement`, que lê o saldo
// atual e grava o novo num único comando SQL (atômico também no D1, que não
// tem transação interativa). O trigger do banco aplica o saldo no produto.
import { HttpError } from '../http.js';

export const MOVEMENT_KINDS = {
  inicial: 'Estoque inicial',
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste (contagem)',
  olisek_import: 'Importação OliSek',
  olisek_api: 'Sincronização OliSek',
};

export const LOW_STOCK_THRESHOLD = 10; // mesmo limite do selo "Últimas unidades"

/** Monta (sem executar) o INSERT da movimentação — dá pra mandar sozinho
 *  ou dentro de um db.batch() junto com outras mudanças.
 *  - `delta`: soma/subtrai do saldo atual (recusa se ficar negativo);
 *  - `target`: define o saldo final (ajuste/sincronização); não grava nada
 *    quando o saldo já é esse.
 *  O RETURNING devolve a linha criada; nenhuma linha = nada foi gravado. */
export function movementStatement(db, productId, { kind, delta, target, stockSource, reason, user }) {
  if (!MOVEMENT_KINDS[kind]) throw new HttpError(400, 'invalid_kind');
  const common = [kind, stockSource, reason ?? null, user?.id ?? null, user?.name ?? null];
  if (target != null) {
    return db.prepare(`
      INSERT INTO stock_movements (product_id, kind, quantity, stock_before, stock_after, stock_source, reason, user_id, user_name)
      SELECT id, ?2, ?7 - stock, stock, ?7, ?3, ?4, ?5, ?6 FROM products
       WHERE id = ?1 AND ?7 >= 0 AND stock <> ?7
      RETURNING id, quantity, stock_before AS stockBefore, stock_after AS stockAfter
    `).bind(productId, ...common, target);
  }
  return db.prepare(`
    INSERT INTO stock_movements (product_id, kind, quantity, stock_before, stock_after, stock_source, reason, user_id, user_name)
    SELECT id, ?2, ?7, stock, stock + ?7, ?3, ?4, ?5, ?6 FROM products
     WHERE id = ?1 AND stock + ?7 >= 0
    RETURNING id, quantity, stock_before AS stockBefore, stock_after AS stockAfter
  `).bind(productId, ...common, delta);
}

/** Movimentação manual feita no /admin. Devolve a movimentação criada (ou
 *  null quando um ajuste não muda nada). Erros: 400/404/409. */
export async function moveStock(db, productId, { kind, quantity, reason, user }) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 0 || qty > 1_000_000) throw new HttpError(400, 'invalid_quantity', 'Informe uma quantidade inteira válida.');
  const motivo = String(reason || '').trim().slice(0, 300);
  if ((kind === 'saida' || kind === 'ajuste') && !motivo) throw new HttpError(400, 'reason_required', 'Informe o motivo da movimentação.');
  let opts;
  if (kind === 'entrada' || kind === 'saida') {
    if (qty === 0) throw new HttpError(400, 'invalid_quantity', 'A quantidade precisa ser maior que zero.');
    opts = { delta: kind === 'entrada' ? qty : -qty };
  } else if (kind === 'ajuste') {
    opts = { target: qty };
  } else {
    throw new HttpError(400, 'invalid_kind');
  }
  const { results } = await movementStatement(db, productId, {
    kind, ...opts, stockSource: 'manual', reason: motivo || null, user,
  }).all();
  if (results.length) return results[0];
  const product = await db.prepare('SELECT stock FROM products WHERE id = ?').bind(productId).first();
  if (!product) throw new HttpError(404, 'not_found');
  if (kind === 'saida') throw new HttpError(409, 'insufficient_stock', `Estoque insuficiente: há ${product.stock} unidade(s).`);
  // Ajuste para o mesmo número: nada muda, mas a origem passa a ser "manual"
  // (alguém conferiu e confirmou o número).
  await db.prepare("UPDATE products SET stock_source = 'manual', updated_at = datetime('now') WHERE id = ?").bind(productId).run();
  return null;
}

const MOVEMENT_SELECT = `
  SELECT m.id, m.product_id AS productId, p.name AS productName, p.slug AS productSlug,
         m.kind, m.quantity, m.stock_before AS stockBefore, m.stock_after AS stockAfter,
         m.stock_source AS stockSource, m.reason, m.user_name AS userName, m.created_at AS createdAt
    FROM stock_movements m JOIN products p ON p.id = m.product_id`;

export async function listMovements(db, { productId, limit = 50 } = {}) {
  const lim = Math.min(5000, Math.max(1, Number(limit) || 50));
  const stmt = productId
    ? db.prepare(`${MOVEMENT_SELECT} WHERE m.product_id = ? ORDER BY m.id DESC LIMIT ?`).bind(productId, lim)
    : db.prepare(`${MOVEMENT_SELECT} ORDER BY m.id DESC LIMIT ?`).bind(lim);
  const { results } = await stmt.all();
  return results.map((r) => ({ ...r, kindLabel: MOVEMENT_KINDS[r.kind] || r.kind }));
}

/** Visão geral para /admin/estoque. */
export async function inventoryOverview(db) {
  const { results } = await db.prepare(`
    SELECT p.id, p.name, p.slug, p.stock, p.stock_source AS stockSource, p.active, p.sales,
           p.olisek_id AS olisekId, p.olisek_link_status AS olisekLinkStatus, p.olisek_synced_at AS olisekSyncedAt,
           b.name AS brand,
           (SELECT MAX(created_at) FROM stock_movements m WHERE m.product_id = p.id) AS lastMovementAt
      FROM products p LEFT JOIN brands b ON b.id = p.brand_id
     ORDER BY p.name COLLATE NOCASE ASC
  `).all();
  const totals = {
    produtos: results.length,
    unidades: results.reduce((s, r) => s + r.stock, 0),
    zerados: results.filter((r) => r.stock <= 0).length,
    baixos: results.filter((r) => r.stock > 0 && r.stock <= LOW_STOCK_THRESHOLD).length,
  };
  return { products: results, totals };
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  // Evita que o Excel interprete uma célula como fórmula (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV com ";" (o Excel em português abre direto) e BOM para os acentos. */
export function toCSV(header, rows) {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
