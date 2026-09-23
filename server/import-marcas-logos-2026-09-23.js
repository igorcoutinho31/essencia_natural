// Script de uso único — segundo fechamento da V2 (23/09/2026). Liga os
// logos enviados pelo cliente (`Marcas.zip`) às marcas já cadastradas em
// `brands` (ver `server/seed.js`, `MARCAS_CONFIRMADAS`).
//
// Regras seguidas (ver docs/CATALOGO.md, seção "Grade de marcas"):
//  - Só liga logo a uma marca que já existe na tabela `brands` — nenhuma
//    marca nova é criada por este script. Cadastrar marca nova é uma ação
//    deliberada de admin (ver docs/ADMIN.md), não uma consequência de
//    receber um arquivo de logo.
//  - Arquivo de logo padronizado pelo slug da marca, salvo em
//    `assets/brands/<slug>.<ext>` — nunca o nome original do arquivo
//    enviado (evita nomes inconsistentes tipo "lataffa.png" pra "Lattafa").
//  - Marca sem logo continua sem `logo_path` (mostra nome em texto — ver
//    `assets/js/marcas.js`) — nunca um logo inventado ou de outra marca.
//
// O zip enviado tinha 22 arquivos; 17 bateram com uma marca confirmada
// (mapa abaixo). Os outros 5 (amouage, anfar, ferassa, maisonasrar,
// zaafaran) e mais um com nome corrompido pela codificação do zip
// (volaré) são de marcas que HOJE NÃO estão em `MARCAS_CONFIRMADAS` nem
// vinculadas a nenhum produto do catálogo — ficaram de fora de propósito,
// aguardando confirmação do cliente antes de virarem marca nova (ver
// pendência em docs/TODO-VERIFY.md). "Armaf" é uma marca confirmada que
// ficou sem logo no arquivo enviado — mostra nome em texto até chegar um.
'use strict';

const db = require('./db');

const LOGO_BY_SLUG = {
  'afnan': 'afnan.png',
  'al-haramain': 'al-haramain.jpg',
  'al-wataniah': 'al-wataniah.png',
  'asdaaf': 'asdaaf.png',
  'aurora': 'aurora.jpg',
  'bharara': 'bharara.jpg',
  'dkhoon-emirates': 'dkhoon-emirates.png',
  'french-avenue': 'french-avenue.png',
  'lattafa': 'lattafa.png',
  'maison-alhambra': 'maison-alhambra.jpg',
  'orientica': 'orientica.png',
  'paris-corner': 'paris-corner.png',
  'qawafi': 'qawafi.jpg',
  'rasasi': 'rasasi.png',
  'rave': 'rave.png',
  'rayhaan': 'rayhaan.png',
  'zimaya': 'zimaya.png',
};

const update = db.prepare("UPDATE brands SET logo_path = ? WHERE slug = ?");
let changed = 0;
for (const [slug, filename] of Object.entries(LOGO_BY_SLUG)) {
  const info = update.run(`/assets/brands/${filename}`, slug);
  changed += info.changes;
  if (info.changes === 0) console.log(`  aviso: nenhuma marca com slug "${slug}" encontrada — logo NÃO aplicado.`);
}
console.log(`Logos vinculados: ${changed}.`);

const rows = db.prepare('SELECT name, slug, logo_path FROM brands ORDER BY name').all();
console.log('\nEstado final da tabela brands:');
rows.forEach((r) => console.log(` - ${r.name} (${r.slug}): ${r.logo_path || '— sem logo, mostra nome em texto'}`));
