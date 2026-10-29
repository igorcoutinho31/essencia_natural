  /* ---- marcas: faixa de logos em dourado, vinda de /api/brands ----
     Nenhuma marca é escrita à mão no HTML — só as que a loja confirmou e que
     têm produto publicado. Os logos aparecem todos em dourado, sem fundo
     (convertidos por tools/logos-ouro.cjs); marca sem logo aparece com o
     nome. Tocar numa marca filtra o catálogo por ela. */
  (function marcas(){
    var faixa = document.getElementById('marquee');
    if (!faixa) return;
    // versão em dourado do logo (tools/logos-ouro.cjs); sem ela, o nome
    function logoOuro(m){
      var r = /^\/?assets\/brands\/([^/.]+)\.(png|jpe?g|webp)$/i.exec(m.logoPath || '');
      return r ? '/assets/brands/ouro/' + r[1] + '.png' : '';
    }
    function nomeTexto(a, m){
      var t = document.createElement('span'); t.className = 'marca-txt'; t.textContent = m.name; a.appendChild(t);
    }
    function item(m){
      var a = document.createElement('a');
      a.href = '#catalogo';
      var src = logoOuro(m);
      if (src) {
        var img = new Image(); img.alt = m.name; img.decoding = 'async'; img.loading = 'lazy'; img.src = src; img.height = 78;
        img.addEventListener('error', function(){ img.remove(); nomeTexto(a, m); }, { once: true });
        a.appendChild(img);
      } else nomeTexto(a, m);
      a.setAttribute('aria-label', 'Ver os perfumes da marca ' + m.name);
      a.addEventListener('click', function(ev){
        if (!window.ENCatalogo) return;
        ev.preventDefault();
        window.ENCatalogo.filtrar({ marca: m.slug });
      });
      return a;
    }
    fetch('/api/brands').then(function(r){ return r.json(); }).then(function(data){
      var lista = (data.brands || []).filter(function(m){ return m.productCount > 0; });
      if (!lista.length) lista = data.brands || [];
      lista.sort(function(a, b){ return (b.productCount || 0) - (a.productCount || 0) || a.name.localeCompare(b.name, 'pt-BR'); });
      lista = lista.slice(0, 24);
      if (!lista.length) { faixa.parentNode.hidden = true; return; }
      // duas voltas iguais: a animação anda metade e recomeça sem emenda
      [0, 1].forEach(function(volta){
        lista.forEach(function(m){
          var a = item(m);
          if (volta) { a.setAttribute('aria-hidden', 'true'); a.tabIndex = -1; }
          faixa.appendChild(a);
        });
      });
    }).catch(function(){ faixa.parentNode.hidden = true; });
  })();
