  /* ---- menu mobile ----
     Abre/fecha o painel de navegação. Fecha no Esc, ao clicar fora, ao
     escolher um link e ao voltar para a largura de desktop. */
  (function menu(){
    var btn = document.getElementById('nav-toggle');
    var nav = document.getElementById('nav');
    if (!btn || !nav) return;
    var desktop = window.matchMedia('(min-width: 861px)');

    function set(aberto){
      btn.setAttribute('aria-expanded', String(aberto));
      btn.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
      document.body.classList.toggle('nav-aberto', aberto);
    }
    function fechar(){ set(false); }

    btn.addEventListener('click', function(){
      set(btn.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function(ev){
      if (ev.target.closest('a')) fechar();      // escolheu um destino
    });
    document.addEventListener('keydown', function(ev){
      if (ev.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true'){
        fechar(); btn.focus();
      }
    });
    document.addEventListener('click', function(ev){
      if (btn.getAttribute('aria-expanded') !== 'true') return;
      if (!ev.target.closest('.site-header')) fechar();
    });
    (desktop.addEventListener ? desktop.addEventListener.bind(desktop,'change')
                              : desktop.addListener.bind(desktop))(function(e){
      if (e.matches) fechar();                   // voltou pro desktop
    });
  })();

