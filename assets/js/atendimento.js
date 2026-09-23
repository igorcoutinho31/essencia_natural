  /* ---- escolha de atendimento: etapa entre a sacola e o WhatsApp ----
     Não cria uma lista de vendedores nova: lê os cards direto da seção
     #equipe (mesmo nome e foto que já aparecem no site), pra nunca ter
     duas listas de equipe pra manter atualizadas. Trocar foto, remover ou
     adicionar alguém continua sendo só editar o <li class="pessoa"> em
     #equipe — este modal acompanha sozinho, sem mexer aqui.

     sacola.js chama window.ENAtendimento.abrir(callback) quando o
     cliente clica em "Finalizar no WhatsApp"; o callback recebe o nome
     escolhido (ou "Sem preferência") e é quem de fato monta o link e abre
     o WhatsApp — este arquivo só escolhe o nome. Se por algum motivo este
     script não carregar, sacola.js tem um caminho de volta que vai direto
     pro WhatsApp sem essa etapa: nunca trava uma venda real. */
  (function atendimento(){
    var dlg = document.getElementById('atendimento');
    if (!dlg) return;
    var grid = document.getElementById('at-grid');
    var semBtn = document.getElementById('at-sem');
    var fecharBtn = document.getElementById('at-fechar');
    var callback = null;

    function pessoasDaEquipe(){
      return [].map.call(document.querySelectorAll('#equipe .pessoa'), function(li){
        var img = li.querySelector('img');
        var nomeEl = li.querySelector('.pessoa-nome');
        return {
          nome: nomeEl ? nomeEl.textContent.trim() : '',
          foto: img ? img.getAttribute('src') : '',
        };
      }).filter(function(p){ return p.nome; });
    }

    function montarGrid(){
      grid.textContent = '';
      pessoasDaEquipe().forEach(function(p){
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
        montarGrid();
        callback = cb;
        if (typeof dlg.showModal === 'function') dlg.showModal();
        else cb('Sem preferência'); // navegador sem suporte a <dialog>: não trava a venda
      },
    };
  })();
