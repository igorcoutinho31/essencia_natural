// catalogService — única camada que fala com o banco de produtos. Rotas
// públicas, rotas de admin e (no futuro) integrações não tocam o SQLite
// direto: todas passam por aqui. Isso é o que deixa o `olisekId`/estoque
// trocável por uma API de verdade mais tarde sem mexer no resto do site.
'use strict';

const db = require('../db');
const { slugify, uniqueSlug } = require('../util');

const STOCK_THRESHOLD = { ultimas: 10 }; // configurável: stock<=10 = "Últimas unidades"
const PLACEHOLDER_IMAGE = '/assets/images/placeholder-produto.svg';

/** Informativo pro admin (de onde veio o número de estoque) — não decide
 *  mais o que aparece no site público (ver `isPubliclyVisible`/
 *  `computeAvailability` abaixo, fechamento V2 25/09/2026): um vínculo
 *  'confirmed'/'probable' com a OliSek, ou um número digitado à mão
 *  (`stock_source` 'manual'), contam como um estoque com origem conhecida;
 *  `stock_source` 'none' é só o valor padrão da coluna, nunca uma afirmação
 *  de ninguém. */
function isStockReliable(row) {
  if (row.stock_source === 'olisek_import') return row.olisek_link_status === 'confirmed' || row.olisek_link_status === 'probable';
  if (row.stock_source === 'manual') return true;
  return false;
}

/** Regra de visibilidade do catálogo público (fechamento V2, 25/09/2026):
 *  um produto só aparece pro cliente se tiver estoque de verdade OU já
 *  tiver vendido o bastante pra continuar valendo mostrar (mesmo zerado).
 *  `sales` nunca é estimado — vem só de importação real da OliSek (hoje
 *  sempre 0 até essa importação existir, ver docs/OLISEK-INTEGRATION.md).
 *  Nunca exclui o produto do banco/admin — só decide o que o cliente vê. */
function isPubliclyVisible(row) {
  return row.stock > 0 || row.sales >= 10;
}

/** Os 3 estados públicos de disponibilidade (fechamento V2, 25/09/2026) —
 *  só o número de estoque decide o selo; a regra de "aparece ou não"
 *  (`isPubliclyVisible`) já filtrou antes quem chega até aqui, então um
 *  produto zerado só recebe o selo "Indisponível no momento" quando já
 *  passou por essa porta (ou seja, tem 10+ vendas). Nunca inventa um
 *  número: mostra exatamente o que o `stock` real diz. */
function computeAvailability(row) {
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
    notes: {
      topo: row.notes_top || '',
      coracao: row.notes_heart || '',
      fundo: row.notes_base || '',
    },
    price: row.active ? row.price : null,
    comparePrice: row.active ? row.compare_price : null,
    stockStatus: status.code,
    stockLabel: status.label,
    active: !!row.active,
    featured: !!row.featured,
    image: row.main_image || PLACEHOLDER_IMAGE,
    hasImage: !!row.main_image,
    images: [],
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

function getImages(productId) {
  return db.prepare(
    'SELECT id, file_path AS path, sort_order AS sortOrder, is_main AS isMain FROM product_images WHERE product_id = ? ORDER BY sort_order ASC'
  ).all(productId).map((r) => ({ ...r, isMain: !!r.isMain }));
}

// ---------- catálogo público ----------

function getPublicProducts({ q, brand, gender, category, availability, featured, sort } = {}) {
  let rows = db.prepare(`${BASE_SELECT} WHERE p.active = 1`).all().filter(isPubliclyVisible);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  if (q) {
    const t = norm(q);
    rows = rows.filter((r) => norm(r.name).includes(t) || norm(r.brand_name).includes(t));
  }
  if (brand) rows = rows.filter((r) => r.brand_slug === brand);
  if (gender) rows = rows.filter((r) => r.gender === gender);
  if (category) rows = rows.filter((r) => r.category === category);
  if (featured === 'true') rows = rows.filter((r) => r.featured);
  if (availability) {
    rows = rows.filter((r) => computeAvailability(r).code === availability);
  }

  if (sort === 'price_asc') rows = rows.filter((r) => r.price != null).sort((a, b) => a.price - b.price)
    .concat(rows.filter((r) => r.price == null));
  else if (sort === 'price_desc') rows = rows.filter((r) => r.price != null).sort((a, b) => b.price - a.price)
    .concat(rows.filter((r) => r.price == null));
  else if (sort === 'az') rows = rows.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  // 'catalogo' (padrão): mantém a ordem de criação

  return rows.map(rowToPublic);
}

function getPublicProductBySlug(slug) {
  const row = db.prepare(`${BASE_SELECT} WHERE p.slug = ? AND p.active = 1`).get(slug);
  // Um produto oculto do catálogo (estoque 0 e menos de 10 vendas) não tem
  // página pública própria — a regra de visibilidade vale pra ele inteiro,
  // não só pra listagem (mas continua existindo no banco e no /admin).
  if (!row || !isPubliclyVisible(row)) return null;
  const pub = rowToPublic(row);
  pub.images = getImages(row.id).map((i) => i.path);
  return pub;
}

function getRelated(slug, limit = 4) {
  const row = db.prepare('SELECT * FROM products WHERE slug = ?').get(slug);
  if (!row) return [];
  let rows = db.prepare(`${BASE_SELECT} WHERE p.active = 1 AND p.id != ?`).all(row.id).filter(isPubliclyVisible);
  const sameBrand = rows.filter((r) => row.brand_id && r.brand_id === row.brand_id);
  const sameCat = rows.filter((r) => r.category === row.category && !(row.brand_id && r.brand_id === row.brand_id));
  const pick = [...sameBrand, ...sameCat, ...rows].slice(0, limit);
  const seen = new Set();
  return pick.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).map(rowToPublic);
}

