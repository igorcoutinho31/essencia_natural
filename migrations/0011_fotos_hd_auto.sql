-- 0011 — Fotos em alta automáticas (src/services/fotosAuto.js): cada foto
-- é tentada uma vez; se falhar, o cron tenta de novo no dia seguinte.
CREATE TABLE IF NOT EXISTS foto_hd_tentativas (
  sha TEXT PRIMARY KEY,
  resultado TEXT NOT NULL,              -- ok | igual | falhou
  tentado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
