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
      <a class="a-brand" href="/admin/produtos">Essência Natural · Admin</a>
      <div class="a-user">
        <span>${escapeHTML(user.name)} · ${user.role === 'admin' ? 'Administração' : 'Vendedora'}</span>
        <a href="/admin/produtos"${active === 'produtos' ? ' class="a-nav-ativo"' : ''}>Produtos</a>
        ${user.role === 'admin' ? `<a href="/admin/fotos"${active === 'fotos' ? ' class="a-nav-ativo"' : ''}>Fotos</a>` : ''}
        ${user.role === 'admin' ? `<a href="/admin/equipe"${active === 'equipe' ? ' class="a-nav-ativo"' : ''}>Equipe</a>` : ''}
        ${user.role === 'admin' ? `<a href="/admin/ferramentas"${active === 'ferramentas' ? ' class="a-nav-ativo"' : ''}>Ferramentas</a>` : ''}
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
          location.href = res.d.user.mustChangePassword ? '/admin/trocar-senha' : '/admin/produtos';
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
          location.href = '/admin/produtos';
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

/** Ferramentas (/admin/ferramentas): arrumar nomes e padronizar fotos em
 *  poucos cliques. As regras rodam aqui no navegador
 *  (/assets/js/regras-catalogo.mjs); a pessoa confere a prévia, desmarca o
 *  que não quiser e aplica — o servidor só grava o que foi aprovado. */
