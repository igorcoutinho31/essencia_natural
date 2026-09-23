// Página individual de produto (SSR): /produto/:slug. Reaproveita o
// cabeçalho, rodapé, sacola e os mesmos arquivos de CSS/JS do site — não é
// um layout novo. SEO/Open Graph e o JSON-LD "Product" só recebem os
// campos que o produto realmente tem: sem preço confirmado, sem nota,
// sem GTIN/SKU inventados, o schema simplesmente omite o campo.
'use strict';

const catalogService = require('../services/catalogService');
const { sendHTML, escapeHTML } = require('../util');

const WHATSAPP = '5511949614608';
const SITE_NAME = 'Essência Natural';
const PLACEHOLDER_IMAGE = catalogService.PLACEHOLDER_IMAGE;
// Nunca deixa imagem quebrada: se o arquivo real falhar ao carregar (path
// errado, arquivo apagado do disco), troca pro placeholder oficial. Página
// é renderizada no servidor, então o fallback vai inline no atributo
// `onerror` — sem precisar de mais um <script>. `this.onerror=null` evita
// loop infinito se o próprio placeholder também falhar.
const IMG_FALLBACK_ATTR = `onerror="this.onerror=null;this.src='${PLACEHOLDER_IMAGE}'"`;

function waLink(texto) {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
}

function stockBadgeClass(code) {
  if (code === 'em_estoque') return 'pd-selo--em_estoque';
  if (code === 'ultimas') return 'pd-selo--ultimas';
  return 'pd-selo--indisponivel';
}

function schemaAvailability(code) {
  if (code === 'em_estoque') return 'https://schema.org/InStock';
  if (code === 'ultimas') return 'https://schema.org/LimitedAvailability';
  if (code === 'indisponivel') return 'https://schema.org/OutOfStock';
  return null; // defensivo — hoje todo código chega em um dos 3 acima
}

function podeComprar(product) { return product.stockStatus === 'em_estoque' || product.stockStatus === 'ultimas'; }

function notesList(notes) {
  const pares = [['Topo', notes.topo], ['Coração', notes.coracao], ['Fundo', notes.fundo]].filter((p) => p[1]);
  if (!pares.length) return '';
  return `<dl class="pd-notas">${pares.map(([label, valor]) => `<div><dt>${label}</dt><dd>${escapeHTML(valor)}</dd></div>`).join('')}</dl>`;
}

/* O campo `description`, na maior parte do catálogo migrado, é só o nome
   repetido + as mesmas notas já exibidas em pd-notas — exibi-lo de novo
   duplicaria o conteúdo da página (mesma lógica do catálogo antigo, ver
   assets/js/catalogo.js). Descartamos as linhas que repetem as notas e o
   nome; só sobra algo quando a descrição realmente traz texto próprio. */
function descricaoUtil(product) {
  const linhas = String(product.description || '').split('\n').filter((l) => !/^\s*notas\s+de\s/i.test(l));
  const texto = linhas.join('\n').split(product.name).join(' ').trim();
  return /[\p{L}\p{N}]/u.test(texto) ? texto : '';
}

function relatedCard(p) {
  // `p.image` sempre vem preenchido (placeholder oficial quando não há foto
  // real) — não existe mais o caso "relacionado sem nenhuma imagem".
  return `
    <a class="prod-related" href="/produto/${p.slug}">
      <img src="${escapeHTML(p.image)}" alt="" loading="lazy" width="220" height="290" ${IMG_FALLBACK_ATTR}>
      ${p.brand ? `<span class="prod-related-marca">${escapeHTML(p.brand)}</span>` : ''}
      <span class="prod-related-nome">${escapeHTML(p.name)}</span>
    </a>`;
}

