// Páginas HTML do /admin — renderizadas no servidor (sem framework), estilo
// "back office" simples. A parte interativa (salvar preço, subir foto,
// reordenar) usa fetch() para as rotas JSON de server/routes/adminApi.js;
// a sessão viaja sozinha pelo cookie httpOnly, nunca por token no JS.
'use strict';

const catalogService = require('../services/catalogService');
const { sendHTML, escapeHTML } = require('../util');

function layout({ title, user, active, body }) {
  const nav = user ? `
    <header class="a-top">
      <a class="a-brand" href="/admin/produtos">Essência Natural · Admin</a>
      <div class="a-user">
        <span>${escapeHTML(user.name)} · ${user.role === 'admin' ? 'Administração' : 'Vendedora'}</span>
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

function loginPage(req, res, { error } = {}) {
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
  sendHTML(res, 200, layout({ title: 'Entrar', user: null, body }));
}

function changePasswordPage(req, res, user) {
  const body = `
  <div class="a-wrap" style="max-width:420px">
    <div class="a-card">
      <h1>Trocar senha</h1>
      <p class="a-sub">${user.must_change_password ? 'Essa é sua senha temporária — defina uma senha definitiva para continuar.' : 'Defina uma nova senha de acesso.'}</p>
      <div id="a-msg"></div>
      <form id="a-pass-form">
        ${user.must_change_password ? '' : '<div class="a-field"><label>Senha atual</label><input type="password" name="currentPassword" required></div>'}
        <div class="a-field"><label>Nova senha (mín. 6 caracteres)</label><input type="password" name="newPassword" minlength="6" required></div>
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
          if (!res.ok) { msg.innerHTML = '<div class="a-msg a-msg-err">' + (res.d.message || 'Erro.') + '</div>'; return; }
          location.href = '/admin/produtos';
        });
    });
  </script>`;
  sendHTML(res, 200, layout({ title: 'Trocar senha', user, body }));
}

function stockBadge(p) {
  const cls = p.stockLabel === 'Em estoque' ? 'badge-ok' : p.stockLabel === 'Últimas unidades' ? 'badge-warn' : 'badge-danger';
  return `<span class="badge ${cls}">${escapeHTML(p.stockLabel)}</span>`;
}

function productsListPage(req, res, user, { q }) {
  const products = catalogService.getAdminProducts({ q });
  const rows = products.map((p) => `
    <tr>
      <td>${p.olisekId ? `<span class="badge ${p.olisekMatchConfidence === 'provavel' ? 'badge-warn' : 'badge-ok'}" title="ID OliSek ${p.olisekId}">OliSek</span>` : '<span class="badge badge-muted">Aguardando vínculo</span>'}</td>
      <td>${escapeHTML(p.name)}<div class="a-help">${escapeHTML(p.brand || '—')}</div></td>
      <td>${p.price != null ? 'R$ ' + Number(p.price).toFixed(2).replace('.', ',') : '<span class="a-help">Consulte</span>'}</td>
      <td>${stockBadge(p)}</td>
      <td>${p.active ? '<span class="badge badge-ok">Publicado</span>' : '<span class="badge badge-muted">Oculto</span>'}</td>
      <td>${p.featured ? '★' : ''}</td>
      <td><a class="btn btn-ghost btn-sm" href="/admin/produtos/${p.id}">Editar</a></td>
    </tr>`).join('');

  const body = `
  <div class="a-wrap">
    <div class="a-row" style="justify-content:space-between; margin-bottom:16px">
      <div>
        <h1>Produtos</h1>
        <p class="a-sub">${products.length} produto${products.length === 1 ? '' : 's'} no catálogo.</p>
      </div>
      ${user.role === 'admin' ? '<a class="btn btn-gold" href="/admin/produtos/novo">+ Novo produto</a>' : ''}
    </div>
    <div class="a-card">
      <form method="get" class="a-row" style="margin-bottom:14px">
        <input class="a-search" type="search" name="q" placeholder="Buscar por nome, marca ou ID OliSek" value="${escapeHTML(q || '')}">
        <button class="btn btn-ghost btn-sm" type="submit">Buscar</button>
      </form>
      <table>
        <thead><tr><th>Vínculo</th><th>Produto</th><th>Preço</th><th>Estoque</th><th>Site</th><th>Destaque</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="a-help">Nenhum produto encontrado.</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;
  sendHTML(res, 200, layout({ title: 'Produtos', user, active: 'produtos', body }));
}