function getBrandsPublic() {
  return db.prepare(`
    SELECT b.id, b.name, b.slug, b.logo_path AS logoPath,
      (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id AND p.active = 1) AS productCount
    FROM brands b ORDER BY b.name ASC
  `).all();
}

// ---------- admin ----------

/** Tela "produtos incompletos" (regra 8 do fechamento da V2): cada filtro é
 *  um predicado sobre a linha crua do banco, para poder tanto filtrar a
 *  lista quanto contar cada balde sem duas fontes de verdade diferentes. */
const ADMIN_FILTERS = {
  todos: () => true,
  em_estoque: (r) => r.stock > 0,
  vendidos: (r) => r.sales > 0,
  indisponiveis: (r) => r.stock <= 0 && isPubliclyVisible(r), // zerado mas com 10+ vendas: visível como "Indisponível no momento"
  oculto_catalogo: (r) => r.active === 1 && !isPubliclyVisible(r), // zerado e com menos de 10 vendas: some do site, mas não do admin
  sem_preco: (r) => r.price == null,
  sem_imagem: (r) => !r.main_image,
  sem_vinculo: (r) => r.olisek_link_status === 'unlinked',
  precisa_revisao: (r) => r.olisek_link_status === 'probable' || r.olisek_link_status === 'needs_review',
};

function getAdminFilterCounts() {
  const rows = db.prepare(BASE_SELECT).all();
  const counts = {};
  for (const key of Object.keys(ADMIN_FILTERS)) counts[key] = rows.filter(ADMIN_FILTERS[key]).length;
  return counts;
}

function getAdminProducts({ q, filter } = {}) {
  let rows = db.prepare(BASE_SELECT).all();
  if (q) {
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const t = norm(q);
    rows = rows.filter((r) => norm(r.name).includes(t) || norm(r.brand_name).includes(t) || String(r.olisek_id || '').includes(t));
  }
  if (filter && ADMIN_FILTERS[filter]) rows = rows.filter(ADMIN_FILTERS[filter]);
  return rows.map(rowToAdmin);
}

function getAdminProductById(id) {
  const row = db.prepare(BASE_SELECT + ' WHERE p.id = ?').get(id);
  if (!row) return null;
  const admin = rowToAdmin(row);
  admin.images = getImages(row.id);
  admin.priceHistory = db.prepare(
    'SELECT id, old_price AS oldPrice, new_price AS newPrice, old_compare_price AS oldComparePrice, new_compare_price AS newComparePrice, user_name AS userName, created_at AS createdAt FROM price_history WHERE product_id = ? ORDER BY created_at DESC'
  ).all(row.id);
  return admin;
}

function touch(id) {
  db.prepare("UPDATE products SET updated_at = datetime('now') WHERE id = ?").run(id);
}

const VALID_LINK_STATUS = ['confirmed', 'probable', 'needs_review', 'unlinked'];

