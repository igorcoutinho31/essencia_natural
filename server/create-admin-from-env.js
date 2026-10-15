// Cria uma conta administradora adicional a partir de variáveis de ambiente
// temporárias. Feito para casos em que o dono da loja precisa de um login
// próprio sem alterar a conta admin que a equipe já usa.
//
// Variáveis:
//   CREATE_ADMIN_NAME
//   CREATE_ADMIN_USERNAME
//   CREATE_ADMIN_PASSWORD
//
// O script NUNCA imprime a senha. Se o username já existir, não altera nada.
// Depois do primeiro deploy e de confirmar o login, apague as três variáveis
// do Railway. A conta continua no banco persistente normalmente.
'use strict';

const db = require('./db');
const auth = require('./auth');

function run() {
  const name = String(process.env.CREATE_ADMIN_NAME || '').trim();
  const username = String(process.env.CREATE_ADMIN_USERNAME || '').trim();
  const password = String(process.env.CREATE_ADMIN_PASSWORD || '');

  const anyConfigured = Boolean(name || username || password);
  if (!anyConfigured) return;

  if (!name || !username || !password) {
    console.warn('[bootstrap-admin] Variáveis incompletas — defina CREATE_ADMIN_NAME, CREATE_ADMIN_USERNAME e CREATE_ADMIN_PASSWORD. Nenhuma conta foi criada.');
    return;
  }

  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) {
    console.warn('[bootstrap-admin] CREATE_ADMIN_USERNAME inválido. Use 3–40 caracteres: letras, números, ponto, hífen ou underscore.');
    return;
  }

  if (password.length < 10) {
    console.warn('[bootstrap-admin] CREATE_ADMIN_PASSWORD precisa ter pelo menos 10 caracteres. Nenhuma conta foi criada.');
    return;
  }

  const existing = db.prepare('SELECT id, username, role FROM users WHERE username = ?').get(username);
  if (existing) {
    console.log(`[bootstrap-admin] Usuário "${username}" já existe — senha e permissões não foram alteradas.`);
    return;
  }

  const { hash, salt } = auth.hashPassword(password);
  db.prepare(`
    INSERT INTO users (name, username, password_hash, password_salt, role, must_change_password, active)
    VALUES (?, ?, ?, ?, 'admin', 1, 1)
  `).run(name, username, hash, salt);

  console.log(`[bootstrap-admin] Conta admin "${username}" criada com sucesso. Faça login e troque a senha; depois remova as variáveis CREATE_ADMIN_* do Railway.`);
}

run();
