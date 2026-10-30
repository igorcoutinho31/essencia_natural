// Páginas HTML do /admin — renderizadas no servidor (sem framework), estilo
// "back office" simples. A parte interativa (salvar preço, subir foto,
// reordenar) usa fetch() para as rotas JSON de src/routes/adminApi.js;
// a sessão viaja sozinha pelo cookie httpOnly, nunca por token no JS.
import * as olisek from '../services/olisek.js';
import { LOW_STOCK_THRESHOLD } from '../services/inventory.js';
import { KEEP_SNAPSHOTS, TRASH_DAYS } from '../services/autoBackup.js';
import { MIN_PASSWORD_LENGTH } from './adminApi.js';
import { escapeHTML } from '../util.js';
import { html } from '../http.js';

// Funções de navegador usadas pelas telas do admin (pedido JSON, aviso,
// redução de foto antes do envio).
const JS_AJUDA = `
    function post(url, method, data){
      return fetch(url, { method: method, headers:{'Content-Type':'application/json'}, body: data != null ? JSON.stringify(data) : undefined })
        .then(function(r){ return r.json().then(function(d){ if (!r.ok) throw d; return d; }); });
    }
    function msg(el, texto, ok){
      el.innerHTML = '';
      var d = document.createElement('div');
      d.className = 'a-msg ' + (ok ? 'a-msg-ok' : 'a-msg-err');
      d.textContent = texto;
      el.appendChild(d);
      setTimeout(function(){ el.innerHTML=''; }, 5000);
    }
    // Reduz a foto no navegador (máx. 1600px, WEBP) antes do envio. Se o
    // navegador não conseguir, manda o arquivo original.
    function prepararFoto(file){
      var MAX = 1600;
      return new Promise(function(resolve){
        var original = function(){ var r = new FileReader(); r.onload = function(){ resolve(r.result); }; r.readAsDataURL(file); };
        if (!window.createImageBitmap || !document.createElement('canvas').toBlob) return original();
        createImageBitmap(file).then(function(bmp){
          var esc = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
          var c = document.createElement('canvas');
          c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc);
          c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
          c.toBlob(function(blob){
            if (!blob || blob.type !== 'image/webp' || (esc === 1 && blob.size >= file.size)) return original();
            var r = new FileReader(); r.onload = function(){ resolve(r.result); }; r.readAsDataURL(blob);
          }, 'image/webp', 0.85);
        }).catch(original);
      });
    }
`;

function layout({ title, user, active, body }) {
  const nav = user ? `
    <header class="a-top">
      <a class="a-brand" href="/admin">Essência Natural · Admin</a>
      <div class="a-user">
        <span>${escapeHTML(user.name)} · ${user.role === 'admin' ? 'Administração' : 'Vendedora'}</span>
        <a href="/admin/loja"${active === 'loja' ? ' class="a-nav-ativo"' : ''}>Loja</a>
        ${user.role === 'admin' ? `<a href="/admin/produtos"${active === 'produtos' ? ' class="a-nav-ativo"' : ''}>Produtos</a>` : ''}
        ${user.role === 'admin' ? `<a href="/admin/fotos"${active === 'fotos' ? ' class="a-nav-ativo"' : ''}>Fotos</a>` : ''}
        ${user.role === 'admin' ? `<a href="/admin/equipe"${active === 'equipe' ? ' class="a-nav-ativo"' : ''}>Equipe</a>` : ''}
        ${user.role === 'admin' ? `<a href="/admin/contas"${active === 'contas' ? ' class="a-nav-ativo"' : ''}>Contas</a>` : ''}
        ${user.role === 'admin' ? `<a href="/admin/estoque"${active === 'estoque' ? ' class="a-nav-ativo"' : ''}>Estoque</a>` : ''}
        <a href="/admin/trocar-senha">Trocar senha</a>
        <a href="/" target="_blank" rel="noopener">Ver site</a>
        <button class="btn btn-ghost btn-sm" id="a-sair" type="button">Sair</button>
      </div>
    </header>` : '';
  const logoutScript = user ? `
    <script>
      document.getElementById('a-sair').addEventListener('click', function(){
        fetch('/api/admin/logout', { method:'POST' }).then(function(){ location.href = '/admin/login'; });
      });
    </script>` : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHTML(title)} — Admin Essência Natural</title>
