// Entrada do Worker na Cloudflare (ver wrangler.toml e docs/CLOUDFLARE.md).
//
// Bindings:
//   DB       D1 (banco SQLite gerenciado)          — migrations/*.sql
//   UPLOADS  R2 (fotos enviadas pelo /admin)
//   ASSETS   arquivos estáticos (pasta public/)
//   IMAGES   Cloudflare Images (opcional; otimiza as fotos enviadas)
// Variáveis/segredos: SITE_URL, OLISEK_API_URL, OLISEK_AUTO_SYNC,
// OLISEK_LOGIN e OLISEK_PASSWORD (estes dois via `wrangler secret put`).
import { handle, configFromEnv } from './app.js';
import { r2Storage } from './storage.js';
import { purgeExpired } from './auth.js';
import { normalizarCategoriasGravadas, syncAllFromOlisek } from './services/catalog.js';
import { apiConfigured } from './services/olisek.js';

function deps(env, request) {
  return {
    db: env.DB,
    storage: r2Storage(env.UPLOADS),
    assets: env.ASSETS,
    images: env.IMAGES,
    config: configFromEnv(env),
    clientIp: request ? request.headers.get('cf-connecting-ip') || '' : '',
  };
}

export default {
  async fetch(request, env) {
    return handle(request, deps(env, request));
  },

  /** Cron (wrangler.toml, a cada 30 min): limpeza de sessões vencidas,
   *  unificação de categorias e — só se OLISEK_AUTO_SYNC=1 — atualização do
   *  estoque dos produtos com vínculo CONFIRMADO na OliSek. */
  async scheduled(event, env, ctx) {
    const d = deps(env);
    ctx.waitUntil((async () => {
      await purgeExpired(d.db);
      await normalizarCategoriasGravadas(d.db);
      if (d.config.olisekAutoSync && apiConfigured(d.config)) {
        const report = await syncAllFromOlisek(d.db, d.config, { user: { id: null, name: 'Sincronização automática' } });
        console.log('[cron] OliSek:', JSON.stringify(report));
      }
    })());
  },
};
