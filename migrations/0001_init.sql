-- Esquema da V2 já com todas as migrações incrementais do antigo
-- server/db.js aplicadas (olisek_link_status, sales, requires_product,
-- olisek_synced_at). É o ponto de partida do D1 (Cloudflare) e também é
-- aplicado pelo servidor Node local (server/sqlite-d1.js) — tudo aqui é
-- idempotente (IF NOT EXISTS), então rodar de novo numa base que já existe
-- não muda nada.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('vendedora','admin')),
  must_change_password INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- requires_product: 0 (padrão) = marca sempre aparece em #marcas; 1 = só
-- aparece com pelo menos um produto público/ativo (ver
-- catalog.getBrandsPublic e docs/CATALOGO.md).
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  logo_path TEXT,
  requires_product INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  olisek_id INTEGER UNIQUE,
  olisek_name TEXT,
  olisek_link_status TEXT NOT NULL DEFAULT 'unlinked', -- confirmed | probable | needs_review | unlinked
  olisek_synced_at TEXT,
  name TEXT NOT NULL,
  brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  category TEXT,
  volume TEXT,
  gender TEXT,
  family TEXT,
  description TEXT,
  notes_top TEXT,
  notes_heart TEXT,
  notes_base TEXT,
  price REAL,
  compare_price REAL,
  stock INTEGER NOT NULL DEFAULT 0,
  stock_source TEXT NOT NULL DEFAULT 'none',  -- olisek_api | olisek_import | manual | none
  sales INTEGER NOT NULL DEFAULT 0,           -- vendas acumuladas (só importação real da OliSek)
  active INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  legacy_instagram_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_main INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  old_price REAL,
  new_price REAL,
  old_compare_price REAL,
  new_compare_price REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);