function createProduct(data) {
  const slug = uniqueSlug(data.name, (s) => !!db.prepare('SELECT 1 FROM products WHERE slug = ?').get(s));
  const linkStatus = VALID_LINK_STATUS.includes(data.olisekLinkStatus) ? data.olisekLinkStatus : (data.olisekId ? 'needs_review' : 'unlinked');
  const info = db.prepare(`
    INSERT INTO products (slug, name, brand_id, category, volume, gender, family, description,
      notes_top, notes_heart, notes_base, price, compare_price, stock, active, featured,
      olisek_id, olisek_name, olisek_link_status, stock_source)
    VALUES (@slug, @name, @brandId, @category, @volume, @gender, @family, @description,
      @notesTop, @notesHeart, @notesBase, @price, @comparePrice, @stock, @active, @featured,
      @olisekId, @olisekName, @olisekLinkStatus, @stockSource)
  `).run({
    slug,
    name: data.name,
    brandId: data.brandId ?? null,
    category: data.category ?? null,
    volume: data.volume ?? null,
    gender: data.gender ?? null,
    family: data.family ?? null,
    description: data.description ?? null,
    notesTop: data.notes?.topo ?? null,
    notesHeart: data.notes?.coracao ?? null,
    notesBase: data.notes?.fundo ?? null,
    price: data.price ?? null,
    comparePrice: data.comparePrice ?? null,
    stock: data.stock ?? 0,
    active: data.active ? 1 : 0,
    featured: data.featured ? 1 : 0,
    olisekId: data.olisekId ?? null,
    olisekName: data.olisekName ?? null,
    olisekLinkStatus: linkStatus,
    // 'olisek_import' só quando o vínculo é o bastante para confiar no
    // estoque; 'manual' quando alguém digitou um número na criação; 'none'
    // quando o produto nasce sem nenhum sinal real de estoque (regra 1: o
    // produto ainda assim entra no catálogo, só mostra "Consulte
    // disponibilidade" até alguém confirmar).
    stockSource: data.olisekId && (linkStatus === 'confirmed' || linkStatus === 'probable')
      ? 'olisek_import'
      : (data.stock != null ? 'manual' : 'none'),
  });
  return getAdminProductById(info.lastInsertRowid);
}

/** Edição "completa" — reservada a admin/gerente na rota, não aqui. */
function updateProductFull(id, data) {
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!current) return null;
  db.prepare(`
    UPDATE products SET
      name=@name, brand_id=@brandId, category=@category, volume=@volume, gender=@gender,
      family=@family, description=@description, notes_top=@notesTop, notes_heart=@notesHeart,
      notes_base=@notesBase,
      updated_at=datetime('now')
    WHERE id=@id
  `).run({
    id,
    name: data.name ?? current.name,
    brandId: data.brandId ?? current.brand_id,
    category: data.category ?? current.category,
    volume: data.volume ?? current.volume,
    gender: data.gender ?? current.gender,
    family: data.family ?? current.family,
    description: data.description ?? current.description,
    notesTop: data.notes?.topo ?? current.notes_top,
    notesHeart: data.notes?.coracao ?? current.notes_heart,
    notesBase: data.notes?.fundo ?? current.notes_base,
  });
  return getAdminProductById(id);
}

/** Vínculo OliSek — reservado a admin/gerente na rota, não aqui (regra 6 do
 *  fechamento da V2). Sempre passa pelo admin escolhendo explicitamente o
 *  `linkStatus`: nunca inferimos "confirmado" sozinhos. Trocar só o status
 *  (sem mexer no id/nome/estoque) é o caminho normal para resolver um
 *  'probable'/'needs_review' depois que alguém confirma manualmente. */
function setOlisekLink(id, { olisekId, olisekName, linkStatus, stock, sales }) {
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!current) return null;
  if (!VALID_LINK_STATUS.includes(linkStatus)) throw Object.assign(new Error('invalid_link_status'), { status: 400 });
  const finalOlisekId = linkStatus === 'unlinked' ? null : (olisekId ?? current.olisek_id);
  const finalOlisekName = linkStatus === 'unlinked' ? null : (olisekName ?? current.olisek_name);
  const finalStock = stock != null ? Math.max(0, parseInt(stock, 10) || 0) : current.stock;
  // `sales` só muda quando alguém passa um valor de verdade (import real da
  // OliSek) — nunca inventado, nunca zerado de volta só por trocar o status
  // do vínculo.
  const finalSales = sales != null ? Math.max(0, parseInt(sales, 10) || 0) : current.sales;
  const stockSource = linkStatus === 'confirmed' || linkStatus === 'probable' ? 'olisek_import'
    : (linkStatus === 'unlinked' && current.stock_source === 'olisek_import' ? 'none' : current.stock_source);
  db.prepare(`
    UPDATE products SET olisek_id=?, olisek_name=?, olisek_link_status=?, stock=?, sales=?, stock_source=?, updated_at=datetime('now')
    WHERE id=?
  `).run(finalOlisekId, finalOlisekName, linkStatus, finalStock, finalSales, stockSource, id);
  return getAdminProductById(id);
}

