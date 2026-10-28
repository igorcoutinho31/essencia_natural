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

function layout({ title, user, active, body }) {
  const nav = user ? `
    <header class="a-top">
      <a class="a-brand" href="/admin/produtos">Essência Natural · Admin</a>
      <div class="a-user">
        <span>${escapeHTML(user.name)} · ${user.role === 'admin' ? 'Administração' : 'Vendedora'}</span>
        <a href="/admin/produtos"${active === 'produtos' ? ' class="a-nav-ativo"' : ''}>Produtos</a>
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
  ['foto_pendente', 'Foto a liberar'],
  ['da_loja', 'Cadastros da loja'],
  ['biblioteca', 'Biblioteca'],
  ['sem_preco', 'Sem preço'],
  ['sem_imagem', 'Sem imagem'],
  ['em_estoque', 'Em estoque'],
  ['estoque_baixo', 'Estoque baixo'],
  ['zerados', 'Estoque zerado'],
  ['vendidos', 'Vendidos'],
  ['sem_vinculo', 'Sem vínculo OliSek'],
  ['precisa_revisao', 'Precisa revisão'],
];

const SOURCE_NAMES = { atlantico: 'Atlântico', onuh: 'ONUH' };

function origemBadge(p) {
  if (!p.source) return '<span class="badge badge-ok">Loja</span>';
  return `<span class="badge badge-muted" title="Cadastro da biblioteca de fornecedores">${escapeHTML(SOURCE_NAMES[p.source] || p.source)}</span>`;
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
        ${p.inStoreReport ? `<span class="badge badge-ok" title="${escapeHTML(p.storeReportName || '')}">no relatório da loja</span>` : ''}
        ${p.pendingImages ? '<span class="badge badge-warn" title="Só aparece no site depois que a loja liberar o uso da foto">foto a liberar</span>' : ''}</td>
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
        <select name="origem"><option value="">Todas as origens</option>${opt('loja', 'Cadastros da loja', source === 'loja')}${opt('atlantico', 'Atlântico', source === 'atlantico')}${opt('onuh', 'ONUH', source === 'onuh')}</select>
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
          <option value="liberar_fotos">Liberar fotos (fornecedor autorizou)</option>
          <option value="bloquear_fotos">Bloquear fotos da biblioteca</option>
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
            ${img.licensed ? '' : '<span class="badge badge-warn a-img-pend" title="Foto de fornecedor: só aparece no site depois de liberada">a liberar</span>'}
            <div class="a-img-actions">
              <button type="button" data-action="main" title="Definir como principal">★</button>
              <button type="button" data-action="del" title="Excluir">🗑</button>
            </div>
          </div>`).join('')}
      </div>
      <label class="a-drop" for="a-file-input" id="a-drop">Clique para escolher uma foto (JPG, PNG ou WEBP)</label>
      <input type="file" id="a-file-input" accept="image/jpeg,image/png,image/webp" style="display:none">
      <p class="a-help">A foto é reduzida automaticamente (até 1600px, formato WEBP) antes de ir para o site — pode mandar direto da câmera do celular.</p>
      ${isAdmin && p.pendingImages ? `<p class="a-help"><b>${p.pendingImages} foto(s) de fornecedor ainda não liberada(s)</b> — só aparecem aqui no admin. Libere quando a loja confirmar que o fornecedor autoriza o uso, ou envie uma foto própria.</p>
        <button class="btn btn-ghost btn-sm" type="button" id="f-liberar-fotos">Liberar fotos deste produto</button>` : ''}
    </div>`;

  const body = `
  <div class="a-wrap">
    <p><a href="/admin/produtos">&larr; Voltar para produtos</a></p>
    <h1>${isNew ? 'Novo produto' : escapeHTML(p.name)}</h1>
    ${!isNew && p.source ? `<p class="a-help">Cadastro da biblioteca de fornecedores: <b>${escapeHTML(SOURCE_NAMES[p.source] || p.source)}</b>${p.sourceUrl ? ` · <a href="${escapeHTML(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">ver página de origem</a>` : ''}${p.concentration ? ` · ${escapeHTML(p.concentration)}` : ''}</p>` : ''}
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
    var liberar = document.getElementById('f-liberar-fotos');
    if (liberar) liberar.addEventListener('click', function(){
      if (!confirm('A loja confirmou que o fornecedor autoriza usar estas fotos no site?')) return;
      post('/api/admin/products/bulk', 'POST', { action: 'liberar_fotos', ids: [PRODUCT_ID] }).then(function(){ location.reload(); })
        .catch(function(e){ msg(document.getElementById('a-msg-topo'), (e && e.message) || 'Erro.', false); });
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

