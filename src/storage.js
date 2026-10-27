// Armazenamento das fotos enviadas pelo /admin. Interface única:
//   put(key, bytes, contentType)       grava
//   get(key) -> { body, contentType, etag, size } | null
//   delete(key)
//   list(prefix) -> [key, ...]
// As chaves são relativas a /uploads/ (ex.: "products/atheeri/principal.webp").
// Três implementações:
//   d1Storage  — no próprio banco D1 (padrão na Cloudflare: plano grátis,
//                sem precisar ativar o R2, que pede cartão)
//   r2Storage  — bucket R2 (se o binding UPLOADS existir no wrangler.toml)
//   fsStorage  — pasta no disco (Node local, server/storage-fs.js)
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

// Pedaço de base64 por linha: bem abaixo do limite de 100 KB por comando
// SQL do D1 (a importação grava as fotos por SQL).
export const CHUNK_CHARS = 64 * 1024;

function chunksOf(bytes) {
  const b64 = Buffer.from(bytes).toString('base64');
  const out = [];
  for (let i = 0; i < b64.length; i += CHUNK_CHARS) out.push(b64.slice(i, i + CHUNK_CHARS));
  return out.length ? out : [''];
}

function etagOf(bytes) {
  return `"${crypto.createHash('sha1').update(bytes).digest('hex')}"`;
}

export function d1Storage(db) {
  return {
    async put(key, bytes, contentType) {
      const parts = chunksOf(bytes);
      await db.batch([
        db.prepare('DELETE FROM upload_chunks WHERE key = ?').bind(key),
        db.prepare(`INSERT INTO uploads (key, content_type, size, etag, chunks) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET content_type=excluded.content_type, size=excluded.size, etag=excluded.etag, chunks=excluded.chunks`)
          .bind(key, contentType, bytes.length, etagOf(bytes), parts.length),
        ...parts.map((data, idx) => db.prepare('INSERT INTO upload_chunks (key, idx, data) VALUES (?, ?, ?)').bind(key, idx, data)),
      ]);
    },
    async get(key) {
      const meta = await db.prepare('SELECT content_type, size, etag FROM uploads WHERE key = ?').bind(key).first();
      if (!meta) return null;
      const { results } = await db.prepare('SELECT data FROM upload_chunks WHERE key = ? ORDER BY idx').bind(key).all();
      const body = new Uint8Array(Buffer.from(results.map((r) => r.data).join(''), 'base64'));
      return { body, contentType: meta.content_type, etag: meta.etag, size: body.length };
    },
    async delete(key) {
      await db.batch([
        db.prepare('DELETE FROM upload_chunks WHERE key = ?').bind(key),
        db.prepare('DELETE FROM uploads WHERE key = ?').bind(key),
      ]);
    },
    async list(prefix) {
      const { results } = await db.prepare("SELECT key FROM uploads WHERE substr(key, 1, ?) = ? ORDER BY key").bind(prefix.length, prefix).all();
      return results.map((r) => r.key);
    },
  };
}

/** SQL (texto) que grava uma foto nas tabelas do d1Storage — usado pela
 *  importação (tools/cf-importar.js). `key` precisa já ter sido validada. */
export function uploadSQL(key, bytes, contentType) {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const parts = chunksOf(bytes);
  return [
    `DELETE FROM upload_chunks WHERE key = ${q(key)};`,
    `DELETE FROM uploads WHERE key = ${q(key)};`,
    `INSERT INTO uploads (key, content_type, size, etag, chunks) VALUES (${q(key)}, ${q(contentType)}, ${bytes.length}, ${q(etagOf(bytes))}, ${parts.length});`,
    ...parts.map((data, idx) => `INSERT INTO upload_chunks (key, idx, data) VALUES (${q(key)}, ${idx}, '${data}');`),
  ].join('\n');
}

export function r2Storage(bucket) {
  return {
    async put(key, bytes, contentType) {
      await bucket.put(key, bytes, { httpMetadata: { contentType } });
    },
    async get(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return { body: obj.body, contentType: obj.httpMetadata?.contentType, etag: obj.httpEtag, size: obj.size };
    },
    async delete(key) {
      await bucket.delete(key);
    },
    async list(prefix) {
      const keys = [];
      let cursor;
      do {
        const page = await bucket.list({ prefix, cursor });
        keys.push(...page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return keys;
    },
  };
}