<meta name="robots" content="noindex,nofollow">
<link rel="icon" href="/assets/icons/favicon.ico" sizes="any">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Jost:wght@300;400;500;600&display=swap">
<link rel="stylesheet" href="/assets/css/admin.css">
</head>
<body>
${nav}
${body}
${logoutScript}
</body>
</html>`;
}

export function loginPage({ error } = {}) {
  const body = `
  <div class="a-login-wrap">
    <div class="a-card a-login-card">
      <h1>Entrar</h1>
      <p class="a-sub">Painel administrativo da Essência Natural.</p>
      ${error ? `<div class="a-msg a-msg-err">${escapeHTML(error)}</div>` : ''}
      <form id="a-login-form">
        <div class="a-field"><label>Usuário</label><input type="text" name="username" autocomplete="username" required></div>
        <div class="a-field"><label>Senha</label><input type="password" name="password" autocomplete="current-password" required></div>
        <button class="btn btn-gold" type="submit" style="width:100%">Entrar</button>
      </form>
    </div>
  </div>
  <script>
    document.getElementById('a-login-form').addEventListener('submit', function(ev){
      ev.preventDefault();
      var f = ev.target, btn = f.querySelector('button');
      btn.disabled = true; btn.textContent = 'Entrando…';
      fetch('/api/admin/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username: f.username.value, password: f.password.value })
      }).then(function(r){ return r.json().then(function(d){ return { ok:r.ok, d:d }; }); })
        .then(function(res){
          if (!res.ok) { location.href = '/admin/login?erro=' + encodeURIComponent(res.d.message || 'Não foi possível entrar.'); return; }
          location.href = res.d.user.mustChangePassword ? '/admin/trocar-senha' : '/admin';
        })
        .catch(function(){ location.href = '/admin/login?erro=Erro de conexão. Tente novamente.'; });
    });
  </script>`;
  return html(200, layout({ title: 'Entrar', user: null, body }));
}

export function changePasswordPage(user) {
  const body = `
  <div class="a-wrap" style="max-width:420px">
    <div class="a-card">
      <h1>Trocar senha</h1>
      <p class="a-sub">${user.must_change_password ? 'Essa é sua senha temporária — defina uma senha definitiva para continuar.' : 'Defina uma nova senha de acesso.'}</p>
      <div id="a-msg"></div>
      <form id="a-pass-form">
        ${user.must_change_password ? '' : '<div class="a-field"><label>Senha atual</label><input type="password" name="currentPassword" required></div>'}
        <div class="a-field"><label>Nova senha (mín. ${MIN_PASSWORD_LENGTH} caracteres)</label><input type="password" name="newPassword" minlength="${MIN_PASSWORD_LENGTH}" autocomplete="new-password" required></div>
        <button class="btn btn-gold" type="submit">Salvar</button>
      </form>
    </div>
  </div>
  <script>
    document.getElementById('a-pass-form').addEventListener('submit', function(ev){
      ev.preventDefault();
      var f = ev.target;
      fetch('/api/admin/change-password', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ currentPassword: f.currentPassword ? f.currentPassword.value : '', newPassword: f.newPassword.value })
      }).then(function(r){ return r.json().then(function(d){ return {ok:r.ok, d:d}; }); })
        .then(function(res){
          var msg = document.getElementById('a-msg');
          if (!res.ok) { msg.innerHTML = ''; var d = document.createElement('div'); d.className = 'a-msg a-msg-err'; d.textContent = res.d.message || 'Erro.'; msg.appendChild(d); return; }
          location.href = '/admin';
        });
    });
  </script>`;
  return html(200, layout({ title: 'Trocar senha', user, body }));
}

function stockBadge(p) {
  const cls = p.stockStatus === 'em_estoque' ? 'badge-ok'
    : p.stockStatus === 'ultimas' ? 'badge-warn'
    : 'badge-danger';
  return `<span class="badge ${cls}">${escapeHTML(p.stockLabel)}</span>`;
}

const OLISEK_LINK_LABELS = {
  confirmed: { text: 'vínculo confirmado', cls: 'badge-ok' },
  probable: { text: 'correspondência provável — confirmar', cls: 'badge-warn' },
  needs_review: { text: 'precisa revisão', cls: 'badge-warn' },
  unlinked: { text: 'sem vínculo', cls: 'badge-muted' },
};
function olisekBadge(p) {
  const info = OLISEK_LINK_LABELS[p.olisekLinkStatus] || OLISEK_LINK_LABELS.unlinked;
  return `<span class="badge ${info.cls}" title="${p.olisekId ? 'ID OliSek ' + p.olisekId : 'sem ID OliSek'}">${p.olisekId ? 'OliSek' : 'Sem vínculo'}</span>`;
}

// Ordem e rótulos das abas de filtro (fechamento V2, 25/09/2026) — a chave
// bate exatamente com as chaves de ADMIN_FILTERS em src/services/catalog.js.
const FILTER_TABS = [
  ['todos', 'Todos'],
  ['publicados', 'Publicados'],
  ['ocultos', 'Ocultos'],
  ['no_relatorio', 'No relatório da loja'],
  ['da_loja', 'Cadastros da loja'],
  ['biblioteca', 'Catálogo importado'],
  ['sem_preco', 'Sem preço'],
  ['sem_imagem', 'Sem imagem'],
  ['em_estoque', 'Em estoque'],
  ['estoque_baixo', 'Estoque baixo'],
  ['zerados', 'Estoque zerado'],
  ['vendidos', 'Vendidos'],
  ['sem_vinculo', 'Sem vínculo OliSek'],
  ['precisa_revisao', 'Precisa revisão'],
];

function origemBadge(p) {
  return p.source ? '<span class="badge badge-muted">Importado</span>' : '<span class="badge badge-ok">Loja</span>';
}

/** Lista do /admin (paginada no banco). `view` = { q, filtroAtivo, brandId,
 *  category, source, page, perPage, total, products, counts, brands, categories }. */
export function productsListPage(user, view) {
  const { q, filtroAtivo, brandId, category, source, page, perPage, total, products, counts, brands = [], categories = [] } = view;
  const isAdmin = user.role === 'admin';
  const paginas = Math.max(1, Math.ceil(total / perPage));
  const link = (mudancas) => {
    const qs = new URLSearchParams();
    const atual = { q, filtro: filtroAtivo === 'todos' ? '' : filtroAtivo, marca: brandId || '', categoria: category || '', origem: source || '', pagina: '' };
    for (const [k, v] of Object.entries({ ...atual, ...mudancas })) if (v) qs.set(k, v);
    return '/admin/produtos' + (qs.toString() ? '?' + qs.toString() : '');
  };

  const rows = products.map((p) => `
    <tr>
      ${isAdmin ? `<td><input type="checkbox" class="a-sel" value="${p.id}" aria-label="Selecionar ${escapeHTML(p.name)}"></td>` : ''}
      <td>${p.hasImage ? `<img class="a-thumb" src="${escapeHTML(p.image)}" alt="" loading="lazy" width="48" height="48">` : '<span class="badge badge-warn">sem foto</span>'}</td>
      <td>${escapeHTML(p.name)}<div class="a-help">${escapeHTML(p.brand || '—')}${p.volume ? ' · ' + escapeHTML(p.volume) : ''}${p.category ? ' · ' + escapeHTML(p.category) : ''}</div>
        ${p.inStoreReport ? `<span class="badge badge-ok" title="${escapeHTML(p.storeReportName || '')}">no relatório da loja</span>` : ''}</td>
      <td>${origemBadge(p)}</td>
      <td>${p.price != null ? 'R$ ' + Number(p.price).toFixed(2).replace('.', ',') : '<span class="a-help">Consulte</span>'}</td>
      <td>${p.active ? '<span class="badge badge-ok">Publicado</span>' : '<span class="badge badge-muted">Oculto</span>'}${p.featured ? ' ★' : ''}</td>
      <td><a class="btn btn-ghost btn-sm" href="/admin/produtos/${p.id}">Editar</a></td>
    </tr>`).join('');

  const tabsHTML = FILTER_TABS.map(([key, label]) =>
    `<a class="a-tab${key === filtroAtivo ? ' a-tab--ativo' : ''}" href="${link({ filtro: key === 'todos' ? '' : key })}">${escapeHTML(label)} (${counts[key] ?? 0})</a>`).join('');

  const opt = (v, label, sel) => `<option value="${escapeHTML(String(v))}"${sel ? ' selected' : ''}>${escapeHTML(label)}</option>`;
  const filtros = `
      <form method="get" class="a-row a-filtros" style="margin-bottom:14px; gap:8px; flex-wrap:wrap">
        ${filtroAtivo !== 'todos' ? `<input type="hidden" name="filtro" value="${escapeHTML(filtroAtivo)}">` : ''}
        <input class="a-search" type="search" name="q" placeholder="Buscar por nome, marca ou ID OliSek" value="${escapeHTML(q || '')}">
        <select name="marca"><option value="">Todas as marcas</option>${brands.map((b) => opt(b.id, b.name, String(b.id) === String(brandId))).join('')}</select>
        <select name="categoria"><option value="">Todas as categorias</option>${categories.map((c) => opt(c, c, c === category)).join('')}</select>
        <select name="origem"><option value="">Todas as origens</option>${opt('loja', 'Cadastros da loja', source === 'loja')}${opt('importado', 'Catálogo importado', source === 'importado')}</select>
        <button class="btn btn-ghost btn-sm" type="submit">Filtrar</button>
        ${(q || brandId || category || source) ? `<a class="btn btn-ghost btn-sm" href="${link({ q: '', marca: '', categoria: '', origem: '' })}">Limpar</a>` : ''}
      </form>`;

  const lote = isAdmin ? `
      <div class="a-lote" id="a-lote">
        <label><input type="checkbox" id="a-sel-todos"> Selecionar a página</label>
        <span id="a-sel-n" class="a-help">0 selecionado(s)</span>
        <select id="a-lote-acao">
          <option value="publicar">Publicar no site</option>
          <option value="ocultar">Ocultar do site</option>
        </select>
        <button class="btn btn-gold btn-sm" type="button" id="a-lote-sel">Aplicar nos selecionados</button>
        <button class="btn btn-ghost btn-sm" type="button" id="a-lote-filtro">Aplicar nos ${total} resultado${total === 1 ? '' : 's'} deste filtro</button>
        <div id="a-msg-lote"></div>
      </div>` : '';

  const paginacao = paginas > 1 ? `
      <div class="a-row a-paginas" style="justify-content:center; gap:8px; margin-top:14px">
        ${page > 1 ? `<a class="btn btn-ghost btn-sm" href="${link({ pagina: page - 1 })}">&larr; Anterior</a>` : ''}
        <span class="a-help">Página ${page} de ${paginas}</span>
        ${page < paginas ? `<a class="btn btn-ghost btn-sm" href="${link({ pagina: page + 1 })}">Próxima &rarr;</a>` : ''}
      </div>` : '';

  const criterios = { q: q || '', filter: filtroAtivo === 'todos' ? '' : filtroAtivo, brandId: brandId || '', category: category || '', source: source || '' };
  const script = isAdmin ? `
  <script>
    (function(){
      var CRITERIOS = ${JSON.stringify(criterios).replace(/</g, '\\u003c')};
      var TOTAL = ${Number(total)};
      var NOMES = { publicar: 'publicar', ocultar: 'ocultar', liberar_fotos: 'liberar as fotos de', bloquear_fotos: 'bloquear as fotos de' };
      var sels = function(){ return Array.prototype.slice.call(document.querySelectorAll('.a-sel')); };
      function conta(){ document.getElementById('a-sel-n').textContent = sels().filter(function(c){ return c.checked; }).length + ' selecionado(s)'; }
      sels().forEach(function(c){ c.addEventListener('change', conta); });
      document.getElementById('a-sel-todos').addEventListener('change', function(ev){ sels().forEach(function(c){ c.checked = ev.target.checked; }); conta(); });
      function msg(texto, ok){ var el = document.getElementById('a-msg-lote'); el.innerHTML = ''; var d = document.createElement('div'); d.className = 'a-msg ' + (ok ? 'a-msg-ok' : 'a-msg-err'); d.textContent = texto; el.appendChild(d); }
      function enviar(corpo, n){
        var acao = document.getElementById('a-lote-acao').value;
        if (!confirm('Confirmar: ' + NOMES[acao] + ' ' + n + ' produto(s)?')) return;
        corpo.action = acao;
        fetch('/api/admin/products/bulk', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(corpo) })
          .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
          .then(function(res){
            if (!res.ok) { msg(res.d.message || res.d.error || 'Erro.', false); return; }
            msg(res.d.affected + ' produto(s) atualizado(s).', true);
            setTimeout(function(){ location.reload(); }, 900);
          })
          .catch(function(){ msg('Erro de conexão.', false); });
      }
      document.getElementById('a-lote-sel').addEventListener('click', function(){
        var ids = sels().filter(function(c){ return c.checked; }).map(function(c){ return Number(c.value); });
        if (!ids.length) { msg('Selecione pelo menos um produto.', false); return; }
        enviar({ ids: ids }, ids.length);
      });
      document.getElementById('a-lote-filtro').addEventListener('click', function(){
        if (!TOTAL) { msg('Nenhum produto neste filtro.', false); return; }
        enviar({ criteria: CRITERIOS }, TOTAL);
      });
    })();
  </script>` : '';

  const body = `
  <div class="a-wrap">
    <div class="a-row" style="justify-content:space-between; margin-bottom:16px">
      <div>
        <h1>Produtos</h1>
        <p class="a-sub">${total} produto${total === 1 ? '' : 's'} ${filtroAtivo === 'todos' && !q && !brandId && !category && !source ? 'no total' : 'neste filtro'}.</p>
      </div>
      ${isAdmin ? '<a class="btn btn-gold" href="/admin/produtos/novo">+ Novo produto</a>' : ''}
    </div>
    <div class="a-tabs">${tabsHTML}</div>
    <div class="a-card">
      ${filtros}
      ${lote}
      <table>
        <thead><tr>${isAdmin ? '<th></th>' : ''}<th>Foto</th><th>Produto</th><th>Origem</th><th>Preço</th><th>Site</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="${isAdmin ? 7 : 6}" class="a-help">Nenhum produto encontrado.</td></tr>`}</tbody>
      </table>
      ${paginacao}
    </div>
  </div>
  ${script}`;
  return html(200, layout({ title: 'Produtos', user, active: 'produtos', body }));
}

/** Painel da loja (/admin/loja): a tela simples do dia a dia — procurar,
 *  foto, destaque, preço, mostrar/tirar do site e cadastrar perfume novo.
 *  Feita para celular, tablet e computador (a grade se ajusta). */
