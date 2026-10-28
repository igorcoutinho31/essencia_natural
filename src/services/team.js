// Equipe da loja (seção "Nossa equipe" e etapa "Escolher atendimento" da
// sacola). Cuidada pelo /admin/equipe — ver migrations/0007_equipe.sql.
// No site só aparece o primeiro nome e a foto (docs/TEAM.md): nada de
// cargo, sobrenome ou telefone pessoal.

export const MAX_NAME = 40;

function toPublic(r) {
  return { id: r.id, name: r.name, photo: r.photo_path || null };
}

function toAdmin(r) {
  return { ...toPublic(r), active: !!r.active, sortOrder: r.sort_order };
}

export async function listPublic(db) {
  const { results } = await db.prepare(
    'SELECT id, name, photo_path FROM team_members WHERE active = 1 ORDER BY sort_order ASC, id ASC'
  ).all();
  return results.map(toPublic);
}

export async function listAdmin(db) {
  const { results } = await db.prepare(
    'SELECT id, name, photo_path, sort_order, active FROM team_members ORDER BY active DESC, sort_order ASC, id ASC'
  ).all();
  return results.map(toAdmin);
}

export function cleanName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  return name && name.length <= MAX_NAME ? name : null;
}

export async function create(db, name) {
  const row = await db.prepare(
    `INSERT INTO team_members (name, sort_order)
     VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM team_members)) RETURNING id`
  ).bind(name).first();
  return row.id;
}

/** Atualiza nome e/ou se aparece no site. Devolve false se não existe. */
export async function update(db, id, { name, active }) {
  const atual = await db.prepare('SELECT id, name, active FROM team_members WHERE id = ?').bind(id).first();
  if (!atual) return false;
  await db.prepare("UPDATE team_members SET name = ?, active = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(name ?? atual.name, active === undefined ? atual.active : (active ? 1 : 0), id).run();
  return true;
}

/** Troca a foto; devolve o caminho antigo (para ir à lixeira) ou false. */
export async function setPhoto(db, id, photoPath) {
  const atual = await db.prepare('SELECT photo_path FROM team_members WHERE id = ?').bind(id).first();
  if (!atual) return false;
  await db.prepare("UPDATE team_members SET photo_path = ?, updated_at = datetime('now') WHERE id = ?").bind(photoPath, id).run();
  return atual.photo_path || null;
}

/** Nova ordem: lista de ids, do primeiro ao último. */
export async function reorder(db, ids) {
  await db.batch(ids.map((id, i) => db.prepare('UPDATE team_members SET sort_order = ? WHERE id = ?').bind(i + 1, id)));
}

/** Remove de vez; devolve o caminho da foto (para ir à lixeira) ou false. */
export async function remove(db, id) {
  const row = await db.prepare('DELETE FROM team_members WHERE id = ? RETURNING photo_path').bind(id).first();
  return row ? (row.photo_path || null) : false;
}