function productFormPage(req, res, user, product, { brands }) {
  const isNew = !product;
  const isAdmin = user.role === 'admin';
  const p = product || { name: '', brandId: null, category: '', volume: '', gender: '', family: '', description: '',
    notes: { topo: '', coracao: '', fundo: '' }, price: null, comparePrice: null, stock: 0, active: 1, featured: 0,
    olisekId: null, olisekName: null, olisekMatchConfidence: null, images: [], priceHistory: [] };

  const brandOptions = brands.map((b) => `<option value="${b.id}" ${b.id === p.brandId ? 'selected' : ''}>${escapeHTML(b.name)}</option>`).join('');

  const camposBase = `
    <div class="a-grid2">
      <div class="a-field"><label>Nome do produto</label><input type="text" id="f-name" value="${escapeHTML(p.name)}" ${isAdmin ? '' : 'disabled'}></div>
      <div class="a-field"><label>Marca</label>
        <select id="f-brand" ${isAdmin ? '' : 'disabled'}><option value="">—</option>${brandOptions}</select>
      </div>
    </div>
    <div class="a-grid3">
      <div class="a-field"><label>Categoria</label><input type="text" id="f-category" value="${escapeHTML(p.category || '')}" ${isAdmin ? '' : 'disabled'}></div>
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

  const olisekBox = `
    <div class="a-card">
      <h2>Vínculo OliSek</h2>
      ${p.olisekId ? `
        <p>ID <b>${p.olisekId}</b> — ${escapeHTML(p.olisekName || '')}
          ${p.olisekMatchConfidence === 'provavel' ? '<span class="badge badge-warn">correspondência provável — confirmar</span>' : '<span class="badge badge-ok">confirmado</span>'}
        </p>
        <p class="a-help">Estoque de origem: ${p.stockSource === 'olisek_import' ? 'importado da OliSek' : 'ajustado manualmente'}.</p>
      ` : '<p class="a-help">Ainda sem vínculo com a OliSek — estoque é controlado manualmente até a lista completa ser importada (ver docs/OLISEK-INTEGRATION.md).</p>'}
    </div>`;

  const precoBox = isNew ? '' : `
    <div class="a-card">
      <h2>Preço</h2>
      <div id="a-msg-preco"></div>
      <div class="a-grid2">
        <div class="a-field"><label>Preço (R$)</label><input type="number" step="0.01" min="0" id="f-price" value="${p.price ?? ''}" placeholder="deixe em branco = &quot;Consulte&quot;"></div>
        <div class="a-field"><label>Preço &quot;de&quot; (promoção, opcional)</label><input type="number" step="0.01" min="0" id="f-compare-price" value="${p.comparePrice ?? ''}"></div>
      </div>
      <button class="btn btn-gold btn-sm" id="f-salvar-preco" type="button">Salvar preço</button>
      ${isAdmin && p.priceHistory && p.priceHistory.length ? `
        <h2 style="margin-top:18px">Histórico de preço</h2>
        <div class="a-hist"><table>
          <thead><tr><th>Quando</th><th>De</th><th>Para</th><th>Quem</th></tr></thead>
          <tbody>${p.priceHistory.map((h) => `<tr><td>${escapeHTML(h.createdAt)}</td><td>${h.oldPrice != null ? 'R$ ' + Number(h.oldPrice).toFixed(2) : '—'}</td><td>${h.newPrice != null ? 'R$ ' + Number(h.newPrice).toFixed(2) : '—'}</td><td>${escapeHTML(h.userName)}</td></tr>`).join('')}</tbody>
        </table></div>` : ''}
    </div>`;

  const estoqueBox = isNew ? '' : `
    <div class="a-card">
      <h2>Estoque e disponibilidade</h2>
      <div class="a-row">
        <div class="a-field" style="max-width:140px"><label>Estoque (unidades)</label><input type="number" min="0" id="f-stock" value="${p.stock}"></div>
        <label style="margin-top:20px"><input type="checkbox" id="f-active" ${p.active ? 'checked' : ''}> Publicado no site</label>
        <label style="margin-top:20px"><input type="checkbox" id="f-featured" ${p.featured ? 'checked' : ''}> Produto em destaque</label>
      </div>
      <p class="a-help">O cliente nunca vê esse número — só o selo (Em estoque / Últimas unidades / Indisponível).</p>
      <button class="btn btn-ghost btn-sm" id="f-salvar-estoque" type="button">Salvar estoque e disponibilidade</button>
      ${isAdmin ? `<button class="btn btn-danger btn-sm" id="f-despublicar" type="button" style="margin-left:8px">Despublicar produto</button>` : ''}
    </div>`;

  const imagesBox = isNew ? '' : `
    <div class="a-card">
      <h2>Fotos</h2>
      <div class="a-imgs" id="a-imgs">
        ${p.images.map((img) => `
          <div class="a-img ${img.isMain ? 'main' : ''}" data-id="${img.id}">
            <img src="${img.path}" alt="">
            <div class="a-img-actions">
              <button type="button" data-action="main" title="Definir como principal">★</button>
              <button type="button" data-action="del" title="Excluir">🗑</button>
            </div>
          </div>`).join('')}
      </div>
      <label class="a-drop" for="a-file-input">Clique para escolher uma foto (JPG, PNG ou WEBP, até 8MB)</label>
      <input type="file" id="a-file-input" accept="image/jpeg,image/png,image/webp" style="display:none">
      <p class="a-help">A imagem é salva como arquivo real em /uploads/products/ — nada fica embutido no HTML.</p>
    </div>`;

  const body = `
  <div class="a-wrap">
    <p><a href="/admin/produtos">&larr; Voltar para produtos</a></p>
    <h1>${isNew ? 'Novo produto' : escapeHTML(p.name)}</h1>
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
      el.innerHTML = '<div class="a-msg ' + (ok ? 'a-msg-ok' : 'a-msg-err') + '">' + texto + '</div>';
      setTimeout(function(){ el.innerHTML=''; }, 4000);
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
      post('/api/admin/products/' + PRODUCT_ID + '/price', 'PUT', data)
        .then(function(){ msg(document.getElementById('a-msg-preco'), 'Preço atualizado.', true); setTimeout(function(){location.reload();}, 900); })
        .catch(function(e){ msg(document.getElementById('a-msg-preco'), e.message || 'Erro.', false); });
    });
    var salvarEstoque = document.getElementById('f-salvar-estoque');
    if (salvarEstoque) salvarEstoque.addEventListener('click', function(){
      var stock = document.getElementById('f-stock').value, active = document.getElementById('f-active').checked, featured = document.getElementById('f-featured').checked;
      Promise.all([
        post('/api/admin/products/' + PRODUCT_ID + '/stock', 'PUT', { stock: stock }),
        post('/api/admin/products/' + PRODUCT_ID + '/active', 'PUT', { active: active }),
        post('/api/admin/products/' + PRODUCT_ID + '/featured', 'PUT', { featured: featured }),
      ]).then(function(){ msg(document.getElementById('a-msg-topo'), 'Estoque e disponibilidade atualizados.', true); })
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
      var reader = new FileReader();
      reader.onload = function(){
        post('/api/admin/products/' + PRODUCT_ID + '/images', 'POST', { dataUrl: reader.result })
          .then(function(){ location.reload(); })
          .catch(function(e){ msg(document.getElementById('a-msg-topo'), e.message || 'Erro ao enviar imagem.', false); });
      };
      reader.readAsDataURL(file);
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
  sendHTML(res, 200, layout({ title: isNew ? 'Novo produto' : p.name, user, active: 'produtos', body }));
}

module.exports = { loginPage, changePasswordPage, productsListPage, productFormPage };
