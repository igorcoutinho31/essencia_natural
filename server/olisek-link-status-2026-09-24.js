// Script de uso único — fechamento da V2 (24/09/2026). Refina a classificação
// do vínculo OliSek de dois produtos que já tinham `olisek_id` gravado desde
// a importação de 23/09/2026, mas cuja correspondência é mais fraca que um
// simples "provável":
//
//  - Fakhar Black -> vinculado por TRADUÇÃO ("Preto" = "Black"), não pelo
//    texto. É o tipo de vínculo que precisa de alguém olhando os dois
//    sistemas lado a lado antes de confiar no estoque.
//  - Fakhar Gold -> a OliSek tem DOIS registros parecidos ("selo antigo" e
//    "selo novo"); vinculamos ao mais provável, mas é uma ambiguidade real
//    (rule 6 do fechamento da V2: nunca associar com confiança quando há
//    ambiguidade).
//
// Por isso os dois passam de 'probable' para 'needs_review': continuam
// vinculados (olisek_id/olisek_name preservados, para quem for conferir
// manualmente), mas o site público para de confiar no número de estoque
// deles até alguém confirmar — mostra "Consulte disponibilidade" em vez de
// um selo de estoque que pode estar errado (ver server/services/catalogService.js).
'use strict';

const db = require('./db');

const SLUGS_NEEDS_REVIEW = ['fakhar-black', 'fakhar-gold'];

const update = db.prepare("UPDATE products SET olisek_link_status = 'needs_review', updated_at = datetime('now') WHERE slug = ? AND olisek_link_status = 'probable'");

let changed = 0;
for (const slug of SLUGS_NEEDS_REVIEW) {
  const info = update.run(slug);
  changed += info.changes;
}
console.log(`Produtos reclassificados para 'needs_review': ${changed}.`);

const rows = db.prepare("SELECT slug, olisek_id, olisek_link_status FROM products WHERE olisek_link_status = 'needs_review'").all();
rows.forEach((r) => console.log(' -', r.slug, '(OliSek', r.olisek_id + ')'));
