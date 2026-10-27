// Catálogo — única camada que fala com o banco de produtos. Rotas
// públicas, rotas de admin e integrações passam por aqui. Todas as funções
// recebem `db` (API do D1: prepare/bind/first/all/run/batch) — no Worker é
// o binding D1 de verdade; no Node local é server/sqlite-d1.js.
import { HttpError } from '../http.js';
import { uniqueSlug, normalizeText } from '../util.js';
import * as olisek from './olisek.js';
import { movementStatement } from './inventory.js';

export const STOCK_THRESHOLD = { ultimas: 10 }; // stock<=10 = "Últimas unidades"
export const PLACEHOLDER_IMAGE = '/assets/images/placeholder-produto.svg';
export const VALID_LINK_STATUS = ['confirmed', 'probable', 'needs_review', 'unlinked'];

/** Informativo pro admin (de onde veio o número de estoque) — não decide o
 *  que aparece no site público. */
export function isStockReliable(row) {
  if (row.stock_source === 'olisek_api') return true;
  if (row.stock_source === 'olisek_import') return row.olisek_link_status === 'confirmed' || row.olisek_link_status === 'probable';
  if (row.stock_source === 'manual') return true;
  return false;
}

/** Visibilidade no catálogo público: estoque > 0 OU 10+ vendas. Nunca
 *  exclui o produto do banco/admin. */
export function isPubliclyVisible(row) {
  return row.stock > 0 || row.sales >= 10;
}

/** Os 3 selos públicos — só o número real de estoque decide. */
export function computeAvailability(row) {
  if (row.stock <= 0) return { code: 'indisponivel', label: 'Indisponível no momento' };
  if (row.stock <= STOCK_THRESHOLD.ultimas) return { code: 'ultimas', label: 'Últimas unidades' };
  return { code: 'em_estoque', label: 'Em estoque' };
}

function rowToPublic(row) {
  const status = computeAvailability(row);
  return {
    id: row.slug,
    slug: row.slug,
    name: row.name,
    brand: row.brand_name || null,
    brandSlug: row.brand_slug || null,
    category: row.category,
    volume: row.volume,
    gender: row.gender,
    family: row.family,
    description: row.description,
    notes: { topo: row.notes_top || '', coracao: row.notes_heart || '', fundo: row.notes_base || '' },
    price: row.active ? row.price : null,
    comparePrice: row.active ? row.compare_price : null,
    stockStatus: status.code,
    stockLabel: status.label,
    active: !!row.active,
    featured: !!row.featured,
    image: row.main_image || PLACEHOLDER_IMAGE,
    hasImage: !!row.main_image,
    images: [],
    updatedAt: row.updated_at,
  };
}

