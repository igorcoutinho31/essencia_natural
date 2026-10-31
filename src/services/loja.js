// Painel da loja (/admin/loja): a tela simples do dia a dia das vendedoras
// (e da administração, quando quiser o atalho). Só o essencial: procurar,
// trocar foto, marcar destaque, preço, mostrar/tirar do site e cadastrar
// um perfume novo. O resto continua no cadastro completo (só admin).
import * as catalog from './catalog.js';

export const POR_PAGINA = 30;

const FILTROS = {
  todos: '1 = 1',
  site: 'p.active = 1',
  fora: 'p.active = 0',
  destaques: 'p.featured = 1',
  semfoto: 'NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)',
};

/** Busca leve: nome/marca, filtro e página. Sem termo, os mexidos por último vêm primeiro. */
export async function buscar(db, { q = '', filtro = 'todos', pagina = 1 } = {}) {
  const termos = String(q).trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const where = [FILTROS[filtro] || FILTROS.todos];
  const params = [];
  for (const t of termos) {
    where.push('(lower(p.name) LIKE ? OR lower(COALESCE(b.name, \'\')) LIKE ?)');
    params.push(`%${t}%`, `%${t}%`);
  }
  const pg = Math.max(1, Math.min(500, parseInt(pagina, 10) || 1));
  const sql = `FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE ${where.join(' AND ')}`;
  const [total, lista] = await db.batch([
    // sem busca por texto, a contagem não precisa juntar as marcas (lê menos linhas)
    db.prepare(`SELECT COUNT(*) AS n ${termos.length ? sql : `FROM products p WHERE ${where.join(' AND ')}`}`).bind(...params),
    db.prepare(`SELECT p.id, p.slug, p.name, b.name AS brand, p.volume, p.price, p.active, p.featured,
        (SELECT pi.file_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_main DESC, pi.sort_order ASC LIMIT 1) AS image
      ${sql} ORDER BY ${termos.length ? 'p.active DESC, p.name ASC' : 'p.updated_at DESC, p.id DESC'} LIMIT ? OFFSET ?`)
      .bind(...params, POR_PAGINA, (pg - 1) * POR_PAGINA),
  ]);
  return {
    total: total.results[0].n,
    pagina: pg,
    porPagina: POR_PAGINA,
    itens: lista.results.map((r) => ({
      id: r.id, slug: r.slug, name: r.name, brand: r.brand || null, volume: r.volume || null,
      price: r.price == null ? null : Number(r.price), active: !!r.active, featured: !!r.featured, image: r.image || null,
    })),
  };
}

/** Marcas e categorias para o formulário de cadastro rápido. */
export async function opcoes(db) {
  const [marcas, categorias] = await Promise.all([
    db.prepare('SELECT id, name FROM brands ORDER BY name').all(),
    catalog.listCategories(db),
  ]);
  return { marcas: marcas.results, categorias: categorias.length ? categorias : ['Perfume'] };
}

const limpa = (v, max) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, max) : null; };

/** Cadastro rápido: nome, marca, volume e categoria. Entra fora do site —
 *  só vai para o site depois de ter foto (ver mostrarNoSite). */
export async function criar(db, dados, user) {
  const name = limpa(dados.name, 200);
  if (!name) return { erro: 'Informe o nome do perfume.' };
  let brandId = null;
  if (dados.brandId != null && dados.brandId !== '') {
    brandId = Number(dados.brandId);
    if (!Number.isInteger(brandId) || !(await db.prepare('SELECT 1 AS x FROM brands WHERE id = ?').bind(brandId).first())) return { erro: 'Marca inválida.' };
  }
  const produto = await catalog.createProduct(db, {
    name, brandId, volume: limpa(dados.volume, 40), category: limpa(dados.category, 60) || 'Perfume', active: false,
  }, user);
  return { id: produto.id, slug: produto.slug };
}

/** Mostra/tira do site. Para mostrar, o perfume precisa ter foto. */
export async function mostrarNoSite(db, id, ativo) {
  const p = await db.prepare(`SELECT p.id, EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id) AS foto FROM products p WHERE p.id = ?`).bind(id).first();
  if (!p) return { erro: 'not_found' };
  if (ativo && !p.foto) return { erro: 'sem_foto' };
  await db.prepare("UPDATE products SET active = ?, updated_at = datetime('now') WHERE id = ?").bind(ativo ? 1 : 0, id).run();
  return { ok: true, active: !!ativo };
}