export function lojaPage(user) {
  const isAdmin = user.role === 'admin';
  const body = `
  <div class="a-wrap lj">
    <div class="lj-topo">
      <div>
        <h1>Olá, ${escapeHTML(String(user.name).split(' ')[0])}</h1>
        <p class="a-sub">Procure um perfume para trocar a foto, marcar destaque, colocar preço ou tirar do site.</p>
      </div>
      <button class="btn btn-gold lj-novo-btn" type="button" id="lj-novo-abrir">＋ Cadastrar perfume</button>
    </div>
    <div class="lj-busca">
      <input type="search" id="lj-q" placeholder="Procurar perfume ou marca" autocomplete="off" enterkeyhint="search" aria-label="Procurar perfume ou marca">
    </div>
    <div class="lj-filtros" role="group" aria-label="Filtro">
      <button type="button" class="lj-chip ativo" data-filtro="todos">Todos</button>
      <button type="button" class="lj-chip" data-filtro="site">No site</button>
      <button type="button" class="lj-chip" data-filtro="fora">Fora do site</button>
      <button type="button" class="lj-chip" data-filtro="destaques">★ Destaques</button>
      <button type="button" class="lj-chip" data-filtro="semfoto">Sem foto</button>
    </div>
    <div id="lj-aviso" aria-live="polite"></div>
    <p class="a-help" id="lj-total"></p>
    <ul class="lj-lista" id="lj-lista"></ul>
    <button class="btn btn-ghost lj-mais" type="button" id="lj-mais" hidden>Ver mais</button>
  </div>

  <dialog class="lj-dialogo" id="lj-ficha" aria-label="Perfume">
    <div class="lj-ficha" id="lj-ficha-corpo"></div>
  </dialog>

  <dialog class="lj-dialogo" id="lj-novo" aria-label="Cadastrar perfume">
    <form class="lj-ficha lj-form" id="lj-novo-form" method="dialog">
      <div class="lj-ficha-cab"><h2>Cadastrar perfume</h2><button type="button" class="lj-fechar" data-fechar aria-label="Fechar">×</button></div>
      <label class="lj-foto-escolher" id="lj-novo-foto-rot">
        <span class="lj-foto-prev" id="lj-novo-prev">📷<small>Tirar ou escolher foto</small></span>
        <input type="file" accept="image/jpeg,image/png,image/webp" id="lj-novo-foto" hidden>
      </label>
      <label>Nome do perfume<input name="name" required maxlength="200" placeholder="Ex.: Khamrah"></label>
      <label>Marca<select name="brandId" id="lj-novo-marca"><option value="">— sem marca —</option></select></label>
      <div class="lj-dupla">
        <label>Volume<input name="volume" maxlength="40" list="lj-volumes" placeholder="Ex.: 100 ml"></label>
        <label>Tipo<select name="category" id="lj-novo-cat"></select></label>
      </div>
      <datalist id="lj-volumes"><option value="100 ml"><option value="90 ml"><option value="80 ml"><option value="50 ml"><option value="30 ml"><option value="200 ml"><option value="250 ml"></datalist>
      <label class="lj-check"><input type="checkbox" name="mostrar" checked> Mostrar no site agora (precisa de foto)</label>
      <button class="btn btn-gold" type="submit">Cadastrar</button>
      <p class="a-help" id="lj-novo-msg"></p>
    </form>
  </dialog>

  <script>
    (function(){
      ${JS_AJUDA}
      var IS_ADMIN = ${isAdmin ? 'true' : 'false'};
      var est = { q: '', filtro: 'todos', pagina: 1 };
      var lista = document.getElementById('lj-lista'), total = document.getElementById('lj-total');
      var mais = document.getElementById('lj-mais'), aviso = document.getElementById('lj-aviso');
      var ficha = document.getElementById('lj-ficha'), fichaCorpo = document.getElementById('lj-ficha-corpo');
      var mudou = false;
      function el(tag, cls, txt){ var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
      function preco(v){ return v == null ? 'Consulte' : 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
      function erro(e){ msg(aviso, (e && e.message) || 'Não deu certo. Tente de novo.', false); }

      function item(p){
        var li = el('li');
        var b = el('button', 'lj-item' + (p.active ? '' : ' lj-item--fora')); b.type = 'button';
        var f = el('span', 'lj-thumb');
        if (p.image) { var im = new Image(); im.src = p.image; im.alt = ''; im.loading = 'lazy'; f.appendChild(im); } else f.appendChild(el('small', null, 'sem foto'));
        var t = el('span', 'lj-item-txt');
        t.appendChild(el('b', null, p.name));
        var sub = [p.brand, p.volume].filter(Boolean).join(' · '); if (sub) t.appendChild(el('span', 'lj-sub', sub));
        var tags = el('span', 'lj-tags');
        tags.appendChild(el('span', 'lj-tag ' + (p.active ? 'lj-tag--site' : 'lj-tag--fora'), p.active ? 'No site' : 'Fora do site'));
        if (p.featured) tags.appendChild(el('span', 'lj-tag lj-tag--estrela', '★ Destaque'));
        tags.appendChild(el('span', 'lj-preco', preco(p.price)));
        t.appendChild(tags);
        b.append(f, t);
        b.addEventListener('click', function(){ abrirFicha(p.id); });
        li.appendChild(b); return li;
      }
      function carregar(somar){
        if (!somar) est.pagina = 1;
        var qs = new URLSearchParams({ q: est.q, filtro: est.filtro, pagina: est.pagina });
        return fetch('/api/admin/loja/produtos?' + qs).then(function(r){ if (!r.ok) throw new Error('Não foi possível carregar.'); return r.json(); }).then(function(d){
          if (!somar) lista.textContent = '';
          d.itens.forEach(function(p){ lista.appendChild(item(p)); });
          total.textContent = d.total ? d.total + ' perfume(s)' : 'Nenhum perfume encontrado.';
          mais.hidden = d.pagina * d.porPagina >= d.total;
        }).catch(erro);
      }
      var espera;
      document.getElementById('lj-q').addEventListener('input', function(ev){
        clearTimeout(espera); espera = setTimeout(function(){ est.q = ev.target.value.trim(); carregar(); }, 300);
      });
      document.querySelectorAll('.lj-chip').forEach(function(c){
        c.addEventListener('click', function(){
          document.querySelectorAll('.lj-chip').forEach(function(x){ x.classList.toggle('ativo', x === c); });
          est.filtro = c.dataset.filtro; carregar();
        });
      });
      mais.addEventListener('click', function(){ est.pagina += 1; carregar(true); });

      // ---- ficha do perfume ----
      function interruptor(rotulo, ligado, aoMudar){
        var l = el('label', 'lj-switch');
        var i = el('input'); i.type = 'checkbox'; i.checked = ligado;
        l.append(i, el('span', 'lj-switch-ui'), el('span', null, rotulo));
        i.addEventListener('change', function(){ i.disabled = true; aoMudar(i.checked).catch(function(e){ i.checked = !i.checked; erroFicha(e); }).then(function(){ i.disabled = false; }); });
        return l;
      }
      var fichaMsg;
      function erroFicha(e){ if (fichaMsg) msg(fichaMsg, (e && e.message) || 'Não deu certo. Tente de novo.', false); }
      function abrirFicha(id){
        fetch('/api/admin/products/' + id).then(function(r){ if (!r.ok) throw new Error('Não foi possível abrir.'); return r.json(); })
          .then(function(d){ montarFicha(d.product); if (!ficha.open) ficha.showModal(); }).catch(erro);
      }
      function montarFicha(p){
        fichaCorpo.textContent = '';
        var cab = el('div', 'lj-ficha-cab');
        var tit = el('div'); tit.appendChild(el('h2', null, p.name));
        var sub = [p.brand, p.volume].filter(Boolean).join(' · '); if (sub) tit.appendChild(el('p', 'lj-sub', sub));
        var x = el('button', 'lj-fechar', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Fechar'); x.addEventListener('click', function(){ ficha.close(); });
        cab.append(tit, x); fichaCorpo.appendChild(cab);
        fichaMsg = el('div'); fichaCorpo.appendChild(fichaMsg);

        var grade = el('div', 'lj-ficha-grade');
        // fotos
        var colFoto = el('div', 'lj-ficha-fotos');
        var imgs = p.images || [];
        var principal = imgs.filter(function(i){ return i.isMain; })[0] || imgs[0];
        var grande = el('div', 'lj-foto-grande');
        if (principal) { var g = new Image(); g.src = principal.path; g.alt = p.name; grande.appendChild(g); } else grande.appendChild(el('span', 'lj-sem-foto', 'Sem foto'));
        colFoto.appendChild(grande);
        if (imgs.length > 1) {
          var tira = el('div', 'lj-tira');
          imgs.forEach(function(i){
            var c = el('div', 'lj-mini' + (principal && i.id === principal.id ? ' ativo' : ''));
            var im = new Image(); im.src = i.path; im.alt = ''; c.appendChild(im);
            if (!(principal && i.id === principal.id)) {
              var usar = el('button', 'lj-mini-btn', 'Principal'); usar.type = 'button';
              usar.addEventListener('click', function(){ post('/api/admin/products/' + p.id + '/images/' + i.id + '/main', 'PUT').then(function(){ mudou = true; abrirFicha(p.id); }).catch(erroFicha); });
              c.appendChild(usar);
            }
            var apagar = el('button', 'lj-mini-del', '🗑'); apagar.type = 'button'; apagar.setAttribute('aria-label', 'Apagar foto');
            apagar.addEventListener('click', function(){ if (!confirm('Apagar esta foto?')) return; post('/api/admin/products/' + p.id + '/images/' + i.id, 'DELETE').then(function(){ mudou = true; abrirFicha(p.id); }).catch(erroFicha); });
            c.appendChild(apagar); tira.appendChild(c);
          });
          colFoto.appendChild(tira);
        }
        var rot = el('label', 'btn btn-ghost lj-foto-btn', principal ? '📷 Trocar foto' : '📷 Colocar foto');
        var inp = el('input'); inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp'; inp.hidden = true; rot.appendChild(inp);
        inp.addEventListener('change', function(){
          if (!inp.files[0]) return;
          msg(fichaMsg, 'Enviando foto…', true);
          prepararFoto(inp.files[0]).then(function(dataUrl){ return post('/api/admin/products/' + p.id + '/images', 'POST', { dataUrl: dataUrl, isMain: true }); })
            .then(function(){ mudou = true; abrirFicha(p.id); }).catch(erroFicha);
        });
        colFoto.appendChild(rot);
        grade.appendChild(colFoto);

        // ações
        var col = el('div', 'lj-ficha-acoes');
        col.appendChild(interruptor('Aparece no site', !!p.active, function(v){
          return post('/api/admin/loja/produtos/' + p.id + '/site', 'PUT', { ativo: v }).then(function(){ mudou = true; p.active = v; verSite.hidden = !v; });
        }));
        col.appendChild(interruptor('★ Destaque na página inicial', !!p.featured, function(v){
          return post('/api/admin/products/' + p.id + '/featured', 'PUT', { featured: v }).then(function(){ mudou = true; });
        }));
        var pr = el('form', 'lj-preco-form');
        var rotP = el('label', null, 'Preço (deixe em branco para "Consulte")');
        var campo = el('input'); campo.inputMode = 'decimal'; campo.placeholder = 'Ex.: 199,90';
        campo.value = p.price == null ? '' : Number(p.price).toFixed(2).replace('.', ',');
        rotP.appendChild(campo);
        var salvar = el('button', 'btn btn-gold', 'Salvar preço'); salvar.type = 'submit';
        pr.append(rotP, salvar);
        pr.addEventListener('submit', function(ev){
          ev.preventDefault();
          var v = campo.value.trim().replace(/\\./g, '').replace(',', '.');
          if (v && !(Number(v) >= 0)) { msg(fichaMsg, 'Preço inválido.', false); return; }
          post('/api/admin/products/' + p.id + '/price', 'PUT', { price: v === '' ? null : Number(v), comparePrice: p.comparePrice == null ? null : p.comparePrice })
            .then(function(){ mudou = true; msg(fichaMsg, 'Preço salvo.', true); }).catch(erroFicha);
        });
        col.appendChild(pr);
        var links = el('div', 'lj-links');
        var verSite = el('a', null, 'Ver no site ↗'); verSite.href = '/produto/' + p.slug; verSite.target = '_blank'; verSite.rel = 'noopener'; verSite.hidden = !p.active;
        links.appendChild(verSite);
        if (IS_ADMIN) { var comp = el('a', null, 'Cadastro completo'); comp.href = '/admin/produtos/' + p.id; links.appendChild(comp); }
        col.appendChild(links);
        grade.appendChild(col);
        fichaCorpo.appendChild(grade);
      }
      ficha.addEventListener('close', function(){ if (mudou) { mudou = false; carregar(); } });
      ficha.addEventListener('click', function(ev){ if (ev.target === ficha) ficha.close(); });

      // ---- cadastro rápido ----
      var novo = document.getElementById('lj-novo'), form = document.getElementById('lj-novo-form');
      var fotoIn = document.getElementById('lj-novo-foto'), prev = document.getElementById('lj-novo-prev'), novoMsg = document.getElementById('lj-novo-msg');
      var opcoesProntas = false;
      document.getElementById('lj-novo-abrir').addEventListener('click', function(){
        form.reset(); fotoIn.value = ''; prev.textContent = '📷'; prev.appendChild(el('small', null, 'Tirar ou escolher foto')); novoMsg.textContent = '';
        if (!opcoesProntas) {
          fetch('/api/admin/loja/opcoes').then(function(r){ return r.json(); }).then(function(d){
            var sm = document.getElementById('lj-novo-marca'), sc = document.getElementById('lj-novo-cat');
            d.marcas.forEach(function(m){ var o = el('option', null, m.name); o.value = m.id; sm.appendChild(o); });
            d.categorias.forEach(function(c){ var o = el('option', null, c); o.value = c; sc.appendChild(o); });
            opcoesProntas = true;
          });
        }
        novo.showModal();
      });
      novo.querySelector('[data-fechar]').addEventListener('click', function(){ novo.close(); });
      novo.addEventListener('click', function(ev){ if (ev.target === novo) novo.close(); });
      fotoIn.addEventListener('change', function(){
        var f = fotoIn.files[0]; if (!f) return;
        prev.textContent = ''; var im = new Image(); im.src = URL.createObjectURL(f); im.alt = ''; prev.appendChild(im);
      });
      form.addEventListener('submit', function(ev){
        ev.preventDefault();
        var dados = { name: form.name.value, brandId: form.brandId.value || null, volume: form.volume.value, category: form.category.value };
        var foto = fotoIn.files[0], mostrar = form.mostrar.checked;
        var btn = form.querySelector('button[type=submit]'); btn.disabled = true; novoMsg.textContent = 'Cadastrando…';
        post('/api/admin/loja/produtos', 'POST', dados).then(function(r){
          var id = r.id;
          var passo = Promise.resolve();
          if (foto) passo = passo.then(function(){ novoMsg.textContent = 'Enviando foto…'; return prepararFoto(foto); })
            .then(function(dataUrl){ return post('/api/admin/products/' + id + '/images', 'POST', { dataUrl: dataUrl, isMain: true }); });
          if (foto && mostrar) passo = passo.then(function(){ return post('/api/admin/loja/produtos/' + id + '/site', 'PUT', { ativo: true }); });
          return passo.then(function(){ novo.close(); carregar(); abrirFicha(id); msg(aviso, foto && mostrar ? 'Perfume cadastrado e já aparece no site.' : 'Perfume cadastrado. Ele aparece no site depois de ter foto e de ligar "Aparece no site".', true); });
        }).catch(function(e){ novoMsg.textContent = (e && e.message) || 'Não deu certo. Tente de novo.'; }).then(function(){ btn.disabled = false; });
      });

      carregar();
    })();
  </script>`;
  return html(200, layout({ title: 'Loja', user, active: 'loja', body }));
}

