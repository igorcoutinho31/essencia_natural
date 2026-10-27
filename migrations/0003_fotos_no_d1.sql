-- Fotos enviadas pelo /admin guardadas no próprio D1 — para o site rodar
-- 100% no plano grátis da Cloudflare sem ativar o R2 (que pede cartão).
-- Cada foto vira uma linha em `uploads` + pedaços de até 64 KB (texto
-- base64) em `upload_chunks`: o D1 limita o tamanho de cada comando SQL,
-- e a importação (tools/cf-importar.js) grava as fotos por SQL.
-- Se o binding R2 (`UPLOADS`) estiver configurado, o Worker usa o R2 e
-- estas tabelas ficam vazias. Ver src/storage.js.
CREATE TABLE IF NOT EXISTS uploads (
  key TEXT PRIMARY KEY,                 -- ex.: products/atheeri/principal.webp
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  etag TEXT NOT NULL,
  chunks INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS upload_chunks (
  key TEXT NOT NULL REFERENCES uploads(key) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  data TEXT NOT NULL,                   -- base64
  PRIMARY KEY (key, idx)
);
