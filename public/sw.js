// Service worker do app (site instalado na tela inicial do celular).
// Deliberadamente simples:
//  - páginas: sempre da rede (preço, publicação e equipe mudam pelo
//    painel); sem internet, mostra /offline.html;
//  - CSS, JS, ícones e imagens fixas (/assets/): servidos do aparelho e
//    atualizados por trás (os arquivos de CSS/JS levam ?v= na URL);
//  - /admin, /api e /uploads nunca passam pelo cache daqui.
// Ao mudar a lógica deste arquivo, troque VERSAO: o aparelho baixa o novo
// e apaga o cache antigo.
const VERSAO = 'en-v1';
const ESSENCIAIS = ['/offline.html', '/assets/icons/icon-192.png', '/assets/images/logo-essencia-natural.webp'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    if (url.pathname.startsWith('/admin')) return;
    ev.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    ev.respondWith(caches.open(VERSAO).then(async (cache) => {
      const guardado = await cache.match(req);
      const daRede = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => guardado);
      return guardado || daRede;
    }));
  }
});
