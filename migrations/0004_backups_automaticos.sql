-- Backups automáticos (sem ninguém precisar lembrar de nada).
--
-- 1. Cópia semanal dos DADOS (produtos, marcas, preços, estoque, contas…)
--    feita pelo cron do Worker; guarda as 12 mais recentes (~3 meses).
--    A cópia é feita inteira em SQL (INSERT … SELECT json_object(…)) dentro
--    do D1 — não gasta CPU do Worker, que no plano grátis tem só 10 ms.
--    Ver src/services/autoBackup.js.
-- 2. Fotos apagadas no /admin não somem na hora: entram numa fila e só são
--    removidas de vez depois de 90 dias — assim uma cópia de até ~3 meses
--    atrás ainda encontra as fotos que ela cita.
-- O Time Travel do D1 (7 dias no plano grátis) continua valendo por cima.

CREATE TABLE IF NOT EXISTS auto_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  summary TEXT                     -- ex.: {"products":34,"brands":24,...}
);

CREATE TABLE IF NOT EXISTS auto_backup_rows (
  backup_id INTEGER NOT NULL REFERENCES auto_backups(id) ON DELETE CASCADE,
  tbl TEXT NOT NULL,
  data TEXT NOT NULL               -- a linha da tabela original, em JSON
);

CREATE INDEX IF NOT EXISTS idx_auto_backup_rows ON auto_backup_rows(backup_id, tbl);

CREATE TABLE IF NOT EXISTS upload_trash (
  key TEXT PRIMARY KEY,            -- chave da foto no armazenamento (ex.: products/x/abc.webp)
  deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
