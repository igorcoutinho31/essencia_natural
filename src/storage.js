// Armazenamento das fotos enviadas pelo /admin. Interface única:
//   put(key, bytes, contentType)       grava
//   get(key) -> { body, contentType, etag, size } | null
//   delete(key)
//   list(prefix) -> [key, ...]
// Na Cloudflare é um bucket R2 (r2Storage); no Node local é a pasta
// uploads/ (server/storage-fs.js). As chaves são relativas a /uploads/
// (ex.: "products/atheeri/principal.webp").

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
