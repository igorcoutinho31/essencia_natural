-- 0010 — Índice para "os mexidos por último" do painel da loja
-- (src/services/loja.js): sem ele, cada abertura da tela lia a tabela de
-- produtos inteira para ordenar (o banco grátis tem limite de leituras/dia).
CREATE INDEX IF NOT EXISTS idx_products_updated ON products(updated_at DESC, id DESC);