function render(req, res, product, related) {
  const title = `${product.name}${product.brand ? ' — ' + product.brand : ''} | ${SITE_NAME}`;
  const descBase = descricaoUtil(product) ||
    `${product.name}${product.brand ? ', ' + product.brand : ''} — perfumaria árabe e importada na Galeria Pagé, São Paulo. Consulte disponibilidade pelo WhatsApp.`;
  const priceHTML = product.price != null
    ? `<p class="pd-preco">${product.comparePrice > product.price ? `<span class="pd-preco-de">R$ ${Number(product.comparePrice).toFixed(2).replace('.', ',')}</span>` : ''}R$ ${Number(product.price).toFixed(2).replace('.', ',')}</p>`
    : '<p class="pd-preco pd-preco--consulte">Consulte o valor</p>';

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: descBase,
  };
  if (product.brand) schema.brand = { '@type': 'Brand', name: product.brand };
  if (product.image) schema.image = product.image;
  schema.offers = {
    '@type': 'Offer',
    priceCurrency: 'BRL',
    url: `/produto/${product.slug}`,
  };
  const availabilitySchema = schemaAvailability(product.stockStatus);
  if (availabilitySchema) schema.offers.availability = availabilitySchema;
  if (product.price != null) schema.offers.price = Number(product.price).toFixed(2);
  // Sem price: omitimos "price" (Google tolera Offer sem preço quando "Consulte" é o caso real
  // do negócio) — nunca inventamos um valor só para preencher o schema.

  // `product.image` sempre vem preenchido (placeholder oficial quando não há
  // foto real, ver catalogService.PLACEHOLDER_IMAGE) — a galeria nunca fica
  // vazia, então não existe mais o caso "sem nenhuma imagem" aqui.
  const images = product.images && product.images.length ? product.images : [product.image];
  const galeria = `<div class="pd-galeria">${images.map((src, i) => `<img src="${escapeHTML(src)}" alt="${escapeHTML(product.name)}" ${i === 0 ? '' : 'loading="lazy"'} width="480" height="620" ${IMG_FALLBACK_ATTR}>`).join('')}</div>`;

  const body = `
<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="/#hero" aria-label="Essência Natural — início">
      <span class="name">Essência Natural</span>
      <span class="ar" lang="ar" dir="rtl">العطور</span>
    </a>
    <nav class="nav" id="nav" aria-label="Navegação principal">
      <a href="/#catalogo">Catálogo</a>
      <a href="/#marcas">Marcas</a>
      <a href="/#canais">Atacado</a>
      <a href="/#envios">Envios</a>
      <a href="/#loja">Loja</a>
      <a class="header-cta" href="${waLink('Olá! Vim pelo site da Essência Natural.')}" target="_blank" rel="noopener">Falar no WhatsApp</a>
    </nav>
    <div class="header-acoes">
      <button class="bag-btn" id="bag-btn" type="button" aria-haspopup="dialog" aria-label="Abrir sacola">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 8.5h13l1 11.5h-15l1-11.5Z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/></svg>
        <span class="bag-n" id="bag-n" hidden>0</span>
      </button>
      <button class="nav-toggle" id="nav-toggle" type="button" aria-expanded="false" aria-controls="nav" aria-label="Abrir menu"><span></span><span></span><span></span></button>
    </div>
  </div>
  <div class="progresso" id="progresso" aria-hidden="true"></div>
</header>

<main class="pd-page">
  <div class="pd-page-inner">
    <p class="pd-trilha"><a href="/#catalogo">Catálogo</a> / ${product.brand ? `<span>${escapeHTML(product.brand)}</span> / ` : ''}<span>${escapeHTML(product.name)}</span></p>
    <div class="pd-layout">
      ${galeria}
      <div class="pd-info">
        ${product.brand ? `<p class="pd-marca">${escapeHTML(product.brand)}</p>` : ''}
        <h1 class="pd-nome">${escapeHTML(product.name)}</h1>
        <span class="pd-selo ${stockBadgeClass(product.stockStatus)}">${escapeHTML(product.stockLabel)}</span>
        ${priceHTML}
        ${notesList(product.notes)}
        <p class="pd-desc">${escapeHTML(descBase)}</p>
        <div class="pd-acoes">
          <button type="button" class="btn btn-primary pd-add" id="pd-add" ${podeComprar(product) ? '' : 'disabled'}>
            ${podeComprar(product) ? 'Adicionar à sacola' : 'Indisponível no momento'}
          </button>
          <a class="btn btn-ghost" href="${waLink(
            product.price == null
              ? 'Olá! Vim pelo site da Essência Natural e gostaria de consultar o valor do produto ' + product.name + '.'
              : 'Olá! Vim pelo site da Essência Natural e gostaria de saber mais sobre o produto ' + product.name + '.'
          )}" target="_blank" rel="noopener">Consultar no WhatsApp</a>
        </div>
      </div>
    </div>

    ${related.length ? `
    <section class="pd-relacionados">
      <h2>Você também pode gostar</h2>
      <div class="pd-related-grid">${related.map(relatedCard).join('')}</div>
    </section>` : ''}
  </div>
</main>

<section class="rodape" id="rodape">
  <div class="container">
    <footer class="foot">
      <div>
        <span class="brand"><span class="name">Essência Natural</span></span>
        <address>Rua Comendador Afonso Kherlakian, 79<br>Galeria Pagé — Sobreloja 215<br>Centro — São Paulo, SP</address>
      </div>
      <div>
        <h3>Navegue</h3>
        <ul>
          <li><a href="/#catalogo">Catálogo</a></li>
          <li><a href="/#marcas">Marcas</a></li>
          <li><a href="/#canais">Varejo e atacado</a></li>
          <li><a href="/#envios">Envios</a></li>
          <li><a href="/#loja">Loja física</a></li>
          <li><a href="/#faq">Perguntas frequentes</a></li>
        </ul>
      </div>
      <div>
        <h3>Fale com a gente</h3>
        <ul>
          <li><a href="${waLink('Olá! Vim pelo site da Essência Natural.')}" target="_blank" rel="noopener">WhatsApp (11) 94961-4608</a></li>
          <li><a href="https://www.instagram.com/essencianaturall__/" target="_blank" rel="noopener">Instagram @essencianaturall__</a></li>
          <li><a href="https://www.tiktok.com/@essencia.natura" target="_blank" rel="noopener">TikTok @essencia.natura</a></li>
        </ul>
      </div>
    </footer>
    <div class="foot-base">
      <span>&copy; 2026 Essência Natural — Perfumaria.</span>
      <span>Perfumes árabes e importados — São Paulo, SP</span>
    </div>
  </div>
</section>

<dialog class="bag" id="sacola" aria-labelledby="sac-titulo">
  <div class="bag-topo"><h2 id="sac-titulo">Sua sacola</h2><button class="bag-fechar" id="sac-fechar" type="button" aria-label="Fechar sacola">&times;</button></div>
  <div class="bag-corpo" id="sac-corpo">
    <div class="bag-vazia" id="sac-vazia"><p>Sua sacola está vazia.</p><a class="btn btn-ghost" href="/#catalogo" id="sac-ver">Ver o catálogo</a></div>
    <ul class="bag-lista" id="sac-lista" role="list"></ul>
    <form class="bag-form" id="sac-form" novalidate>
      <fieldset class="bag-entrega">
        <legend>Como você quer receber?</legend>
        <label class="opt"><input type="radio" name="sac-entrega" value="loja" checked><span>Retirar na loja</span></label>
        <label class="opt"><input type="radio" name="sac-entrega" value="casa"><span>Receber em casa</span></label>
      </fieldset>
      <div class="bag-campo" id="sac-cep-wrap" hidden>
        <label for="sac-cep">CEP de entrega</label>
        <input id="sac-cep" type="text" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000">
        <p class="dica">O frete é calculado pela nossa equipe.</p>
      </div>
      <div class="bag-campo"><label for="sac-nome">Seu nome <span>(opcional)</span></label><input id="sac-nome" type="text" autocomplete="name" maxlength="60"></div>
      <div class="bag-campo"><label for="sac-obs">Observação <span>(opcional)</span></label><textarea id="sac-obs" rows="2" maxlength="300"></textarea></div>
    </form>
  </div>
  <div class="bag-rodape" id="sac-rodape">
    <p class="bag-total" id="sac-total" hidden></p>
    <p class="bag-bloqueio" id="sac-bloqueio" hidden>Remova os itens indisponíveis para finalizar o pedido.</p>
    <a class="btn btn-primary bag-enviar" id="sac-enviar" href="#" target="_blank" rel="noopener">Finalizar no WhatsApp</a>
    <p class="dica">Você envia o pedido e a equipe confirma disponibilidade, valores e frete.</p>
    <button class="bag-limpar" id="sac-limpar" type="button">Esvaziar sacola</button>
  </div>
</dialog>
<div class="toast" id="toast" role="status" aria-live="polite" hidden><span id="toast-t"></span><button type="button" id="toast-ver">Ver sacola</button></div>

<script>window.__PRODUTO__ = ${JSON.stringify(product)}; window.__RELACIONADOS__ = ${JSON.stringify(related)};</script>
<script src="/assets/js/menu.js"></script>
<script src="/assets/js/sacola.js"></script>
<script src="/assets/js/vida.js"></script>
<script>
  (function(){
    if (window.ENSacola) window.ENSacola.catalogo([window.__PRODUTO__].concat(window.__RELACIONADOS__));
    var addBtn = document.getElementById('pd-add');
    if (addBtn) addBtn.addEventListener('click', function(){
      if (window.ENSacola) window.ENSacola.add(window.__PRODUTO__);
    });
  })();
</script>`;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(descBase.slice(0, 300))}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(descBase.slice(0, 300))}">
${product.image ? `<meta property="og:image" content="${escapeHTML(product.image)}">` : ''}
<!-- Canônico e URL absolutas de imagem dependem do domínio final — ver docs/TODO-VERIFY.md; não inventamos aqui. -->
<link rel="icon" href="/assets/icons/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
<script type="application/ld+json">${JSON.stringify(schema)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Jost:wght@300;400;500;600&display=swap">
<link rel="stylesheet" href="/assets/css/site.css">
<link rel="stylesheet" href="/assets/css/product.css">
</head>
<body>
${body}
</body>
</html>`;
  sendHTML(res, 200, html);
}

function productPage(req, res, slug) {
  const product = catalogService.getPublicProductBySlug(slug);
  if (!product) {
    sendHTML(res, 404, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Produto não encontrado — ${SITE_NAME}</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/assets/css/site.css"></head><body style="padding:80px 24px;text-align:center;background:#0b0906;color:#f4ecd8;font-family:sans-serif"><h1>Produto não encontrado</h1><p><a href="/#catalogo" style="color:#c9a44c">Voltar para o catálogo</a></p></body></html>`);
    return;
  }
  const related = catalogService.getRelated(slug, 4);
  render(req, res, product, related);
}

module.exports = { productPage };
