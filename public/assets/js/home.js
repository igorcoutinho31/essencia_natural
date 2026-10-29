  /* ---- home: liga as partes da página ao catálogo ----
     "Destaques" (produtos marcados com ★ no painel; sem nenhum, as
     novidades com foto), "Mais vendidos" (pela posição de vendas que a API
     informa, nunca a quantidade) e a barra fixa do celular. Nada aqui
     inventa produto: sem dados, a seção simplesmente não aparece. Também
     roda na página de produto (só a barra do celular). */
  (function home(){
    var cat = window.ENCatalogo;

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

    /* lupa do cabeçalho: leva ao catálogo e já põe o cursor na busca */
    document.querySelectorAll('[data-busca]').forEach(function(a){
      a.addEventListener('click', function(){ setTimeout(function(){ var q = document.getElementById('cat-q'); if (q) q.focus({ preventScroll: true }); }, 500); });
    });

    cat.pronto(function(produtos){
      /* destaques: os marcados com ★; sem nenhum, as novidades com foto */
      var vitrine = document.getElementById('vitrine');
      if (vitrine) {
        var destaques = produtos.filter(function(p){ return p.featured; });
        if (!destaques.length) {
          destaques = produtos.filter(function(p){ return p.hasImage; }).slice(-8).reverse();
          var sub = document.getElementById('destaques-sub'), tit = document.getElementById('destaques-t');
          if (sub) sub.textContent = 'Acabaram de chegar';
          if (tit) tit.textContent = 'Novidades';
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
          document.getElementById('mais-vendidos').hidden = false;
        }
      }
      if (window.ENRevelar) window.ENRevelar();
    });
  })();
