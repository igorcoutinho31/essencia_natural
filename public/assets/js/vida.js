/* ---- vida: movimento sutil ----
   Tudo aqui é decoração: com prefers-reduced-motion nada roda, e o
   conteúdo fica visível sem depender de nenhum destes efeitos. Os
   efeitos de brilho/partículas foram reduzidos na V2 (menos densidade,
   menos opacidade, menos inclinação) para um acabamento mais comercial
   e menos "efeito de template". */
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

  /* aparecer ao rolar */
  (function revelar(){
    if (reduzido || !('IntersectionObserver' in window)) return;
    var alvos = [
      '.cat-head','.cat-tools','.cat-chips','#marcas .sec-head','.marca','.canal','.canais-fluxo',
      '.equipe-head','.pessoa','.social-wrap>*','.envios-copy>*','.envios-art',
      '#loja .sec-head','.loja-grid>*','#faq .sec-head','.faq-lista details','.cta-final>*','.foot>*'
    ];
    var nos = [].slice.call(document.querySelectorAll(alvos.join(',')));
    document.documentElement.classList.add('rv-on');
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin:'0px 0px -6% 0px', threshold:0.05 });
    nos.forEach(function(n, i){
      var irmaos = [].indexOf.call(n.parentNode.children, n);
      n.classList.add('rv');
      n.style.setProperty('--d', Math.min(irmaos, 5) * 0.08 + 's');
      io.observe(n);
    });
    // rede de segurança: se nada disparar (captura de tela, aba em segundo plano), mostra tudo
    setTimeout(function(){ nos.forEach(function(n){ n.classList.add('in'); }); }, 6000);
  })();

  /* poeira dourada no hero — discreta: poucas partículas, baixa opacidade */
  (function poeira(){
    var cv = document.getElementById('hero-particulas');
    if (!cv || reduzido || !cv.getContext) return;
    var ctx = cv.getContext('2d'), w = 0, h = 0, dpr = 1, P = [], rodando = false, raf = 0;
    function tamanho(){
      var r = cv.parentNode.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.max(8, Math.min(20, Math.round(w * h / 42000))); // V2: densidade reduzida
      while (P.length < n) P.push(nova(true));
      P.length = n;
    }
    function nova(inicio){
      return { x:Math.random() * w, y:inicio ? Math.random() * h : h + 8, r:Math.random() * 1.3 + .5,
               v:Math.random() * .18 + .06, d:Math.random() * 6.28, a:Math.random() * .26 + .1, f:Math.random() * .8 + .5 };
    }
    function quadro(t){
      if (!rodando) return;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < P.length; i++) {
        var q = P[i];
        q.y -= q.v; q.x += Math.sin(t * .0005 + q.d) * .2;
        if (q.y < -10) { P[i] = nova(false); continue; }
        var borda = Math.min(1, q.y / (h * .25), (h - q.y) / (h * .1) + .2);
        var a = q.a * (.55 + .45 * Math.sin(t * .0016 * q.f + q.d)) * Math.max(0, borda);
        var g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r * 4);
        g.addColorStop(0, 'rgba(238,203,132,' + a + ')');
        g.addColorStop(1, 'rgba(238,203,132,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 4, 0, 6.283); ctx.fill();
      }
      raf = requestAnimationFrame(quadro);
    }
    function ligar(){ if (!rodando) { rodando = true; raf = requestAnimationFrame(quadro); } }
    function desligar(){ rodando = false; cancelAnimationFrame(raf); }
    tamanho();
    window.addEventListener('resize', tamanho);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function(es){ es[0].isIntersecting ? ligar() : desligar(); }).observe(cv);
    } else ligar();
    document.addEventListener('visibilitychange', function(){ document.hidden ? desligar() : ligar(); });
  })();

  /* o brasão acompanha o ponteiro, bem de leve (só com mouse) */
  (function inclinar(){
    var selo = document.querySelector('.brasao-selo');
    var hero = document.getElementById('hero');
    if (!selo || !hero || reduzido || !window.matchMedia('(hover:hover)').matches) return;
    hero.addEventListener('pointermove', function(ev){
      var r = selo.getBoundingClientRect();
      var x = (ev.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
      var y = (ev.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
      x = Math.max(-1, Math.min(1, x)); y = Math.max(-1, Math.min(1, y));
      selo.style.transform = 'rotateY(' + (x * 3).toFixed(2) + 'deg) rotateX(' + (-y * 3).toFixed(2) + 'deg)'; // V2: inclinação reduzida (era 7deg)
    });
    hero.addEventListener('pointerleave', function(){ selo.style.transform = ''; });
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
      else {
        var prox = (n.d + 1) % 7;
        t = 'Fechado agora · abre amanhã às ' + hm(H[prox][0]);
      }
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