/** Contas (/admin/contas — só administração): quem entra no painel.
 *  Usuário (login) fica em minúsculas; o nome pode mudar quando quiser. */
export function contasPage(user) {
  const body = `
  <div class="a-wrap">
    <h1>Contas</h1>
    <p class="a-sub">Quem entra no painel. <b>Vendedora</b> usa a tela simples da Loja; <b>Administração</b> vê tudo. O usuário (para entrar) não muda; o nome pode mudar quando quiser.</p>
    <div id="ct-aviso" aria-live="polite"></div>

    <div class="a-card">
      <h2>Nova conta</h2>
      <form id="ct-nova" class="ct-form">
        <label>Nome<input name="nome" maxlength="60" required placeholder="Ex.: Maria"></label>
        <label>Usuário (para entrar)<input name="usuario" maxlength="40" required placeholder="Ex.: maria" autocapitalize="none" autocomplete="off" spellcheck="false"></label>
        <label>Tipo<select name="papel"><option value="vendedora">Vendedora</option><option value="admin">Administração</option></select></label>
        <label>Senha<input name="senha" type="text" autocomplete="off" placeholder="Em branco = o painel cria uma"></label>
        <label class="ct-check"><input type="checkbox" name="trocar" checked> Pedir para a pessoa trocar a senha no primeiro acesso</label>
        <button class="btn btn-gold" type="submit">Criar conta</button>
      </form>
      <p class="a-help">A senha precisa ter pelo menos 10 caracteres. Entregue a senha pessoalmente (não mande por mensagem).</p>
    </div>

    <div class="ct-lista" id="ct-lista"></div>
  </div>
  <script>
    (function(){
      ${JS_AJUDA}
      var aviso = document.getElementById('ct-aviso'), lista = document.getElementById('ct-lista');
      function el(tag, cls, txt){ var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
      function erro(e){ msg(aviso, (e && e.message) || 'Não deu certo. Tente de novo.', false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      function mostrarSenha(usuario, senha){
        aviso.textContent = '';
        var box = el('div', 'a-msg a-msg-ok ct-senha');
        box.appendChild(el('b', null, 'Anote agora — esta senha não aparece de novo.'));
        var linha = el('div', 'ct-senha-linha');
        linha.append(el('span', null, 'Usuário: '), el('code', null, usuario), el('span', null, ' · Senha: '), el('code', null, senha));
        var copiar = el('button', 'btn btn-ghost btn-sm', 'Copiar'); copiar.type = 'button';
        copiar.addEventListener('click', function(){ if (navigator.clipboard) navigator.clipboard.writeText(senha).then(function(){ copiar.textContent = 'Copiada'; }); });
        linha.appendChild(copiar);
        var fechar = el('button', 'btn btn-ghost btn-sm', 'Já anotei'); fechar.type = 'button'; fechar.addEventListener('click', function(){ box.remove(); });
        box.append(linha, fechar);
        aviso.appendChild(box);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      function carregar(){
        fetch('/api/admin/contas').then(function(r){ return r.json(); }).then(function(d){
          lista.textContent = '';
          d.contas.forEach(function(c){ lista.appendChild(linha(c, c.id === d.eu)); });
        }).catch(erro);
      }
      function linha(c, souEu){
        var card = el('div', 'a-card ct-conta' + (c.active ? '' : ' ct-conta--off'));
        var topo = el('div', 'ct-conta-topo');
        var nome = el('input', 'ct-nome'); nome.value = c.name; nome.maxLength = 60; nome.setAttribute('aria-label', 'Nome');
        var salvar = el('button', 'btn btn-gold btn-sm', 'Salvar nome'); salvar.type = 'button';
        salvar.addEventListener('click', function(){ post('/api/admin/contas/' + c.id, 'PUT', { nome: nome.value }).then(function(){ msg(aviso, 'Nome salvo.', true); carregar(); }).catch(erro); });
        topo.append(nome, salvar);
        var info = el('p', 'a-help ct-info');
        info.append(el('span', null, 'Usuário: '), el('code', null, c.username));
        var tags = el('span', 'ct-tags');
        tags.appendChild(el('span', 'ct-tag', c.role === 'admin' ? 'Administração' : 'Vendedora'));
        if (souEu) tags.appendChild(el('span', 'ct-tag ct-tag--eu', 'você'));
        if (!c.active) tags.appendChild(el('span', 'ct-tag ct-tag--off', 'desativada'));
        else if (c.trocarSenha) tags.appendChild(el('span', 'ct-tag ct-tag--aviso', 'troca a senha no próximo acesso'));
        info.appendChild(tags);
        var acoes = el('div', 'ct-acoes');
        if (!souEu) {
          var tipo = el('select'); tipo.setAttribute('aria-label', 'Tipo');
          [['vendedora', 'Vendedora'], ['admin', 'Administração']].forEach(function(o){ var op = el('option', null, o[1]); op.value = o[0]; tipo.appendChild(op); });
          tipo.value = c.role;
          tipo.addEventListener('change', function(){
            if (!confirm('Mudar o tipo da conta de ' + c.name + '? A pessoa precisa entrar de novo.')) { tipo.value = c.role; return; }
            post('/api/admin/contas/' + c.id, 'PUT', { papel: tipo.value }).then(carregar).catch(function(e){ tipo.value = c.role; erro(e); });
          });
          acoes.appendChild(tipo);
          var nova = el('button', 'btn btn-ghost btn-sm', 'Gerar senha nova'); nova.type = 'button';
          nova.addEventListener('click', function(){
            if (!confirm('Gerar uma senha nova para ' + c.name + '? A senha atual deixa de funcionar.')) return;
            post('/api/admin/contas/' + c.id + '/senha', 'POST').then(function(r){ mostrarSenha(r.username, r.senhaGerada); carregar(); }).catch(erro);
          });
          acoes.appendChild(nova);
          var at = el('button', 'btn btn-sm ' + (c.active ? 'btn-danger' : 'btn-ghost'), c.active ? 'Desativar' : 'Reativar'); at.type = 'button';
          at.addEventListener('click', function(){
            if (c.active && !confirm('Desativar a conta de ' + c.name + '? Ela não consegue mais entrar (o histórico fica).')) return;
            post('/api/admin/contas/' + c.id, 'PUT', { ativo: !c.active }).then(carregar).catch(erro);
          });
          acoes.appendChild(at);
        } else {
          acoes.appendChild(el('a', null, 'Trocar a minha senha')).href = '/admin/trocar-senha';
        }
        card.append(topo, info, acoes);
        return card;
      }
      document.getElementById('ct-nova').addEventListener('submit', function(ev){
        ev.preventDefault();
        var f = ev.target;
        post('/api/admin/contas', 'POST', { nome: f.nome.value, usuario: f.usuario.value, papel: f.papel.value, senha: f.senha.value, trocar: f.trocar.checked })
          .then(function(r){
            f.reset(); carregar();
            if (r.senhaGerada) mostrarSenha(r.username, r.senhaGerada);
            else msg(aviso, 'Conta criada: ' + r.name + ' (usuário ' + r.username + ').', true);
          }).catch(erro);
      });
      carregar();
    })();
  </script>`;
  return html(200, layout({ title: 'Contas', user, active: 'contas', body }));
}

