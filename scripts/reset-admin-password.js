// Gera uma nova senha temporária para a conta 'admin' (útil se a senha
// original se perdeu, ou para trocar a que apareceu nos logs de setup).
// Marca must_change_password=1: a próxima entrada em /admin já pede pra
// trocar de novo.
//
//   node scripts/reset-admin-password.js
// (Banco local. Na Cloudflare: `npm run cf:admin -- resetar-senha`.)
import * as auth from '../src/auth.js';
import { runAsScript } from './script-db.js';

export async function run(db) {
  const admin = await db.prepare("SELECT * FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1").first();
  if (!admin) { console.log('Nenhuma conta admin encontrada — rode scripts/seed.js primeiro.'); return; }
  const senha = auth.generateTempPassword();
  const { hash, salt } = auth.hashPassword(senha);
  await db.batch([
    db.prepare('UPDATE users SET password_hash=?, password_salt=?, must_change_password=1 WHERE id=?').bind(hash, salt, admin.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(admin.id),
  ]);
  console.log('Usuário:', admin.username);
  console.log('Nova senha temporária (anote agora — não é mostrada de novo):', senha);
  console.log('Será obrigada a trocar a senha no próximo login em /admin.');
}

await runAsScript(import.meta.url, run);
