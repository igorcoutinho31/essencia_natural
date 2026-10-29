// Planeja a padronização das fotos (comando tools/cf-fotos.js). Funções
// puras, sem banco nem disco — testadas em tests/fotos.test.js.
//
//  1. Cadastros antigos da loja (source vazio, fotos tiradas na loja/
//     Instagram): se o mesmo perfume existe no pacote do fornecedor (mesma
//     marca e mesmo nome, ignorando volume/EDP), a foto antiga dá lugar à do
//     pacote, em alta. Quem não tem equivalente fica como está e entra na
//     lista "sem par" para a loja decidir.
//  2. Produtos do catálogo importado: a foto (enviada a 800 px) é reenviada
//     maior e mais nítida, numa chave nova (`-hd`), porque as fotos ficam 1
//     ano no cache do navegador e a chave antiga nunca seria atualizada.
// Por padrão só os produtos publicados (para caber no banco grátis).
import { chaveProduto } from './biblioteca-plano.js';
import { tituloProduto, tokens, chaveMarca } from './biblioteca-regras.js';

// mesmo perfume = mesma marca e mesmas palavras do nome, sem a marca
// repetida no nome ("Lattafa Khamrah EDP 100 ml" = "KHAMRAH" da Lattafa)
function chave(nome, marca) { return chaveProduto(tituloProduto(nome, { marca }).nome, marca); }

// "esqueleto" das palavras: sem vogais e sem letras repetidas, para casar
// grafias diferentes do mesmo nome árabe ("KHAMARAH" = "Khamrah")
function esqueleto(nome, marca) {
  const ws = [...tokens(tituloProduto(nome, { marca }).nome)]
    .map((w) => (/^\d+$/.test(w) ? w : w.replace(/[aeiouy]/g, '').replace(/(.)\1+/g, '$1')))
    .filter(Boolean);
  return ws.sort().join(' ');
}

export const SUFIXO_HD = '-hd';

function chaveHD(sha) { return `biblioteca/${sha}${SUFIXO_HD}.webp`; }

/**
 * @param catalogo  conteúdo do catalog.json (schemaVersion 2)
 * @param produtos  [{ id, name, brand, source, sourceId, active, imagens: ['/uploads/...'] }]
 * @param opts      { todos: false } — true inclui produtos ocultos
 */
export function planejarFotos(catalogo, produtos, { todos = false } = {}) {
  const porChave = new Map();
  const porSourceId = new Map();
  const porEsqueleto = new Map(); // esqueleto do nome -> [{ img, marca, nome }]
  for (const it of catalogo.products || []) {
    const img = (it.images || []).find((x) => x && x.localPath && x.sha256);
    if (!img) continue;
    porSourceId.set(it.sourceId, img);
    const k = chave(it.name, it.brand);
    if (!porChave.has(k)) porChave.set(k, img);
    const e = esqueleto(it.name, it.brand);
    if (e) { if (!porEsqueleto.has(e)) porEsqueleto.set(e, []); porEsqueleto.get(e).push({ img, marca: chaveMarca(it.brand), nome: it.name }); }
  }
  // sem marca no cadastro da loja: casa pelo esqueleto do nome, mas só se
  // todas as opções do pacote forem da mesma marca (senão é ambíguo)
  function parDaLoja(p) {
    const exato = porChave.get(chave(p.name, p.brand));
    if (exato) return { img: exato };
    const ops = porEsqueleto.get(esqueleto(p.name, p.brand)) || [];
    const marcaP = chaveMarca(p.brand);
    const filtradas = marcaP ? ops.filter((o) => o.marca === marcaP) : ops;
    if (!filtradas.length || new Set(filtradas.map((o) => o.marca)).size > 1) return null;
    return { img: filtradas[0].img, nome: filtradas[0].nome };
  }

  const fotos = new Map(); // chave nova -> { key, localPath }
  const trocas = [];       // { productId, novaFoto, antigas: [...] }
  const semPar = [];
  for (const p of produtos) {
    if (!todos && !p.active) continue;
    const antigas = p.imagens || [];
    let img = null;
    let par = null;
    if (!p.source) {
      par = parDaLoja(p);
      if (!par) { semPar.push({ id: p.id, name: p.name, brand: p.brand }); continue; }
      img = par.img;
    } else {
      img = porSourceId.get(p.sourceId) || null;
      if (!img) continue;
    }
    const key = chaveHD(img.sha256);
    const novaFoto = '/uploads/' + key;
    if (antigas.length === 1 && antigas[0] === novaFoto) continue; // já feito
    if (!fotos.has(key)) fotos.set(key, { key, localPath: img.localPath });
    trocas.push({ productId: p.id, nome: p.name, parecido: par && par.nome, novaFoto, antigas: antigas.filter((a) => a !== novaFoto), daLoja: !p.source });
  }
  return {
    fotos: [...fotos.values()],
    trocas,
    semPar,
    resumo: {
      daLoja: trocas.filter((t) => t.daLoja).length,
      importados: trocas.filter((t) => !t.daLoja).length,
      semPar: semPar.length,
      fotosNovas: fotos.size,
    },
  };
}

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** SQL que troca as fotos dos produtos cuja foto nova já foi enviada.
 *  As antigas vão para a lixeira de 90 dias (nada é apagado na hora). */
export function sqlTrocas(plano, keysEnviadas) {
  const ok = new Set(keysEnviadas.map((k) => '/uploads/' + k));
  const out = [];
  for (const t of plano.trocas) {
    if (!ok.has(t.novaFoto)) continue;
    for (const a of t.antigas) {
      if (a.startsWith('/uploads/')) {
        out.push(`INSERT INTO upload_trash (key) VALUES (${q(a.slice('/uploads/'.length))}) ON CONFLICT(key) DO UPDATE SET deleted_at = datetime('now');`);
      }
    }
    out.push(`DELETE FROM product_images WHERE product_id = ${Number(t.productId)};`);
    out.push(`INSERT INTO product_images (product_id, file_path, sort_order, is_main, licensed) VALUES (${Number(t.productId)}, ${q(t.novaFoto)}, 0, 1, 1);`);
  }
  return out.join('\n') + '\n';
}