/** Preço — vendedora e admin. Sempre grava histórico. */
function setPrice(id, { price, comparePrice }, user) {
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!current) return null;
  db.prepare("UPDATE products SET price=?, compare_price=?, updated_at=datetime('now') WHERE id=?")
    .run(price, comparePrice ?? null, id);
  db.prepare(`
    INSERT INTO price_history (product_id, user_id, user_name, old_price, new_price, old_compare_price, new_compare_price)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, user.id, user.name, current.price, price, current.compare_price, comparePrice ?? null);
  return getAdminProductById(id);
}

function setActive(id, active) {
  db.prepare("UPDATE products SET active=?, updated_at=datetime('now') WHERE id=?").run(active ? 1 : 0, id);
  return getAdminProductById(id);
}

function setFeatured(id, featured) {
  db.prepare("UPDATE products SET featured=?, updated_at=datetime('now') WHERE id=?").run(featured ? 1 : 0, id);
  return getAdminProductById(id);
}

function setStockManual(id, stock) {
  db.prepare("UPDATE products SET stock=?, stock_source='manual', updated_at=datetime('now') WHERE id=?").run(stock, id);
  return getAdminProductById(id);
}

/** Despublicar (não apaga a linha nem o histórico — só tira do site). */
function despublish(id) {
  db.prepare("UPDATE products SET active=0, updated_at=datetime('now') WHERE id=?").run(id);
}

// ---------- imagens ----------

function addImage(productId, filePath, { isMain } = {}) {
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),-1) AS m FROM product_images WHERE product_id=?').get(productId).m;
  if (isMain) db.prepare('UPDATE product_images SET is_main=0 WHERE product_id=?').run(productId);
  const noneYet = db.prepare('SELECT COUNT(*) AS c FROM product_images WHERE product_id=?').get(productId).c === 0;
  const info = db.prepare('INSERT INTO product_images (product_id, file_path, sort_order, is_main) VALUES (?,?,?,?)')
    .run(productId, filePath, maxOrder + 1, (isMain || noneYet) ? 1 : 0);
  touch(productId);
  return info.lastInsertRowid;
}

function removeImage(productId, imageId) {
  const img = db.prepare('SELECT * FROM product_images WHERE id=? AND product_id=?').get(imageId, productId);
  if (!img) return false;
  db.prepare('DELETE FROM product_images WHERE id=?').run(imageId);
  if (img.is_main) {
    const next = db.prepare('SELECT id FROM product_images WHERE product_id=? ORDER BY sort_order ASC LIMIT 1').get(productId);
    if (next) db.prepare('UPDATE product_images SET is_main=1 WHERE id=?').run(next.id);
  }
  touch(productId);
  return img.file_path;
}

function setMainImage(productId, imageId) {
  db.prepare('UPDATE product_images SET is_main=0 WHERE product_id=?').run(productId);
  db.prepare('UPDATE product_images SET is_main=1 WHERE id=? AND product_id=?').run(imageId, productId);
  touch(productId);
}

function reorderImages(productId, orderedIds) {
  const stmt = db.prepare('UPDATE product_images SET sort_order=? WHERE id=? AND product_id=?');
  orderedIds.forEach((imgId, i) => stmt.run(i, imgId, productId));
  touch(productId);
}

// ---------- marcas ----------

function ensureBrand(name) {
  if (!name) return null;
  const existing = db.prepare('SELECT id FROM brands WHERE name = ?').get(name);
  if (existing) return existing.id;
  const slug = uniqueSlug(name, (s) => !!db.prepare('SELECT 1 FROM brands WHERE slug=?').get(s));
  return db.prepare('INSERT INTO brands (name, slug) VALUES (?,?)').run(name, slug).lastInsertRowid;
}

function listBrandsAdmin() {
  return db.prepare('SELECT id, name, slug, logo_path AS logoPath FROM brands ORDER BY name ASC').all();
}

module.exports = {
  stockStatus: computeAvailability,
  isStockReliable,
  isPubliclyVisible,
  PLACEHOLDER_IMAGE,
  VALID_LINK_STATUS,
  getPublicProducts, getPublicProductBySlug, getRelated, getBrandsPublic,
  getAdminProducts, getAdminProductById, getAdminFilterCounts,
  createProduct, updateProductFull, setOlisekLink, setPrice, setActive, setFeatured, setStockManual, despublish,
  addImage, removeImage, setMainImage, reorderImages,
  ensureBrand, listBrandsAdmin,
};
