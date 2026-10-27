// Banco no Node local: SQLite embutido (`node:sqlite`) com a MESMA API do
// D1 da Cloudflare (prepare/bind/first/all/run/batch/exec), para o código
// de src/ rodar igual nos dois lugares. Também aplica migrations/*.sql
// (todas idempotentes) toda vez que abre o banco.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS_DIR } from './paths.js';

function toParam(v) {
  if (v === undefined) throw new TypeError('D1_TYPE_ERROR: Type \'undefined\' not supported for value \'undefined\'');
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

const RETURNS_ROWS = /^\s*(select|pragma|with|values)\b|\breturning\b/i;

class Statement {
  constructor(d1, sql, params = []) {
    this.d1 = d1;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new Statement(this.d1, this.sql, params.map(toParam));
  }

  _stmt() { return this.d1._prepare(this.sql); }

  _all() {
    const results = this._stmt().all(...this.params).map((r) => ({ ...r }));
    return { success: true, results, meta: { changes: 0, last_row_id: 0 } };
  }

  _run() {
    if (RETURNS_ROWS.test(this.sql)) return this._all();
    const info = this._stmt().run(...this.params);
    return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }

  async first(column) {
    const row = this._stmt().get(...this.params);
    if (!row) return null;
    return column ? row[column] : { ...row };
  }

  async all() { return this._all(); }

  async run() { return this._run(); }
}

export class SqliteD1 {
  constructor(file) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.cache = new Map();
    if (file !== ':memory:') this.raw.exec('PRAGMA journal_mode = WAL');
    this.raw.exec('PRAGMA foreign_keys = ON');
  }

  _prepare(sql) {
    let stmt = this.cache.get(sql);
    if (!stmt) { stmt = this.raw.prepare(sql); this.cache.set(sql, stmt); }
    return stmt;
  }

  prepare(sql) { return new Statement(this, sql); }

  /** Atômico, como no D1: tudo ou nada. */
  async batch(statements) {
    this.raw.exec('BEGIN');
    try {
      const out = statements.map((s) => s._run());
      this.raw.exec('COMMIT');
      return out;
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }

  async exec(sql) {
    this.raw.exec(sql);
    return { count: 0, duration: 0 };
  }

  close() { if (this.raw.isOpen) this.raw.close(); }
}

// Bancos criados pela V2 antes da Cloudflare (Railway) evoluíram por
// ALTER TABLE no antigo server/db.js. Mantido aqui para uma base antiga
// ainda subir certa; numa base nova tudo já vem de 0001_init.sql.
function legacyMigrations(raw) {
  const cols = (t) => raw.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  let productCols = cols('products');
  if (!productCols.includes('olisek_link_status')) {
    raw.exec("ALTER TABLE products ADD COLUMN olisek_link_status TEXT NOT NULL DEFAULT 'unlinked'");
    raw.exec(productCols.includes('olisek_match_confidence')
      ? `UPDATE products SET olisek_link_status = CASE
           WHEN olisek_match_confidence = 'confirmado' THEN 'confirmed'
           WHEN olisek_match_confidence = 'provavel' THEN 'probable'
           WHEN olisek_id IS NOT NULL THEN 'confirmed' ELSE 'unlinked' END`
      : "UPDATE products SET olisek_link_status = CASE WHEN olisek_id IS NOT NULL THEN 'confirmed' ELSE 'unlinked' END");
  }
  if (productCols.includes('olisek_match_confidence')) raw.exec('ALTER TABLE products DROP COLUMN olisek_match_confidence');
  if (!raw.prepare("SELECT 1 FROM settings WHERE key = 'migration_stock_source_none'").get()) {
    raw.exec("UPDATE products SET stock_source = 'none' WHERE olisek_id IS NULL AND stock_source = 'manual' AND stock = 0");
    raw.prepare("INSERT INTO settings (key, value) VALUES ('migration_stock_source_none', datetime('now'))").run();
  }
  productCols = cols('products');
  if (!productCols.includes('sales')) raw.exec('ALTER TABLE products ADD COLUMN sales INTEGER NOT NULL DEFAULT 0');
  if (!productCols.includes('olisek_synced_at')) raw.exec('ALTER TABLE products ADD COLUMN olisek_synced_at TEXT');
  if (!cols('brands').includes('requires_product')) raw.exec('ALTER TABLE brands ADD COLUMN requires_product INTEGER NOT NULL DEFAULT 0');
}

export function applyMigrations(d1) {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  files.forEach((f, i) => {
    d1.raw.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
    if (i === 0) legacyMigrations(d1.raw);
  });
}

export function openDatabase(file) {
  const d1 = new SqliteD1(file);
  applyMigrations(d1);
  return d1;
}
