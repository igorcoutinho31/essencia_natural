  /* ---- escolha de atendimento: etapa entre a sacola e o WhatsApp ----
     Não cria uma lista de vendedores nova: lê os cards direto da seção
     #equipe da home (mesmo nome e foto que já aparecem no site), pra
     nunca ter duas listas de equipe pra manter atualizadas. Trocar foto,
     remover ou adicionar alguém continua sendo só editar o
     <li class="pessoa"> em #equipe (index.html) — este modal acompanha
     sozinho, em qualquer página.

     Funciona em toda página que tem a sacola (home e /produto/:slug):
     - o próprio script monta o <dialog> se a página não tiver um;
     - se a página não tiver a seção #equipe (ex.: página de produto),
       busca a home ("/") e lê a lista de lá.

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

    var equipePromessa = null;
    function equipe(){
      if (equipePromessa) return equipePromessa;
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
