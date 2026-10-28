  /* ---- app: o site instalado na tela inicial do celular (PWA) ----
     Só registra o service worker (/sw.js). O cliente instala pelo menu do
     navegador: "Adicionar à tela inicial" (iPhone: Compartilhar) ou
     "Instalar app" (Android). Ver docs/APP.md. */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('/sw.js').catch(function(){});
    });
  }
