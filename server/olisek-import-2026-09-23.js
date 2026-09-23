// Importação pontual do relatório "Essencia Natural.pdf" (movimentação/estoque
// da OliSek, enviado pelo cliente em 23/09/2026) — script de uso único, não faz
// parte do fluxo normal do servidor. Mantido no repositório como registro do
// que foi importado e quando (ver docs/OLISEK-INTEGRATION.md).
//
// Regra respeitada: só atualiza vínculo OliSek (olisek_id/olisek_name/
// confiança) e estoque de produtos que JÁ existem no catálogo — não cria
// nem publica produto novo, e nunca toca no campo `price`.
'use strict';

const db = require('./db');

// [slug do catálogo, olisekId, nome exato na OliSek, estoque atual no relatório, confiança]
const LINKS = [
  // --- correspondência direta e inequívoca (confirmado) ---
  ['elysian-fields-kiss-qawafi', 805746, 'QAWAFI ELYSIAN FIELDS KISS', 78, 'confirmado'],
  ['elysian-fields-silk-qawafi', 805745, 'QAWAFI ELYSIAN FIELDS SILK 100ML', 18, 'confirmado'],
  ['the-show-magnifique-paris-corner', 805684, 'THE SHOW MAGNIFIQUE', 0, 'confirmado'],
  ['eqaab', 804290, 'AL WATANIAH EQAAB EDP H 100ML', 1, 'confirmado'],
  ['his-confession', 804121, 'LATTAFA HIS CONFESSION EDP M 100ML', 0, 'confirmado'],
  ['azm', 805708, 'PARIS CORNER AZM 100ML', 12, 'confirmado'],
  ['club-de-nuit-woman', 804055, 'ARMAF CLUB DE NUIT WOMAN EDP 105ML', 45, 'confirmado'],
  ['club-de-nuit-untold', 804432, 'ARMAF CLUB DE NUIT UNTOLD EDP 105ML', 6, 'confirmado'],
  ['club-de-nuit-maleka', 804264, 'ARMAF CLUB DE NUIT MALEKA EDP F 105ML', 45, 'confirmado'],
  ['club-de-nuit-bling', 804543, 'ARMAF CLUB DE NUIT BLING EDP 75ML', 35, 'confirmado'],
  ['club-de-nuit-iconic', 804134, 'ARMAF CLUB DE NUIT ICONIC EDP M 105ML', 12, 'confirmado'],
  ['body-cream-so-candid', 805689, 'MAISON BODY CREAM SO CANDID', 52, 'confirmado'],
  ['body-cream-delilah', 805687, 'BODY CREAM DELILAH', 97, 'confirmado'],
  ['body-cream-salvo', 805691, 'MAISON BODY CREAM SALVO', 10, 'confirmado'],
  ['jasoor', 805662, 'LATTAFA JASOOR 100ML', 17, 'confirmado'],
  ['salvo', 804078, 'MAISON AL HAMBRA SALVO INTENSE M 100ML', 46, 'confirmado'],
  ['fakhar-platin', 804263, 'LATTAFA FAKHAR PLATIN EDP M 100ML', 30, 'confirmado'],
  ['fakhar-rose-o-mais-querido-pelas-mulheres', 804019, 'LATTAFA FAKHAR ROSE EDP 100ML', 119, 'confirmado'],

  // --- nome parecido mas não idêntico: vínculo "provável", pedir confirmação humana ---
  ['khamarah-qawah', 804660, 'LATTAFA KHAMRAH QAHWA SELO ANTIGO EDP', 23, 'provavel'],
  ['musamam-black', 804549, 'LATTAFA MUSAMAM BLACK INTENSE EDP', 1, 'provavel'],
  ['fakhar-black', 804018, 'LATTAFA FAKHAR PRETO EDP M 100ML', 57, 'provavel'],
  ['fakhar-gold', 804020, 'LATTAFA FAKHAR GOLD EDP U 100ML SELO NOVO', 0, 'provavel'],
];

const update = db.prepare(
  `UPDATE products SET olisek_id=?, olisek_name=?, olisek_match_confidence=?, stock=?, stock_source='olisek_import', updated_at=datetime('now') WHERE slug=?`
);

let confirmados = 0, provaveis = 0;
db.exec('BEGIN');
try {
  for (const [slug, olisekId, olisekName, stock, confidence] of LINKS) {
    const info = update.run(olisekId, olisekName, confidence, stock, slug);
    if (info.changes !== 1) throw new Error('slug não encontrado: ' + slug);
    if (confidence === 'confirmado') confirmados += 1; else provaveis += 1;
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

console.log(`Vínculos aplicados: ${confirmados} confirmados, ${provaveis} prováveis.`);

const total = db.prepare('SELECT COUNT(*) AS n FROM products WHERE active=1').get().n;
const vinculados = db.prepare("SELECT COUNT(*) AS n FROM products WHERE olisek_id IS NOT NULL").get().n;
console.log(`Total de produtos vinculados à OliSek: ${vinculados} de ${total}.`);
