// Leva os dados para o D1 + R2 da Cloudflare. SUBSTITUI tudo o que houver
// no banco de destino (produtos, marcas, usuários, históricos).
//
//   npm run cf:importar -- backup.json --remote
//       backup baixado em /admin/estoque ("Baixar backup completo") no site
//       antigo (Railway) — é o caminho normal da migração.
//   npm run cf:importar -- essencia.sqlite --uploads pasta/uploads --remote
//       se você tiver o arquivo do banco e a pasta de fotos em mãos.
//   npm run cf:importar -- --do-zero --remote
//       sem dados antigos: monta a base inicial do repositório (34 produtos,
//       marcas, fotos, vínculos OliSek e a conta admin com senha temporária).
//
// Troque --remote por --local para testar no `wrangler dev` antes.
// Opção --sem-fotos: só o banco.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { SqliteD1, applyMigrations, openDatabase } from '../server/sqlite-d1.js';
import { run as montarBaseInicial } from '../scripts/base-inicial.js';
import { BACKUP_TABLES, backupToSQL, exportBackup } from '../src/services/backup.js';
import { fsStorage } from '../server/storage-fs.js';
import { mimeFor } from '../src/util.js';
import { wrangler, targetFlag, D1_NAME, R2_BUCKET } from './wrangler.js';

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
}

/** Colunas que existem no esquema atual (aplicando as migrations num banco
 *  em memória) — colunas antigas que o backup tiver a mais são ignoradas. */
function targetColumns() {
  const mem = new SqliteD1(':memory:');
  applyMigrations(mem);
  const out = {};
  for (const t of BACKUP_TABLES) out[t] = mem.raw.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  mem.close();
  return out;
}

function backupFromSqlite(file, uploadsDir) {
  const db = new DatabaseSync(file, { readOnly: true });
  const tables = {};
  const existentes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
  for (const t of BACKUP_TABLES) tables[t] = existentes.has(t) ? db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all() : [];
  db.close();
  const uploads = [];
  if (uploadsDir) {
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs);
        else {
          const key = path.relative(uploadsDir, abs).split(path.sep).join('/');
          if (key.startsWith('products/')) uploads.push({ key, contentType: mimeFor(abs), base64: fs.readFileSync(abs).toString('base64') });
        }
      }
    };
    walk(uploadsDir);
  }
  return { format: 'essencia-natural-backup', version: 1, exportedAt: new Date().toISOString(), tables, uploads };
}

async function backupDoZero() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'essencia-do-zero-'));
  const db = openDatabase(path.join(dir, 'essencia.sqlite'));
  const uploadsDir = path.join(dir, 'uploads');
  console.log('Montando a base inicial do repositório...');
  await montarBaseInicial(db, uploadsDir);
  const backup = await exportBackup(db, fsStorage(uploadsDir));
  db.close();
  return backup;
}

async function main() {
  const argv = process.argv.slice(2);
  const target = targetFlag(argv);
  const semFotos = argv.includes('--sem-fotos');
  let backup;
  if (argv.includes('--do-zero')) {
    backup = await backupDoZero();
  } else {
    const file = argv.find((a) => !a.startsWith('--') && a !== arg(argv, '--uploads'));
    if (!file || !fs.existsSync(file)) throw new Error('Informe o arquivo de backup (.json) ou do banco (.sqlite). Ver o topo de tools/cf-importar.js.');
    backup = file.endsWith('.json')
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : backupFromSqlite(file, arg(argv, '--uploads'));
  }

  const resumo = Object.fromEntries(BACKUP_TABLES.map((t) => [t, (backup.tables?.[t] || []).length]));
  console.log('Conteúdo:', JSON.stringify(resumo), `| fotos: ${backup.uploads?.length || 0}`);
  if (!resumo.products) throw new Error('O backup não tem nenhum produto — importação cancelada.');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'essencia-import-'));
  try {
    console.log(`\n1/3 Aplicando o esquema (migrations) no D1 ${target}...`);
    wrangler(['d1', 'migrations', 'apply', D1_NAME, target]);

    console.log(`\n2/3 Gravando os dados no D1 ${target}...`);
    const sqlFile = path.join(tmp, 'dados.sql');
    fs.writeFileSync(sqlFile, backupToSQL(backup, targetColumns()));
    wrangler(['d1', 'execute', D1_NAME, target, `--file=${sqlFile}`]);

    if (semFotos) {
      console.log('\n3/3 Fotos puladas (--sem-fotos).');
    } else {
      const fotos = backup.uploads || [];
      console.log(`\n3/3 Enviando ${fotos.length} foto(s) para o R2 ${target}...`);
      fotos.forEach((f, i) => {
        if (!/^products\/[\w.\-/]+$/.test(f.key) || f.key.includes('..')) { console.warn('  chave ignorada:', f.key); return; }
        const arquivo = path.join(tmp, `foto-${i}`);
        fs.writeFileSync(arquivo, Buffer.from(f.base64, 'base64'));
        wrangler(['r2', 'object', 'put', `${R2_BUCKET}/${f.key}`, `--file=${arquivo}`, `--content-type=${f.contentType || mimeFor(f.key)}`, target]);
      });
    }
    console.log('\nPronto. Todos precisam entrar de novo no /admin (as sessões antigas não são levadas).');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error('\nErro:', e.message); process.exit(1); });