function rowToAdmin(row) {
  const status = computeAvailability(row);
  return {
    id: row.id,
    slug: row.slug,
    olisekId: row.olisek_id,
    olisekName: row.olisek_name,
    olisekLinkStatus: row.olisek_link_status,
    olisekSyncedAt: row.olisek_synced_at,
    name: row.name,
    brandId: row.brand_id,
    brand: row.brand_name || null,
    category: row.category,
    volume: row.volume,
    gender: row.gender,
    family: row.family,
    description: row.description,
    notes: { topo: row.notes_top || '', coracao: row.notes_heart || '', fundo: row.notes_base || '' },
    price: row.price,
    comparePrice: row.compare_price,
    stock: row.stock,
    stockSource: row.stock_source,
    stockReliable: isStockReliable(row),
    sales: row.sales,
    stockStatus: status.code,
    stockLabel: status.label,
    publiclyVisible: isPubliclyVisible(row),
    active: !!row.active,
    featured: !!row.featured,
    hasImage: !!row.main_image,
    image: row.main_image || PLACEHOLDER_IMAGE,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BASE_SELECT = `
  SELECT p.*, b.name AS brand_name, b.slug AS brand_slug,
    (SELECT file_path FROM product_images pi WHERE pi.product_id = p.id
       ORDER BY pi.is_main DESC, pi.sort_order ASC LIMIT 1) AS main_image
  FROM products p LEFT JOIN brands b ON b.id = p.brand_id
`;

async function all(stmt) { return (await stmt.all()).results; }

async function getRawProduct(db, id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
}

export async function getImages(db, productId) {
  const rows = await all(db.prepare(
    'SELECT id, file_path AS path, sort_order AS sortOrder, is_main AS isMain FROM product_images WHERE product_id = ? ORDER BY sort_order ASC'
  ).bind(productId));
  return rows.map((r) => ({ ...r, isMain: !!r.isMain }));
}

// ---------- catálogo público ----------

async function publicRows(db) {
  return (await all(db.prepare(`${BASE_SELECT} WHERE p.active = 1 ORDER BY p.id ASC`))).filter(isPubliclyVisible);
}

export async function getPublicProducts(db, { q, brand, gender, category, availability, featured, sort } = {}) {
  let rows = await publicRows(db);
  if (q) {
    const t = normalizeText(q);
    rows = rows.filter((r) => normalizeText(r.name).includes(t) || normalizeText(r.brand_name).includes(t));
  }
  if (brand) rows = rows.filter((r) => r.brand_slug === brand);
  if (gender) rows = rows.filter((r) => r.gender === gender);
  if (category) rows = rows.filter((r) => r.category === category);
  if (featured === 'true') rows = rows.filter((r) => r.featured);
  if (availability) rows = rows.filter((r) => computeAvailability(r).code === availability);

  const comPreco = (cmp) => rows.filter((r) => r.price != null).sort(cmp).concat(rows.filter((r) => r.price == null));
  if (sort === 'price_asc') rows = comPreco((a, b) => a.price - b.price);
  else if (sort === 'price_desc') rows = comPreco((a, b) => b.price - a.price);
  else if (sort === 'az') rows = rows.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  // 'catalogo' (padrão): ordem de criação

  return rows.map(rowToPublic);
}

/** Produto público + relacionados (mesma marca, depois mesma categoria,
 *  depois o resto) com uma consulta só para a lista. */
export async function getPublicProductPage(db, slug, relatedLimit = 4) {
  const rows = await publicRows(db);
  const row = rows.find((r) => r.slug === slug);
  // Produto oculto (estoque 0 e menos de 10 vendas) não tem página pública.
  if (!row) return null;
  const product = rowToPublic(row);
  product.images = (await getImages(db, row.id)).map((i) => i.path);
  const outros = rows.filter((r) => r.id !== row.id);
  const sameBrand = outros.filter((r) => row.brand_id && r.brand_id === row.brand_id);
  const sameCat = outros.filter((r) => r.category === row.category && !(row.brand_id && r.brand_id === row.brand_id));
  const seen = new Set();
  const related = [...sameBrand, ...sameCat, ...outros]
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .slice(0, relatedLimit)
    .map(rowToPublic);
  return { product, related };
}

/** Marcas em `/#marcas`: toda marca aparece, exceto as com
 *  `requires_product = 1` sem nenhum produto ativo e publicamente visível. */
export async function getBrandsPublic(db) {
  const brands = await all(db.prepare('SELECT id, name, slug, logo_path AS logoPath, requires_product AS requiresProduct FROM brands ORDER BY name ASC'));
  const active = await all(db.prepare('SELECT brand_id, stock, sales FROM products WHERE active = 1 AND brand_id IS NOT NULL'));
  const count = new Map();
  const visible = new Set();
  for (const p of active) {
    count.set(p.brand_id, (count.get(p.brand_id) || 0) + 1);
    if (isPubliclyVisible(p)) visible.add(p.brand_id);
  }
  return brands
    .filter((b) => !b.requiresProduct || visible.has(b.id))
    .map((b) => ({ id: b.id, name: b.name, slug: b.slug, logoPath: b.logoPath, productCount: count.get(b.id) || 0 }));
}

// ---------- admin ----------

export const ADMIN_FILTERS = {
  todos: () => true,
  em_estoque: (r) => r.stock > 0,
  estoque_baixo: (r) => r.stock > 0 && r.stock <= STOCK_THRESHOLD.ultimas,
  vendidos: (r) => r.sales > 0,
  indisponiveis: (r) => r.stock <= 0 && isPubliclyVisible(r),
  oculto_catalogo: (r) => r.active === 1 && !isPubliclyVisible(r),
  sem_preco: (r) => r.price == null,
  sem_imagem: (r) => !r.main_image,
  sem_vinculo: (r) => r.olisek_link_status === 'unlinked',
  precisa_revisao: (r) => r.olisek_link_status === 'probable' || r.olisek_link_status === 'needs_review',
};

/** Lista + contagem de cada filtro com uma consulta só. */
export async function getAdminProducts(db, { q, filter } = {}) {
  const allRows = await all(db.prepare(`${BASE_SELECT} ORDER BY p.id ASC`));
  const counts = {};
  for (const key of Object.keys(ADMIN_FILTERS)) counts[key] = allRows.filter(ADMIN_FILTERS[key]).length;
  let rows = allRows;
  if (q) {
    const t = normalizeText(q);
    rows = rows.filter((r) => normalizeText(r.name).includes(t) || normalizeText(r.brand_name).includes(t) || String(r.olisek_id || '').includes(t));
  }
  if (filter && ADMIN_FILTERS[filter]) rows = rows.filter(ADMIN_FILTERS[filter]);
  return { products: rows.map(rowToAdmin), counts };
}

export async function getAdminProductById(db, id) {
  const row = await db.prepare(BASE_SELECT + ' WHERE p.id = ?').bind(id).first();
  if (!row) return null;
  const admin = rowToAdmin(row);
  admin.images = await getImages(db, row.id);
  admin.priceHistory = await all(db.prepare(
    'SELECT id, old_price AS oldPrice, new_price AS newPrice, old_compare_price AS oldComparePrice, new_compare_price AS newComparePrice, user_name AS userName, created_at AS createdAt FROM price_history WHERE product_id = ? ORDER BY id DESC'
  ).bind(row.id));
  return admin;
}

function touch(db, id) {
  return db.prepare("UPDATE products SET updated_at = datetime('now') WHERE id = ?").bind(id);
}

const s = (v) => (v === undefined || v === '' ? null : v);

export async function createProduct(db, data, user) {
  const slug = await uniqueSlug(data.name, async (x) => !!(await db.prepare('SELECT 1 AS x FROM products WHERE slug = ?').bind(x).first()));
  const olisekId = data.olisekId ? Number(data.olisekId) : null;
  const linkStatus = VALID_LINK_STATUS.includes(data.olisekLinkStatus) ? data.olisekLinkStatus : (olisekId ? 'needs_review' : 'unlinked');
  const stockSource = olisekId && (linkStatus === 'confirmed' || linkStatus === 'probable')
    ? 'olisek_import'
    : (data.stock != null && data.stock !== '' ? 'manual' : 'none');
  const initialStock = Math.max(0, parseInt(data.stock, 10) || 0);
  const { meta } = await db.prepare(`
    INSERT INTO products (slug, name, brand_id, category, volume, gender, family, description,
      notes_top, notes_heart, notes_base, price, compare_price, stock, active, featured,
      olisek_id, olisek_name, olisek_link_status, stock_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
  `).bind(
    slug, String(data.name).trim(), s(data.brandId) == null ? null : Number(data.brandId),
    await normalizarCategoria(db, data.category),
    s(data.volume) ?? null, s(data.gender) ?? null, s(data.family) ?? null, s(data.description) ?? null,
    s(data.notes?.topo) ?? null, s(data.notes?.coracao) ?? null, s(data.notes?.fundo) ?? null,
    data.price == null || data.price === '' ? null : Number(data.price),
    data.comparePrice == null || data.comparePrice === '' ? null : Number(data.comparePrice),
    data.active ? 1 : 0, data.featured ? 1 : 0,
    olisekId, s(data.olisekName) ?? null, linkStatus, stockSource,
  ).run();
  const id = meta.last_row_id;
  if (initialStock > 0) {
    await movementStatement(db, id, { kind: 'inicial', delta: initialStock, stockSource, reason: 'Cadastro do produto', user }).run();
  }
  return getAdminProductById(db, id);
}

export async function updateProductFull(db, id, data) {
  const current = await getRawProduct(db, id);
  if (!current) return null;
  const pick = (key, col) => (data[key] ?? current[col]);
  await db.prepare(`
    UPDATE products SET name=?, brand_id=?, category=?, volume=?, gender=?, family=?, description=?,
      notes_top=?, notes_heart=?, notes_base=?, updated_at=datetime('now')
    WHERE id=?
  `).bind(
    String(data.name ?? current.name).trim() || current.name,
    // `'x' in data`: o formulário manda brandId null para tirar a marca.
    'brandId' in data ? (data.brandId === '' || data.brandId == null ? null : Number(data.brandId)) : current.brand_id,
    'category' in data ? await normalizarCategoria(db, data.category, id) : current.category,
    pick('volume', 'volume'), pick('gender', 'gender'), pick('family', 'family'), pick('description', 'description'),
    data.notes?.topo ?? current.notes_top, data.notes?.coracao ?? current.notes_heart, data.notes?.fundo ?? current.notes_base,
    id,
  ).run();
  return getAdminProductById(db, id);
}

/** Vínculo OliSek — o admin sempre escolhe o `linkStatus`; nunca inferimos
 *  "confirmado" sozinhos. Estoque vindo do vínculo vira movimentação
 *  'olisek_import' (fica no histórico). */
export async function setOlisekLink(db, id, { olisekId, olisekName, linkStatus, stock, sales }, user) {
  const current = await getRawProduct(db, id);
  if (!current) return null;
  if (!VALID_LINK_STATUS.includes(linkStatus)) throw new HttpError(400, 'invalid_link_status');
  const finalOlisekId = linkStatus === 'unlinked' ? null : (olisekId ?? current.olisek_id);
  const finalOlisekName = linkStatus === 'unlinked' ? null : (olisekName ?? current.olisek_name);
  if (finalOlisekId != null) {
    const dono = await db.prepare('SELECT id, name FROM products WHERE olisek_id = ? AND id <> ?').bind(finalOlisekId, id).first();
    if (dono) throw new HttpError(409, 'olisek_id_in_use', `O ID OliSek ${finalOlisekId} já está vinculado a "${dono.name}".`);
  }
  // `sales` só muda com valor real de importação da OliSek.
  const finalSales = sales != null && sales !== '' ? Math.max(0, parseInt(sales, 10) || 0) : current.sales;
  const stockSource = linkStatus === 'confirmed' || linkStatus === 'probable' ? 'olisek_import'
    : (linkStatus === 'unlinked' && current.stock_source === 'olisek_import' ? 'none' : current.stock_source);
  const stmts = [];
  if (stock != null && stock !== '') {
    stmts.push(movementStatement(db, id, {
      kind: 'olisek_import', target: Math.max(0, parseInt(stock, 10) || 0), stockSource,
      reason: finalOlisekId ? `Vínculo OliSek ${finalOlisekId}` : 'Vínculo OliSek', user,
    }));
  }
  stmts.push(db.prepare(`
    UPDATE products SET olisek_id=?, olisek_name=?, olisek_link_status=?, sales=?, stock_source=?, updated_at=datetime('now')
    WHERE id=?
  `).bind(finalOlisekId, finalOlisekName, linkStatus, finalSales, stockSource, id));
  await db.batch(stmts);
  return getAdminProductById(db, id);
}

/** Estoque direto da API da OliSek (botão "Sincronizar agora", sincronização
 *  em lote do /admin/estoque e cron opcional). Não muda o status do vínculo. */
export async function syncStockFromOlisek(db, config, id, user, opts) {
  const current = await getRawProduct(db, id);
  if (!current) return null;
  if (!current.olisek_id) throw new HttpError(400, 'product_not_linked');
  const stock = await olisek.getStockFromApi(config, current.olisek_id, opts);
  await db.batch([
    movementStatement(db, id, { kind: 'olisek_api', target: stock, stockSource: 'olisek_api', reason: `OliSek ${current.olisek_id}`, user }),
    db.prepare("UPDATE products SET stock_source='olisek_api', olisek_synced_at=datetime('now'), updated_at=datetime('now') WHERE id=?").bind(id),
  ]);
  return getAdminProductById(db, id);
}

/** Sincroniza em sequência todos os produtos com vínculo confirmado (ou
 *  também os prováveis, se `includeProbable`). Um erro num produto não
 *  interrompe os outros. */
export async function syncAllFromOlisek(db, config, { user = null, includeProbable = false, fetchImpl } = {}) {
  const statuses = includeProbable ? ['confirmed', 'probable'] : ['confirmed'];
  const { results } = await db.prepare(
    `SELECT id, name, stock FROM products WHERE olisek_id IS NOT NULL AND olisek_link_status IN (${statuses.map(() => '?').join(',')}) ORDER BY id`
  ).bind(...statuses).all();
  const report = { total: results.length, atualizados: 0, semMudanca: 0, erros: [] };
  for (const r of results) {
    try {
      const p = await syncStockFromOlisek(db, config, r.id, user, fetchImpl ? { fetchImpl } : undefined);
      if (p.stock !== r.stock) report.atualizados += 1; else report.semMudanca += 1;
    } catch (e) {
      report.erros.push({ id: r.id, name: r.name, error: e.message });
      if (e.status === 501) break; // API não configurada: não adianta tentar os outros
    }
  }
  return report;
}

/** Preço — vendedora e admin. Sempre grava histórico (mesmo batch). */
export async function setPrice(db, id, { price, comparePrice }, user) {
  const current = await getRawProduct(db, id);
  if (!current) return null;
  await db.batch([
    db.prepare("UPDATE products SET price=?, compare_price=?, updated_at=datetime('now') WHERE id=?").bind(price, comparePrice ?? null, id),
    db.prepare(`
      INSERT INTO price_history (product_id, user_id, user_name, old_price, new_price, old_compare_price, new_compare_price)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, user.id, user.name, current.price, price, current.compare_price, comparePrice ?? null),
  ]);
  return getAdminProductById(db, id);
}

export async function setActive(db, id, active) {
  await db.prepare("UPDATE products SET active=?, updated_at=datetime('now') WHERE id=?").bind(active ? 1 : 0, id).run();
  return getAdminProductById(db, id);
}

export async function setFeatured(db, id, featured) {
  await db.prepare("UPDATE products SET featured=?, updated_at=datetime('now') WHERE id=?").bind(featured ? 1 : 0, id).run();
  return getAdminProductById(db, id);
}

/** Despublicar (não apaga a linha nem o histórico — só tira do site). */
export async function despublish(db, id) {
  await db.prepare("UPDATE products SET active=0, updated_at=datetime('now') WHERE id=?").bind(id).run();
}

// ---------- imagens ----------

export async function addImage(db, productId, filePath, { isMain } = {}) {
  const info = await db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS m, COUNT(*) AS c FROM product_images WHERE product_id = ?'
  ).bind(productId).first();
  const main = isMain || info.c === 0;
  const stmts = [];
  if (main) stmts.push(db.prepare('UPDATE product_images SET is_main=0 WHERE product_id=?').bind(productId));
  stmts.push(db.prepare('INSERT INTO product_images (product_id, file_path, sort_order, is_main) VALUES (?,?,?,?) RETURNING id')
    .bind(productId, filePath, info.m + 1, main ? 1 : 0));
  stmts.push(touch(db, productId));
  const results = await db.batch(stmts);
  return results[main ? 1 : 0].results[0].id;
}

/** Remove a linha e devolve o caminho do arquivo (quem chama apaga o
 *  arquivo do armazenamento), ou null se a foto não existe. */
export async function removeImage(db, productId, imageId) {
  const img = await db.prepare('SELECT * FROM product_images WHERE id=? AND product_id=?').bind(imageId, productId).first();
  if (!img) return null;
  const stmts = [db.prepare('DELETE FROM product_images WHERE id=?').bind(imageId)];
  if (img.is_main) {
    stmts.push(db.prepare(`UPDATE product_images SET is_main=1 WHERE id = (
      SELECT id FROM product_images WHERE product_id=? ORDER BY sort_order ASC LIMIT 1)`).bind(productId));
  }
  stmts.push(touch(db, productId));
  await db.batch(stmts);
  return img.file_path;
}

export async function setMainImage(db, productId, imageId) {
  const img = await db.prepare('SELECT 1 AS x FROM product_images WHERE id=? AND product_id=?').bind(imageId, productId).first();
  if (!img) return false;
  await db.batch([
    db.prepare('UPDATE product_images SET is_main = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE product_id=?').bind(imageId, productId),
    touch(db, productId),
  ]);
  return true;
}

export async function reorderImages(db, productId, orderedIds) {
  const stmts = orderedIds.map((imgId, i) => db.prepare('UPDATE product_images SET sort_order=? WHERE id=? AND product_id=?').bind(i, imgId, productId));
  stmts.push(touch(db, productId));
  await db.batch(stmts);
}

// ---------- categorias ----------
// Texto livre no admin; a chave ignora maiúsculas, acentos, espaços extras e
// o "s" do plural — o texto gravado é sempre o da categoria que já existe.

const INVISIVEIS = /[​-‍⁠﻿­]/g;

function limpar(s) { return String(s).replace(INVISIVEIS, '').replace(/\s+/g, ' ').trim(); }

export function chaveCategoria(s) {
  return limpar(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/s$/, '');
}

export async function normalizarCategoria(db, raw, excetoId) {
  if (raw == null) return null;
  const limpo = limpar(raw);
  if (!limpo) return null;
  const k = chaveCategoria(limpo);
  const existentes = await all(db.prepare(`
    SELECT category, COUNT(*) AS n FROM products
    WHERE category IS NOT NULL AND TRIM(category) <> '' AND id <> ?
    GROUP BY category ORDER BY n DESC, category ASC
  `).bind(excetoId ?? -1));
  const igual = existentes.find((e) => chaveCategoria(e.category) === k);
  if (igual) return limpar(igual.category);
  return limpo.charAt(0).toLocaleUpperCase('pt-BR') + limpo.slice(1);
}

/** Junta variações já gravadas da mesma categoria (roda no cron/no start). */
export async function normalizarCategoriasGravadas(db) {
  const grupos = new Map();
  for (const r of await all(db.prepare(`SELECT category, COUNT(*) AS n FROM products
      WHERE category IS NOT NULL GROUP BY category ORDER BY n DESC, category ASC`))) {
    const limpo = limpar(r.category);
    const k = limpo ? chaveCategoria(limpo) : '';
    if (!grupos.has(k)) grupos.set(k, { oficial: limpo || null, variantes: [] });
    grupos.get(k).variantes.push(r.category);
  }
  const stmts = [];
  for (const { oficial, variantes } of grupos.values()) {
    for (const v of variantes) if (v !== oficial) stmts.push(db.prepare('UPDATE products SET category = ? WHERE category = ?').bind(oficial, v));
  }
  if (!stmts.length) return 0;
  const res = await db.batch(stmts);
  return res.reduce((n, r) => n + Number(r.meta?.changes || 0), 0);
}

export async function listCategories(db) {
  return (await all(db.prepare(`SELECT category, COUNT(*) AS n FROM products
    WHERE category IS NOT NULL GROUP BY category ORDER BY n DESC, category ASC`))).map((r) => r.category);
}

// ---------- marcas ----------

export async function ensureBrand(db, name) {
  if (!name) return null;
  const existing = await db.prepare('SELECT id FROM brands WHERE name = ?').bind(name).first();
  if (existing) return existing.id;
  const slug = await uniqueSlug(name, async (x) => !!(await db.prepare('SELECT 1 AS x FROM brands WHERE slug=?').bind(x).first()));
  const { meta } = await db.prepare('INSERT INTO brands (name, slug) VALUES (?,?)').bind(name, slug).run();
  return meta.last_row_id;
}

export async function listBrandsAdmin(db) {
  return all(db.prepare('SELECT id, name, slug, logo_path AS logoPath FROM brands ORDER BY name ASC'));
}
