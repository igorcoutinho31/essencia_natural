// Onde o site guarda o que muda enquanto ele está no ar: o banco SQLite e
// as fotos de produto enviadas pelo /admin.
//
// Localmente (sem configurar nada) continua tudo como sempre foi:
//   data/essencia.sqlite  e  uploads/
// dentro da pasta do projeto.
//
// Em produção, a hospedagem (Railway, Render etc.) só guarda arquivos
// entre um deploy e outro dentro de um "volume" (disco persistente), e o
// Railway só permite UM volume por serviço. Por isso existe STORAGE_DIR:
// aponte essa variável de ambiente para onde o volume está montado (ex.:
// /data) e o banco e as fotos passam a morar os dois ali dentro:
//   $STORAGE_DIR/essencia.sqlite  e  $STORAGE_DIR/uploads/
// Ver README-V2.md, "Publicar no Railway".
'use strict';

const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STORAGE_DIR = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : null;

const DB_PATH = STORAGE_DIR
  ? path.join(STORAGE_DIR, 'essencia.sqlite')
  : path.join(ROOT, 'data', 'essencia.sqlite');

const UPLOADS_DIR = STORAGE_DIR
  ? path.join(STORAGE_DIR, 'uploads')
  : path.join(ROOT, 'uploads');

/** Converte um caminho público gravado no banco (`/uploads/products/x/y.webp`)
 *  no arquivo real em disco — onde quer que UPLOADS_DIR esteja. Devolve null
 *  se o caminho não for de /uploads/ ou tentar sair da pasta (`..`). */
function uploadPathToDisk(publicPath) {
  if (typeof publicPath !== 'string' || !publicPath.startsWith('/uploads/')) return null;
  const abs = path.resolve(UPLOADS_DIR, publicPath.slice('/uploads/'.length));
  if (abs !== UPLOADS_DIR && !abs.startsWith(UPLOADS_DIR + path.sep)) return null;
  return abs;
}

module.exports = { ROOT, STORAGE_DIR, DB_PATH, UPLOADS_DIR, uploadPathToDisk };
