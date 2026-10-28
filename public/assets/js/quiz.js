  /* ---- quiz "Descubra o seu perfume em 4 perguntas" ----
     Usa só o que o cadastro tem (gênero e família/notas de cada produto)
     para sugerir até três perfumes publicados, e termina numa mensagem de
     WhatsApp com as respostas, para a equipe completar o atendimento. Não
     promete nada que o cadastro não diga. */
  (function quiz(){
    var dlg = document.getElementById('quiz');
    var abrir = document.getElementById('quiz-abrir');
    if (!dlg || !abrir || typeof dlg.showModal !== 'function') { if (abrir) abrir.closest('section').hidden = true; return; }
    var corpo = document.getElementById('quiz-corpo');
    var passo = document.getElementById('quiz-passo');
    var barra = document.getElementById('quiz-barra');
    var fechar = document.getElementById('quiz-fechar');

    var PERGUNTAS = [
      { id:'para', titulo:'Para quem é o perfume?', ops:[
        ['feminino','Para ela'], ['masculino','Para ele'], ['','Tanto faz', 'unissex ou para presentear'] ] },
      { id:'familia', titulo:'Qual estilo combina mais?', ops:[
        ['doce','Doce e envolvente','baunilha, caramelo, frutas'], ['amadeirado','Marcante','oud, madeiras, especiarias'],
        ['fresco','Fresco e leve','cítricos, aquáticos'], ['floral','Floral','rosas, flores brancas'] ] },
      { id:'momento', titulo:'Para quando?', ops:[
        ['dia','Dia a dia'], ['noite','Noite e ocasiões especiais'], ['sempre','Para todo momento'] ] },
      { id:'intensidade', titulo:'Como você gosta que o perfume fique?', ops:[
        ['suave','Suave, só para quem chega perto'], ['marcante','Marcante, que deixa rastro'] ] }
    ];
    var resp = {}, i = 0;

    function el(tag, cls, txt){ var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

    function pergunta(){
      var q = PERGUNTAS[i];
      passo.textContent = 'Pergunta ' + (i + 1) + ' de ' + PERGUNTAS.length;
      barra.style.transform = 'scaleX(' + (i / PERGUNTAS.length) + ')';
      corpo.textContent = '';
      var h = el('h2', null, q.titulo); h.id = 'quiz-titulo'; h.tabIndex = -1;
      corpo.appendChild(h);
      var box = el('div','quiz-opcoes');
      q.ops.forEach(function(op){
        var b = el('button','quiz-op'); b.type = 'button';
        var t = el('span', null, op[1]); b.appendChild(t);
        if (op[2]) b.appendChild(el('small', null, op[2]));
        b.addEventListener('click', function(){ resp[q.id] = { v: op[0], t: op[1] }; i++; i < PERGUNTAS.length ? pergunta() : resultado(); });
        box.appendChild(b);
      });
      corpo.appendChild(box);
      if (i > 0) {
        var voltar = el('button','quiz-voltar','Voltar'); voltar.type = 'button';
        voltar.addEventListener('click', function(){ i--; pergunta(); });
        corpo.appendChild(voltar);
      }
      h.focus({ preventScroll: true });
    }

    function sugestoes(){
      var cat = window.ENCatalogo; if (!cat) return [];
      var lista = cat.produtos();
      var g = resp.para && resp.para.v, f = resp.familia && resp.familia.v;
      var pontua = function(p){
        var s = 0;
        if (f && cat.familiaDe(p) === f) s += 4;
        if (g && p.gender === g) s += 3; else if (g && p.gender === 'unissex') s += 2; else if (g && p.gender && p.gender !== g) s -= 5;
        if (p.featured) s += 1;
        if (p.salesRank) s += Math.max(0, 1.5 - p.salesRank / 40);
        if (p.hasImage) s += .5;
        return s;
      };
      return lista.map(function(p){ return [pontua(p), p]; })
        .filter(function(x){ return x[0] >= 3; })
        .sort(function(a, b){ return b[0] - a[0]; })
        .slice(0, 3).map(function(x){ return x[1]; });
    }

    function resultado(){
      var cat = window.ENCatalogo;
      passo.textContent = 'Suas sugestões';
      barra.style.transform = 'scaleX(1)';
      corpo.textContent = '';
      var h = el('h2', null, 'Separamos para você'); h.id = 'quiz-titulo'; h.tabIndex = -1;
      corpo.appendChild(h);
      var lista = sugestoes();
      if (lista.length) {
        var res = el('div','quiz-res');
        lista.forEach(function(p){
          var a = el('a'); a.href = '/produto/' + p.slug;
          var img = new Image(); img.src = p.image; img.alt = ''; img.loading = 'lazy';
          a.appendChild(img);
          a.appendChild(el('span','prod-marca', p.brand || ''));
          a.appendChild(el('b', null, p.name));
          res.appendChild(a);
        });
        corpo.appendChild(res);
      } else {
        corpo.appendChild(el('p', null, 'Não achamos uma combinação exata no catálogo do site agora, mas a nossa equipe conhece a loja inteira e pode indicar pessoalmente.'));
      }
      var linhas = ['Olá! Fiz o teste "Descubra o seu perfume" no site da Essência Natural.'];
      PERGUNTAS.forEach(function(q){ if (resp[q.id]) linhas.push('• ' + q.titulo + ' ' + resp[q.id].t); });
      if (lista.length) linhas.push('Gostei destas sugestões: ' + lista.map(function(p){ return [p.brand, p.name].filter(Boolean).join(' '); }).join(', ') + '.');
      linhas.push('Pode me ajudar a escolher?');
      var acoes = el('div','quiz-acoes');
      var wa = el('a','btn btn-primary btn-lg','Falar com a equipe no WhatsApp');
      wa.href = 'https://wa.me/' + (cat ? cat.whatsapp() : '5511949614608') + '?text=' + encodeURIComponent(linhas.join('\n'));
      wa.target = '_blank'; wa.rel = 'noopener';
      acoes.appendChild(wa);
      if (resp.familia && resp.familia.v && cat) {
        var ver = el('button','btn btn-ghost','Ver todos dessa família'); ver.type = 'button';
        ver.addEventListener('click', function(){ dlg.close(); cat.filtrar({ familia: resp.familia.v, genero: resp.para && resp.para.v }); });
        acoes.appendChild(ver);
      }
      var refazer = el('button','quiz-voltar','Refazer o teste'); refazer.type = 'button';
      refazer.addEventListener('click', function(){ resp = {}; i = 0; pergunta(); });
      acoes.appendChild(refazer);
      corpo.appendChild(acoes);
      h.focus({ preventScroll: true });
    }

    abrir.addEventListener('click', function(){ resp = {}; i = 0; pergunta(); dlg.showModal(); });
    fechar.addEventListener('click', function(){ dlg.close(); });
    dlg.addEventListener('click', function(ev){ if (ev.target === dlg) dlg.close(); });
  })();
