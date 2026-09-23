// Gera uma nova senha temporária para a conta 'admin' (útil se a senha
// original se perdeu, ou para trocar a que apareceu nos logs de setup).
// Marca must_change_password=1: a próxima entrada em /admin já pede pra
// trocar de novo.
//
//   node server/reset-admin-password.js
'use strict';

const db = require('./db');
const auth = require('./auth');

function run() {
  const admin = db.prepare("SELECT * FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1").get();
  if (!admin) { console.log('Nenhuma conta admin encontrada — rode server/seed.js primeiro.'); return; }
  const senha = auth.generateTempPassword();
  const { hash, salt } = auth.hashPassword(senha);
  db.prepare('UPDATE users SET password_hash=?, password_salt=?, must_change_password=1 WHERE id=?').run(hash, salt, admin.id);
  console.log('Usuário:', admin.username);
  console.log('Nova senha temporária (anote agora — não é mostrada de novo):', senha);
  console.log('Será obrigada a trocar a senha no próximo login em /admin.');
}

run();
