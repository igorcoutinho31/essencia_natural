/* ---- vida: movimento e detalhes vivos da página ----
   Tudo aqui é decoração: com prefers-reduced-motion nada se move, e o
   conteúdo fica visível sem depender destes efeitos. */
(function(){
  'use strict';
  var reduzido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* barra de progresso + cabeçalho que ganha corpo ao rolar */
  (function rolagem(){
    var barra = document.getElementById('progresso');
    var head = document.querySelector('.site-header');
    var ticking = false;
    function calc(){
      ticking = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var y = window.pageYOffset || 0;
      if (barra) barra.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
      if (head) head.classList.toggle('rolou', y > 12);
    }
    window.addEventListener('scroll', function(){
      if (!ticking) { ticking = true; requestAnimationFrame(calc); }
    }, { passive:true });
    calc();
  })();

  /* aparecer ao rolar: todo elemento com a classe .rv. Outros scripts
     chamam window.ENRevelar() depois de montar conteúdo novo. */
  (function revelar(){
    if (reduzido || !('IntersectionObserver' in window)) { window.ENRevelar = function(){}; return; }
    document.documentElement.classList.add('rv-on');
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin:'0px 0px -8% 0px', threshold:0.06 });
    function observar(){
      [].forEach.call(document.querySelectorAll('.rv:not([data-rv])'), function(n){
        n.setAttribute('data-rv', '');
        var irmaos = [].filter.call(n.parentNode.children, function(c){ return c.classList.contains('rv'); });
        n.style.setProperty('--d', Math.min(irmaos.indexOf(n), 5) * 0.09 + 's');
        io.observe(n);
      });
    }
    window.ENRevelar = observar;
    observar();
    // rede de segurança: aba em segundo plano, captura de tela etc.
    setTimeout(function(){ [].forEach.call(document.querySelectorAll('.rv'), function(n){ n.classList.add('in'); }); }, 8000);
  })();

  /* loja: aberta ou fechada agora (horário de Brasília, pelos horários do site) */
  (function statusLoja(){
    var box = document.getElementById('loja-status'), txt = document.getElementById('loja-status-t');
    var quadro = document.getElementById('horarios');
    if (!box || !txt || !window.Intl || !Intl.DateTimeFormat) return;
    // abre/fecha em minutos desde 0h; 0=domingo … 6=sábado
    var H = { 0:[480,750], 1:[480,1020], 2:[480,1020], 3:[480,1020], 4:[480,1020], 5:[480,1020], 6:[480,960] };
    var DIAS = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    function hm(min){ var h = Math.floor(min / 60), m = min % 60; return h + 'h' + (m ? String(m).padStart(2,'0') : ''); }
    function agora(){
      var f = new Intl.DateTimeFormat('en-US', { timeZone:'America/Sao_Paulo', weekday:'short', hour:'numeric', minute:'numeric', hourCycle:'h23' });
      var o = {}; f.formatToParts(new Date()).forEach(function(p){ o[p.type] = p.value; });
      return { d: DIAS[o.weekday], m: (parseInt(o.hour,10) % 24) * 60 + parseInt(o.minute,10) };
    }
    function pintar(){
      var n; try { n = agora(); } catch (e) { return; }
      if (n.d == null) return;
      var h = H[n.d], aberta = n.m >= h[0] && n.m < h[1], t;
      if (aberta) t = 'Aberto agora · até ' + hm(h[1]);
      else if (n.m < h[0]) t = 'Fechado agora · abre hoje às ' + hm(h[0]);
      else t = 'Fechado agora · abre amanhã às ' + hm(H[(n.d + 1) % 7][0]);
      txt.textContent = t;
      box.hidden = false;
      box.classList.toggle('fechada', !aberta);
      if (quadro) [].forEach.call(quadro.children, function(r){
        r.classList.toggle('hoje', (r.getAttribute('data-dias') || '').split(',').indexOf(String(n.d)) > -1);
      });
    }
    pintar();
    setInterval(pintar, 60000);
  })();
})();