/** Equipe (/admin/equipe): quem aparece em "Nossa equipe" e na escolha de
 *  atendimento da sacola. Só o primeiro nome e a foto vão para o site. */
export function teamPage(user, { members }) {
  const itens = members.map((m, i) => `
      <li class="a-pessoa${m.active ? '' : ' a-pessoa--oculta'}" data-id="${m.id}">
        <div class="a-pessoa-foto">${m.photo ? `<img src="${escapeHTML(m.photo)}" alt="" width="120" height="160">` : '<span>sem foto</span>'}</div>
        <div class="a-pessoa-dados">
          <label class="a-help" for="t-nome-${m.id}">Nome no site</label>
          <input id="t-nome-${m.id}" type="text" maxlength="40" value="${escapeHTML(m.name)}" data-campo="nome">
          <div class="a-row" style="gap:6px; flex-wrap:wrap; margin-top:8px">
            <button class="btn btn-gold btn-sm" type="button" data-acao="salvar">Salvar nome</button>
            <label class="btn btn-ghost btn-sm" style="cursor:pointer">Trocar foto<input type="file" accept="image/jpeg,image/png,image/webp" data-acao="foto" hidden></label>
            <button class="btn btn-ghost btn-sm" type="button" data-acao="ativo">${m.active ? 'Esconder do site' : 'Mostrar no site'}</button>
            ${i > 0 ? '<button class="btn btn-ghost btn-sm" type="button" data-acao="subir" title="Mover para cima">↑</button>' : ''}
            ${i < members.length - 1 ? '<button class="btn btn-ghost btn-sm" type="button" data-acao="descer" title="Mover para baixo">↓</button>' : ''}
            <button class="btn btn-danger btn-sm" type="button" data-acao="remover">Remover</button>
          </div>
          ${m.active ? '' : '<p class="a-help">Escondida: não aparece no site nem na escolha de atendimento.</p>'}
        </div>
      </li>`).join('');
  const body = `
  <div class="a-wrap">
    <h1>Equipe</h1>
    <p class="a-sub">Quem aparece em "Nossa equipe" no site e na hora de escolher o atendimento pela sacola. Só o primeiro nome e a foto vão para o site. A foto fica melhor em pé (retrato), com o rosto no centro.</p>
    <div id="a-msg-equipe"></div>
    <div class="a-card">
      <h2>Adicionar pessoa</h2>
      <form class="a-row" id="t-novo" style="gap:8px; flex-wrap:wrap">
        <input type="text" name="nome" maxlength="40" placeholder="Primeiro nome" required style="max-width:260px">
        <button class="btn btn-gold btn-sm" type="submit">Adicionar</button>
      </form>
      <p class="a-help">Depois de adicionar, envie a foto pelo botão "Trocar foto".</p>
    </div>
    <ul class="a-equipe" id="t-lista">${itens || '<li class="a-help">Ninguém cadastrado ainda.</li>'}</ul>
  </div>
  <script>
    (function(){
      ${JS_AJUDA}
      var aviso = document.getElementById('a-msg-equipe');
      function erro(e){ msg(aviso, (e && e.message) || 'Não deu certo. Tente de novo.', false); }
      function recarregar(){ location.reload(); }
      document.getElementById('t-novo').addEventListener('submit', function(ev){
        ev.preventDefault();
        post('/api/admin/team', 'POST', { name: ev.target.nome.value }).then(recarregar).catch(erro);
      });
      var lista = document.getElementById('t-lista');
      function ordemAtual(){ return [].map.call(lista.querySelectorAll('.a-pessoa'), function(li){ return Number(li.dataset.id); }); }
      lista.addEventListener('click', function(ev){
        var btn = ev.target.closest('button[data-acao]'); if (!btn) return;
        var li = btn.closest('.a-pessoa'); var id = li.dataset.id; var acao = btn.dataset.acao;
        if (acao === 'salvar') {
          post('/api/admin/team/' + id, 'PUT', { name: li.querySelector('[data-campo="nome"]').value })
            .then(function(){ msg(aviso, 'Nome salvo.', true); }).catch(erro);
        } else if (acao === 'ativo') {
          post('/api/admin/team/' + id, 'PUT', { active: li.classList.contains('a-pessoa--oculta') }).then(recarregar).catch(erro);
        } else if (acao === 'subir' || acao === 'descer') {
          var ids = ordemAtual(); var i = ids.indexOf(Number(id)); var j = acao === 'subir' ? i - 1 : i + 1;
          var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
          post('/api/admin/team/order', 'PUT', { ids: ids }).then(recarregar).catch(erro);
        } else if (acao === 'remover') {
          if (!confirm('Remover esta pessoa da equipe? Para só tirar do site por um tempo, use "Esconder do site".')) return;
          post('/api/admin/team/' + id, 'DELETE').then(recarregar).catch(erro);
        }
      });
      lista.addEventListener('change', function(ev){
        var input = ev.target; if (input.dataset.acao !== 'foto' || !input.files[0]) return;
        var li = input.closest('.a-pessoa');
        msg(aviso, 'Enviando foto…', true);
        prepararFoto(input.files[0]).then(function(dataUrl){
          return post('/api/admin/team/' + li.dataset.id + '/photo', 'POST', { dataUrl: dataUrl });
        }).then(recarregar).catch(erro);
      });
    })();
  </script>`;
  return html(200, layout({ title: 'Equipe', user, active: 'equipe', body }));
}

/** Revisão de fotos em grade: bater o olho e tirar, com um toque, foto com
 *  logo ou marca d'água de outra empresa. O produto fica sem foto (aparece
 *  com a imagem padrão) até a loja enviar outra. */
export function photoReviewPage(user, { items, total, page, perPage, source }) {
  const paginas = Math.max(1, Math.ceil(total / perPage));
  const link = (pg, origem = source) => {
    const qs = new URLSearchParams();
    if (origem) qs.set('origem', origem);
    if (pg > 1) qs.set('pagina', pg);
    return '/admin/fotos' + (qs.toString() ? '?' + qs.toString() : '');
  };
  const cards = items.map((it) => `
      <figure class="a-foto" data-produto="${it.id}" data-imagem="${it.imageId}">
        <a href="/admin/produtos/${it.id}"><img src="${escapeHTML(it.image)}" alt="" loading="lazy" width="160" height="160"></a>
        <figcaption>${escapeHTML(it.name)}<span class="a-help">${escapeHTML(it.brand || '—')}${it.active ? ' · publicado' : ''}</span></figcaption>
        <button class="btn btn-danger btn-sm" type="button" data-acao="tirar">Tirar foto</button>
      </figure>`).join('');
  const abas = [['', 'Todas'], ['importado', 'Catálogo importado'], ['loja', 'Cadastros da loja']]
    .map(([v, l]) => `<a class="a-tab${v === source ? ' a-tab--ativo' : ''}" href="${link(1, v)}">${l}</a>`).join('');
  const body = `
  <div class="a-wrap">
    <h1>Fotos</h1>
    <p class="a-sub">A foto principal de cada produto (${total}). Viu alguma com logo, nome de loja ou marca d'água de outra empresa? Toque em <b>Tirar foto</b>: o produto fica com a imagem padrão até vocês enviarem outra.</p>
    <div class="a-tabs">${abas}</div>
    <div id="a-msg-fotos"></div>
    <div class="a-fotos">${cards || '<p class="a-help">Nenhuma foto aqui.</p>'}</div>
    ${paginas > 1 ? `<div class="a-row a-paginas" style="justify-content:center; gap:8px; margin-top:14px">
      ${page > 1 ? `<a class="btn btn-ghost btn-sm" href="${link(page - 1)}">&larr; Anterior</a>` : ''}
      <span class="a-help">Página ${page} de ${paginas}</span>
      ${page < paginas ? `<a class="btn btn-ghost btn-sm" href="${link(page + 1)}">Próxima &rarr;</a>` : ''}
    </div>` : ''}
  </div>
  <script>
    document.querySelector('.a-fotos').addEventListener('click', function(ev){
      var btn = ev.target.closest('[data-acao="tirar"]'); if (!btn) return;
      var fig = btn.closest('.a-foto');
      if (!confirm('Tirar esta foto do produto? Ele fica com a imagem padrão até vocês enviarem outra.')) return;
      btn.disabled = true;
      fetch('/api/admin/products/' + fig.dataset.produto + '/images/' + fig.dataset.imagem, { method: 'DELETE' })
        .then(function(r){ if (!r.ok) throw new Error(); fig.classList.add('a-foto--removida'); btn.textContent = 'Foto retirada'; })
        .catch(function(){ btn.disabled = false; document.getElementById('a-msg-fotos').innerHTML = '<div class="a-msg a-msg-err">Não deu para tirar a foto. Tente de novo.</div>'; });
    });
  </script>`;
  return html(200, layout({ title: 'Fotos', user, active: 'fotos', body }));
}

