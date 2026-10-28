  /* ---- escolha de atendimento: etapa entre a sacola e o WhatsApp ----
     A equipe vem de /api/team (cuidada pela loja em /admin/equipe): a
     mesma lista monta a seção #equipe da home e este modal, então trocar
     nome, foto, ordem ou esconder alguém no painel muda os dois sozinhos.
     Se a API falhar, vale a lista escrita em #equipe (index.html) ou, na
     página de produto, a da home.

     Funciona em toda página que tem a sacola (home e /produto/:slug):
     - o próprio script monta o <dialog> se a página não tiver um;

     sacola.js chama window.ENAtendimento.abrir(callback) quando o
     cliente clica em "Finalizar no WhatsApp"; o callback recebe o nome
     escolhido (ou "Sem preferência") e é quem de fato monta o link e abre
     o WhatsApp — este arquivo só escolhe o nome. */
  (function atendimento(){
    var MARCACAO =
      '<div class="bag-topo">' +
        '<h2 id="at-titulo">Escolher atendimento</h2>' +
        '<button class="bag-fechar" id="at-fechar" type="button" aria-label="Fechar">&times;</button>' +
      '</div>' +
      '<div class="at-corpo">' +
        '<p class="at-sub">Com quem você prefere falar? O pedido vai sempre para o mesmo WhatsApp da loja — é só pra gente já saber sua preferência.</p>' +
        '<ul class="at-grid" id="at-grid" role="list"></ul>' +
        '<button class="btn btn-ghost at-sem" id="at-sem" type="button">Sem preferência</button>' +
      '</div>';

    var dlg = document.getElementById('atendimento');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'atendimento'; dlg.id = 'atendimento';
      dlg.setAttribute('aria-labelledby', 'at-titulo');
      dlg.innerHTML = MARCACAO;
      document.body.appendChild(dlg);
    }
    var grid = document.getElementById('at-grid');
    var semBtn = document.getElementById('at-sem');
    var fecharBtn = document.getElementById('at-fechar');
    var callback = null;

    /* lê os <li class="pessoa"> de um documento (esta página ou a home) e
       devolve {nome, foto} com a foto em caminho absoluto — o src em
       index.html é relativo ("assets/team/..."), e em /produto/x ele
       apontaria pro lugar errado. */
    function lerEquipe(doc){
      return [].map.call(doc.querySelectorAll('#equipe .pessoa'), function(li){
        var img = li.querySelector('img');
        var nomeEl = li.querySelector('.pessoa-nome');
        var src = img ? img.getAttribute('src') : '';
        return {
          nome: nomeEl ? nomeEl.textContent.trim() : '',
          foto: src ? new URL(src, location.origin + '/').pathname : '',
        };
      }).filter(function(p){ return p.nome; });
    }

    /* monta a seção "Nossa equipe" da home com a lista do painel */
    function montarSecao(pessoas){
      var ul = document.querySelector('#equipe .equipe-grid');
      if (!ul || !pessoas.length) return;
      ul.textContent = '';
      pessoas.forEach(function(p){
        var li = document.createElement('li'); li.className = 'pessoa';
        if (p.foto) {
          var img = document.createElement('img');
          img.src = p.foto; img.alt = p.nome + ', da equipe da Essência Natural';
          img.width = 900; img.height = 1200; img.loading = 'lazy'; img.decoding = 'async';
          li.appendChild(img);
        }
        var nome = document.createElement('p'); nome.className = 'pessoa-nome'; nome.textContent = p.nome;
        li.appendChild(nome);
        ul.appendChild(li);
      });
    }

    var equipePromessa = null;
    function equipeDaPagina(){
      if (document.querySelector('#equipe .pessoa')) {
        equipePromessa = Promise.resolve(lerEquipe(document));
      } else if (window.fetch && window.DOMParser) {
        equipePromessa = fetch('/', { credentials:'same-origin' })
          .then(function(r){ return r.ok ? r.text() : ''; })
          .then(function(html){ return lerEquipe(new DOMParser().parseFromString(html, 'text/html')); })
          .catch(function(){ return []; });
      } else {
        equipePromessa = Promise.resolve([]);
      }
      return equipePromessa;
    }
    function equipe(){
      if (equipePromessa) return equipePromessa;
      if (!window.fetch) return equipeDaPagina();
      equipePromessa = fetch('/api/team', { credentials:'same-origin' })
        .then(function(r){ if (!r.ok) throw new Error(); return r.json(); })
        .then(function(d){
          var pessoas = (d.team || []).map(function(p){ return { nome: String(p.name || ''), foto: p.photo || '' }; })
            .filter(function(p){ return p.nome; });
          if (!pessoas.length) throw new Error();
          montarSecao(pessoas);
          return pessoas;
        })
        .catch(function(){ equipePromessa = null; return equipeDaPagina(); });
      return equipePromessa;
    }
    // já deixa a lista pronta: na página de produto evita esperar a rede no clique
    equipe();

    function montarGrid(pessoas){
      grid.textContent = '';
      pessoas.forEach(function(p){
        var li = document.createElement('li');
        li.className = 'at-pessoa';

        if (p.foto) {
          var img = document.createElement('img');
          img.src = p.foto; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
          li.appendChild(img);
        }

        var nome = document.createElement('p');
        nome.className = 'at-nome'; nome.textContent = p.nome;
        li.appendChild(nome);

        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn btn-ghost at-escolher';
        btn.textContent = 'Escolher ' + p.nome;
        btn.addEventListener('click', function(){ escolher(p.nome); });
        li.appendChild(btn);

        grid.appendChild(li);
      });
    }

    function escolher(nome){
      var cb = callback; callback = null;
      if (dlg.open) dlg.close();
      if (cb) cb(nome);
    }

    function cancelar(){ callback = null; if (dlg.open) dlg.close(); }

    semBtn.addEventListener('click', function(){ escolher('Sem preferência'); });
    fecharBtn.addEventListener('click', cancelar);
    dlg.addEventListener('cancel', function(){ callback = null; }); // tecla Esc
    dlg.addEventListener('click', function(ev){ if (ev.target === dlg) cancelar(); }); // clique fora do card

    window.ENAtendimento = {
      abrir: function(cb){
        callback = cb;
        if (typeof dlg.showModal !== 'function') { callback = null; cb('Sem preferência'); return; } // navegador sem <dialog>: não trava a venda
        grid.textContent = '';
        dlg.showModal();
        // o modal abre na hora; os cards entram assim que a lista estiver
        // pronta (na home é imediato). Se a lista não vier, "Sem
        // preferência" continua funcionando.
        equipe().then(function(pessoas){ if (dlg.open) montarGrid(pessoas); });
      },
    };
  })();
