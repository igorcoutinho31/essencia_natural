  /* ---- catálogo real: agora vem da API (/api/products), não mais de um
     arquivo estático. O servidor já decide o que é público (só produtos
     ativos), calcula o status de estoque ("Em estoque" / "Últimas
     unidades" / "Indisponível" — nunca o número exato) e resolve a marca.
     Preço nunca é inventado aqui: se `price` vier vazio, mostramos
     "Consulte" em vez de um valor. */
  (function catalogo(){
    var grid    = document.getElementById('cat-grid');
    var status  = document.getElementById('cat-status');
    var chipsEl = document.getElementById('cat-chips');
    var contagem= document.getElementById('cat-contagem');
    var busca   = document.getElementById('cat-q');
    var limpar  = document.getElementById('cat-limpar');
    var ordemEl = document.getElementById('cat-ordem');
    var marcaEl = document.getElementById('cat-marca');
    var generoEl= document.getElementById('cat-genero');
    var estoqueEl = document.getElementById('cat-so-estoque');
    var moreWrap= document.getElementById('cat-more');
    var moreBtn = document.getElementById('cat-mais');
    var pd      = document.getElementById('pd');
    var pdGrid  = document.getElementById('pd-grid');
    var pdFechar= document.getElementById('pd-fechar');
    if (!grid) return;

    var LOTE = 12;
    var WA_PADRAO = '5511949614608';
    var PLACEHOLDER = '/assets/images/placeholder-produto.svg';
    var WA_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16.02 3C9.4 3 4 8.4 4 15.02c0 2.36.65 4.56 1.78 6.45L4 29l7.72-1.72a11.94 11.94 0 0 0 4.3.8h.01c6.62 0 12.02-5.4 12.02-12.02C28.05 8.4 22.64 3 16.02 3Zm0 21.86h-.01a9.9 9.9 0 0 1-5.05-1.39l-.36-.21-4.58 1.02 1.04-4.47-.24-.37a9.86 9.86 0 0 1-1.5-5.42c0-5.46 4.44-9.9 9.9-9.9 5.45 0 9.88 4.44 9.88 9.9 0 5.46-4.43 9.84-9.08 9.84Zm5.42-7.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.24-.46-2.36-1.46-.87-.78-1.46-1.74-1.63-2.04-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5-.17 0-.37-.02-.57-.02-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.47 0 1.46 1.07 2.87 1.22 3.07.15.2 2.1 3.22 5.1 4.5.71.3 1.27.49 1.7.63.72.23 1.36.2 1.88.12.57-.08 1.76-.72 2-1.42.24-.7.24-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z"/></svg>';
    var ICON_MAIS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    var ICON_OK   = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    var produtos = [], wa = WA_PADRAO, marcas = [];
    var filtro = 'todos', termo = '', ordem = 'catalogo', mostrados = 0, jaPintados = 0;
    var fMarca = '', fGenero = '', soEstoque = false;

    function el(tag, cls, txt){
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (txt != null) e.textContent = txt;
      return e;
    }
    function norm(t){ return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }
    /* Sem preço: mensagem exata pedida (fechamento V2) — pergunta pelo
       VALOR, porque é isso que falta. Com preço: mensagem genérica de
       interesse, que serve tanto pra quem quer comprar quanto pra quem só
       quer confirmar disponibilidade. "produto", não "perfume": o catálogo
       tem itens que não são perfume (ex.: body cream). */
    function linkWhatsApp(p){
      var nome = p && p.name || '';
      var msg = p && !p.price
        ? 'Olá! Vim pelo site da Essência Natural e gostaria de consultar o valor do produto ' + nome + '.'
        : 'Olá! Vim pelo site da Essência Natural e gostaria de saber mais sobre o produto ' + nome + '.';
      return 'https://wa.me/' + wa + '?text=' + encodeURIComponent(msg);
    }
    function botaoWhatsApp(p){
      var a = el('a','prod-wa');
      a.href = linkWhatsApp(p); a.target = '_blank'; a.rel = 'noopener';
      a.setAttribute('aria-label','Consultar ' + p.name + ' no WhatsApp');
      a.innerHTML = WA_SVG;
      a.appendChild(document.createTextNode('Consultar no WhatsApp'));
      return a;
    }
    /* Só deixa adicionar à sacola quando o estoque é um número em que a
       gente confia (em_estoque/ultimas). "Indisponível" (zerado confirmado)
       e "consulte" (sem vínculo/sem estoque confiável) nunca viram botão de
       compra direta — ver regras 4 e 5 do fechamento da V2: nunca inventar
       disponibilidade, e produto zerado nunca some, só bloqueia o carrinho. */
    function podeComprar(p){ return p.stockStatus === 'em_estoque' || p.stockStatus === 'ultimas'; }
    function botaoAdd(p){
      var b = el('button','prod-add');
      b.type = 'button';
      b.setAttribute('aria-label','Adicionar ' + p.name + ' à sacola');
      b.innerHTML = ICON_MAIS;
      b.addEventListener('click', function(ev){
        ev.stopPropagation();
        if (!window.ENSacola) return;
        window.ENSacola.add(p);
        b.classList.add('ok'); b.innerHTML = ICON_OK;
        setTimeout(function(){ b.classList.remove('ok'); b.innerHTML = ICON_MAIS; }, 1300);
      });
      return b;
    }
    function precoTexto(p){ return p.price ? window.ENbrl(p.price) : 'Consulte'; }

    function descricaoUtil(p){
      var linhas = String(p.description || '').split('\n').filter(function(l){ return !/^\s*notas\s+de\s/i.test(l); });
      var texto = linhas.join('\n').split(p.name).join(' ').trim();
      return texto.replace(/[^\p{L}\p{N}]/gu,'') ? texto : '';
    }
    function paresDeNotas(p){
      var n = p.notes || {};
      return [['Topo',n.topo],['Coração',n.coracao],['Fundo',n.fundo]].filter(function(par){ return !!par[1]; });
    }

    /* ---- filtros ---- */
    function montarChips(){
      var contagens = {}, ordemCats = [];
      produtos.forEach(function(p){ var c = p.category; if (!c) return; if (!(c in contagens)) { contagens[c]=0; ordemCats.push(c); } contagens[c]++; });
      var lista = [['todos','Todos',produtos.length]];
      ordemCats.forEach(function(c){ if (contagens[c] > 0) lista.push([c, c, contagens[c]]); });
      chipsEl.textContent = '';
      lista.forEach(function(item){
        var b = el('button','chip'); b.type = 'button'; b.dataset.cat = item[0];
        b.setAttribute('aria-pressed', String(item[0] === filtro));
        b.appendChild(document.createTextNode(item[1]));
        b.appendChild(el('span','n', String(item[2])));
        b.addEventListener('click', function(){
          filtro = item[0];
          [].forEach.call(chipsEl.children, function(c){ c.setAttribute('aria-pressed', String(c.dataset.cat === filtro)); });
          reset();
        });
        chipsEl.appendChild(b);
      });
    }
    function montarMarcas(){
      if (!marcaEl) return;
      var vistas = {}, lista = [];
      produtos.forEach(function(p){ if (p.brand && !vistas[p.brand]) { vistas[p.brand]=1; lista.push([p.brandSlug, p.brand]); } });
      lista.sort(function(a,b){ return a[1].localeCompare(b[1],'pt-BR'); });
      marcaEl.textContent = '';
      marcaEl.appendChild(el('option', null, 'Todas as marcas')).value = '';
      lista.forEach(function(par){ var o = el('option', null, par[1]); o.value = par[0]; marcaEl.appendChild(o); });
    }

    function listaAtual(){
      var t = norm(termo);
      var out = produtos.filter(function(p){
        if (filtro !== 'todos' && p.category !== filtro) return false;
        if (fMarca && p.brandSlug !== fMarca) return false;
        if (fGenero && p.gender !== fGenero) return false;
        if (soEstoque && !podeComprar(p)) return false;
        if (!t) return true;
        return norm(p.name).indexOf(t) > -1 || norm(p.brand).indexOf(t) > -1;
      });
      if (ordem === 'az') out = out.slice().sort(function(x,y){ return String(x.name).localeCompare(String(y.name),'pt-BR',{sensitivity:'base'}); });
      else if (ordem === 'preco_asc' || ordem === 'preco_desc') {
        var comPreco = out.filter(function(p){ return p.price; });
        var semPreco = out.filter(function(p){ return !p.price; });
        comPreco.sort(function(a,b){ return ordem === 'preco_asc' ? a.price - b.price : b.price - a.price; });
        out = comPreco.concat(semPreco);
      } else if (ordem === 'destaques') {
        out = out.slice().sort(function(a,b){ return (b.featured?1:0) - (a.featured?1:0); });
      }
      return out;
    }

    function card(p){
      var art = el('article','prod');
      if (p.stockStatus === 'indisponivel') art.classList.add('prod-indisponivel');

      var media = el('div','prod-media');
      var img = new Image();
      img.alt = p.name; img.loading = 'lazy'; img.decoding = 'async';
      img.width = 700; img.height = 933;
      var ok = function(){ img.classList.add('ok'); };
      // Nunca deixa imagem quebrada: se o arquivo real falhar (apagado do
      // disco, path errado etc.), troca pro placeholder oficial em vez de
      // mostrar o ícone de imagem quebrada do navegador.
      img.addEventListener('error', function(){
        if (img.src.indexOf(PLACEHOLDER) === -1) { img.src = PLACEHOLDER; return; }
        ok();
      });
      img.addEventListener('load', ok);
      img.src = p.image || PLACEHOLDER;
      if (img.complete) ok();
      media.appendChild(img);
      if (p.featured) media.appendChild(el('span','prod-destaque','Destaque'));
      var selo = el('span','prod-selo prod-selo--' + p.stockStatus, p.stockLabel);
      media.appendChild(selo);
      if (podeComprar(p)) media.appendChild(botaoAdd(p));
      art.appendChild(media);

      var body = el('div','prod-body');
      if (p.brand) body.appendChild(el('p','prod-marca', p.brand));

      var h3 = el('h3','prod-nome');
      var trig = el('button','prod-trigger', p.name);
      trig.type = 'button'; trig.setAttribute('aria-haspopup','dialog');
      trig.addEventListener('click', function(){ abrirDetalhes(p); });
      h3.appendChild(trig);
      body.appendChild(h3);

      var meta = [p.volume, p.category].filter(Boolean).join(' · ');
      if (meta) body.appendChild(el('p','prod-cat', meta));

      body.appendChild(el('p','prod-preco' + (p.price ? '' : ' prod-preco--consulte'), precoTexto(p)));

      var acoes = el('div','prod-acoes');
      var ver = el('a','prod-ver','Ver produto'); ver.href = '/produto/' + p.slug;
      acoes.appendChild(ver);
      body.appendChild(acoes);

      var cta = el('div','prod-cta');
      cta.appendChild(botaoWhatsApp(p));
      body.appendChild(cta);

      art.appendChild(body);
      return art;
    }

    function abrirDetalhes(p){
      if (!pd || typeof pd.showModal !== 'function') return;
      pdGrid.textContent = '';
      var media = el('div','pd-media');
      var img = new Image(); img.alt = p.name; img.decoding = 'async';
      img.addEventListener('error', function(){
        if (img.src.indexOf(PLACEHOLDER) === -1) img.src = PLACEHOLDER;
      });
      img.src = p.image || PLACEHOLDER;
      media.appendChild(img);
      pdGrid.appendChild(media);

      var body = el('div','pd-body');
      if (p.brand) body.appendChild(el('p','pd-marca', p.brand));
      body.appendChild(el('h3','pd-nome', p.name));
      var meta = [p.volume, p.gender, p.category].filter(Boolean).join(' · ');
      if (meta) body.appendChild(el('p','pd-cat', meta));
      body.appendChild(el('p','pd-preco', precoTexto(p)));
      body.appendChild(el('p','pd-selo pd-selo--' + p.stockStatus, p.stockLabel));
      var desc = descricaoUtil(p);
      if (desc) body.appendChild(el('p','pd-desc', desc));
      var notas = paresDeNotas(p);
      if (notas.length) {
        var dl = el('dl','pd-notas');
        notas.forEach(function(par){ var row = el('div'); row.appendChild(el('dt', null, par[0])); row.appendChild(el('dd', null, par[1])); dl.appendChild(row); });
        body.appendChild(dl);
      }
      var cta = el('div','pd-cta');
      if (podeComprar(p)) {
        var addBtn = el('button','btn btn-primary pd-add','Adicionar à sacola');
        addBtn.type = 'button';
        addBtn.addEventListener('click', function(){ if (window.ENSacola) window.ENSacola.add(p); pd.close(); });
        cta.appendChild(addBtn);
      }
      cta.appendChild(botaoWhatsApp(p));
      var verLink = el('a','pd-ver','Ver página do produto'); verLink.href = '/produto/' + p.slug;
      cta.appendChild(verLink);
      body.appendChild(cta);
      pdGrid.appendChild(body);
      pd.showModal();
    }
    if (pdFechar) pdFechar.addEventListener('click', function(){ pd.close(); });
    if (pd) pd.addEventListener('click', function(ev){ if (ev.target === pd) pd.close(); });

    function pintar(){
      var lista = listaAtual();
      grid.textContent = '';
      if (!lista.length) {
        moreWrap.hidden = true;
        var vazio = el('p','cat-vazio');
        vazio.appendChild(document.createTextNode('Nenhum produto encontrado. '));
        var b = el('button', null, 'Limpar filtros'); b.type = 'button';
        b.addEventListener('click', function(){
          termo=''; busca.value=''; limpar.hidden=true; filtro='todos'; fMarca=''; fGenero=''; soEstoque=false;
          if (marcaEl) marcaEl.value=''; if (generoEl) generoEl.value=''; if (estoqueEl) estoqueEl.checked=false;
          [].forEach.call(chipsEl.children, function(c){ c.setAttribute('aria-pressed', String(c.dataset.cat === 'todos')); });
          reset();
        });
        vazio.appendChild(b);
        grid.appendChild(vazio);
        contagem.textContent = 'Nenhum produto encontrado.';
        return;
      }
      var frag = document.createDocumentFragment();
      var fim = Math.min(mostrados, lista.length);
      for (var i = 0; i < fim; i++) {
        var c = card(lista[i]);
        if (i >= jaPintados) c.style.setProperty('--d', ((i - jaPintados) % 12) * 0.04 + 's');
        else c.style.animation = 'none';
        frag.appendChild(c);
      }
      jaPintados = fim;
      grid.appendChild(frag);
      var resta = lista.length - fim;
      moreWrap.hidden = resta <= 0;
      if (resta > 0) moreBtn.textContent = 'Ver mais produtos (' + resta + ')';
      contagem.textContent = 'Mostrando ' + fim + ' de ' + lista.length + (lista.length === 1 ? ' produto' : ' produtos');
    }
    function reset(){ mostrados = LOTE; jaPintados = 0; pintar(); }

    moreBtn.addEventListener('click', function(){ mostrados += LOTE; pintar(); });
    busca.addEventListener('input', function(){ termo = busca.value.trim(); limpar.hidden = !termo; reset(); });
    limpar.addEventListener('click', function(){ busca.value=''; termo=''; limpar.hidden=true; busca.focus(); reset(); });
    ordemEl.addEventListener('change', function(){ ordem = ordemEl.value; reset(); });
    if (marcaEl) marcaEl.addEventListener('change', function(){ fMarca = marcaEl.value; reset(); });
    if (generoEl) generoEl.addEventListener('change', function(){ fGenero = generoEl.value; reset(); });
    if (estoqueEl) estoqueEl.addEventListener('change', function(){ soEstoque = estoqueEl.checked; reset(); });

    fetch('/api/products')
      .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(d){
        produtos = (d && d.products) || [];
        if (d && d.whatsapp) wa = String(d.whatsapp).replace(/\D/g,'');
        if (!produtos.length) throw new Error('nenhum produto no catálogo');
        status.hidden = true;
        montarChips();
        montarMarcas();
        if (window.ENSacola) window.ENSacola.catalogo(produtos);
        reset();
      })
      .catch(function(err){
        status.innerHTML = 'Não foi possível carregar o catálogo (' + String(err && err.message || err) + ').<br>Tente recarregar a página em alguns instantes.';
      });
  })();
