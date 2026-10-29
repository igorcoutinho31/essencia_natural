// Ferramentas do painel (/admin/ferramentas): arrumar nomes e padronizar
// fotos. As regras rodam no navegador de quem usa o painel
// (public/assets/js/regras-catalogo.mjs) — o servidor só entrega a lista e
// grava o que foi conferido e aprovado, sempre validando. Assim o Worker
// fica dentro dos 10 ms de CPU do plano grátis mesmo com milhares de produtos.

export const LISTA_LIMITE = 500;
export const MAX_NOMES = 300;
export const MAX_FOTOS = 100;

/** Uma página da lista leve de produtos (id crescente, a partir de `depois`). */
export async function listaLeve(db, depois = 0, limite = LISTA_LIMITE) {
  const { results } = await db.prepare(
    `SELECT p.id, p.name, b.name AS brand, p.volume, p.concentration, p.source, p.active,
       (SELECT pi.file_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_main DESC, pi.sort_order ASC LIMIT 1) AS image
     FROM products p LEFT JOIN brands b ON b.id = p.brand_id
     WHERE p.id > ? ORDER BY p.id ASC LIMIT ?`
  ).bind(Math.max(0, Number(depois) || 0), limite).all();
  return results.map((r) => ({
    id: r.id, name: r.name, brand: r.brand || null, volume: r.volume || null, concentration: r.concentration || null,
    source: r.source || null, active: !!r.active, image: r.image || null, hasImage: !!r.image,
  }));
}

function texto(v, max) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s && s.length <= max ? s : undefined; // undefined = inválido
}

/** Grava nomes conferidos: [{ id, name, volume, concentration }]. */
export async function aplicarNomes(db, mudancas) {
  if (!Array.isArray(mudancas) || !mudancas.length || mudancas.length > MAX_NOMES) return { erro: 'lista_invalida' };
  const stmts = [];
  for (const m of mudancas) {
    const id = Number(m && m.id);
    const name = texto(m.name, 200), volume = texto(m.volume, 40), concentration = texto(m.concentration, 60);
    if (!Number.isInteger(id) || id <= 0 || !name || volume === undefined || concentration === undefined) return { erro: 'item_invalido', id: m && m.id };
    stmts.push(db.prepare("UPDATE products SET name = ?, volume = ?, concentration = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(name, volume, concentration, id));
  }
  const res = await db.batch(stmts);
  return { alterados: res.reduce((n, r) => n + (r.meta?.changes ? 1 : 0), 0) };
}

/** Troca as fotos dos cadastros da loja pela foto do mesmo perfume no
 *  catálogo importado: [{ id, de }]. As fotos antigas vão para a lixeira de
 *  90 dias (nada é apagado na hora). */
export async function aplicarFotos(db, pares) {
  if (!Array.isArray(pares) || !pares.length || pares.length > MAX_FOTOS) return { erro: 'lista_invalida' };
  let trocados = 0;
  for (const par of pares) {
    const id = Number(par && par.id), de = Number(par && par.de);
    if (!Number.isInteger(id) || !Number.isInteger(de) || id <= 0 || de <= 0 || id === de) return { erro: 'item_invalido', id: par && par.id };
    const [alvo, origem] = await db.batch([
      db.prepare('SELECT id, source FROM products WHERE id = ?').bind(id),
      db.prepare(`SELECT pi.file_path AS image FROM products p JOIN product_images pi ON pi.product_id = p.id
        WHERE p.id = ? AND p.source IS NOT NULL ORDER BY pi.is_main DESC, pi.sort_order ASC LIMIT 1`).bind(de),
    ]);
    const produto = alvo.results[0], foto = origem.results[0]?.image;
    if (!produto || produto.source || !foto) continue; // só cadastro da loja recebe foto do catálogo importado
    const antigas = (await db.prepare('SELECT file_path FROM product_images WHERE product_id = ?').bind(id).all()).results
      .map((r) => r.file_path).filter((f) => f !== foto);
    const stmts = antigas.filter((f) => f.startsWith('/uploads/')).map((f) =>
      db.prepare("INSERT INTO upload_trash (key) VALUES (?) ON CONFLICT(key) DO UPDATE SET deleted_at = datetime('now')").bind(f.slice('/uploads/'.length)));
    stmts.push(db.prepare('DELETE FROM product_images WHERE product_id = ?').bind(id));
    stmts.push(db.prepare('INSERT INTO product_images (product_id, file_path, sort_order, is_main, licensed) VALUES (?, ?, 0, 1, 1)').bind(id, foto));
    stmts.push(db.prepare("UPDATE products SET updated_at = datetime('now') WHERE id = ?").bind(id));
    await db.batch(stmts);
    trocados += 1;
  }
  return { trocados };
}
