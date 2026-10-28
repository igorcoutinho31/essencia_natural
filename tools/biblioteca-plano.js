// Planeja a importação da biblioteca: decide, para cada item do pacote,
// se entra (e como), se é repetido de um cadastro da loja, que marca usa e
// qual foto leva — e gera o SQL. Sem rede e sem disco: o comando
// (tools/cf-biblioteca.js) busca o estado atual do banco, chama isto e
// executa o SQL; os testes chamam isto direto contra um banco em memória.
import { slugify } from '../src/util.js';
import { chave, chaveMarca, limparNome, categoria, extrairNotas, tokens, indiceRelatorio, casarRelatorio } from './biblioteca-regras.js';

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

/** Chave de "mesmo produto": marca + palavras do nome (sem volume/EDP...). */
function chaveProduto(nome, marca) {
  return `${chaveMarca(marca) || ''}|${[...tokens(nome)].sort().join(' ')}`;
}

/**
 * @param catalogo  conteúdo do catalog.json (schemaVersion 2)
 * @param estado    { slugs: string[], sourceIds: string[], marcas: [{name, slug}],
 *                    produtosLoja: [{name, brand}], fotosExistentes: string[] }
 * @param relatorio itens de seed/relatorio-loja-*.json
 */
export function planejar(catalogo, estado, relatorio = []) {
  if (catalogo?.schemaVersion !== 2 || !Array.isArray(catalogo.products)) {
    throw new Error('catalog.json inesperado: era esperado schemaVersion 2 com a lista "products".');
  }
  const idx = indiceRelatorio(relatorio);
  const slugs = new Set(estado.slugs);
  const jaImportados = new Set(estado.sourceIds);
  const fotosExistentes = new Set(estado.fotosExistentes);
  const daLoja = new Set(estado.produtosLoja.map((p) => chaveProduto(p.name, p.brand)));

  // 1ª passada: quais itens entram (pula já importados e cadastros da loja).
  const resumo = { total: catalogo.products.length, novos: 0, jaImportados: 0, repetidosDaLoja: 0, noRelatorio: 0, semFoto: 0, porCategoria: {}, porOrigem: {} };
  const entram = [];
  const vistos = new Set();
  for (const it of catalogo.products) {
    if (!it.sourceId || vistos.has(it.sourceId)) continue;
    vistos.add(it.sourceId);
    if (jaImportados.has(it.sourceId)) { resumo.jaImportados += 1; continue; }
    const nome = limparNome(it.name);
    if (!nome) continue;
    if (daLoja.has(chaveProduto(nome, it.brand))) { resumo.repetidosDaLoja += 1; continue; }
    entram.push({ it, nome });
  }

  // Marcas: a do banco ganha; senão a grafia mais comum no pacote.
  const marcaPorChave = new Map();
  for (const m of estado.marcas) { const k = chaveMarca(m.name); if (k && !marcaPorChave.has(k)) marcaPorChave.set(k, { ...m, existe: true }); }
  const grafias = new Map();
  for (const { it } of entram) {
    const k = chaveMarca(it.brand);
    if (!k || marcaPorChave.has(k)) continue;
    if (!grafias.has(k)) grafias.set(k, new Map());
    const g = grafias.get(k); const nome = String(it.brand).trim(); g.set(nome, (g.get(nome) || 0) + 1);
  }
  const marcasNovas = [];
  for (const [k, g] of grafias) {
    const nome = [...g.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    let slug = slugify(nome); let i = 2;
    while (estado.marcas.some((m) => m.slug === slug) || marcasNovas.some((m) => m.slug === slug)) slug = `${slugify(nome)}-${i++}`;
    const m = { name: nome, slug };
    marcasNovas.push(m);
    marcaPorChave.set(k, m);
  }

  // 2ª passada: monta os cadastros.
  const produtos = [];
  const fotos = new Map(); // key -> { key, localPath, existe }
  for (const { it, nome } of entram) {
    let slug = slugify(nome); let i = 2;
    while (slugs.has(slug)) slug = `${slugify(nome)}-${i++}`;
    slugs.add(slug);

    const notas = it.source === 'onuh' ? extrairNotas(it.description) : {};
    const cat = categoria(it);
    const rel = casarRelatorio(idx, nome, it.brand);
    const marca = marcaPorChave.get(chaveMarca(it.brand)) || null;
    const img = (it.images || []).find((x) => x && x.localPath && x.sha256);
    const foto = img ? { key: `biblioteca/${img.sha256}.webp`, localPath: img.localPath } : null;
    if (foto && !fotos.has(foto.key)) fotos.set(foto.key, { ...foto, existe: fotosExistentes.has(foto.key) });
    if (!foto) resumo.semFoto += 1;
    if (rel) resumo.noRelatorio += 1;
    resumo.novos += 1;
    resumo.porCategoria[cat] = (resumo.porCategoria[cat] || 0) + 1;
    resumo.porOrigem[it.source] = (resumo.porOrigem[it.source] || 0) + 1;

    produtos.push({
      slug, name: nome, brandSlug: marca ? marca.slug : null, category: cat,
      volume: it.volume ? String(it.volume).trim() : null,
      concentration: it.concentration ? String(it.concentration).trim() : null,
      family: notas.familia || null, notesTop: notas.topo || null, notesHeart: notas.coracao || null, notesBase: notas.fundo || null,
      source: it.source, sourceId: it.sourceId, sourceUrl: it.sourceUrl || null,
      inStoreReport: rel ? 1 : 0, storeReportName: rel,
      foto: foto ? foto.key : null,
    });
  }
  resumo.marcasNovas = marcasNovas.length;
  resumo.fotosNovas = [...fotos.values()].filter((f) => !f.existe).length;
  return { produtos, marcasNovas, fotos: [...fotos.values()], resumo };
}

/** SQL dos cadastros (marcas novas + produtos ocultos). Idempotente. */
export function sqlCadastros(plano) {
  const out = [];
  for (const m of plano.marcasNovas) {
    out.push(`INSERT OR IGNORE INTO brands (name, slug, requires_product) VALUES (${q(m.name)}, ${q(m.slug)}, 1);`);
  }
  for (const p of plano.produtos) {
    out.push(`INSERT OR IGNORE INTO products (slug, name, brand_id, category, volume, concentration, family, notes_top, notes_heart, notes_base,
  description, price, compare_price, stock, stock_source, active, featured, olisek_link_status, source, source_id, source_url, in_store_report, store_report_name)
VALUES (${q(p.slug)}, ${q(p.name)}, ${p.brandSlug ? `(SELECT id FROM brands WHERE slug = ${q(p.brandSlug)})` : 'NULL'}, ${q(p.category)}, ${q(p.volume)}, ${q(p.concentration)}, ${q(p.family)}, ${q(p.notesTop)}, ${q(p.notesHeart)}, ${q(p.notesBase)},
  NULL, NULL, NULL, 0, 'none', 0, 0, 'unlinked', ${q(p.source)}, ${q(p.sourceId)}, ${q(p.sourceUrl)}, ${p.inStoreReport}, ${q(p.storeReportName)});`);
  }
  return out.join('\n') + '\n';
}

/** SQL que liga a foto principal (ainda "a liberar") a cada produto que usa
 *  uma das `keys` — só se o produto ainda não tem nenhuma foto. */
export function sqlLigarFotos(plano, keys) {
  const set = new Set(keys);
  return plano.produtos.filter((p) => p.foto && set.has(p.foto)).map((p) =>
    `INSERT INTO product_images (product_id, file_path, sort_order, is_main, licensed)
SELECT p.id, ${q('/uploads/' + p.foto)}, 0, 1, 0 FROM products p
 WHERE p.source_id = ${q(p.sourceId)} AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id);`).join('\n') + '\n';
}

export { chave };
