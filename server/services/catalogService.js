// catalogService — única camada que fala com o banco de produtos. Rotas
// públicas, rotas de admin e (no futuro) integrações não tocam o SQLite
// direto: todas passam por aqui. Isso é o que deixa o `olisekId`/estoque
// trocável por uma API de verdade mais tarde sem mexer no resto do site.
'use strict';

const db = require('../db');
const { slugify, uniqueSlug } = require('../util');

const STOCK_THRESHOLD = { ultimas: 10 }; // configurável: stock<=10 = "Últimas unidades"

function stockStatus(stock) {
  if (stock <= 0) return { code: 'indisponivel', label: 'Indisponível' };
  if (stock <= STOCK_THRESHOLD.ultimas) return { code: 'ultimas', label: 'Últimas unidades' };
  return { code: 'em_estoque', label: 'Em estoque' };
}

function rowToPublic(row) {
  const status = stockStatus(row.stock);
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
    image: row.main_image || null,
    images: [],
  };
}

function rowToAdmin(row) {
  return {
    id: row.id,
    slug: row.slug,
    olisekId: row.olisek_id,
    olisekName: row.olisek_name,
    olisekMatchConfidence: row.olisek_match_confidence,
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
    stockLabel: stockStatus(row.stock).label,
    active: !!row.active,
    featured: !!row.featured,
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
  let rows = db.prepare(`${BASE_SELECT} WHERE p.active = 1`).all();
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
    rows = rows.filter((r) => stockStatus(r.stock).code === availability);
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
  if (!row) return null;
  const pub = rowToPublic(row);
  pub.images = getImages(row.id).map((i) => i.path);
  return pub;
}

function getRelated(slug, limit = 4) {
  const row = db.prepare('SELECT * FROM products WHERE slug = ?').get(slug);
  if (!row) return [];
  let rows = db.prepare(`${BASE_SELECT} WHERE p.active = 1 AND p.id != ?`).all(row.id);
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

function getAdminProducts({ q } = {}) {
  let rows = db.prepare(BASE_SELECT).all();
  if (q) {
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const t = norm(q);
    rows = rows.filter((r) => norm(r.name).includes(t) || norm(r.brand_name).includes(t) || String(r.olisek_id || '').includes(t));
  }
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

function createProduct(data) {
  const slug = uniqueSlug(data.name, (s) => !!db.prepare('SELECT 1 FROM products WHERE slug = ?').get(s));
  const info = db.prepare(`
    INSERT INTO products (slug, name, brand_id, category, volume, gender, family, description,
      notes_top, notes_heart, notes_base, price, compare_price, stock, active, featured,
      olisek_id, olisek_name, olisek_match_confidence, stock_source)
    VALUES (@slug, @name, @brandId, @category, @volume, @gender, @family, @description,
      @notesTop, @notesHeart, @notesBase, @price, @comparePrice, @stock, @active, @featured,
      @olisekId, @olisekName, @olisekMatchConfidence, @stockSource)
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
    olisekMatchConfidence: data.olisekMatchConfidence ?? null,
    stockSource: data.olisekId ? 'olisek_import' : 'manual',
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
      notes_base=@notesBase, olisek_id=@olisekId, olisek_name=@olisekName,
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
    olisekId: data.olisekId ?? current.olisek_id,
    olisekName: data.olisekName ?? current.olisek_name,
  });
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
  stockStatus,
  getPublicProducts, getPublicProductBySlug, getRelated, getBrandsPublic,
  getAdminProducts, getAdminProductById,
  createProduct, updateProductFull, setPrice, setActive, setFeatured, setStockManual, despublish,
  addImage, removeImage, setMainImage, reorderImages,
  ensureBrand, listBrandsAdmin,
};
