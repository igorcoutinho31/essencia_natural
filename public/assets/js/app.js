  /* ---- app: o site instalado na tela inicial do celular (PWA) ----
     Registra o service worker (/sw.js) e, no celular, mostra um convite
     discreto para instalar: no Android o botão abre a instalação do
     navegador; no iPhone (Safari) explica o "Adicionar à Tela de Início".
     Aparece depois de uns segundos no site, nunca para quem já instalou,
     e some por 30 dias quando a pessoa fecha. Ver docs/APP.md. */
  (function(){
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      window.addEventListener('load', function(){
        navigator.serviceWorker.register('/sw.js').catch(function(){});
      });
    }

    var CHAVE = 'en-convite-app', DIAS = 30, ESPERA = 20000;
    var ua = navigator.userAgent || '';
    var instalado = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    var celular = window.matchMedia && matchMedia('(max-width: 820px) and (pointer: coarse)').matches;
    var iphone = /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Instagram|FBAN|FBAV|Line\//.test(ua);
    if (instalado || !celular) return;

    function fechadoHaPouco(){
      try { var t = Number(localStorage.getItem(CHAVE) || 0); return t && Date.now() - t < DIAS * 864e5; } catch (e) { return false; }
    }
    function lembrarFechado(){ try { localStorage.setItem(CHAVE, String(Date.now())); } catch (e) {} }
    if (fechadoHaPouco()) return;

    var pedido = null, mostrado = false;
    window.addEventListener('beforeinstallprompt', function(ev){ ev.preventDefault(); pedido = ev; });
    window.addEventListener('appinstalled', function(){ lembrarFechado(); fechar(); });

    var caixa;
    function el(tag, cls, txt){ var e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; }
    function fechar(){ if (caixa) { caixa.classList.remove('aberto'); setTimeout(function(){ caixa && caixa.remove(); caixa = null; }, 400); } }

    function mostrar(){
      if (mostrado || (!pedido && !iphone)) return; // sem como instalar (ex.: navegador do Instagram)
      mostrado = true;
      caixa = el('aside', 'convite-app');
      caixa.setAttribute('role', 'dialog'); caixa.setAttribute('aria-label', 'Instalar o app da Essência Natural');
      if (document.querySelector('.barra-app')) caixa.classList.add('convite-app--barra');
      var logo = el('img', 'convite-app-logo'); logo.src = '/assets/icons/icon-192.png'; logo.alt = ''; logo.width = 48; logo.height = 48;
      var txt = el('div', 'convite-app-txt');
      txt.appendChild(el('strong', null, 'Leve a Essência no celular'));
      txt.appendChild(el('span', null, iphone
        ? 'Toque em Compartilhar (o quadrado com a seta) e depois em "Adicionar à Tela de Início".'
        : 'Instale o app: abre direto no catálogo, sem ocupar espaço.'));
      var acoes = el('div', 'convite-app-acoes');
      if (pedido) {
        var instalar = el('button', 'btn btn-primary btn-sm', 'Instalar');
        instalar.type = 'button';
        instalar.addEventListener('click', function(){
          pedido.prompt();
          pedido.userChoice.then(function(){ lembrarFechado(); fechar(); }, fechar);
          pedido = null;
        });
        acoes.appendChild(instalar);
      }
      var x = el('button', 'convite-app-fechar', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Fechar');
      x.addEventListener('click', function(){ lembrarFechado(); fechar(); });
      caixa.append(logo, txt, acoes, x);
      document.body.appendChild(caixa);
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ caixa && caixa.classList.add('aberto'); }); });
    }
    setTimeout(mostrar, ESPERA);
  })();
