  /* ---- marcas: faixa em dourado, vinda de /api/brands ----
     Nenhuma marca é escrita à mão no HTML — só as que a loja confirmou e que
     têm produto publicado. Os nomes aparecem em dourado, na mesma letra do
     site (logos de fundo branco destoavam do visual escuro). Tocar numa
     marca filtra o catálogo por ela. */
  (function marcas(){
    var faixa = document.getElementById('marquee');
    if (!faixa) return;
    function item(m){
      var a = document.createElement('a');
      a.href = '#catalogo';
      a.textContent = m.name;
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
