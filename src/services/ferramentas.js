// Ferramentas do painel (/admin/ferramentas): arrumar nomes e padronizar
// fotos. As regras rodam no navegador de quem usa o painel
// (public/assets/js/regras-catalogo.mjs) — o servidor só entrega a lista e
// grava o que foi conferido e aprovado, sempre validando. Assim o Worker
// fica dentro dos 10 ms de CPU do plano grátis mesmo com milhares de produtos.
import { sniffImage } from '../util.js';

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

// ---------- vitrine: o que fica publicado ----------
// Regra: aparece no site o que a loja tem (produtos do relatório da loja,
// com foto). Do catálogo importado, sai o que não está no relatório.
// Cadastros feitos pela loja (sem origem) não são tocados.
const VITRINE = {
  publicar: `p.active = 0 AND p.in_store_report = 1
    AND EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)`,
  ocultar: 'p.active = 1 AND p.source IS NOT NULL AND p.in_store_report = 0',
  semFoto: `p.active = 0 AND p.in_store_report = 1
    AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)`,
};

/** Prévia: quantos entram, quantos saem (com alguns nomes de exemplo). */
export async function previaVitrine(db) {
  const conta = (w) => db.prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${w}`);
  const exemplos = (w) => db.prepare(`SELECT p.id, p.name, b.name AS brand FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE ${w} ORDER BY p.name LIMIT 30`);
  const [a, b, c, d, e, f] = await db.batch([
    conta(VITRINE.publicar), exemplos(VITRINE.publicar), conta(VITRINE.ocultar), exemplos(VITRINE.ocultar), conta(VITRINE.semFoto),
    db.prepare('SELECT COUNT(*) AS n FROM products WHERE active = 1'),
  ]);
  const nomes = (r) => r.results.map((x) => ({ id: x.id, nome: x.name, marca: x.brand || null }));
  return {
    publicados: f.results[0].n,
    publicar: { total: a.results[0].n, exemplos: nomes(b) },
    ocultar: { total: c.results[0].n, exemplos: nomes(d) },
    semFoto: e.results[0].n,
  };
}

/** Aplica as duas partes escolhidas. Devolve quantos mudaram em cada uma. */
export async function aplicarVitrine(db, { publicar, ocultar }) {
  const stmts = [];
  if (publicar) stmts.push(db.prepare(`UPDATE products SET active = 1, updated_at = datetime('now') WHERE id IN (SELECT p.id FROM products p WHERE ${VITRINE.publicar})`));
  if (ocultar) stmts.push(db.prepare(`UPDATE products SET active = 0, updated_at = datetime('now') WHERE id IN (SELECT p.id FROM products p WHERE ${VITRINE.ocultar})`));
  if (!stmts.length) return { erro: 'nada' };
  const res = await db.batch(stmts);
  const n = (r) => (r && r.meta ? r.meta.changes || 0 : 0);
  return { publicados: publicar ? n(res[0]) : 0, ocultados: ocultar ? n(res[publicar ? 1 : 0]) : 0 };
}

// ---------- fotos em alta definição ----------
// As fotos do catálogo importado foram guardadas pequenas (até 800 px). O
// original fica no fornecedor; o painel lê o catalog.json uma vez e guarda,
// para cada foto, o endereço do original (tabela foto_origem). Depois:
//   1. o Worker busca o original (só endereços desses hosts, só admin);
//   2. o navegador reduz para até 1200 px e devolve em WEBP;
//   3. o Worker grava como biblioteca/<sha>-hd.webp e troca nos produtos.
// O Worker só repassa bytes: o trabalho pesado fica no navegador.
export const ORIGEM_HOSTS = ['media-n.atlanticostor.com.br', 's3.amazonaws.com'];
export const MAX_ORIGENS = 1000;
export const MAX_ORIGINAL = 12 * 1024 * 1024;
export const MAX_HD = 3 * 1024 * 1024;
const SHA = /^[0-9a-f]{64}$/;

export function urlOrigemValida(u) {
  let x;
  try { x = new URL(String(u)); } catch { return false; }
  if (x.protocol !== 'https:' || x.username || x.password || x.port || !ORIGEM_HOSTS.includes(x.hostname)) return false;
  return x.hostname !== 's3.amazonaws.com' || x.pathname.startsWith('/tiny-anexos-us/');
}

/** Guarda [{ sha, url }] (vindos do catalog.json). Itens inválidos são ignorados. */
export async function gravarOrigens(db, itens) {
  if (!Array.isArray(itens) || !itens.length || itens.length > MAX_ORIGENS) return { erro: 'lista_invalida' };
  const validos = itens.filter((i) => i && SHA.test(String(i.sha)) && urlOrigemValida(i.url) && String(i.url).length <= 500);
  if (validos.length) {
    await db.batch(validos.map((i) => db.prepare('INSERT INTO foto_origem (sha, url) VALUES (?, ?) ON CONFLICT(sha) DO UPDATE SET url = excluded.url')
      .bind(String(i.sha), String(i.url))));
  }
  return { gravadas: validos.length, ignoradas: itens.length - validos.length };
}

/** Fotos de produtos publicados que ainda estão no tamanho pequeno e têm original conhecido. */
export async function listaHD(db) {
  const [total, lista] = await db.batch([
    db.prepare('SELECT COUNT(*) AS n FROM foto_origem'),
    db.prepare(`SELECT fo.sha, pi.file_path AS image, MIN(p.name) AS nome, COUNT(DISTINCT p.id) AS produtos
      FROM foto_origem fo
      JOIN product_images pi ON pi.file_path = '/uploads/biblioteca/' || fo.sha || '.webp'
      JOIN products p ON p.id = pi.product_id AND p.active = 1
      GROUP BY fo.sha, pi.file_path ORDER BY MIN(p.name) LIMIT 3000`),
  ]);
  return { origens: total.results[0].n, fotos: lista.results.map((r) => ({ sha: r.sha, image: r.image, nome: r.nome, produtos: r.produtos })) };
}

/** Busca o original no fornecedor. Só por `sha` já guardado (nunca um
 *  endereço vindo do pedido) e só nos hosts permitidos. */
export async function baixarOriginal(db, sha, fetchFn = fetch) {
  if (!SHA.test(String(sha))) return { erro: 'sha_invalido' };
  const row = await db.prepare('SELECT url FROM foto_origem WHERE sha = ?').bind(sha).first();
  if (!row || !urlOrigemValida(row.url)) return { erro: 'sem_origem' };
  let r;
  try {
    r = await fetchFn(row.url, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { Accept: 'image/webp,image/jpeg,image/png,image/*' } });
  } catch { return { erro: 'fornecedor_fora' }; }
  if (r.status !== 200) return { erro: 'fornecedor_' + r.status };
  if (Number(r.headers.get('content-length') || 0) > MAX_ORIGINAL) return { erro: 'grande_demais' };
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > MAX_ORIGINAL) return { erro: 'grande_demais' };
  const ext = sniffImage(bytes);
  if (!ext) return { erro: 'nao_e_imagem' };
  return { bytes, contentType: { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] };
}

/** Grava a versão em alta (WEBP ou JPEG já reduzida no navegador) e troca
 *  em todos os produtos que usam a foto pequena. A pequena vai para a
 *  lixeira de 90 dias. */
export async function gravarHD(db, storage, sha, bytes) {
  if (!SHA.test(String(sha))) return { erro: 'sha_invalido' };
  const ext = sniffImage(bytes);
  if (ext !== 'webp' && ext !== 'jpg') return { erro: 'formato' };
  if (bytes.length > MAX_HD) return { erro: 'grande_demais' };
  const antiga = `/uploads/biblioteca/${sha}.webp`;
  const usada = await db.prepare('SELECT COUNT(*) AS n FROM product_images WHERE file_path = ?').bind(antiga).first();
  if (!usada || !usada.n) return { erro: 'nao_encontrada' };
  const key = `biblioteca/${sha}-hd.${ext}`;
  await storage.put(key, bytes, ext === 'jpg' ? 'image/jpeg' : 'image/webp');
  await db.batch([
    db.prepare('UPDATE product_images SET file_path = ? WHERE file_path = ?').bind('/uploads/' + key, antiga),
    db.prepare("INSERT INTO upload_trash (key) VALUES (?) ON CONFLICT(key) DO UPDATE SET deleted_at = datetime('now')").bind(antiga.slice('/uploads/'.length)),
  ]);
  return { image: '/uploads/' + key, produtos: usada.n };
}
