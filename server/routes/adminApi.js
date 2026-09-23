// API do admin (JSON) — tudo aqui exige sessão válida (ver server/app.js,
// que já recusa qualquer /api/admin/* sem req.user antes de chegar aqui).
// Duas contas: 'vendedora' (preço, estoque manual, fotos, ativo/destaque)
// e 'admin' (tudo isso + cadastro completo, criar/despublicar, histórico).
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const auth = require('../auth');
const catalogService = require('../services/catalogService');
const olisekService = require('../services/olisekService');
const { sendJSON, readJsonBody, decodeImageDataUrl, randomId } = require('../util');

const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads', 'products');

function isAdmin(req) { return req.user && req.user.role === 'admin'; }

function requireAdmin(req, res) {
  if (!isAdmin(req)) { sendJSON(res, 403, { error: 'forbidden', message: 'Só administradores podem fazer isso.' }); return false; }
  return true;
}

// ---------- login / sessão ----------

async function login(req, res) {
  const body = await readJsonBody(req);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user || !auth.verifyPassword(password, user.password_salt, user.password_hash)) {
    return sendJSON(res, 401, { error: 'invalid_credentials', message: 'Usuário ou senha incorretos.' });
  }
  const session = auth.createSession(user.id);
  auth.setSessionCookie(res, session.id, { secure: auth.isSecureRequest(req) });
  sendJSON(res, 200, {
    user: { id: user.id, name: user.name, username: user.username, role: user.role, mustChangePassword: !!user.must_change_password },
  });
}

function logout(req, res) {
  if (req.sessionId) auth.destroySession(req.sessionId);
  auth.clearSessionCookie(res);
  sendJSON(res, 200, { ok: true });
}

function me(req, res) {
  if (!req.user) return sendJSON(res, 401, { error: 'not_logged_in' });
  const u = req.user;
  sendJSON(res, 200, { user: { id: u.id, name: u.name, username: u.username, role: u.role, mustChangePassword: !!u.must_change_password } });
}

