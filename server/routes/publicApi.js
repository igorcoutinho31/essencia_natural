// Rotas públicas da API — só leitura, sem autenticação. Servem o catálogo
// (index.html) e a página de produto. Nunca expõem estoque numérico bruto
// nem chamam a OliSek diretamente (isso é papel do olisekService no backend).
'use strict';

const catalogService = require('../services/catalogService');
const { sendJSON } = require('../util');

const WHATSAPP = '5511949614608';

/** GET /api/products — lista pública, com filtros por querystring. */
function listProducts(req, res, query) {
  const products = catalogService.getPublicProducts({
    q: query.get('q') || undefined,
    brand: query.get('brand') || undefined,
    gender: query.get('genero') || query.get('gender') || undefined,
    category: query.get('categoria') || query.get('category') || undefined,
    availability: query.get('disponibilidade') || query.get('availability') || undefined,
    featured: query.get('destaque') || query.get('featured') || undefined,
    sort: query.get('sort') || undefined,
  });
  sendJSON(res, 200, { whatsapp: WHATSAPP, products });
}

/** GET /api/products/slug/:slug — um produto (para a página /produto/:slug e o modal). */
function getProductBySlug(req, res, slug) {
  const product = catalogService.getPublicProductBySlug(slug);
  if (!product) return sendJSON(res, 404, { error: 'not_found' });
  const related = catalogService.getRelated(slug, 4);
  sendJSON(res, 200, { whatsapp: WHATSAPP, product, related });
}

/** GET /api/brands — grade de marcas públicas (nome + slug + qtde de produtos ativos). */
function listBrands(req, res) {
  sendJSON(res, 200, { brands: catalogService.getBrandsPublic() });
}

module.exports = { listProducts, getProductBySlug, listBrands, WHATSAPP };
