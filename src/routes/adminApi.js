// API do admin (JSON). O roteador (src/app.js) já recusa /api/admin/* sem
// sessão antes de chegar aqui, exceto login/logout/me.
// Dois papéis: 'vendedora' (preço, fotos, destaque) e 'admin' (tudo isso +
// cadastro completo, estoque, OliSek, publicar/despublicar, backup).
import * as auth from '../auth.js';
import * as catalog from '../services/catalog.js';
import * as inventory from '../services/inventory.js';
import * as olisek from '../services/olisek.js';
import { exportDataJSON, readSnapshotJSON, trashUpload } from '../services/autoBackup.js';
import { optimizeImage } from '../images.js';
import { json, readJson, HttpError } from '../http.js';
import { decodeImageDataUrl, randomId } from '../util.js';

export function isAdmin(ctx) { return ctx.user && ctx.user.role === 'admin'; }

function requireAdmin(ctx) {
  if (!isAdmin(ctx)) throw new HttpError(403, 'forbidden', 'Só administradores podem fazer isso.');
}

function publicUser(u) {
  return { id: u.id, name: u.name, username: u.username, role: u.role, mustChangePassword: !!u.must_change_password };
}

/** Histórico de preço é só do admin. */
function stripHistoryUnlessAdmin(ctx, product) {
  if (product && !isAdmin(ctx)) delete product.priceHistory;
  return product;
}

function productOr404(ctx, product) {
  if (!product) return json(404, { error: 'not_found' });
  return json(200, { product: stripHistoryUnlessAdmin(ctx, product) });
}

// ---------- login / sessão ----------

export async function login(ctx) {
  const body = await readJson(ctx.request, 64 * 1024);
  const username = String(body.username || '').trim().slice(0, 80);
  const password = String(body.password || '').slice(0, 200);
  if (!username || !password) return json(400, { error: 'invalid_credentials', message: 'Informe usuário e senha.' });

  const locked = await auth.loginLockedFor(ctx.db, ctx.clientIp, username);
  if (locked) {
    const min = Math.ceil(locked / 60);
    return json(429, { error: 'too_many_attempts', message: `Muitas tentativas erradas. Tente de novo em ${min} minuto${min === 1 ? '' : 's'}.` },
      { 'Retry-After': String(locked) });
  }
  const user = await ctx.db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').bind(username).first();
  if (!user || !auth.verifyPassword(password, user.password_salt, user.password_hash)) {
    await auth.registerLoginFailure(ctx.db, ctx.clientIp, username);
    return json(401, { error: 'invalid_credentials', message: 'Usuário ou senha incorretos.' });
  }
  await auth.clearLoginFailures(ctx.db, ctx.clientIp, username);
  // Senha no formato antigo (V2): regrava no formato atual, que cabe no
  // limite de CPU do plano grátis da Cloudflare. A pessoa nem percebe.
  if (auth.needsRehash(user.password_hash)) {
    const { hash, salt } = auth.hashPassword(password);
    await ctx.db.prepare('UPDATE users SET password_hash=?, password_salt=? WHERE id=?').bind(hash, salt, user.id).run();
  }
  const session = await auth.createSession(ctx.db, user.id);
  return json(200, { user: publicUser(user) }, { 'Set-Cookie': auth.sessionCookie(session.id, { secure: ctx.https }) });
}

export async function logout(ctx) {
  if (ctx.sessionId) await auth.destroySession(ctx.db, ctx.sessionId);
  return json(200, { ok: true }, { 'Set-Cookie': auth.clearSessionCookie({ secure: ctx.https }) });
}

export async function me(ctx) {
  if (!ctx.user) return json(401, { error: 'not_logged_in' });
  return json(200, { user: publicUser(ctx.user) });
}

export const MIN_PASSWORD_LENGTH = 10;

