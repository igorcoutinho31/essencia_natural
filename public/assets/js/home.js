  /* ---- home: liga as partes da página ao catálogo ----
     Vídeo do topo, busca rápida, atalhos de gênero, famílias olfativas,
     "Destaques" (produtos marcados com ★ no painel), "Mais vendidos" (pela
     posição de vendas que a API informa, nunca a quantidade) e a barra fixa
     do celular. Nada aqui inventa produto: se não houver destaque ou venda
     registrada, a seção simplesmente não aparece. */
  (function home(){
    var reduzido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var cat = window.ENCatalogo;

    /* vídeo das prateleiras por cima da foto (só se o aparelho deixar) */
    (function videoTopo(){
      var caixa = document.querySelector('.hero-media');
      var conexao = navigator.connection || {};
      if (!caixa || reduzido || conexao.saveData || /(^|-)2g$/.test(conexao.effectiveType || '')) return;
      var v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.preload = 'auto';
      v.poster = 'assets/store/prateleiras-poster.webp';
      v.src = 'assets/store/prateleiras.mp4';
      v.addEventListener('playing', function(){
        var img = caixa.querySelector('img');
        caixa.appendChild(v);
        if (img) setTimeout(function(){ img.remove(); }, 400);
      }, { once: true });
      var p = v.play();
      if (p && p.catch) p.catch(function(){});
    })();

    /* barra do celular: sacola e contador */
    var abrirSacola = document.querySelector('[data-abrir-sacola]');
    var bagBtn = document.getElementById('bag-btn');
    if (abrirSacola && bagBtn) abrirSacola.addEventListener('click', function(){ bagBtn.click(); });
    var nOrig = document.getElementById('bag-n'), nBarra = document.querySelector('[data-bag-n]');
    if (nOrig && nBarra && 'MutationObserver' in window) {
      var copiar = function(){ nBarra.textContent = nOrig.textContent; nBarra.hidden = nOrig.hidden; };
      new MutationObserver(copiar).observe(nOrig, { attributes: true, childList: true, characterData: true, subtree: true });
      copiar();
    }

    if (!cat) return;

    /* busca rápida e atalhos */
    var form = document.getElementById('busca-rapida');
    if (form) form.addEventListener('submit', function(ev){
      ev.preventDefault();
      cat.filtrar({ termo: document.getElementById('busca-rapida-q').value.trim() });
    });
    var pilulas = document.getElementById('pilulas');
    if (pilulas) pilulas.addEventListener('click', function(ev){
      var b = ev.target.closest('[data-genero]'); if (!b) return;
      [].forEach.call(pilulas.children, function(x){ x.classList.toggle('pilula--ouro', x === b); });
      cat.filtrar({ genero: b.dataset.genero });
    });
    document.querySelectorAll('[data-busca]').forEach(function(a){
      a.addEventListener('click', function(){ setTimeout(function(){ var q = document.getElementById('cat-q'); if (q) q.focus({ preventScroll: true }); }, 500); });
    });

    /* famílias: mostra quantos produtos há em cada uma e esconde as vazias */
    var familias = document.getElementById('familias-grid');
    if (familias) familias.addEventListener('click', function(ev){
      var b = ev.target.closest('[data-familia]'); if (!b) return;
      cat.filtrar({ familia: b.dataset.familia });
    });

    cat.pronto(function(produtos){
      /* contagem por família */
      if (familias) {
        var cont = {};
        produtos.forEach(function(p){ var f = cat.familiaDe(p); if (f) cont[f] = (cont[f] || 0) + 1; });
        [].forEach.call(familias.querySelectorAll('[data-familia]'), function(b){
          var n = cont[b.dataset.familia] || 0;
          var small = b.querySelector('small');
          if (!n) { b.hidden = true; return; }
          if (small) small.textContent += ' · ' + n + (n === 1 ? ' perfume' : ' perfumes');
        });
        if (!familias.querySelector('[data-familia]:not([hidden])')) {
          var sec = document.getElementById('familias'); if (sec) sec.hidden = true;
        }
      }

      /* destaques: os marcados com ★; sem nenhum, os que têm foto */
      var vitrine = document.getElementById('vitrine');
      if (vitrine) {
        var destaques = produtos.filter(function(p){ return p.featured; });
        var sub = document.getElementById('destaques-sub');
        if (!destaques.length) {
          destaques = produtos.filter(function(p){ return p.hasImage; }).slice(-8).reverse();
          if (sub) sub.textContent = 'Novidades no catálogo';
        }
        destaques = destaques.slice(0, 8);
        if (destaques.length >= 2) {
          destaques.forEach(function(p, i){ var c = cat.card(p); c.style.setProperty('--d', (i % 4) * 0.08 + 's'); vitrine.appendChild(c); });
          document.getElementById('destaques').hidden = false;
        }
      }

      /* mais vendidos: só quem tem venda registrada, na ordem */
      var top = document.getElementById('top5');
      if (top) {
        var lista = produtos.filter(function(p){ return p.salesRank; })
          .sort(function(a,b){ return a.salesRank - b.salesRank; }).slice(0, 5);
        if (lista.length >= 3) {
          lista.forEach(function(p, i){
            var li = document.createElement('li'); li.className = 'top-item';
            var num = document.createElement('span'); num.className = 'top-num'; num.setAttribute('aria-hidden', 'true'); num.textContent = String(i + 1);
            var a = document.createElement('a'); a.href = '/produto/' + p.slug;
            var img = new Image(); img.alt = [p.brand, p.name].filter(Boolean).join(' '); img.loading = 'lazy'; img.decoding = 'async';
            img.width = 440; img.height = 550; img.src = p.image;
            img.addEventListener('error', function(){ img.src = '/assets/images/placeholder-produto.svg'; }, { once: true });
            var marca = document.createElement('span'); marca.className = 'prod-marca'; marca.textContent = p.brand || '';
            var h = document.createElement('h3'); h.textContent = p.name;
            a.appendChild(img); a.appendChild(marca); a.appendChild(h);
            li.appendChild(num); li.appendChild(a);
            top.appendChild(li);
          });
          document.getElementById('top5-bloco').hidden = false;
        }
      }
      if (window.ENRevelar) window.ENRevelar();
    });
  })();
