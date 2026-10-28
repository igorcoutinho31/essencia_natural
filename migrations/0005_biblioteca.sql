-- Biblioteca de cadastros (28/10/2026): ~2.910 produtos coletados de sites
-- de fornecedores (Atlântico e ONUH) entram OCULTOS no admin para a loja
-- revisar e publicar em lote. Ver docs/CATALOGO.md, "Biblioteca".

-- De onde o cadastro veio. NULL = cadastro da própria loja.
ALTER TABLE products ADD COLUMN source TEXT;                 -- 'atlantico' | 'onuh' | NULL
ALTER TABLE products ADD COLUMN source_id TEXT;              -- ex.: 'onuh:afnan-9-am-dive-edp-100ml'
ALTER TABLE products ADD COLUMN source_url TEXT;
ALTER TABLE products ADD COLUMN concentration TEXT;          -- EDP, EDT, Extrait...
-- 1 = o nome bate com um item do relatório de estoque da loja (OliSek,
-- 22/09/2026) — ajuda a achar o mix real da loja no meio da biblioteca.
ALTER TABLE products ADD COLUMN in_store_report INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN store_report_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_source_id ON products(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_source ON products(source);

-- Direito de uso da foto. 1 = pode aparecer no site (foto da loja, enviada
-- pelo admin, ou de fornecedor que a loja confirmou que libera o uso).
-- 0 = foto de fornecedor ainda NÃO liberada: só aparece dentro do /admin.
ALTER TABLE product_images ADD COLUMN licensed INTEGER NOT NULL DEFAULT 1;