export async function changePassword(ctx) {
  const body = await readJson(ctx.request, 64 * 1024);
  const atual = String(body.currentPassword || '');
  const nova = String(body.newPassword || '');
  if (nova.length < MIN_PASSWORD_LENGTH || nova.length > 200) {
    return json(400, { error: 'weak_password', message: `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
  }
  const user = ctx.user;
  if (!user.must_change_password && !auth.verifyPassword(atual, user.password_salt, user.password_hash)) {
    return json(401, { error: 'wrong_current_password', message: 'Senha atual incorreta.' });
  }
  if (auth.verifyPassword(nova, user.password_salt, user.password_hash)) {
    return json(400, { error: 'same_password', message: 'A nova senha precisa ser diferente da atual.' });
  }
  const { hash, salt } = auth.hashPassword(nova);
  await ctx.db.prepare('UPDATE users SET password_hash=?, password_salt=?, must_change_password=0 WHERE id=?').bind(hash, salt, user.id).run();
  // Derruba as outras sessões abertas dessa conta (ex.: celular perdido).
  await auth.destroyUserSessions(ctx.db, user.id, ctx.sessionId || '');
  return json(200, { ok: true });
}

// ---------- produtos ----------

export async function listProducts(ctx) {
  const q = ctx.url.searchParams;
  const { products, counts } = await catalog.getAdminProducts(ctx.db, { q: q.get('q') || undefined, filter: q.get('filter') || undefined });
  return json(200, { products, brands: await catalog.listBrandsAdmin(ctx.db), counts });
}

export async function getProduct(ctx, id) {
  return productOr404(ctx, await catalog.getAdminProductById(ctx.db, Number(id)));
}

export async function createProduct(ctx) {
  requireAdmin(ctx);
  const body = await readJson(ctx.request);
  if (!body.name || !String(body.name).trim()) return json(400, { error: 'name_required', message: 'Informe o nome do produto.' });
  const product = await catalog.createProduct(ctx.db, body, ctx.user);
  return json(201, { product });
}

/** Ações em lote da lista de produtos: publicar, ocultar, liberar/bloquear
 *  fotos — nos produtos selecionados (`ids`) ou em todos os resultados de
 *  um filtro (`criteria`). Só administração. */
export async function bulk(ctx) {
  requireAdmin(ctx);
  const body = await readJson(ctx.request, 256 * 1024);
  const c = body.criteria;
  const criteria = c && typeof c === 'object' ? {
    q: String(c.q || '').slice(0, 100),
    filter: c.filter in catalog.ADMIN_FILTERS ? c.filter : 'todos',
    brandId: /^\d+$/.test(String(c.brandId || '')) ? c.brandId : '',
    category: String(c.category || '').slice(0, 100),
    source: ['loja', 'atlantico', 'onuh'].includes(c.source) ? c.source : '',
  } : null;
  const affected = await catalog.bulkAction(ctx.db, body.action, { ids: Array.isArray(body.ids) ? body.ids : undefined, criteria });
  return json(200, { ok: true, affected });
}

export async function updateProductFull(ctx, id) {
  requireAdmin(ctx);
  const body = await readJson(ctx.request);
  return productOr404(ctx, await catalog.updateProductFull(ctx.db, Number(id), body));
}

function parsePrice(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new HttpError(400, 'invalid_price', 'Preço inválido.');
  return Math.round(n * 100) / 100;
}

export async function setPrice(ctx, id) {
  const body = await readJson(ctx.request);
  const price = parsePrice(body.price);
  const comparePrice = parsePrice(body.comparePrice);
  return productOr404(ctx, await catalog.setPrice(ctx.db, Number(id), { price, comparePrice }, ctx.user));
}

export async function setActive(ctx, id) {
  requireAdmin(ctx); // publicar/ocultar é só admin
  const body = await readJson(ctx.request);
  return productOr404(ctx, await catalog.setActive(ctx.db, Number(id), !!body.active));
}

export async function setFeatured(ctx, id) {
  const body = await readJson(ctx.request);
  return productOr404(ctx, await catalog.setFeatured(ctx.db, Number(id), !!body.featured));
}

/** Compatibilidade com a tela antiga: "definir estoque = N" vira um ajuste
 *  registrado no histórico. */
export async function setStock(ctx, id) {
  requireAdmin(ctx);
  const body = await readJson(ctx.request);
  await inventory.moveStock(ctx.db, Number(id), {
    kind: 'ajuste', quantity: Math.max(0, parseInt(body.stock, 10) || 0),
    reason: String(body.reason || '').trim() || 'Ajuste manual na tela do produto', user: ctx.user,
  });
  return productOr404(ctx, await catalog.getAdminProductById(ctx.db, Number(id)));
}

export async function setOlisekLink(ctx, id) {
  requireAdmin(ctx);
  const body = await readJson(ctx.request);
  const product = await catalog.setOlisekLink(ctx.db, Number(id), {
    olisekId: body.olisekId === '' || body.olisekId == null ? null : Number(body.olisekId),
    olisekName: body.olisekName ?? null,
    linkStatus: body.linkStatus,
    stock: body.stock,
    sales: body.sales,
  }, ctx.user);
  return productOr404(ctx, product);
}

export async function despublish(ctx, id) {
  requireAdmin(ctx);
  await catalog.despublish(ctx.db, Number(id));
  return json(200, { ok: true });
}

// ---------- estoque ----------

export async function createMovement(ctx, id) {
  requireAdmin(ctx); // número de estoque é só admin (vendedora não mexe)
  const body = await readJson(ctx.request, 64 * 1024);
  const movement = await inventory.moveStock(ctx.db, Number(id), {
    kind: body.kind, quantity: body.quantity, reason: body.reason, user: ctx.user,
  });
  const product = await catalog.getAdminProductById(ctx.db, Number(id));
  return json(movement ? 201 : 200, { movement, product: stripHistoryUnlessAdmin(ctx, product) });
}

export async function listMovements(ctx, id) {
  requireAdmin(ctx);
  return json(200, { movements: await inventory.listMovements(ctx.db, { productId: id ? Number(id) : undefined, limit: ctx.url.searchParams.get('limit') || 50 }) });
}

export async function stockOverview(ctx) {
  requireAdmin(ctx);
  return json(200, await inventory.inventoryOverview(ctx.db));
}

export async function syncAllOlisek(ctx) {
  requireAdmin(ctx);
  if (!olisek.apiConfigured(ctx.config)) return json(501, { error: 'olisek_api_not_configured', message: 'API da OliSek não configurada.' });
  const body = await readJson(ctx.request, 1024);
  const report = await catalog.syncAllFromOlisek(ctx.db, ctx.config, { user: ctx.user, includeProbable: !!body.includeProbable });
  return json(200, { report });
}

function jsonDownload(text, filename) {
  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Cópia dos dados de agora (sem as fotos — ver docs/BACKEND.md, "Backup"). */
export async function backup(ctx) {
  requireAdmin(ctx);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return jsonDownload(await exportDataJSON(ctx.db), `essencia-natural-backup-${stamp}.json`);
}

/** Uma das cópias automáticas semanais. */
export async function autoBackupDownload(ctx, id) {
  requireAdmin(ctx);
  const text = await readSnapshotJSON(ctx.db, Number(id));
  if (!text) return json(404, { error: 'not_found' });
  return jsonDownload(text, `essencia-natural-backup-automatico-${Number(id)}.json`);
}

// ---------- marcas ----------

export async function createBrand(ctx) {
  requireAdmin(ctx);
  const body = await readJson(ctx.request, 64 * 1024);
  if (!body.name || !String(body.name).trim()) return json(400, { error: 'name_required' });
  const id = await catalog.ensureBrand(ctx.db, String(body.name).trim().slice(0, 80));
  return json(201, { id });
}

export async function listBrands(ctx) {
  return json(200, { brands: await catalog.listBrandsAdmin(ctx.db) });
}

// ---------- imagens ----------
// Upload por JSON (data URL). O formato real é validado pela assinatura dos
// bytes; a foto é otimizada (ver src/images.js) e guardada no R2 (Cloudflare)
// ou na pasta uploads/ (Node local).

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function uploadImage(ctx, id) {
  const productId = Number(id);
  const product = await ctx.db.prepare('SELECT id, slug FROM products WHERE id = ?').bind(productId).first();
  if (!product) return json(404, { error: 'not_found' });
  const body = await readJson(ctx.request, 12 * 1024 * 1024);
  const decoded = decodeImageDataUrl(body.dataUrl);
  if (!decoded) return json(400, { error: 'invalid_image', message: 'Envie um arquivo JPG, PNG ou WEBP.' });
  if (decoded.bytes.length > MAX_UPLOAD_BYTES) return json(413, { error: 'too_large', message: 'Imagem maior que 8MB.' });

  const img = await optimizeImage(ctx.images, decoded.bytes, decoded.ext);
  const key = `products/${product.slug}/${randomId(6)}.${img.ext}`;
  await ctx.storage.put(key, img.bytes, img.contentType);
  const filePath = `/uploads/${key}`;
  const imageId = await catalog.addImage(ctx.db, productId, filePath, { isMain: !!body.isMain });
  return json(201, { image: { id: imageId, path: filePath, optimized: img.optimized, bytes: img.bytes.length } });
}

export async function deleteImage(ctx, id, imageId) {
  const filePath = await catalog.removeImage(ctx.db, Number(id), Number(imageId));
  if (!filePath) return json(404, { error: 'image_not_found' });
  // O arquivo não é apagado na hora: vai para a fila de remoção e só some
  // depois de 90 dias (as cópias automáticas ainda podem citá-lo). Ver
  // src/services/autoBackup.js.
  if (filePath.startsWith('/uploads/')) await trashUpload(ctx.db, filePath.slice('/uploads/'.length));
  return json(200, { ok: true });
}

export async function setMainImage(ctx, id, imageId) {
  const ok = await catalog.setMainImage(ctx.db, Number(id), Number(imageId));
  return ok ? json(200, { ok: true }) : json(404, { error: 'image_not_found' });
}

export async function reorderImages(ctx, id) {
  const body = await readJson(ctx.request, 64 * 1024);
  const order = Array.isArray(body.order) ? body.order.map(Number).filter(Number.isInteger) : [];
  await catalog.reorderImages(ctx.db, Number(id), order);
  return json(200, { ok: true });
}

// ---------- OliSek ----------

export async function parseOlisekReport(ctx) {
  requireAdmin(ctx);
  const body = await readJson(ctx.request);
  const rows = olisek.parseReport(body.text || '');
  const out = [];
  for (const r of rows) {
    const existing = await ctx.db.prepare('SELECT id, slug, name FROM products WHERE olisek_id = ?').bind(r.olisekId).first();
    out.push({ ...r, jaVinculado: existing ? { id: existing.id, slug: existing.slug, name: existing.name } : null });
  }
  return json(200, { rows: out });
}

export async function applyOlisekLink(ctx) {
  requireAdmin(ctx);
  const body = await readJson(ctx.request);
  // Vínculo aplicado por um admin a partir de um relatório colado: uma
  // pessoa olhou e confirmou — por isso 'confirmed'.
  const product = await catalog.setOlisekLink(ctx.db, Number(body.productId), {
    olisekId: body.olisekId, olisekName: body.olisekName, linkStatus: 'confirmed', stock: body.stock,
  }, ctx.user);
  return productOr404(ctx, product);
}

/** Botão "Sincronizar agora" na tela de produto. */
export async function syncOlisekStock(ctx, id) {
  requireAdmin(ctx);
  try {
    return productOr404(ctx, await catalog.syncStockFromOlisek(ctx.db, ctx.config, Number(id), ctx.user));
  } catch (e) {
    return json(e.status || 502, { error: e.message || 'olisek_sync_failed', olisekError: e.olisekError || null });
  }
}
