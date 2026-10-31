// Entrada do Worker na Cloudflare (ver wrangler.toml e docs/CLOUDFLARE.md).
//
// Bindings:
//   DB       D1 (banco SQLite gerenciado)          — migrations/*.sql
//   UPLOADS  R2 (opcional) — sem ele, as fotos ficam no próprio D1
//   ASSETS   arquivos estáticos (pasta public/)
//   IMAGES   Cloudflare Images (opcional; otimiza as fotos enviadas)
// Variáveis/segredos: SITE_URL, OLISEK_API_URL, OLISEK_AUTO_SYNC,
// OLISEK_LOGIN e OLISEK_PASSWORD (estes dois via `wrangler secret put`).
import { handle, configFromEnv } from './app.js';
import { r2Storage, d1Storage } from './storage.js';
import { purgeExpired } from './auth.js';
import { normalizarCategoriasGravadas, syncAllFromOlisek } from './services/catalog.js';
import { apiConfigured } from './services/olisek.js';
import { weeklySnapshotIfDue, purgeTrash } from './services/autoBackup.js';
import { melhorarFotosPublicadas } from './services/fotosAuto.js';

function deps(env, request) {
  return {
    db: env.DB,
    storage: env.UPLOADS ? r2Storage(env.UPLOADS) : d1Storage(env.DB),
    assets: env.ASSETS,
    images: env.IMAGES,
    config: configFromEnv(env),
    clientIp: request ? request.headers.get('cf-connecting-ip') || '' : '',
  };
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, {
      ...deps(env, request),
      cache: typeof caches !== 'undefined' ? caches.default : null, // cache na borda (ver src/app.js)
      waitUntil: (p) => ctx.waitUntil(p),
    });
  },

  /** Cron (wrangler.toml, a cada 10 min): fotos em alta automáticas, cópia semanal automática dos
   *  dados, remoção definitiva de fotos apagadas há 90+ dias, limpeza de
   *  sessões vencidas, unificação de categorias e — só se
   *  OLISEK_AUTO_SYNC=1 — estoque dos vínculos CONFIRMADOS na OliSek. */
  async scheduled(event, env, ctx) {
    const d = deps(env);
    ctx.waitUntil((async () => {
      const copia = await weeklySnapshotIfDue(d.db);
      if (copia) console.log('[cron] cópia automática dos dados criada:', copia);
      await purgeTrash(d.db, d.storage);
      await purgeExpired(d.db);
      // lê todos os produtos: uma vez por dia basta (às 03h UTC)
      const quando = new Date(event.scheduledTime || Date.now());
      if (quando.getUTCHours() === 3 && quando.getUTCMinutes() < 10) await normalizarCategoriasGravadas(d.db);
      // fotos dos produtos publicados na melhor qualidade, sem precisar do painel
      const fotos = await melhorarFotosPublicadas(d.db, d.storage, d.images, { limite: 4 });
      if (fotos.ok || fotos.falhou) console.log('[cron] fotos em alta:', JSON.stringify(fotos));
      if (d.config.olisekAutoSync && apiConfigured(d.config)) {
        const report = await syncAllFromOlisek(d.db, d.config, { user: { id: null, name: 'Sincronização automática' } });
        console.log('[cron] OliSek:', JSON.stringify(report));
      }
    })());
  },
};