export function productFormPage(user, product, { brands, categories = [], movements = [], olisekConfigured = false }) {
  const isNew = !product;
  const isAdmin = user.role === 'admin';
  const p = product || { name: '', brandId: null, category: '', volume: '', gender: '', family: '', description: '',
    notes: { topo: '', coracao: '', fundo: '' }, price: null, comparePrice: null, stock: 0, active: 1, featured: 0,
    olisekId: null, olisekName: null, olisekLinkStatus: 'unlinked', images: [], priceHistory: [] };

  const brandOptions = brands.map((b) => `<option value="${b.id}" ${b.id === p.brandId ? 'selected' : ''}>${escapeHTML(b.name)}</option>`).join('');

  const camposBase = `
    <div class="a-grid2">
      <div class="a-field"><label>Nome do produto</label><input type="text" id="f-name" value="${escapeHTML(p.name)}" ${isAdmin ? '' : 'disabled'}></div>
      <div class="a-field"><label>Marca</label>
        <select id="f-brand" ${isAdmin ? '' : 'disabled'}><option value="">—</option>${brandOptions}</select>
      </div>
    </div>
    <div class="a-grid3">
      <div class="a-field"><label>Categoria</label><input type="text" id="f-category" list="f-category-opcoes" autocomplete="off" value="${escapeHTML(p.category || '')}" ${isAdmin ? '' : 'disabled'}>
        <datalist id="f-category-opcoes">${categories.map((c) => `<option value="${escapeHTML(c)}">`).join('')}</datalist>
        <p class="a-help">Escolha uma da lista. Se digitar "perfume", "Perfumes" etc., o sistema grava como a categoria que já existe.</p></div>
      <div class="a-field"><label>Gênero</label>
        <select id="f-gender" ${isAdmin ? '' : 'disabled'}>
          <option value="" ${!p.gender ? 'selected' : ''}>—</option>
          <option value="masculino" ${p.gender === 'masculino' ? 'selected' : ''}>Masculino</option>
          <option value="feminino" ${p.gender === 'feminino' ? 'selected' : ''}>Feminino</option>
          <option value="unissex" ${p.gender === 'unissex' ? 'selected' : ''}>Unissex</option>
        </select>
      </div>
      <div class="a-field"><label>Volume (ex.: 100ml)</label><input type="text" id="f-volume" value="${escapeHTML(p.volume || '')}" ${isAdmin ? '' : 'disabled'}></div>
    </div>
    <div class="a-field"><label>Descrição</label><textarea id="f-description" ${isAdmin ? '' : 'disabled'}>${escapeHTML(p.description || '')}</textarea></div>
    <div class="a-grid3">
      <div class="a-field"><label>Notas de topo</label><input type="text" id="f-notes-topo" value="${escapeHTML(p.notes.topo)}" ${isAdmin ? '' : 'disabled'}></div>
      <div class="a-field"><label>Notas de coração</label><input type="text" id="f-notes-coracao" value="${escapeHTML(p.notes.coracao)}" ${isAdmin ? '' : 'disabled'}></div>
      <div class="a-field"><label>Notas de fundo</label><input type="text" id="f-notes-fundo" value="${escapeHTML(p.notes.fundo)}" ${isAdmin ? '' : 'disabled'}></div>
    </div>
    ${isAdmin ? '<button class="btn btn-ghost" id="f-salvar-cadastro" type="button">Salvar dados do produto</button>' : '<p class="a-help">Só a Administração pode editar o cadastro completo. Você pode alterar preço, fotos, destaque e disponibilidade abaixo.</p>'}
  `;

  const olisekLinkInfo = OLISEK_LINK_LABELS[p.olisekLinkStatus] || OLISEK_LINK_LABELS.unlinked;
  const olisekBox = isNew ? '' : `
    <div class="a-card">
      <h2>Vínculo OliSek</h2>
      <div id="a-msg-olisek"></div>
      ${p.olisekId ? `
        <p>ID <b>${p.olisekId}</b> — ${escapeHTML(p.olisekName || '')}
          <span class="badge ${olisekLinkInfo.cls}">${olisekLinkInfo.text}</span>
        </p>
        <p class="a-help">Estoque de origem: ${p.stockSource === 'olisek_api' ? 'sincronizado ao vivo pela API da OliSek' : p.stockSource === 'olisek_import' ? 'importado da OliSek (relatório colado)' : p.stockSource === 'manual' ? 'digitado manualmente' : 'nenhum (nunca confirmado)'}.</p>
        ${p.olisekSyncedAt ? `<p class="a-help">Última sincronização pela API: ${escapeHTML(p.olisekSyncedAt)}.</p>` : ''}
      ` : '<p class="a-help">Ainda sem vínculo com a OliSek — estoque só é considerado confiável depois de um vínculo confirmado ou de um número digitado manualmente (ver docs/OLISEK-INTEGRATION.md).</p>'}
      <p class="a-help">Vendas acumuladas (OliSek): <b>${p.sales}</b> — só muda com uma importação real da OliSek, nunca é digitado à mão aqui (ver docs/OLISEK-INTEGRATION.md).</p>
      ${isAdmin && p.olisekId ? `
      <div class="a-sync-olisek" style="margin-top:10px">
        ${olisekConfigured
          ? '<button class="btn btn-ghost btn-sm" id="f-sync-olisek" type="button">Sincronizar agora com a OliSek</button>'
          : '<p class="a-help">Sincronização pela API desligada — defina OLISEK_LOGIN e OLISEK_PASSWORD nas variáveis de ambiente do servidor para habilitar (ver docs/OLISEK-INTEGRATION.md). Até lá, o vínculo abaixo continua funcionando normalmente.</p>'}
      </div>
      ` : ''}
      ${isAdmin ? `
      <div class="a-grid3" style="margin-top:10px">
        <div class="a-field"><label>ID OliSek</label><input type="number" id="f-olisek-id" value="${p.olisekId ?? ''}" placeholder="deixe em branco para desvincular"></div>
        <div class="a-field"><label>Nome na OliSek</label><input type="text" id="f-olisek-name" value="${escapeHTML(p.olisekName || '')}"></div>
        <div class="a-field"><label>Status do vínculo</label>
          <select id="f-olisek-status">
            <option value="unlinked" ${p.olisekLinkStatus === 'unlinked' ? 'selected' : ''}>Sem vínculo</option>
            <option value="probable" ${p.olisekLinkStatus === 'probable' ? 'selected' : ''}>Correspondência provável</option>
            <option value="needs_review" ${p.olisekLinkStatus === 'needs_review' ? 'selected' : ''}>Precisa revisão</option>
            <option value="confirmed" ${p.olisekLinkStatus === 'confirmed' ? 'selected' : ''}>Confirmado</option>
          </select>
        </div>
      </div>
      <p class="a-help">Mudar o status pra "Confirmado" ou "Correspondência provável" passa a confiar no estoque vindo da OliSek — só faça isso depois de ter olhado os dois sistemas lado a lado.</p>
      <button class="btn btn-ghost btn-sm" id="f-salvar-olisek" type="button">Salvar vínculo OliSek</button>
      ` : ''}
    </div>`;

  // Preço, promoção e destaque: os únicos campos de estoque/cadastro que a
  // vendedora também pode mexer (fechamento V2, regra 7) — por isso ficam
  // juntos aqui, sem `disabled` por papel.
  const precoBox = isNew ? '' : `
    <div class="a-card">
      <h2>Preço e destaque</h2>
      <div id="a-msg-preco"></div>
      <div class="a-grid3">
        <div class="a-field"><label>Preço (R$)</label><input type="number" step="0.01" min="0" id="f-price" value="${p.price ?? ''}" placeholder="deixe em branco = &quot;Consulte&quot;"></div>
        <div class="a-field"><label>Preço &quot;de&quot; (promoção, opcional)</label><input type="number" step="0.01" min="0" id="f-compare-price" value="${p.comparePrice ?? ''}"></div>
        <div class="a-field"><label>&nbsp;</label><label style="display:inline-flex;align-items:center;gap:6px;font-size:14px;color:var(--a-ink)"><input type="checkbox" id="f-featured" ${p.featured ? 'checked' : ''} style="width:auto"> Produto em destaque</label></div>
      </div>
      <button class="btn btn-gold btn-sm" id="f-salvar-preco" type="button">Salvar preço e destaque</button>
      ${isAdmin && p.priceHistory && p.priceHistory.length ? `
        <h2 style="margin-top:18px">Histórico de preço</h2>
        <div class="a-hist"><table>
          <thead><tr><th>Quando</th><th>De</th><th>Para</th><th>Quem</th></tr></thead>
          <tbody>${p.priceHistory.map((h) => `<tr><td>${escapeHTML(h.createdAt)}</td><td>${h.oldPrice != null ? 'R$ ' + Number(h.oldPrice).toFixed(2) : '—'}</td><td>${h.newPrice != null ? 'R$ ' + Number(h.newPrice).toFixed(2) : '—'}</td><td>${escapeHTML(h.userName)}</td></tr>`).join('')}</tbody>
        </table></div>` : ''}
    </div>`;

  // Estoque e publicar/ocultar: só admin (regra 7) — a vendedora nem vê
  // esses campos. Toda mudança de estoque vira uma movimentação no
  // histórico (entrada, saída ou ajuste de contagem, com motivo e autor).
  const historico = movements.length ? `
      <div class="a-hist"><table>
        <thead><tr><th>Quando</th><th>Tipo</th><th>Qtde</th><th>Saldo</th><th>Motivo</th><th>Quem</th></tr></thead>
        <tbody>${movements.map((m) => `<tr>
          <td>${escapeHTML(m.createdAt)}</td><td>${escapeHTML(m.kindLabel)}</td>
          <td>${m.quantity > 0 ? '+' : ''}${m.quantity}</td><td>${m.stockBefore} → ${m.stockAfter}</td>
          <td>${escapeHTML(m.reason || '')}</td><td>${escapeHTML(m.userName || '—')}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="a-help">Nenhuma movimentação registrada ainda.</p>';
  const estoqueBox = isNew || !isAdmin ? '' : `
    <div class="a-card">
      <h2>Estoque e disponibilidade</h2>
      <div id="a-msg-estoque"></div>
      <p>Saldo atual: <b id="f-stock-atual">${p.stock}</b> unidade${p.stock === 1 ? '' : 's'} · ${stockBadge(p)}</p>
      <div class="a-grid3">
        <div class="a-field"><label>Movimentação</label>
          <select id="f-mov-kind">
            <option value="entrada">Entrada (chegou mercadoria)</option>
            <option value="saida">Saída (venda, avaria, brinde...)</option>
            <option value="ajuste">Ajuste de contagem (definir o saldo)</option>
          </select>
        </div>
        <div class="a-field"><label id="f-mov-qtd-label">Quantidade</label><input type="number" min="0" step="1" id="f-mov-qtd" inputmode="numeric"></div>
        <div class="a-field"><label>Motivo <span class="a-help">(obrigatório em saída e ajuste)</span></label>
          <input type="text" id="f-mov-motivo" maxlength="300" list="f-mov-motivos">
          <datalist id="f-mov-motivos"><option value="Venda na loja"><option value="Venda pelo WhatsApp"><option value="Avaria / perda"><option value="Devolução de cliente"><option value="Contagem física"><option value="Brinde / amostra"></datalist>
        </div>
      </div>
      <button class="btn btn-gold btn-sm" id="f-mov-salvar" type="button">Registrar movimentação</button>
      <p class="a-help">Uso interno: o cliente não vê esse número nem selo de estoque — no site aparece sempre "Consulte disponibilidade" e a equipe confirma pelo WhatsApp. O estoque nunca fica negativo: uma saída maior que o saldo é recusada.</p>
      <p class="a-help">${p.active
        ? 'Este produto está <b>publicado</b> no site.'
        : 'Este produto está <b>oculto</b> — não aparece no site. Marque "Publicado no site" abaixo para mostrar.'}</p>
      <h2 style="margin-top:18px">Histórico de estoque <span class="a-help">(últimas ${movements.length})</span></h2>
      ${historico}
      <div class="a-row" style="margin-top:14px">
        <label><input type="checkbox" id="f-active" ${p.active ? 'checked' : ''} style="width:auto"> Publicado no site</label>
        <button class="btn btn-ghost btn-sm" id="f-salvar-ativo" type="button">Salvar publicação</button>
        <button class="btn btn-danger btn-sm" id="f-despublicar" type="button" style="margin-left:8px">Despublicar produto</button>
      </div>
    </div>`;

  const imagesBox = isNew ? '' : `
    <div class="a-card">
      <h2>Fotos</h2>
      <div class="a-imgs" id="a-imgs">
        ${p.images.map((img) => `
          <div class="a-img ${img.isMain ? 'main' : ''}" data-id="${img.id}">
            <img src="${escapeHTML(img.path)}" alt="">
            <div class="a-img-actions">
              <button type="button" data-action="main" title="Definir como principal">★</button>
              <button type="button" data-action="del" title="Excluir">🗑</button>
            </div>
          </div>`).join('')}
      </div>
      <label class="a-drop" for="a-file-input" id="a-drop">Clique para escolher uma foto (JPG, PNG ou WEBP)</label>
      <input type="file" id="a-file-input" accept="image/jpeg,image/png,image/webp" style="display:none">
      <p class="a-help">A foto é reduzida automaticamente (até 1600px, formato WEBP) antes de ir para o site — pode mandar direto da câmera do celular.</p>
    </div>`;

  const body = `
  <div class="a-wrap">
    <p><a href="/admin/produtos">&larr; Voltar para produtos</a></p>
    <h1>${isNew ? 'Novo produto' : escapeHTML(p.name)}</h1>
    ${!isNew && p.inStoreReport ? `<p class="a-help"><span class="badge badge-ok">no relatório da loja</span> como "${escapeHTML(p.storeReportName || '')}"</p>` : ''}
    <div id="a-msg-topo"></div>
    <div class="a-card">${camposBase}</div>
    ${olisekBox}
    ${precoBox}
    ${estoqueBox}
    ${imagesBox}
  </div>
  <script>
    var PRODUCT_ID = ${isNew ? 'null' : p.id};
    ${JS_AJUDA}
    ${isAdmin ? `
    var salvarCadastro = document.getElementById('f-salvar-cadastro');
    if (salvarCadastro) salvarCadastro.addEventListener('click', function(){
      var data = {
        name: document.getElementById('f-name').value,
        brandId: document.getElementById('f-brand').value || null,
        category: document.getElementById('f-category').value,
        gender: document.getElementById('f-gender').value,
        volume: document.getElementById('f-volume').value,
        description: document.getElementById('f-description').value,
        notes: { topo: document.getElementById('f-notes-topo').value, coracao: document.getElementById('f-notes-coracao').value, fundo: document.getElementById('f-notes-fundo').value },
      };
      var topo = document.getElementById('a-msg-topo');
      if (PRODUCT_ID) {
        post('/api/admin/products/' + PRODUCT_ID, 'PUT', data).then(function(){ msg(topo, 'Dados salvos.', true); })
          .catch(function(e){ msg(topo, e.message || 'Erro ao salvar.', false); });
      } else {
        post('/api/admin/products', 'POST', data).then(function(r){ location.href = '/admin/produtos/' + r.product.id; })
          .catch(function(e){ msg(topo, e.message || 'Erro ao criar.', false); });
      }
    });` : ''}
    ${!isNew ? `
    var salvarPreco = document.getElementById('f-salvar-preco');
    if (salvarPreco) salvarPreco.addEventListener('click', function(){
      var data = { price: document.getElementById('f-price').value, comparePrice: document.getElementById('f-compare-price').value };
      var featured = document.getElementById('f-featured').checked;
      Promise.all([
        post('/api/admin/products/' + PRODUCT_ID + '/price', 'PUT', data),
        post('/api/admin/products/' + PRODUCT_ID + '/featured', 'PUT', { featured: featured }),
      ]).then(function(){ msg(document.getElementById('a-msg-preco'), 'Preço e destaque atualizados.', true); setTimeout(function(){location.reload();}, 900); })
        .catch(function(e){ msg(document.getElementById('a-msg-preco'), (e && e.message) || 'Erro.', false); });
    });
    var movKind = document.getElementById('f-mov-kind');
    if (movKind) movKind.addEventListener('change', function(){
      document.getElementById('f-mov-qtd-label').textContent = movKind.value === 'ajuste' ? 'Novo saldo (contado)' : 'Quantidade';
    });
    var movSalvar = document.getElementById('f-mov-salvar');
    if (movSalvar) movSalvar.addEventListener('click', function(){
      var data = { kind: movKind.value, quantity: Number(document.getElementById('f-mov-qtd').value), reason: document.getElementById('f-mov-motivo').value };
      var el = document.getElementById('a-msg-estoque');
      if (document.getElementById('f-mov-qtd').value === '') { msg(el, 'Informe a quantidade.', false); return; }
      movSalvar.disabled = true;
      post('/api/admin/products/' + PRODUCT_ID + '/stock/movements', 'POST', data)
        .then(function(r){
          msg(el, r.movement ? 'Movimentação registrada. Novo saldo: ' + r.movement.stockAfter + '.' : 'O saldo já era esse — nada mudou.', true);
          setTimeout(function(){ location.reload(); }, 900);
        })
        .catch(function(e){ movSalvar.disabled = false; msg(el, (e && e.message) || (e && e.error) || 'Erro.', false); });
    });
    var salvarAtivo = document.getElementById('f-salvar-ativo');
    if (salvarAtivo) salvarAtivo.addEventListener('click', function(){
      post('/api/admin/products/' + PRODUCT_ID + '/active', 'PUT', { active: document.getElementById('f-active').checked })
        .then(function(){ msg(document.getElementById('a-msg-estoque'), 'Publicação atualizada.', true); setTimeout(function(){location.reload();}, 900); })
        .catch(function(e){ msg(document.getElementById('a-msg-estoque'), (e && e.message) || 'Erro.', false); });
    });
    var salvarOlisek = document.getElementById('f-salvar-olisek');
    if (salvarOlisek) salvarOlisek.addEventListener('click', function(){
      var data = {
        olisekId: document.getElementById('f-olisek-id').value,
        olisekName: document.getElementById('f-olisek-name').value,
        linkStatus: document.getElementById('f-olisek-status').value,
      };
      post('/api/admin/products/' + PRODUCT_ID + '/olisek', 'PUT', data)
        .then(function(){ msg(document.getElementById('a-msg-olisek'), 'Vínculo OliSek atualizado.', true); setTimeout(function(){location.reload();}, 900); })
        .catch(function(e){ msg(document.getElementById('a-msg-olisek'), (e && e.message) || (e && e.error) || 'Erro.', false); });
    });
    var syncOlisek = document.getElementById('f-sync-olisek');
    if (syncOlisek) syncOlisek.addEventListener('click', function(){
      syncOlisek.disabled = true; syncOlisek.textContent = 'Sincronizando...';
      post('/api/admin/products/' + PRODUCT_ID + '/olisek/sync', 'POST')
        .then(function(){ msg(document.getElementById('a-msg-olisek'), 'Estoque sincronizado com a OliSek.', true); setTimeout(function(){location.reload();}, 900); })
        .catch(function(e){
          syncOlisek.disabled = false; syncOlisek.textContent = 'Sincronizar agora com a OliSek';
          msg(document.getElementById('a-msg-olisek'), (e && e.error) || (e && e.message) || 'Erro ao sincronizar.', false);
        });
    });
    var despub = document.getElementById('f-despublicar');
    if (despub) despub.addEventListener('click', function(){
      if (!confirm('Despublicar este produto? Ele some do site, mas o histórico é mantido.')) return;
      post('/api/admin/products/' + PRODUCT_ID, 'DELETE').then(function(){ location.href = '/admin/produtos'; });
    });
    var fileInput = document.getElementById('a-file-input');
    if (fileInput) fileInput.addEventListener('change', function(){
      var file = fileInput.files[0]; if (!file) return;
      var drop = document.getElementById('a-drop');
      drop.textContent = 'Enviando foto…';
      prepararFoto(file).then(function(dataUrl){
        return post('/api/admin/products/' + PRODUCT_ID + '/images', 'POST', { dataUrl: dataUrl });
      }).then(function(){ location.reload(); })
        .catch(function(e){
          drop.textContent = 'Clique para escolher uma foto (JPG, PNG ou WEBP)';
          msg(document.getElementById('a-msg-topo'), (e && e.message) || 'Erro ao enviar imagem.', false);
        });
    });
    document.querySelectorAll('#a-imgs [data-action]').forEach(function(b){
      b.addEventListener('click', function(){
        var imgId = b.closest('.a-img').dataset.id;
        if (b.dataset.action === 'del') {
          if (!confirm('Excluir esta foto?')) return;
          post('/api/admin/products/' + PRODUCT_ID + '/images/' + imgId, 'DELETE').then(function(){ location.reload(); });
        } else {
          post('/api/admin/products/' + PRODUCT_ID + '/images/' + imgId + '/main', 'PUT').then(function(){ location.reload(); });
        }
      });
    });` : ''}
  </script>`;
  return html(200, layout({ title: isNew ? 'Novo produto' : p.name, user, active: 'produtos', body }));
}

