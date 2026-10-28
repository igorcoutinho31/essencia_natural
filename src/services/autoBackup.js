// Backups automáticos — rodam sozinhos pelo cron do Worker, sem ninguém da
// loja precisar fazer nada (ver migrations/0004_backups_automaticos.sql).
//
// Tudo é feito em SQL dentro do D1 (json_object / json_group_array): o
// Worker só monta os comandos e junta textos prontos. Isso importa porque o
// plano grátis dá 10 ms de CPU por execução — serializar ou compactar
// milhares de produtos em JavaScript passaria disso.
import { BACKUP_TABLES } from './backup.js';

export const KEEP_SNAPSHOTS = 12;      // ~3 meses de cópias semanais
export const SNAPSHOT_EVERY_DAYS = 7;
export const TRASH_DAYS = 90;          // fotos apagadas ficam guardadas por 90 dias

async function tableColumns(db) {
  const existentes = new Set((await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map((r) => r.name));
  const out = {};
  for (const t of BACKUP_TABLES) {
    if (!existentes.has(t)) continue;
    out[t] = (await db.prepare(`PRAGMA table_info(${t})`).all()).results.map((c) => c.name);
  }
  return out;
}

// json_object('id', id, 'name', name, ...) — nomes vêm do PRAGMA, não de
// quem fez o pedido.
function jsonObjectExpr(cols) {
  return `json_object(${cols.map((c) => `'${c}', "${c}"`).join(', ')})`;
}

/** Faz uma cópia dos dados agora (atômica: tudo ou nada). Devolve o id. */
export async function createSnapshot(db) {
  const cols = await tableColumns(db);
  const novo = '(SELECT MAX(id) FROM auto_backups)';
  const stmts = [db.prepare('INSERT INTO auto_backups (summary) VALUES (NULL)')];
  for (const [t, c] of Object.entries(cols)) {
    stmts.push(db.prepare(`INSERT INTO auto_backup_rows (backup_id, tbl, data) SELECT ${novo}, '${t}', ${jsonObjectExpr(c)} FROM ${t} ORDER BY rowid`));
  }
  stmts.push(db.prepare(`UPDATE auto_backups SET summary = (
      SELECT json_group_object(tbl, n) FROM (SELECT tbl, COUNT(*) AS n FROM auto_backup_rows WHERE backup_id = ${novo} GROUP BY tbl)
    ) WHERE id = ${novo}`));
  stmts.push(db.prepare(`SELECT ${novo} AS id`));
  const res = await db.batch(stmts);
  return res[res.length - 1].results[0].id;
}

function wrap(tablesJson, { exportedAt, origem }) {
  const partes = BACKUP_TABLES.map((t) => `${JSON.stringify(t)}:${tablesJson[t] || '[]'}`);
  return `{"format":"essencia-natural-backup","version":1,"exportedAt":${JSON.stringify(exportedAt)},"origem":${JSON.stringify(origem)},"tables":{${partes.join(',')}},"uploads":[]}`;
}

/** Uma cópia automática, já como texto JSON (mesmo formato do backup
 *  baixado no admin, sem fotos) — ou null se não existir. */
export async function readSnapshotJSON(db, id) {
  const meta = await db.prepare('SELECT id, created_at FROM auto_backups WHERE id = ?').bind(id).first();
  if (!meta) return null;
  const { results } = await db.prepare(
    'SELECT tbl, json_group_array(json(data)) AS rows FROM (SELECT tbl, data FROM auto_backup_rows WHERE backup_id = ? ORDER BY rowid) GROUP BY tbl'
  ).bind(id).all();
  return wrap(Object.fromEntries(results.map((r) => [r.tbl, r.rows])), { exportedAt: meta.created_at.replace(' ', 'T') + 'Z', origem: 'automatico' });
}

/** Os dados de agora, como texto JSON, montado pelo próprio D1 (para o
 *  botão "Baixar cópia dos dados" do admin). */
export async function exportDataJSON(db) {
  const cols = await tableColumns(db);
  const stmts = Object.entries(cols).map(([t, c]) =>
    db.prepare(`SELECT '${t}' AS tbl, json_group_array(json(o)) AS rows FROM (SELECT ${jsonObjectExpr(c)} AS o FROM ${t} ORDER BY rowid)`));
  const res = stmts.length ? await db.batch(stmts) : [];
  return wrap(Object.fromEntries(res.map((r) => [r.results[0].tbl, r.results[0].rows])), { exportedAt: new Date().toISOString(), origem: 'manual' });
}

export async function listSnapshots(db) {
  const { results } = await db.prepare('SELECT id, created_at AS createdAt, summary FROM auto_backups ORDER BY id DESC').all();
  return results.map((r) => ({ ...r, summary: r.summary ? JSON.parse(r.summary) : {} }));
}

/** Apaga as cópias mais antigas, mantendo as `keep` mais recentes. */
export async function pruneSnapshots(db, keep = KEEP_SNAPSHOTS) {
  await db.batch([
    db.prepare('DELETE FROM auto_backup_rows WHERE backup_id NOT IN (SELECT id FROM auto_backups ORDER BY id DESC LIMIT ?)').bind(keep),
    db.prepare('DELETE FROM auto_backups WHERE id NOT IN (SELECT id FROM auto_backups ORDER BY id DESC LIMIT ?)').bind(keep),
  ]);
}

/** Chamado pelo cron (a cada 30 min): faz a cópia se a última tiver 7+ dias. */
export async function weeklySnapshotIfDue(db) {
  const recente = await db.prepare(
    `SELECT 1 AS x FROM auto_backups WHERE created_at > datetime('now', '-${SNAPSHOT_EVERY_DAYS} days') LIMIT 1`
  ).first();
  if (recente) return null;
  const id = await createSnapshot(db);
  await pruneSnapshots(db);
  return id;
}

// ---------- fotos apagadas ----------

/** Em vez de apagar o arquivo na hora, põe na fila de remoção. */
export async function trashUpload(db, key) {
  await db.prepare("INSERT INTO upload_trash (key) VALUES (?) ON CONFLICT(key) DO UPDATE SET deleted_at = datetime('now')").bind(key).run();
}

/** Remove de vez as fotos que estão na fila há mais de 90 dias — exceto se
 *  alguma foto de produto voltou a usar o mesmo arquivo (restauração). */
export async function purgeTrash(db, storage, days = TRASH_DAYS) {
  const { results } = await db.prepare(
    `SELECT key FROM upload_trash WHERE deleted_at <= datetime('now', '-${Number(days)} days') LIMIT 50`
  ).all();
  let removidas = 0;
  for (const { key } of results) {
    const emUso = await db.prepare('SELECT 1 AS x FROM product_images WHERE file_path = ?').bind('/uploads/' + key).first();
    if (!emUso) { await storage.delete(key); removidas += 1; }
    await db.prepare('DELETE FROM upload_trash WHERE key = ?').bind(key).run();
  }
  return removidas;
}
