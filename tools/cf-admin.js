// Contas do /admin direto no D1 da Cloudflare (no Node local, o equivalente
// é `npm run reset-admin-password`).
// A senha é gerada e o hash é calculado AQUI, no seu computador — só o hash
// vai para a Cloudflare. A senha temporária aparece uma vez no terminal e o
// primeiro login obriga a trocar.
//
//   npm run cf:admin -- listar --remote
//   npm run cf:admin -- resetar-senha admin --remote
//   npm run cf:admin -- criar maria "Maria Souza" --remote               (administração)
//   npm run cf:admin -- criar ana "Ana" --vendedora --remote             (vendedora)
//   npm run cf:admin -- desativar ana --remote
import { hashPassword, generateTempPassword } from '../src/auth.js';
import { wrangler, targetFlag, D1_NAME, sqlString } from './wrangler.js';

function sql(target, command, { json = false } = {}) {
  return wrangler(['d1', 'execute', D1_NAME, target, `--command=${command}`, ...(json ? ['--json'] : [])], { capture: json });
}

function validUsername(u) {
  const v = String(u || '').trim().toLowerCase(); // usuário sempre em minúsculas (igual ao /admin/contas)
  if (!/^[a-z0-9._-]{3,40}$/.test(v)) throw new Error('Usuário inválido: use 3–40 caracteres (letras, números, ponto, hífen ou underscore).');
  return v;
}

function mostrarSenha(username, senha) {
  console.log(`\nUsuário: ${username}`);
  console.log(`Senha temporária (anote agora — não é mostrada de novo): ${senha}`);
  console.log('O primeiro login em /admin obriga a trocar a senha.');
}

function main() {
  const argv = process.argv.slice(2);
  const target = targetFlag(argv);
  const [cmd, ...rest] = argv.filter((a) => !a.startsWith('--'));

  if (cmd === 'listar') {
    sql(target, 'SELECT id, username, name, role, active, must_change_password FROM users ORDER BY id');
    return;
  }
  if (cmd === 'resetar-senha') {
    const username = validUsername(rest[0] || 'admin');
    const senha = generateTempPassword();
    const { hash, salt } = hashPassword(senha);
    const u = sqlString(username);
    sql(target, `UPDATE users SET password_hash=${sqlString(hash)}, password_salt=${sqlString(salt)}, must_change_password=1, active=1 WHERE username=${u}; DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username=${u}); DELETE FROM login_attempts WHERE key=${sqlString('user:' + username.toLowerCase())};`);
    console.log('\n(Se o usuário não existir, nada foi alterado — confira com "listar".)');
    mostrarSenha(username, senha);
    return;
  }
  if (cmd === 'criar') {
    const username = validUsername(rest[0]);
    const nome = String(rest[1] || '').trim();
    if (!nome) throw new Error('Informe o nome entre aspas, ex.: criar maria "Maria Souza" --remote');
    const role = argv.includes('--vendedora') ? 'vendedora' : 'admin';
    const senha = generateTempPassword();
    const { hash, salt } = hashPassword(senha);
    sql(target, `INSERT INTO users (name, username, password_hash, password_salt, role, must_change_password, active) VALUES (${sqlString(nome)}, ${sqlString(username)}, ${sqlString(hash)}, ${sqlString(salt)}, '${role}', 1, 1);`);
    mostrarSenha(username, senha);
    return;
  }
  if (cmd === 'desativar') {
    const u = sqlString(validUsername(rest[0]));
    sql(target, `UPDATE users SET active=0 WHERE username=${u}; DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username=${u});`);
    return;
  }
  throw new Error('Comandos: listar | resetar-senha [usuario] | criar <usuario> "<Nome>" [--vendedora] | desativar <usuario> — sempre com --remote ou --local.');
}

try { main(); } catch (e) { console.error('Erro:', e.message); process.exit(1); }