const SOURCE_LABELS = {
  olisek_api: 'OliSek (API)', olisek_import: 'OliSek (relatório)', manual: 'Manual', none: 'Nunca confirmado',
};

/** /admin/estoque — visão geral (só admin): saldos, estoque baixo/zerado,
 *  últimas movimentações, exportação CSV, sincronização em lote com a
 *  OliSek e backup completo. */
export function stockPage(user, { overview, movements, filtro, olisekConfigured, autoSync, snapshots = [] }) {
  const { products, totals } = overview;
  const filtros = [
    ['todos', 'Todos', () => true],
    ['baixo', `Estoque baixo (1–${LOW_STOCK_THRESHOLD})`, (p) => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD],
    ['zerado', 'Zerados', (p) => p.stock <= 0],
    ['nao_confirmado', 'Origem não confirmada', (p) => p.stockSource === 'none'],
  ];
  const atual = filtros.find(([k]) => k === filtro) || filtros[0];
  const lista = products.filter(atual[2]);
  const tabs = filtros.map(([k, label, fn]) =>
    `<a class="a-tab${k === atual[0] ? ' a-tab--ativo' : ''}" href="/admin/estoque${k === 'todos' ? '' : '?filtro=' + k}">${escapeHTML(label)} (${products.filter(fn).length})</a>`).join('');
  const linhas = lista.map((p) => {
    const cls = p.stock <= 0 ? 'badge-danger' : p.stock <= LOW_STOCK_THRESHOLD ? 'badge-warn' : 'badge-ok';
    return `<tr>
      <td><a href="/admin/produtos/${p.id}">${escapeHTML(p.name)}</a><div class="a-help">${escapeHTML(p.brand || '—')}${p.active ? '' : ' · despublicado'}</div></td>
      <td><span class="badge ${cls}">${p.stock}</span></td>
      <td>${escapeHTML(SOURCE_LABELS[p.stockSource] || p.stockSource)}${p.olisekSyncedAt ? `<div class="a-help">sinc. ${escapeHTML(p.olisekSyncedAt)}</div>` : ''}</td>
      <td>${p.olisekId ? escapeHTML(String(p.olisekId)) : '<span class="a-help">—</span>'}</td>
      <td>${p.lastMovementAt ? escapeHTML(p.lastMovementAt) : '<span class="a-help">—</span>'}</td>
    </tr>`;
  }).join('');
  const movs = movements.map((m) => `<tr>
      <td>${escapeHTML(m.createdAt)}</td>
      <td><a href="/admin/produtos/${m.productId}">${escapeHTML(m.productName)}</a></td>
      <td>${escapeHTML(m.kindLabel)}</td>
      <td>${m.quantity > 0 ? '+' : ''}${m.quantity}</td>
      <td>${m.stockBefore} → ${m.stockAfter}</td>
      <td>${escapeHTML(m.reason || '')}</td>
      <td>${escapeHTML(m.userName || '—')}</td>
    </tr>`).join('');

  const body = `
  <div class="a-wrap">
    <h1>Estoque</h1>
    <p class="a-sub">${totals.produtos} produtos · ${totals.unidades} unidades no total · ${totals.baixos} com estoque baixo · ${totals.zerados} zerados.</p>
    <div id="a-msg-estoque"></div>
    <div class="a-row" style="margin-bottom:16px; gap:8px; flex-wrap:wrap">
      <a class="btn btn-ghost btn-sm" href="/admin/estoque.csv">Baixar saldos (CSV)</a>
      <a class="btn btn-ghost btn-sm" href="/admin/estoque/movimentacoes.csv">Baixar movimentações (CSV)</a>
      ${olisekConfigured ? '<button class="btn btn-gold btn-sm" id="a-sync-todos" type="button">Sincronizar todos com a OliSek</button>' : ''}
      <a class="btn btn-ghost btn-sm" href="/api/admin/backup">Baixar cópia dos dados agora</a>
    </div>
    <p class="a-help">${olisekConfigured
      ? `Sincronização com a OliSek: ${autoSync ? '<b>automática ligada</b> (a cada 30 minutos, só vínculos confirmados)' : 'sob demanda (botão acima ou na tela de cada produto)'}.`
      : 'API da OliSek não configurada — a sincronização fica desligada (ver docs/OLISEK-INTEGRATION.md).'}
</p>
    <div class="a-tabs">${tabs}</div>
    <div class="a-card">
      <table>
        <thead><tr><th>Produto</th><th>Saldo</th><th>Origem</th><th>ID OliSek</th><th>Última movimentação</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="5" class="a-help">Nenhum produto neste filtro.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="a-card">
      <h2>Backups automáticos</h2>
      <p class="a-help">${snapshots.length
        ? `O sistema guarda sozinho uma cópia dos dados por semana (as ${KEEP_SNAPSHOTS} mais recentes). Última cópia: <b>${escapeHTML(snapshots[0].createdAt)}</b> (horário UTC).`
        : 'O sistema faz sozinho uma cópia dos dados por semana. A primeira sai em até 30 minutos depois da publicação.'}
        Fotos apagadas ficam guardadas por ${TRASH_DAYS} dias antes de sumir de vez. Ninguém precisa fazer nada — os links abaixo são só para emergências.
        Os arquivos baixados contêm os códigos das senhas da equipe: guarde em lugar privado.</p>
      ${snapshots.length ? `<div class="a-hist"><table>
        <thead><tr><th>Cópia</th><th>Quando (UTC)</th><th>Produtos</th><th>Movimentações</th><th></th></tr></thead>
        <tbody>${snapshots.map((s) => `<tr><td>#${s.id}</td><td>${escapeHTML(s.createdAt)}</td><td>${Number(s.summary.products || 0)}</td><td>${Number(s.summary.stock_movements || 0)}</td>
          <td><a class="btn btn-ghost btn-sm" href="/api/admin/backups/${s.id}">Baixar</a></td></tr>`).join('')}</tbody>
      </table></div>` : ''}
    </div>
    <div class="a-card">
      <h2>Últimas movimentações</h2>
      <div class="a-hist"><table>
        <thead><tr><th>Quando</th><th>Produto</th><th>Tipo</th><th>Qtde</th><th>Saldo</th><th>Motivo</th><th>Quem</th></tr></thead>
        <tbody>${movs || '<tr><td colspan="7" class="a-help">Nenhuma movimentação ainda.</td></tr>'}</tbody>
      </table></div>
    </div>
  </div>
  <script>
    var btn = document.getElementById('a-sync-todos');
    if (btn) btn.addEventListener('click', function(){
      if (!confirm('Buscar o estoque atual de todos os produtos com vínculo confirmado na OliSek?')) return;
      btn.disabled = true; btn.textContent = 'Sincronizando…';
      fetch('/api/admin/stock/olisek-sync', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })
        .then(function(r){ return r.json(); })
        .then(function(d){
          var el = document.getElementById('a-msg-estoque'), box = document.createElement('div');
          var r = d.report;
          box.className = 'a-msg ' + (r && !r.erros.length ? 'a-msg-ok' : 'a-msg-err');
          box.textContent = r ? (r.atualizados + ' atualizado(s), ' + r.semMudanca + ' sem mudança, ' + r.erros.length + ' erro(s) de ' + r.total + '.') : (d.message || d.error || 'Erro.');
          el.innerHTML = ''; el.appendChild(box);
          btn.disabled = false; btn.textContent = 'Sincronizar todos com a OliSek';
        });
    });
  </script>`;
  return html(200, layout({ title: 'Estoque', user, active: 'estoque', body }));
}

