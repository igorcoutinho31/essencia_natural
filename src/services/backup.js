// Backup completo (banco + fotos enviadas) num JSON só. Serve para:
//  1. levar os dados do Railway para a Cloudflare (baixa em /admin/estoque
//     no servidor antigo -> `npm run cf:importar -- backup.json`);
//  2. ter uma cópia de segurança a qualquer momento.
// Sessões e tentativas de login ficam de fora de propósito (todo mundo
// entra de novo depois da importação). O arquivo contém os hashes das
// senhas: guarde em lugar privado e apague depois de usar.
import { Buffer } from 'node:buffer';

export const BACKUP_TABLES = ['users', 'brands', 'products', 'product_images', 'price_history', 'settings', 'stock_movements'];

export async function exportBackup(db, storage, { includeUploads = true } = {}) {
  const tables = {};
  const existentes = new Set((await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map((r) => r.name));
  for (const t of BACKUP_TABLES) {
    tables[t] = existentes.has(t) ? (await db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results : [];
  }
  const uploads = [];
  if (includeUploads) {
    for (const key of await storage.list('products/')) {
      const obj = await storage.get(key);
      if (!obj) continue;
      const bytes = new Uint8Array(await new Response(obj.body).arrayBuffer());
      uploads.push({ key, contentType: obj.contentType, base64: Buffer.from(bytes).toString('base64') });
    }
  }
  return { format: 'essencia-natural-backup', version: 1, exportedAt: new Date().toISOString(), tables, uploads };
}

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Gera o SQL que substitui todo o conteúdo do banco de destino pelo do
 *  backup. `columnsByTable` = colunas que existem no destino (as que o
 *  backup tiver a mais, de um esquema antigo, são ignoradas). O trigger de
 *  estoque é desligado durante a carga para o histórico importado não
 *  reescrever o saldo dos produtos. */
export function backupToSQL(backup, columnsByTable) {
  if (backup?.format !== 'essencia-natural-backup') throw new Error('Arquivo não é um backup da Essência Natural.');
  const out = ['PRAGMA defer_foreign_keys = true;', 'DROP TRIGGER IF EXISTS trg_stock_movements_apply;'];
  for (const t of [...BACKUP_TABLES].reverse()) out.push(`DELETE FROM ${t};`);
  out.push('DELETE FROM sessions;', 'DELETE FROM login_attempts;');
  for (const t of BACKUP_TABLES) {
    const cols = columnsByTable[t];
    const rows = backup.tables?.[t] || [];
    if (!cols || !rows.length) continue;
    const usar = cols.filter((c) => c in rows[0]);
    for (const r of rows) {
      out.push(`INSERT INTO ${t} (${usar.join(', ')}) VALUES (${usar.map((c) => sqlValue(r[c])).join(', ')});`);
    }
  }
  // Backup de antes do histórico de estoque: abre o histórico com o saldo atual.
  out.push(`INSERT INTO stock_movements (product_id, kind, quantity, stock_before, stock_after, stock_source, reason, user_name)
SELECT p.id, 'inicial', p.stock, 0, p.stock, p.stock_source, 'Saldo de abertura do histórico de estoque', 'Sistema'
  FROM products p WHERE p.stock > 0 AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id = p.id);`);
  out.push(TRIGGER_SQL);
  return out.join('\n') + '\n';
}

export const TRIGGER_SQL = `CREATE TRIGGER IF NOT EXISTS trg_stock_movements_apply
AFTER INSERT ON stock_movements
BEGIN
  UPDATE products
     SET stock = NEW.stock_after,
         stock_source = NEW.stock_source,
         updated_at = datetime('now')
   WHERE id = NEW.product_id;
END;`;
