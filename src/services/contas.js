// Contas do painel (/admin/contas — só administração): criar, renomear,
// trocar o tipo (administração/vendedora), gerar senha nova e desativar.
// Usuário (login) sempre em minúsculas; nome (o que aparece no painel e no
// histórico de preços) com iniciais maiúsculas e pode mudar quando quiser.
import * as auth from '../auth.js';

export const MIN_SENHA = 10;
const RE_USUARIO = /^[a-z0-9._-]{3,40}$/;

export const usuarioLimpo = (u) => String(u || '').trim().toLowerCase();

/** "maria souza" -> "Maria Souza"; "vendedora1" -> "Vendedora 1". */
export function nomeBonito(nome) {
  const s = String(nome || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    .replace(/(\p{L})(\d)/gu, '$1 $2');
  return s.replace(/(^|[\s'-])(\p{Ll})/gu, (m, a, l) => a + l.toUpperCase());
}

export async function listar(db) {
  const { results } = await db.prepare(
    'SELECT id, name, username, role, active, must_change_password AS trocarSenha, created_at AS criadaEm FROM users ORDER BY active DESC, role ASC, name ASC'
  ).all();
  return results.map((r) => ({ ...r, active: !!r.active, trocarSenha: !!r.trocarSenha }));
}

async function adminsAtivos(db, excetoId) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?").bind(excetoId).first();
  return r.n;
}

/** Cria a conta. Sem `senha`, gera uma temporária (mostrada uma vez). */
export async function criar(db, { usuario, nome, papel, senha, trocar = true }) {
  const username = usuarioLimpo(usuario);
  if (!RE_USUARIO.test(username)) return { erro: 'Usuário: 3 a 40 letras minúsculas, números, ponto, hífen ou _ (sem espaço).' };
  const name = nomeBonito(nome || username);
  if (!name) return { erro: 'Informe o nome.' };
  const role = papel === 'admin' ? 'admin' : 'vendedora';
  const digitada = senha != null && String(senha) !== '';
  if (digitada && (String(senha).length < MIN_SENHA || String(senha).length > 200)) return { erro: `A senha precisa ter pelo menos ${MIN_SENHA} caracteres.` };
  if (await db.prepare('SELECT 1 AS x FROM users WHERE lower(username) = ?').bind(username).first()) return { erro: 'Já existe uma conta com esse usuário.' };
  const final = digitada ? String(senha) : auth.generateTempPassword();
  const { hash, salt } = auth.hashPassword(final);
  await db.prepare('INSERT INTO users (name, username, password_hash, password_salt, role, must_change_password, active) VALUES (?, ?, ?, ?, ?, ?, 1)')
    .bind(name, username, hash, salt, role, digitada && !trocar ? 0 : 1).run();
  return { ok: true, username, name, senhaGerada: digitada ? null : final };
}

/** Muda nome, tipo e/ou ativa/desativa. Ninguém tira o próprio acesso de
 *  administração, e sempre sobra pelo menos uma administração ativa. */
export async function alterar(db, id, eu, { nome, papel, ativo }) {
  const conta = await db.prepare('SELECT id, role, active FROM users WHERE id = ?').bind(id).first();
  if (!conta) return { erro: 'not_found' };
  const sets = [], binds = [];
  if (nome !== undefined) {
    const name = nomeBonito(nome);
    if (!name) return { erro: 'Informe o nome.' };
    sets.push('name = ?'); binds.push(name);
  }
  const tiraAdmin = (papel !== undefined && papel !== 'admin' && conta.role === 'admin') || (ativo === false && conta.role === 'admin' && conta.active);
  if ((papel !== undefined || ativo !== undefined) && id === eu) return { erro: 'Você não pode mudar o tipo nem desativar a sua própria conta.' };
  if (tiraAdmin && (await adminsAtivos(db, id)) < 1) return { erro: 'Precisa sobrar pelo menos uma conta de administração ativa.' };
  if (papel !== undefined) { sets.push('role = ?'); binds.push(papel === 'admin' ? 'admin' : 'vendedora'); }
  if (ativo !== undefined) { sets.push('active = ?'); binds.push(ativo ? 1 : 0); }
  if (!sets.length) return { erro: 'Nada para mudar.' };
  const stmts = [db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id)];
  if (ativo === false || papel !== undefined) stmts.push(db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id));
  await db.batch(stmts);
  return { ok: true };
}

/** Senha temporária nova (a pessoa troca no próximo acesso). Encerra as
 *  sessões abertas e libera o login se estava bloqueado. */
export async function novaSenha(db, id) {
  const conta = await db.prepare('SELECT id, username FROM users WHERE id = ?').bind(id).first();
  if (!conta) return { erro: 'not_found' };
  const senha = auth.generateTempPassword();
  const { hash, salt } = auth.hashPassword(senha);
  await db.batch([
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 1 WHERE id = ?').bind(hash, salt, id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    db.prepare('DELETE FROM login_attempts WHERE key = ?').bind('user:' + String(conta.username).toLowerCase()),
  ]);
  return { ok: true, username: conta.username, senhaGerada: senha };
}
