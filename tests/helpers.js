// Monta o site inteiro em memória para os testes: mesmo roteador do Worker
// (src/app.js), banco SQLite em memória com a API do D1 e fotos numa pasta
// temporária. Sem rede, sem servidor HTTP.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handle, configFromEnv } from '../src/app.js';
import { SqliteD1, applyMigrations } from '../server/sqlite-d1.js';
import { fsStorage } from '../server/storage-fs.js';
import { staticAssets } from '../server/static.js';
import { PUBLIC_DIR } from '../server/paths.js';
import { hashPassword } from '../src/auth.js';

export const ORIGIN = 'https://www.lojaessencianatural.com.br';

export function createTestApp({ env = {}, images = null } = {}) {
  const db = new SqliteD1(':memory:');
  applyMigrations(db);
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'essencia-test-'));
  const deps = {
    db,
    storage: fsStorage(uploadsDir),
    assets: staticAssets(PUBLIC_DIR),
    images,
    config: configFromEnv(env),
    clientIp: '203.0.113.7',
  };
  let cookie = '';

  /** Faz um pedido ao site. `body` objeto = JSON, Uint8Array = bytes (com Origin do site). */
  async function call(pathname, { method = 'GET', body, headers = {}, ip, url = ORIGIN } = {}) {
    const init = { method, headers: Object.fromEntries(Object.entries(headers).filter(([, v]) => v !== undefined)) };
    if (cookie) init.headers.cookie = cookie;
    if (body !== undefined) {
      const bruto = body instanceof Uint8Array;
      init.body = bruto || typeof body === 'string' ? body : JSON.stringify(body);
      init.headers['content-type'] = bruto ? 'application/octet-stream' : 'application/json';
      if (!('origin' in headers)) init.headers.origin = url;
    }
    const res = await handle(new Request(url + pathname, init), { ...deps, clientIp: ip || deps.clientIp });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  }

  async function createUser({ username = 'admin', password = 'senha-forte-1', role = 'admin', mustChange = 0, name = 'Administração' } = {}) {
    const { hash, salt } = hashPassword(password);
    const { meta } = await db.prepare(
      'INSERT INTO users (name, username, password_hash, password_salt, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(name, username, hash, salt, role, mustChange).run();
    return meta.last_row_id;
  }

  async function login(username = 'admin', password = 'senha-forte-1') {
    const res = await call('/api/admin/login', { method: 'POST', body: { username, password } });
    if (res.status !== 200) throw new Error(`login falhou: ${res.status} ${await res.text()}`);
    return res;
  }

  async function insertProduct({ slug, name = 'Teste', active = 1, stock = 0, sales = 0, brandId = null, price = null }) {
    const { meta } = await db.prepare(
      'INSERT INTO products (slug, name, active, stock, sales, brand_id, price) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(slug, name, active, stock, sales, brandId, price).run();
    return meta.last_row_id;
  }

  function cleanup() {
    db.close();
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }

  return {
    db, deps, call, createUser, login, insertProduct, cleanup, uploadsDir,
    logout() { cookie = ''; },
  };
}

// PNG 1x1 válido.
export const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
