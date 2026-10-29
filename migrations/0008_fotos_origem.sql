-- 0008 — Endereço da foto original de cada foto do catálogo importado.
-- Preenchida pelo /admin/ferramentas ("Fotos em alta definição") a partir do
-- catalog.json do pacote; serve só para buscar de novo a foto original em
-- tamanho maior. Uso interno: nunca aparece no site.
CREATE TABLE IF NOT EXISTS foto_origem (
  sha TEXT PRIMARY KEY,           -- nome do arquivo em /uploads/biblioteca/<sha>.webp
  url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Trocar a foto em todos os produtos que usam o mesmo arquivo.
CREATE INDEX IF NOT EXISTS idx_product_images_file ON product_images(file_path);

-- Sessões passam a ser guardadas só pelo hash (src/auth.js). As antigas,
-- guardadas do jeito anterior, deixam de valer: cada pessoa entra de novo
-- no painel uma vez.
DELETE FROM sessions;
