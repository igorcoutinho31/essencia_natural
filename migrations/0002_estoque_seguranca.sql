-- Estoque robusto + segurança do admin (migração para a Cloudflare, 10/2026).
-- Idempotente: pode rodar de novo sem efeito.

-- Livro-razão do estoque: TODA mudança de products.stock passa por uma
-- linha aqui (entrada, saída, ajuste, sincronização/importação OliSek,
-- estoque inicial). O trigger abaixo é quem grava o saldo em `products` —
-- assim o número do produto e o histórico nunca ficam diferentes.
--
-- A linha é inserida com `INSERT ... SELECT ... FROM products WHERE
-- stock + quantidade >= 0` (ver src/services/inventory.js): o saldo
-- anterior é lido e o novo é gravado no MESMO comando, então duas pessoas
-- dando baixa ao mesmo tempo nunca deixam o estoque negativo nem perdem
-- uma das baixas.
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('inicial','entrada','saida','ajuste','olisek_import','olisek_api')),
  quantity INTEGER NOT NULL,                       -- variação (+ entrou, - saiu)
  stock_before INTEGER NOT NULL,
  stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
  stock_source TEXT NOT NULL,                      -- origem que products.stock_source passa a ter
  reason TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);

CREATE TRIGGER IF NOT EXISTS trg_stock_movements_apply
AFTER INSERT ON stock_movements
BEGIN
  UPDATE products
     SET stock = NEW.stock_after,
         stock_source = NEW.stock_source,
         updated_at = datetime('now')
   WHERE id = NEW.product_id;
END;

-- Saldo de abertura: produtos que já tinham estoque antes do livro-razão
-- existir ganham uma movimentação 'inicial' com o saldo atual (o trigger
-- regrava o mesmo número — nada muda no estoque).
INSERT INTO stock_movements (product_id, kind, quantity, stock_before, stock_after, stock_source, reason, user_name)
SELECT p.id, 'inicial', p.stock, 0, p.stock, p.stock_source, 'Saldo de abertura do histórico de estoque', 'Sistema'
  FROM products p
 WHERE p.stock > 0 AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id = p.id);

-- Limite de tentativas de login (anti força-bruta). Uma linha por chave
-- ("ip:<ip>" e "user:<usuario>"); zera ao acertar a senha.
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  locked_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
