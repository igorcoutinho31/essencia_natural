  /* ---- marcas: grade real, vinda de /api/brands ----
     Nenhuma marca é escrita à mão no HTML — só as que a loja confirmou
     trabalhar (ver server/seed.js). Sem logo enviado ainda, cada marca
     aparece como um cartão só com o nome, linkando pro WhatsApp. */
  (function marcas(){
    var grid = document.getElementById('marcas-grid');
    if (!grid) return;
    var WA = '5511949614608';
    function linkWhatsApp(nome){
      var msg = 'Olá! Vim pelo site da Essência Natural e gostaria de conhecer os perfumes da marca ' + nome + '.';
      return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(msg);
    }
    fetch('/api/brands').then(function(r){ return r.json(); }).then(function(data){
      var marcas = (data.brands || []).slice().sort(function(a, b){ return a.name.localeCompare(b.name, 'pt-BR'); });
      grid.textContent = '';
      if (!marcas.length) { grid.innerHTML = '<li class="marca-carregando">Marcas em cadastro.</li>'; return; }
      marcas.forEach(function(m){
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.className = 'marca';
        a.href = linkWhatsApp(m.name);
        a.target = '_blank'; a.rel = 'noopener';
        a.setAttribute('aria-label', 'Conhecer os perfumes da marca ' + m.name + ' no WhatsApp');
        if (m.logoPath) {
          var img = document.createElement('img');
          img.src = m.logoPath; img.alt = m.name; img.width = 400; img.height = 400; img.loading = 'lazy'; img.decoding = 'async';
          a.appendChild(img);
        } else {
          var span = document.createElement('span');
          span.className = 'marca-nome';
          span.textContent = m.name;
          a.appendChild(span);
        }
        li.appendChild(a);
        grid.appendChild(li);
      });
    }).catch(function(){
      grid.innerHTML = '<li class="marca-carregando">Não foi possível carregar as marcas agora.</li>';
    });
  })();
