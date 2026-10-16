'use strict';

const catalogService = require('../services/catalogService');
const SITE_URL = 'https://www.lojaessencianatural.com.br';

function escapeXML(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function serveSitemap(req, res) {
  // Mesma seleção da vitrine e das páginas públicas, sem filtros ou paginação.
  // Consultar a cada pedido reflete publicação, estoque e vendas automaticamente.
  const urls = [SITE_URL + '/', ...catalogService.getPublicProducts().map(
    (product) => `${SITE_URL}/produto/${encodeURIComponent(product.slug)}`
  )];
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((url) => `  <url><loc>${escapeXML(url)}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  res.writeHead(200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

module.exports = { serveSitemap };
