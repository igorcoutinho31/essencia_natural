// Armazenamento de fotos no Node local: a pasta uploads/ (ou
// $STORAGE_DIR/uploads). Mesma interface do R2 em src/storage.js.
import fs from 'node:fs';
import path from 'node:path';
import { mimeFor } from '../src/util.js';

export function fsStorage(baseDir) {
  const root = path.resolve(baseDir);
  const resolve = (key) => {
    const abs = path.resolve(root, key);
    if (!abs.startsWith(root + path.sep)) throw new Error('caminho inválido: ' + key);
    return abs;
  };
  return {
    async put(key, bytes) {
      const abs = resolve(key);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, bytes);
    },
    async get(key) {
      let abs;
      try { abs = resolve(key); } catch { return null; }
      let stat;
      try { stat = fs.statSync(abs); } catch { return null; }
      if (!stat.isFile()) return null;
      return {
        body: new Uint8Array(fs.readFileSync(abs)),
        contentType: mimeFor(abs),
        etag: `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
        size: stat.size,
      };
    },
    async delete(key) {
      try { fs.unlinkSync(resolve(key)); } catch { /* já não existia */ }
    },
    async list(prefix) {
      const out = [];
      const walk = (dir) => {
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, e.name);
          if (e.isDirectory()) walk(abs);
          else out.push(path.relative(root, abs).split(path.sep).join('/'));
        }
      };
      walk(root);
      return out.filter((k) => k.startsWith(prefix)).sort();
    },
  };
}