async function changePassword(req, res) {
  const body = await readJsonBody(req);
  const atual = String(body.currentPassword || '');
  const nova = String(body.newPassword || '');
  if (nova.length < 6) return sendJSON(res, 400, { error: 'weak_password', message: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user.must_change_password && !auth.verifyPassword(atual, user.password_salt, user.password_hash)) {
    return sendJSON(res, 401, { error: 'wrong_current_password', message: 'Senha atual incorreta.' });
  }
  const { hash, salt } = auth.hashPassword(nova);
  db.prepare('UPDATE users SET password_hash=?, password_salt=?, must_change_password=0 WHERE id=?').run(hash, salt, user.id);
  sendJSON(res, 200, { ok: true });
}

// ---------- produtos ----------

function listProducts(req, res, query) {
  const products = catalogService.getAdminProducts({ q: query.get('q') || undefined, filter: query.get('filter') || undefined });
  sendJSON(res, 200, { products, brands: catalogService.listBrandsAdmin(), counts: catalogService.getAdminFilterCounts() });
}

function getProduct(req, res, id) {
  const product = catalogService.getAdminProductById(Number(id));
  if (!product) return sendJSON(res, 404, { error: 'not_found' });
  if (!isAdmin(req)) delete product.priceHistory; // histórico completo é só do admin/gerente
  sendJSON(res, 200, { product });
}

/** Histórico de preço é só do admin/gerente (ver spec V2, seção 7) — toda
 *  resposta que devolve o produto completo passa por aqui antes de sair. */
function stripHistoryUnlessAdmin(req, product) {
  if (product && !isAdmin(req)) delete product.priceHistory;
  return product;
}

async function createProduct(req, res) {
  if (!requireAdmin(req, res)) return;
  const body = await readJsonBody(req);
  if (!body.name || !String(body.name).trim()) return sendJSON(res, 400, { error: 'name_required' });
  const product = catalogService.createProduct(body);
  sendJSON(res, 201, { product });
}

async function updateProductFull(req, res, id) {
  if (!requireAdmin(req, res)) return;
  const body = await readJsonBody(req);
  const product = catalogService.updateProductFull(Number(id), body);
  if (!product) return sendJSON(res, 404, { error: 'not_found' });
  sendJSON(res, 200, { product });
}

async function setPrice(req, res, id) {
  const body = await readJsonBody(req);
  const price = body.price === '' || body.price == null ? null : Number(body.price);
  const comparePrice = body.comparePrice === '' || body.comparePrice == null ? null : Number(body.comparePrice);
  if (price != null && (!isFinite(price) || price < 0)) return sendJSON(res, 400, { error: 'invalid_price' });
  const product = catalogService.setPrice(Number(id), { price, comparePrice }, { id: req.user.id, name: req.user.name });
  if (!product) return sendJSON(res, 404, { error: 'not_found' });
  sendJSON(res, 200, { product: stripHistoryUnlessAdmin(req, product) });
}

async function setActive(req, res, id) {
  if (!requireAdmin(req, res)) return; // publicar/ocultar produto é só admin/gerente (regra 7)
  const body = await readJsonBody(req);
  const product = catalogService.setActive(Number(id), !!body.active);
  if (!product) return sendJSON(res, 404, { error: 'not_found' });
  sendJSON(res, 200, { product: stripHistoryUnlessAdmin(req, product) });
}

async function setFeatured(req, res, id) {
  const body = await readJsonBody(req);
  const product = catalogService.setFeatured(Number(id), !!body.featured);
  if (!product) return sendJSON(res, 404, { error: 'not_found' });
  sendJSON(res, 200, { product: stripHistoryUnlessAdmin(req, product) });
}

async function setStock(req, res, id) {
  if (!requireAdmin(req, res)) return; // estoque manual é só admin/gerente (regra 7) — vendedora não mexe em número de estoque
  const body = await readJsonBody(req);
  const stock = Math.max(0, parseInt(body.stock, 10) || 0);
  const product = catalogService.setStockManual(Number(id), stock);
  if (!product) return sendJSON(res, 404, { error: 'not_found' });
  sendJSON(res, 200, { product: stripHistoryUnlessAdmin(req, product) });
}

/** Vínculo OliSek (id, nome, status) — só admin/gerente (regra 7). */
async function setOlisekLink(req, res, id) {
  if (!requireAdmin(req, res)) return;
  const body = await readJsonBody(req);
  try {
    const product = catalogService.setOlisekLink(Number(id), {
      olisekId: body.olisekId === '' || body.olisekId == null ? null : Number(body.olisekId),
      olisekName: body.olisekName ?? null,
      linkStatus: body.linkStatus,
      stock: body.stock,
      sales: body.sales,
    });
    if (!product) return sendJSON(res, 404, { error: 'not_found' });
    sendJSON(res, 200, { product });
  } catch (e) {
    sendJSON(res, e.status || 400, { error: e.message || 'invalid_request' });
  }
}

function despublish(req, res, id) {
  if (!requireAdmin(req, res)) return;
  catalogService.despublish(Number(id));
  sendJSON(res, 200, { ok: true });
}

// ---------- marcas ----------

async function createBrand(req, res) {
  if (!requireAdmin(req, res)) return;
  const body = await readJsonBody(req);
  if (!body.name || !String(body.name).trim()) return sendJSON(res, 400, { error: 'name_required' });
  const id = catalogService.ensureBrand(String(body.name).trim());
  sendJSON(res, 201, { id });
}

function listBrands(req, res) {
  sendJSON(res, 200, { brands: catalogService.listBrandsAdmin() });
}

// ---------- imagens ----------
// Upload por JSON (data URL) — sem multer (bloqueado pelo npm). O byte real
// da imagem é validado por assinatura em decodeImageDataUrl; nunca confiamos
// no mime/extensão que o navegador declarar. Sem `sharp` disponível neste
// ambiente, não há redimensionamento automático no servidor — ver
// docs/CATALOGO.md, seção "Limitação conhecida: otimização de imagem".

async function uploadImage(req, res, id) {
  const productId = Number(id);
  const product = catalogService.getAdminProductById(productId);
  if (!product) return sendJSON(res, 404, { error: 'not_found' });
  const body = await readJsonBody(req, 12 * 1024 * 1024);
  const decoded = decodeImageDataUrl(body.dataUrl);
  if (!decoded) return sendJSON(res, 400, { error: 'invalid_image', message: 'Envie um arquivo JPG, PNG ou WEBP.' });
  if (decoded.buffer.length > 8 * 1024 * 1024) return sendJSON(res, 413, { error: 'too_large', message: 'Imagem maior que 8MB.' });

  const dir = path.join(UPLOADS_ROOT, product.slug);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${randomId(6)}.${decoded.ext}`;
  fs.writeFileSync(path.join(dir, filename), decoded.buffer);
  const filePath = `/uploads/products/${product.slug}/${filename}`;
  const imageId = catalogService.addImage(productId, filePath, { isMain: !!body.isMain });
  sendJSON(res, 201, { image: { id: imageId, path: filePath } });
}

function deleteImage(req, res, id, imageId) {
  const productId = Number(id);
  const product = catalogService.getAdminProductById(productId);
  if (!product) return sendJSON(res, 404, { error: 'not_found' });
  const filePath = catalogService.removeImage(productId, Number(imageId));
  if (!filePath) return sendJSON(res, 404, { error: 'image_not_found' });
  const abs = path.join(__dirname, '..', '..', filePath.replace(/^\//, ''));
  fs.unlink(abs, () => {}); // best-effort; não trava a resposta se o arquivo já não existir
  sendJSON(res, 200, { ok: true });
}

function setMainImage(req, res, id, imageId) {
  catalogService.setMainImage(Number(id), Number(imageId));
  sendJSON(res, 200, { ok: true });
}

async function reorderImages(req, res, id) {
  const body = await readJsonBody(req);
  const order = Array.isArray(body.order) ? body.order.map(Number) : [];
  catalogService.reorderImages(Number(id), order);
  sendJSON(res, 200, { ok: true });
}

// ---------- OliSek: importar relatório colado ----------

async function parseOlisekReport(req, res) {
  if (!requireAdmin(req, res)) return;
  const body = await readJsonBody(req);
  const rows = olisekService.parseReport(body.text || '');
  const withMatch = rows.map((r) => {
    const existing = db.prepare('SELECT id, slug, name FROM products WHERE olisek_id = ?').get(r.olisekId);
    return { ...r, jaVinculado: existing ? { id: existing.id, slug: existing.slug, name: existing.name } : null };
  });
  sendJSON(res, 200, { rows: withMatch });
}

async function applyOlisekLink(req, res) {
  if (!requireAdmin(req, res)) return;
  const body = await readJsonBody(req);
  const productId = Number(body.productId);
  const { olisekId, olisekName, stock } = body;
  // Vínculo aplicado manualmente por um admin a partir de um relatório colado
  // já é uma correspondência que uma pessoa olhou e confirmou — por isso
  // 'confirmed' (nunca inferido sozinho pelo sistema, ver regra 6).
  const product = catalogService.setOlisekLink(productId, { olisekId, olisekName, linkStatus: 'confirmed', stock });
  if (!product) return sendJSON(res, 404, { error: 'not_found' });
  sendJSON(res, 200, { product });
}

module.exports = {
  login, logout, me, changePassword,
  listProducts, getProduct, createProduct, updateProductFull,
  setPrice, setActive, setFeatured, setStock, setOlisekLink, despublish,
  createBrand, listBrands,
  uploadImage, deleteImage, setMainImage, reorderImages,
  parseOlisekReport, applyOlisekLink,
  isAdmin,
};