export function ferramentasPage(user) {
  const body = `
  <div class="a-wrap">
    <h1>Ferramentas</h1>
    <p class="a-sub">Arrumações em lote, com prévia antes de gravar. Siga na ordem, de cima para baixo. Nada muda no site até você clicar em <b>Aplicar</b>.</p>

    <div class="a-card a-ferr" id="f-nomes">
      <h2><span class="a-passo">1</span> Arrumar nomes</h2>
      <p class="a-help">Tira do nome a marca, o volume e a concentração repetidos (eles já aparecem ao lado) e arruma nomes em MAIÚSCULAS. Ex.: "AL WATANIAH EQAAB EDP H 100ML" vira "Eqaab", com 100 ml e EDP nos campos certos.</p>
      <button class="btn btn-gold" type="button" data-acao="nomes">Verificar nomes</button>
      <div class="a-ferr-res" aria-live="polite"></div>
    </div>

    <div class="a-card a-ferr" id="f-vitrine">
      <h2><span class="a-passo">2</span> Montar a vitrine</h2>
      <p class="a-help">Deixa no site o que a loja tem: publica os produtos do relatório da loja que têm foto e oculta os do catálogo importado que não estão no relatório. Os cadastros feitos pela loja não mudam. Dá para desfazer a qualquer hora pela lista de produtos.</p>
      <button class="btn btn-gold" type="button" data-acao="vitrine">Ver o que muda</button>
      <div class="a-ferr-res" aria-live="polite"></div>
    </div>

    <div class="a-card a-ferr" id="f-fotos">
      <h2><span class="a-passo">3</span> Padronizar fotos</h2>
      <p class="a-help">Troca as fotos antigas dos cadastros da loja (tiradas no balcão / Instagram) pela foto de fundo limpo do mesmo perfume no catálogo importado. As fotos antigas ficam guardadas por 90 dias. Confira cada par antes de aplicar.</p>
      <button class="btn btn-gold" type="button" data-acao="fotos">Procurar pares</button>
      <div class="a-ferr-res" aria-live="polite"></div>
    </div>

    <div class="a-card a-ferr" id="f-hd">
      <h2><span class="a-passo">4</span> Fotos em alta definição</h2>
      <p class="a-help">As fotos do catálogo importado foram guardadas pequenas. Aqui o painel busca de novo a foto original no fornecedor e grava uma versão maior e mais nítida (até 1200 px) dos produtos publicados. A versão pequena fica guardada por 90 dias. Deixe esta página aberta até terminar.</p>
      <button class="btn btn-gold" type="button" data-acao="hd">Procurar fotos</button>
      <div class="a-ferr-res" aria-live="polite"></div>
    </div>
  </div>
  <script type="module">
    const R = await import('/assets/js/regras-catalogo.mjs?v=20261029-3');
    let cache = null;
    function el(tag, cls, txt){ const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    async function lerTodos(aviso){
      if (cache) return cache;
      const todos = []; let depois = 0;
      for (;;) {
        aviso.textContent = 'Lendo produtos… ' + todos.length;
        const r = await fetch('/api/admin/ferramentas/produtos?depois=' + depois);
        if (!r.ok) throw new Error('Não foi possível ler os produtos.');
        const d = await r.json();
        todos.push(...d.produtos);
        if (d.fim || !d.produtos.length) break;
        depois = d.produtos[d.produtos.length - 1].id;
      }
      cache = todos; return todos;
    }
    async function enviar(url, campo, itens, lote, aviso){
      let feitos = 0;
      for (let i = 0; i < itens.length; i += lote) {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [campo]: itens.slice(i, i + lote) }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Erro ao gravar.');
        feitos = Math.min(itens.length, i + lote);
        aviso.textContent = 'Gravando… ' + feitos + ' de ' + itens.length;
      }
    }
    function barraAcoes(res, total, aplicar){
      const barra = el('div', 'a-row a-ferr-acoes');
      const todos = el('label'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = true; todos.append(cb, ' Marcar todos');
      cb.addEventListener('change', () => res.querySelectorAll('.a-ferr-cb').forEach((x) => { x.checked = cb.checked; }));
      const btn = el('button', 'btn btn-gold', 'Aplicar'); btn.type = 'button';
      btn.addEventListener('click', aplicar);
      barra.append(todos, btn);
      return barra;
    }

    async function nomes(card){
      const res = card.querySelector('.a-ferr-res'); res.textContent = '';
      const aviso = el('p', 'a-help'); res.appendChild(aviso);
      const todos = await lerTodos(aviso);
      const lista = R.mudancasDeNomes(todos);
      aviso.textContent = lista.length ? lista.length + ' nome(s) para arrumar, de ' + todos.length + ' produtos. Desmarque o que não quiser mudar.' : 'Tudo certo: nenhum nome para arrumar (' + todos.length + ' produtos).';
      if (!lista.length) return;
      const tabela = el('div', 'a-ferr-lista');
      lista.forEach((m, i) => {
        const linha = el('label', 'a-ferr-linha');
        const cb = el('input', 'a-ferr-cb'); cb.type = 'checkbox'; cb.checked = true; cb.dataset.i = i;
        const antes = el('span', 'a-ferr-antes', m.antes.name);
        const depois = el('span', 'a-ferr-depois', m.depois.name + [m.depois.concentration, m.depois.volume].filter(Boolean).map((x) => ' · ' + x).join(''));
        const marca = el('span', 'a-help', m.antes.brand || '');
        linha.append(cb, antes, el('span', 'a-ferr-seta', '→'), depois, marca);
        tabela.appendChild(linha);
      });
      res.append(barraAcoes(res, lista.length, async () => {
        const marcados = [...res.querySelectorAll('.a-ferr-cb:checked')].map((x) => lista[+x.dataset.i]);
        if (!marcados.length) return;
        if (!confirm('Gravar ' + marcados.length + ' nome(s)?')) return;
        try {
          await enviar('/api/admin/ferramentas/nomes', 'mudancas', marcados.map((m) => ({ id: m.id, ...m.depois })), 300, aviso);
          cache = null; res.textContent = ''; res.appendChild(el('div', 'a-msg a-msg-ok', marcados.length + ' nome(s) arrumado(s). Já aparecem no site.'));
        } catch (e) { aviso.textContent = e.message; }
      }), tabela);
    }

    async function fotos(card){
      const res = card.querySelector('.a-ferr-res'); res.textContent = '';
      const aviso = el('p', 'a-help'); res.appendChild(aviso);
      const todos = await lerTodos(aviso);
      const { pares, semPar } = R.paresDeFotos(todos);
      aviso.textContent = pares.length
        ? pares.length + ' cadastro(s) da loja com foto nova disponível. Confira cada par: o da esquerda é a foto atual, o da direita a nova.'
        : 'Nenhum par novo encontrado.';
      if (pares.length) {
        const grade = el('div', 'a-ferr-pares');
        pares.forEach((par, i) => {
          const item = el('label', 'a-ferr-par' + (par.exato ? '' : ' a-ferr-par--confira'));
          const cb = el('input', 'a-ferr-cb'); cb.type = 'checkbox'; cb.checked = true; cb.dataset.i = i;
          const fotos = el('span', 'a-ferr-fotos');
          const a = new Image(); a.src = par.imagem || '/assets/images/placeholder-produto.svg'; a.alt = ''; a.loading = 'lazy';
          const b = new Image(); b.src = par.deImagem; b.alt = ''; b.loading = 'lazy';
          fotos.append(a, el('span', 'a-ferr-seta', '→'), b);
          const txt = el('span', 'a-ferr-txt');
          txt.append(el('b', null, par.nome), el('span', 'a-help', '→ ' + par.deNome));
          if (!par.exato) txt.appendChild(el('span', 'badge badge-warn', 'confira: nome parecido'));
          item.append(cb, fotos, txt);
          grade.appendChild(item);
        });
        res.append(barraAcoes(res, pares.length, async () => {
          const marcados = [...res.querySelectorAll('.a-ferr-cb:checked')].map((x) => pares[+x.dataset.i]);
          if (!marcados.length) return;
          if (!confirm('Trocar a foto de ' + marcados.length + ' produto(s)?')) return;
          try {
            await enviar('/api/admin/ferramentas/fotos', 'pares', marcados.map((p) => ({ id: p.id, de: p.de })), 50, aviso);
            cache = null; res.textContent = ''; res.appendChild(el('div', 'a-msg a-msg-ok', marcados.length + ' foto(s) trocada(s). As antigas ficam guardadas por 90 dias.'));
          } catch (e) { aviso.textContent = e.message; }
        }), grade);
      }
      if (semPar.length) {
        const det = el('details', 'a-ferr-sem');
        det.appendChild(el('summary', null, semPar.length + ' cadastro(s) da loja sem foto equivalente no catálogo importado'));
        const ul = el('ul'); semPar.forEach((p) => { const li = el('li'); const a = el('a', null, [p.marca, p.nome].filter(Boolean).join(' ')); a.href = '/admin/produtos/' + p.id; li.appendChild(a); ul.appendChild(li); });
        det.append(el('p', 'a-help', 'Esses continuam com a foto atual. Você pode enviar uma foto nova ou ocultar o produto pela tela dele.'), ul);
        res.appendChild(det);
      }
    }

    async function vitrine(card){
      const res = card.querySelector('.a-ferr-res'); res.textContent = '';
      const aviso = el('p', 'a-help', 'Conferindo…'); res.appendChild(aviso);
      const r = await fetch('/api/admin/ferramentas/vitrine');
      if (!r.ok) throw new Error('Não foi possível ler os produtos.');
      const d = await r.json();
      aviso.textContent = 'Hoje há ' + d.publicados + ' produto(s) publicados no site.';
      if (!d.publicar.total && !d.ocultar.total) { res.appendChild(el('div', 'a-msg a-msg-ok', 'A vitrine já está montada: nada para mudar.')); return; }
      const parte = (chave, titulo, info) => {
        const box = el('label', 'a-ferr-op');
        const cb = el('input', 'a-ferr-cb'); cb.type = 'checkbox'; cb.checked = info.total > 0; cb.disabled = !info.total; cb.dataset.parte = chave;
        const txt = el('span', 'a-ferr-txt'); txt.appendChild(el('b', null, titulo.replace('{n}', info.total)));
        if (info.exemplos.length) {
          const det = el('details'); det.appendChild(el('summary', 'a-help', 'Ver ' + (info.total > info.exemplos.length ? 'alguns' : 'quais')));
          const ul = el('ul'); info.exemplos.forEach((x) => { const li = el('li'); const a = el('a', null, [x.marca, x.nome].filter(Boolean).join(' ')); a.href = '/admin/produtos/' + x.id; a.target = '_blank'; li.appendChild(a); ul.appendChild(li); });
          if (info.total > info.exemplos.length) ul.appendChild(el('li', 'a-help', '… e mais ' + (info.total - info.exemplos.length)));
          det.appendChild(ul); txt.appendChild(det);
        }
        box.append(cb, txt); return box;
      };
      res.append(parte('publicar', 'Publicar {n} produto(s) do relatório da loja', d.publicar), parte('ocultar', 'Ocultar {n} produto(s) do catálogo importado que não estão no relatório', d.ocultar));
      if (d.semFoto) res.appendChild(el('p', 'a-help', d.semFoto + ' produto(s) do relatório estão sem foto e continuam ocultos até ganharem uma.'));
      const btn = el('button', 'btn btn-gold', 'Aplicar'); btn.type = 'button';
      btn.addEventListener('click', async () => {
        const quer = (k) => !!res.querySelector('[data-parte="' + k + '"]:checked');
        const pub = quer('publicar'), oc = quer('ocultar');
        if (!pub && !oc) return;
        if (!confirm([pub && 'publicar ' + d.publicar.total, oc && 'ocultar ' + d.ocultar.total].filter(Boolean).join(' e ') + ' produto(s)?')) return;
        btn.disabled = true;
        const r2 = await fetch('/api/admin/ferramentas/vitrine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicar: pub, ocultar: oc }) });
        const x = await r2.json().catch(() => ({}));
        cache = null; res.textContent = '';
        res.appendChild(r2.ok ? el('div', 'a-msg a-msg-ok', 'Pronto: ' + x.publicados + ' publicado(s) e ' + x.ocultados + ' ocultado(s). Já vale no site.') : el('div', 'a-msg a-msg-err', x.message || 'Não deu certo. Tente de novo.'));
      });
      res.appendChild(btn);
    }

    // ---- fotos em alta definição ----
    const LADO_HD = 1200;
    function lerArquivo(arquivo){ return new Promise((ok, falha) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => falha(new Error('Não deu para ler o arquivo.')); fr.readAsText(arquivo); }); }
    function escolherCatalogo(res, texto, depois){
      const box = el('div', 'a-ferr-arquivo');
      box.appendChild(el('p', 'a-help', texto));
      const rotulo = el('label', 'btn btn-ghost', 'Escolher o catalog.json');
      const input = el('input'); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
      rotulo.appendChild(input); box.appendChild(rotulo);
      const st = el('p', 'a-help'); box.appendChild(st);
      input.addEventListener('change', async () => {
        const f = input.files[0]; if (!f) return;
        try {
          st.textContent = 'Lendo o arquivo…';
          const cat = JSON.parse(await lerArquivo(f));
          const vistos = new Map();
          for (const p of (cat.products || [])) for (const im of (p.images || [])) if (im && im.sha256 && im.url && !vistos.has(im.sha256)) vistos.set(im.sha256, { sha: im.sha256, url: im.url });
          const itens = [...vistos.values()];
          if (!itens.length) throw new Error('Esse arquivo não parece ser o catalog.json do pacote.');
          await enviar('/api/admin/ferramentas/origens', 'itens', itens, 1000, st);
          depois();
        } catch (e) { st.textContent = e.message || 'Não deu certo.'; }
      });
      res.appendChild(box);
    }
    async function blobDe(url){ const r = await fetch(url); if (!r.ok) throw new Error('foto ' + r.status); return r.blob(); }
    function codificar(bmp){
      const escala = Math.min(1, LADO_HD / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * escala), h = Math.round(bmp.height * escala);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
      const em = (tipo, q) => new Promise((ok) => cv.toBlob(ok, tipo, q));
      return em('image/webp', 0.9).then((b) => (b && b.type === 'image/webp' ? b : em('image/jpeg', 0.9))).then((b) => ({ blob: b, lado: Math.max(w, h) }));
    }
    async function melhorar(f){
      const [orig, atual] = await Promise.all([blobDe('/api/admin/ferramentas/hd/original?sha=' + f.sha), blobDe(f.image)]);
      const [bo, ba] = await Promise.all([createImageBitmap(orig), createImageBitmap(atual)]);
      const ladoNovo = Math.min(LADO_HD, Math.max(bo.width, bo.height)), ladoAtual = Math.max(ba.width, ba.height);
      // Só troca se ganha tamanho, ou se o original é bem mais nítido (menos comprimido).
      if (ladoNovo < ladoAtual * 1.15 && orig.size < atual.size * 2.5) return 'igual';
      const { blob } = await codificar(bo);
      const r = await fetch('/api/admin/ferramentas/hd?sha=' + f.sha, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
      if (!r.ok) throw new Error('gravar ' + r.status);
      return (await r.json()).image;
    }
    async function hd(card){
      const res = card.querySelector('.a-ferr-res'); res.textContent = '';
      const aviso = el('p', 'a-help', 'Conferindo…'); res.appendChild(aviso);
      const r = await fetch('/api/admin/ferramentas/hd');
      if (!r.ok) throw new Error('Não foi possível ler as fotos.');
      const d = await r.json();
      const deNovo = () => hd(card);
      if (!d.origens) {
        aviso.textContent = '';
        escolherCatalogo(res, 'Só na primeira vez: escolha o arquivo catalog.json, que fica na pasta "catalogo" do computador (a mesma usada na importação). O painel guarda o endereço de cada foto original e não pede mais.', deNovo);
        return;
      }
      aviso.textContent = d.fotos.length ? d.fotos.length + ' foto(s) de produtos publicados podem ficar em alta definição.' : 'Todas as fotos dos produtos publicados já estão em alta (ou não têm original conhecido).';
      if (d.fotos.length) {
        const barra = el('div', 'a-row a-ferr-acoes');
        const btn = el('button', 'btn btn-gold', 'Melhorar ' + d.fotos.length + ' foto(s)'); btn.type = 'button';
        const parar = el('button', 'btn btn-ghost', 'Parar'); parar.type = 'button'; parar.hidden = true;
        barra.append(btn, parar); res.appendChild(barra);
        const prog = el('progress', 'a-ferr-prog'); prog.max = d.fotos.length; prog.value = 0; prog.hidden = true;
        const st = el('p', 'a-help'); const grade = el('div', 'a-ferr-hd');
        res.append(prog, st, grade);
        let parou = false; parar.addEventListener('click', () => { parou = true; parar.disabled = true; });
        btn.addEventListener('click', async () => {
          btn.disabled = true; parar.hidden = false; prog.hidden = false;
          const fila = d.fotos.slice(); const c = { ok: 0, igual: 0, falha: 0 };
          const conta = () => { prog.value = c.ok + c.igual + c.falha; st.textContent = prog.value + ' de ' + d.fotos.length + ' · ' + c.ok + ' melhorada(s) · ' + c.igual + ' já estava(m) boa(s) · ' + c.falha + ' sem resposta do fornecedor'; };
          const trabalhador = async () => {
            while (fila.length && !parou) {
              const f = fila.shift();
              try {
                const nova = await melhorar(f);
                if (nova === 'igual') c.igual++;
                else { c.ok++; if (grade.children.length < 24) { const im = new Image(); im.src = nova; im.alt = f.nome; im.title = f.nome; grade.appendChild(im); } }
              } catch { c.falha++; }
              conta();
            }
          };
          await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
          parar.hidden = true;
          st.textContent = (parou ? 'Parado. ' : 'Pronto. ') + c.ok + ' foto(s) em alta definição, ' + c.igual + ' já estava(m) boa(s), ' + c.falha + ' sem resposta do fornecedor.' + (c.falha ? ' Dá para tentar de novo depois: só as que faltam aparecem.' : '');
        });
      }
      const det = el('details', 'a-ferr-sem');
      det.appendChild(el('summary', 'a-help', 'Atualizar com outro catalog.json'));
      res.appendChild(det);
      escolherCatalogo(det, 'Use quando chegar um pacote novo do catálogo.', deNovo);
    }

    const ACOES = { nomes, vitrine, fotos, hd };
    document.querySelectorAll('.a-ferr [data-acao]').forEach((b) => b.addEventListener('click', async () => {
      const card = b.closest('.a-ferr'); b.disabled = true;
      try { await ACOES[b.dataset.acao](card); }
      catch (e) { card.querySelector('.a-ferr-res').textContent = e.message || 'Algo deu errado. Tente de novo.'; }
      finally { b.disabled = false; }
    }));
  </script>`;
  return html(200, layout({ title: 'Ferramentas', user, active: 'ferramentas', body }));
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

