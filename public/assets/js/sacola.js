  /* ---- sacola: carrinho que finaliza no WhatsApp ----
     Não processa pagamento nem calcula frete: monta o pedido e abre a
     conversa com a equipe, que confirma estoque, valores e frete. Guarda
     id/quantidade/nome no localStorage (com try/catch: pode estar
     bloqueado). O preço e a disponibilidade de cada item são conferidos
     contra o catálogo mais recente (window.ENSacola.catalogo, alimentado
     pela API): se um item ficou indisponível ou foi despublicado desde
     que entrou na sacola, ele é sinalizado e o botão de finalizar é
     bloqueado até o cliente removê-lo — nunca finaliza um pedido que a
     loja não pode atender. */
  (function sacola(){
    var KEY = 'en_sacola_v1', WA = '5511949614608', MAX = 99;
    var dlg = document.getElementById('sacola');
    if (!dlg) return;
    var btn = document.getElementById('bag-btn'), badge = document.getElementById('bag-n');
    var lista = document.getElementById('sac-lista'), total = document.getElementById('sac-total');
    var enviar = document.getElementById('sac-enviar'), limpar = document.getElementById('sac-limpar');
    var form = document.getElementById('sac-form');
    var cepWrap = document.getElementById('sac-cep-wrap'), cep = document.getElementById('sac-cep');
    var nome = document.getElementById('sac-nome'), obs = document.getElementById('sac-obs');
    var toast = document.getElementById('toast'), toastT = document.getElementById('toast-t');
    var toastVer = document.getElementById('toast-ver'), toastTimer = null;
    var bloqueio = document.getElementById('sac-bloqueio');

    var st = { itens:{}, entrega:'loja', cep:'', nome:'', obs:'' };
    var cat = {};                                   // id -> produto (quando o catálogo carrega da API)

    function el(tag, cls, txt){
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (txt != null) e.textContent = txt;
      return e;
    }
    function ler(){
      try {
        var r = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (r && typeof r === 'object' && r.itens) {
          Object.keys(r.itens).forEach(function(id){
            var it = r.itens[id];
            if (it && it.q > 0 && it.n) st.itens[id] = { q: Math.min(MAX, it.q|0), n: String(it.n), m: it.m ? String(it.m) : '', p: Number(it.p) || 0 };
          });
          st.entrega = r.entrega === 'casa' ? 'casa' : 'loja';
          st.cep = String(r.cep || '').slice(0, 9);
          st.nome = String(r.nome || '').slice(0, 60);
          st.obs = String(r.obs || '').slice(0, 300);
        }
      } catch (e) {}
    }
    function salvar(){ try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

    /* preço: só existe se o produto tiver um número positivo */
    window.ENpreco = function(p){ var v = Number(p && p.price); return isFinite(v) && v > 0 ? v : 0; };
    function brl(v){ return v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
    window.ENbrl = brl;

    function qtdTotal(){ return Object.keys(st.itens).reduce(function(a,id){ return a + st.itens[id].q; }, 0); }
    function atualizarBadge(){
      var n = qtdTotal();
      badge.hidden = n === 0;
      badge.textContent = String(n);
      btn.setAttribute('aria-label', n ? 'Abrir sacola, ' + n + (n === 1 ? ' item' : ' itens') : 'Abrir sacola');
    }

    /* um item é "indisponível" (bloqueia a sacola) se o catálogo mais
       recente confirma isso — ou porque o produto foi desativado, ou
       porque o estoque está zerado (só chega ao catálogo público zerado
       quando já vendeu 10+ vezes, ver fechamento V2). Enquanto o catálogo
       não carregou, não acusamos nada (a API pode ainda não ter
       respondido), só depois que `cat[id]` existe. */
    function indisponivel(id){
      var prod = cat[id];
      if (!prod) return false;
      return prod.active === false || prod.stockStatus === 'indisponivel';
    }

    /* `atendimento`: nome escolhido no modal (assets/js/atendimento.js) ou
       "Sem preferência" — opcional, só entra na mensagem quando existe,
       pra essa função continuar funcionando sozinha se o modal não abrir
       por algum motivo (ver comentário no click de #sac-enviar). */
    function mensagem(atendimento){
      var linhas = ['Olá! Vim pelo site da Essência Natural e gostaria de fazer este pedido:', ''];
      if (atendimento) { linhas.push('Atendimento escolhido: ' + atendimento); linhas.push(''); }
      var soma = 0, todos = true;
      Object.keys(st.itens).forEach(function(id){
        var it = st.itens[id];
        linhas.push('• ' + it.q + 'x ' + it.n + (it.m ? ' (' + it.m + ')' : ''));
        var prod = cat[id];
        var preco = prod ? window.ENpreco(prod) : it.p;
        if (preco) soma += preco * it.q; else todos = false;
      });
      linhas.push('');
      linhas.push(st.entrega === 'casa'
        ? 'Entrega: receber em casa' + (st.cep ? ' — CEP ' + st.cep : '')
        : 'Entrega: retirar na loja (Galeria Pagé)');
      if (st.nome.trim()) linhas.push('Nome: ' + st.nome.trim());
      if (st.obs.trim()) linhas.push('Observação: ' + st.obs.trim());
      if (todos && soma > 0) linhas.push('Total dos produtos: ' + brl(soma));
      linhas.push('');
      linhas.push(st.entrega === 'casa' ? 'Pode confirmar a disponibilidade, os valores e o frete?' : 'Pode confirmar a disponibilidade e os valores?');
      return linhas.join('\n');
    }
    function cepOk(){ return st.entrega !== 'casa' || !st.cep || /^\d{5}-?\d{3}$/.test(st.cep); }

    function render(){
      var ids = Object.keys(st.itens);
      dlg.classList.toggle('vazia', ids.length === 0);
      lista.textContent = '';
      var soma = 0, todos = ids.length > 0, temIndisponivel = false;

      ids.forEach(function(id){
        var it = st.itens[id], prod = cat[id];
        var preco = prod ? window.ENpreco(prod) : it.p;
        var comparePreco = prod ? Number(prod.comparePrice) || 0 : 0;
        var indisp = indisponivel(id);
        if (indisp) temIndisponivel = true;
        if (preco && !indisp) soma += preco * it.q; else todos = false;

        var li = el('li','bag-item' + (indisp ? ' bag-item--indisponivel' : ''));
        if (prod && prod.image) {
          var img = new Image(); img.src = prod.image; img.alt = ''; img.width = 64; img.height = 85; img.decoding = 'async';
          li.appendChild(img);
        } else li.appendChild(el('div','bag-foto'));

        var info = el('div','bag-info');
        if (it.m) info.appendChild(el('p','bag-marca', it.m));
        info.appendChild(el('p','bag-nome', it.n));
        if (preco) {
          var pPreco = el('p','bag-preco');
          if (comparePreco > preco) pPreco.appendChild(el('span','bag-preco-de', brl(comparePreco)));
          pPreco.appendChild(document.createTextNode(brl(preco) + (it.q > 1 ? ' cada' : '')));
          info.appendChild(pPreco);
          if (it.q > 1) info.appendChild(el('p','bag-subtotal', 'Subtotal: ' + brl(preco * it.q)));
        }
        if (indisp) info.appendChild(el('p','bag-aviso', 'Não é possível confirmar este item pelo site agora — remova para continuar ou consulte no WhatsApp'));

        var linha = el('div','bag-linha');
        var q = el('div','bag-qtd');
        var menos = el('button', null, '−'); menos.type = 'button';
        menos.setAttribute('aria-label','Diminuir quantidade de ' + it.n);
        var out = el('output', null, String(it.q));
        var mais = el('button', null, '+'); mais.type = 'button';
        mais.setAttribute('aria-label','Aumentar quantidade de ' + it.n);
        mais.disabled = indisp;
        menos.addEventListener('click', function(){ mudar(id, -1); });
        mais.addEventListener('click', function(){ mudar(id, +1); });
        q.appendChild(menos); q.appendChild(out); q.appendChild(mais);
        var rm = el('button','bag-rm','Remover'); rm.type = 'button';
        rm.setAttribute('aria-label','Remover ' + it.n + ' da sacola');
        rm.addEventListener('click', function(){ delete st.itens[id]; salvar(); atualizarBadge(); render(); });
        linha.appendChild(q); linha.appendChild(rm);
        info.appendChild(linha);
        li.appendChild(info);
        lista.appendChild(li);
      });

      if (todos && soma > 0) {
        total.hidden = false; total.textContent = '';
        total.appendChild(el('span', null, 'Total dos produtos'));
        total.appendChild(el('b', null, brl(soma)));
      } else total.hidden = true;

      [].forEach.call(form.querySelectorAll('input[name=sac-entrega]'), function(r){ r.checked = r.value === st.entrega; });
      cepWrap.hidden = st.entrega !== 'casa';
      if (document.activeElement !== cep) cep.value = st.cep;
      if (document.activeElement !== nome) nome.value = st.nome;
      if (document.activeElement !== obs) obs.value = st.obs;

      var ok = ids.length > 0 && cepOk() && !temIndisponivel;
      cep.setAttribute('aria-invalid', String(!cepOk()));
      enviar.setAttribute('aria-disabled', String(!ok));
      // O link do WhatsApp só é montado depois de escolher o atendimento
      // (ver o click de #sac-enviar, abaixo) — aqui fica só um placeholder.
      enviar.href = '#';
      if (bloqueio) bloqueio.hidden = !temIndisponivel;
    }

    function mudar(id, d){
      var it = st.itens[id]; if (!it) return;
      it.q = Math.max(0, Math.min(MAX, it.q + d));
      if (!it.q) delete st.itens[id];
      salvar(); atualizarBadge(); render();
    }

    function abrir(){ render(); if (typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal(); }
    function fechar(){ if (dlg.open) dlg.close(); }

    function aviso(txt){
      toastT.textContent = txt; toast.hidden = false;
      toast.style.animation = 'none'; void toast.offsetWidth; toast.style.animation = '';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function(){ toast.hidden = true; }, 3200);
    }

    function add(p){
      if (!p || p.id == null) return;
      if (p.active === false || p.stockStatus === 'indisponivel') return; // nunca adiciona um item indisponível
      var id = String(p.id);
      cat[id] = p;
      var it = st.itens[id];
      if (it) it.q = Math.min(MAX, it.q + 1);
      else st.itens[id] = { q:1, n:String(p.name), m:p.brand ? String(p.brand) : '', p:window.ENpreco(p) };
      salvar(); atualizarBadge();
      btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
      aviso(p.name + ' foi para a sacola');
    }

    window.ENSacola = {
      add: add, abrir: abrir,
      catalogo: function(lista){ lista.forEach(function(p){ cat[String(p.id)] = p; }); if (dlg.open) render(); }
    };

    btn.addEventListener('click', abrir);
    toastVer.addEventListener('click', function(){ toast.hidden = true; abrir(); });
    document.getElementById('sac-fechar').addEventListener('click', fechar);
    document.getElementById('sac-ver').addEventListener('click', fechar);
    dlg.addEventListener('click', function(ev){ if (ev.target === dlg) fechar(); });
    limpar.addEventListener('click', function(){ st.itens = {}; salvar(); atualizarBadge(); render(); });
    enviar.addEventListener('click', function(ev){
      ev.preventDefault();
      if (enviar.getAttribute('aria-disabled') === 'true') { if (!cepOk()) cep.focus(); return; }
      // Etapa "Escolher atendimento" antes do WhatsApp (ver
      // assets/js/atendimento.js) — o pedido em si (produtos, valores,
      // entrega etc.) não muda em nada, só ganha a linha do atendimento.
      if (window.ENAtendimento && typeof window.ENAtendimento.abrir === 'function') {
        window.ENAtendimento.abrir(function(nomeEscolhido){
          window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(mensagem(nomeEscolhido)), '_blank', 'noopener');
        });
      } else {
        // nunca trava uma venda real: se o modal de atendimento não
        // carregar por algum motivo, vai direto pro WhatsApp como antes.
        window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(mensagem()), '_blank', 'noopener');
      }
    });
    [].forEach.call(form.querySelectorAll('input[name=sac-entrega]'), function(r){
      r.addEventListener('change', function(){ st.entrega = r.value; salvar(); render(); if (r.value === 'casa') cep.focus(); });
    });
    cep.addEventListener('input', function(){
      var d = cep.value.replace(/\D/g,'').slice(0,8);
      st.cep = d.length > 5 ? d.slice(0,5) + '-' + d.slice(5) : d;
      cep.value = st.cep; salvar(); render();
    });
    nome.addEventListener('input', function(){ st.nome = nome.value; salvar(); render(); });
    obs.addEventListener('input', function(){ st.obs = obs.value; salvar(); render(); });
    form.addEventListener('submit', function(ev){ ev.preventDefault(); });

    ler(); atualizarBadge();
  })();
