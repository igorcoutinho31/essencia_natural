// Fotos em alta automáticas (cron, src/worker.js): sem ninguém abrir o
// painel, as fotos dos produtos PUBLICADOS que ainda estão na versão da
// importação são trocadas pela melhor versão do original do fornecedor
// (endereços em foto_origem, gravada pela importação do catálogo).
// - original grande (> 1300 px): reduzido para 1200 px WEBP pelo Cloudflare
//   Images (binding IMAGES; cota grátis de 5 mil por mês);
// - original do mesmo tamanho, mas menos comprimido: gravado como veio.
// Produtos ocultos não gastam espaço do banco: ganham a foto em alta quando
// forem publicados. Cada foto é tentada uma vez (falha: de novo no dia
// seguinte) — ver a tabela foto_hd_tentativas.
import { sniffImage } from '../util.js';

// ---------- original do fornecedor ----------
// foto_origem guarda, para cada foto do catálogo importado, o endereço do
// original no fornecedor (gravado pela importação, tools/cf-biblioteca.js).
export const ORIGEM_HOSTS = ['media-n.atlanticostor.com.br', 's3.amazonaws.com'];
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
  if (!Array.isArray(itens) || !itens.length) return { erro: 'lista_invalida' };
  const validos = itens.filter((i) => i && SHA.test(String(i.sha)) && urlOrigemValida(i.url) && String(i.url).length <= 500);
  if (validos.length) {
    await db.batch(validos.map((i) => db.prepare('INSERT INTO foto_origem (sha, url) VALUES (?, ?) ON CONFLICT(sha) DO UPDATE SET url = excluded.url')
      .bind(String(i.sha), String(i.url))));
  }
  return { gravadas: validos.length, ignoradas: itens.length - validos.length };
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

const LADO_MAX = 1300;

/** Largura e altura lidas do cabeçalho do arquivo (PNG, JPEG ou WEBP). */
export function dimensoes(b) {
  const u16 = (i) => (b[i] << 8) | b[i + 1];
  const le16 = (i) => b[i] | (b[i + 1] << 8);
  const le24 = (i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) {
    return { w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: u16(i + 7), h: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
    return null;
  }
  if (b.length > 30 && String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP') {
    const tipo = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (tipo === 'VP8 ') return { w: le16(26) & 0x3fff, h: le16(28) & 0x3fff };
    if (tipo === 'VP8L') { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    if (tipo === 'VP8X') return { w: le24(24) + 1, h: le24(27) + 1 };
  }
  return null;
}

async function reduzir(images, bytes, lado, qualidade) {
  const r = await images.input(new Blob([bytes]).stream())
    .transform({ width: lado, height: lado, fit: 'scale-down' })
    .output({ format: 'image/webp', quality: qualidade });
  return new Uint8Array(await r.response().arrayBuffer());
}

/** Melhora até `limite` fotos por vez. Devolve um resumo para o log. */
export async function melhorarFotosPublicadas(db, storage, images, { limite = 4, fetchFn = fetch } = {}) {
  const { results } = await db.prepare(`
    SELECT DISTINCT fo.sha, u.size AS atual
      FROM products p
      JOIN product_images pi ON pi.product_id = p.id
      JOIN foto_origem fo ON fo.sha = substr(pi.file_path, 21, 64)
      JOIN uploads u ON u.key = 'biblioteca/' || fo.sha || '.webp'
      LEFT JOIN foto_hd_tentativas t ON t.sha = fo.sha
     WHERE p.active = 1
       AND pi.file_path LIKE '/uploads/biblioteca/%.webp' AND pi.file_path NOT LIKE '%-hd.%'
       AND (t.sha IS NULL OR (t.resultado = 'falhou' AND t.tentado_em < datetime('now', '-1 day')))
     LIMIT ?`).bind(limite).all();
  const resumo = { ok: 0, igual: 0, falhou: 0 };
  for (const { sha, atual } of results) {
    let resultado = 'falhou';
    try {
      const o = await baixarOriginal(db, sha, fetchFn);
      if (!o.erro) {
        const d = dimensoes(o.bytes);
        let novo = null;
        if (d && Math.max(d.w, d.h) > LADO_MAX) {
          if (images) novo = await reduzir(images, o.bytes, 1200, 85);
        } else if (o.bytes.length > atual * 1.1) {
          if (o.contentType === 'image/png') { if (images) novo = await reduzir(images, o.bytes, LADO_MAX, 92); }
          else if (o.bytes.length <= MAX_HD) novo = o.bytes;
        } else {
          resultado = 'igual';
        }
        if (novo) {
          const g = await gravarHD(db, storage, sha, novo);
          resultado = g.erro ? 'falhou' : 'ok';
        }
      }
    } catch (e) {
      console.warn('[fotos-auto]', sha, e && e.message);
    }
    resumo[resultado] += 1;
    await db.prepare(`INSERT INTO foto_hd_tentativas (sha, resultado, tentado_em) VALUES (?, ?, datetime('now'))
      ON CONFLICT(sha) DO UPDATE SET resultado = excluded.resultado, tentado_em = excluded.tentado_em`).bind(sha, resultado).run();
  }
  return resumo;
}
