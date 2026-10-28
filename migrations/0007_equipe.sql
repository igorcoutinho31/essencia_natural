-- 0007 — Equipe cuidada pelo painel (/admin/equipe).
-- Até aqui os nomes e fotos da equipe estavam escritos à mão no
-- public/index.html. Agora ficam no banco: a loja cadastra, renomeia, troca
-- a foto, esconde e reordena sem mexer em código. A seção "Nossa equipe" e
-- a etapa "Escolher atendimento" da sacola leem de /api/team.
CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  photo_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Formação confirmada em 23/09/2026 (docs/TEAM.md), com as fotos oficiais.
INSERT INTO team_members (name, photo_path, sort_order)
SELECT 'Bassam', '/assets/team/bassam-v2.webp', 1 WHERE NOT EXISTS (SELECT 1 FROM team_members);
INSERT INTO team_members (name, photo_path, sort_order)
SELECT 'Nicolly', '/assets/team/nicolly.webp', 2 WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE sort_order = 2);
INSERT INTO team_members (name, photo_path, sort_order)
SELECT 'Larissa', '/assets/team/larissa-v2.webp', 3 WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE sort_order = 3);
INSERT INTO team_members (name, photo_path, sort_order)
SELECT 'Livia', '/assets/team/livia.webp', 4 WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE sort_order = 4);
