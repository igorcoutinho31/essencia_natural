// Banco de dados da V2 — SQLite embutido no próprio Node (módulo `node:sqlite`).
//
// Por quê SQLite embutido, e não Postgres/MySQL com um pacote do npm: o
// ambiente onde este projeto foi criado bloqueia `npm install` (política de
// segurança da sessão de nuvem), então o back-end inteiro é escrito só com
// módulos nativos do Node — nada em node_modules. `node:sqlite` é nativo do
// Node 22+ e guarda tudo num arquivo só (`data/essencia.sqlite`), o que é
// mais que suficiente para uma loja deste porte. Se um dia a operação
// crescer muito, trocar para Postgres é uma migração de dados, não uma
// reescrita — o `catalogService` é a única camada que fala com o banco.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'data', 'essencia.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
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

CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  logo_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  olisek_id INTEGER UNIQUE,
  olisek_name TEXT,
  olisek_match_confidence TEXT,      -- 'confirmado' | 'provavel' | null (ver docs/OLISEK-INTEGRATION.md)
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
  stock_source TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'olisek_import'
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
`);

module.exports = db;
