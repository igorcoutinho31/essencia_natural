-- 0009 — Ali entra na equipe (29/10/2026), com a foto enviada pela loja.
-- Se ele já tiver sido cadastrado pelo painel, só ganha a foto (quando
-- ainda não tiver uma). Nada mais muda: ordem, nomes e quem está escondido
-- continuam como a loja deixou em /admin/equipe.
INSERT INTO team_members (name, photo_path, sort_order)
SELECT 'Ali', '/assets/team/ali.webp', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM team_members)
WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE name = 'Ali' COLLATE NOCASE);
UPDATE team_members SET photo_path = '/assets/team/ali.webp', updated_at = datetime('now')
WHERE name = 'Ali' COLLATE NOCASE AND (photo_path IS NULL OR photo_path = '');
