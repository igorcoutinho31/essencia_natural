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

  /* poeira dourada na abertura — discreta, só enquanto está na tela */
  (function poeira(){
    var cv = document.getElementById('hero-particulas');
    if (!cv || reduzido || !cv.getContext) return;
    var ctx = cv.getContext('2d'), w = 0, h = 0, P = [], rodando = false, raf = 0;
    function nova(inicio){
      return { x:Math.random() * w, y:inicio ? Math.random() * h : h + 8, r:Math.random() * 1.4 + .4,
               v:Math.random() * .22 + .05, d:Math.random() * 6.28, a:Math.random() * .32 + .12, f:Math.random() * .8 + .5 };
    }
    function tamanho(){
      var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.max(14, Math.min(46, Math.round(w * h / 26000)));
      while (P.length < n) P.push(nova(true));
      P.length = n;
    }
    function quadro(t){
      if (!rodando) return;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < P.length; i++) {
        var q = P[i];
        q.y -= q.v; q.x += Math.sin(t * .0005 + q.d) * .22;
        if (q.y < -10) { P[i] = nova(false); continue; }
        var borda = Math.min(1, q.y / (h * .2), (h - q.y) / (h * .12) + .2);
        var a = q.a * (.55 + .45 * Math.sin(t * .0016 * q.f + q.d)) * Math.max(0, borda);
        var g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r * 4);
        g.addColorStop(0, 'rgba(240,210,150,' + a + ')');
        g.addColorStop(1, 'rgba(240,210,150,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 4, 0, 6.283); ctx.fill();
      }
      raf = requestAnimationFrame(quadro);
    }
    function ligar(){ if (!rodando) { rodando = true; raf = requestAnimationFrame(quadro); } }
    function desligar(){ rodando = false; cancelAnimationFrame(raf); }
    tamanho();
    window.addEventListener('resize', tamanho);
    if ('IntersectionObserver' in window) new IntersectionObserver(function(es){ es[0].isIntersecting ? ligar() : desligar(); }).observe(cv);
    else ligar();
    document.addEventListener('visibilitychange', function(){ document.hidden ? desligar() : ligar(); });
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
