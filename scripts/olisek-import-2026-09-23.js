// Importação pontual do relatório "Essencia Natural.pdf" (movimentação/estoque
// da OliSek, enviado pelo cliente em 23/09/2026) — script de uso único, não faz
// parte do fluxo normal do servidor. Mantido no repositório como registro do
// que foi importado e quando (ver docs/OLISEK-INTEGRATION.md).
//
// Regra respeitada: só atualiza vínculo OliSek (olisek_id/olisek_name/
// confiança) e estoque de produtos que JÁ existem no catálogo — não cria
// nem publica produto novo, e nunca toca no campo `price`.
//
// Atualização 24/09/2026 (fechamento da V2): a coluna gravada aqui era
// `olisek_match_confidence` ('confirmado'/'provavel'), removida na migração
// do antigo `server/db.js` em favor de `olisek_link_status`
// ('confirmed'/'probable'/'needs_review'/'unlinked'). Os valores abaixo
// foram traduzidos pro novo enum só pra este script continuar executável
// contra o schema atual (é histórico, não deveria precisar rodar de novo,
// mas não custa manter certo) — os fatos não mudaram. Fakhar Black e Fakhar
// Gold, que entram aqui como 'probable', foram reclassificados depois para
// 'needs_review' por scripts/olisek-link-status-2026-09-24.js — rode este
// script antes daquele se algum dia precisar recriar o histórico do zero.
import { runAsScript } from './script-db.js';

// [slug do catálogo, olisekId, nome exato na OliSek, estoque atual no relatório, confiança]
const LINKS = [
  // --- correspondência direta e inequívoca (confirmed) ---
  ['elysian-fields-kiss-qawafi', 805746, 'QAWAFI ELYSIAN FIELDS KISS', 78, 'confirmed'],
  ['elysian-fields-silk-qawafi', 805745, 'QAWAFI ELYSIAN FIELDS SILK 100ML', 18, 'confirmed'],
  ['the-show-magnifique-paris-corner', 805684, 'THE SHOW MAGNIFIQUE', 0, 'confirmed'],
  ['eqaab', 804290, 'AL WATANIAH EQAAB EDP H 100ML', 1, 'confirmed'],
  ['his-confession', 804121, 'LATTAFA HIS CONFESSION EDP M 100ML', 0, 'confirmed'],
  ['azm', 805708, 'PARIS CORNER AZM 100ML', 12, 'confirmed'],
  ['club-de-nuit-woman', 804055, 'ARMAF CLUB DE NUIT WOMAN EDP 105ML', 45, 'confirmed'],
  ['club-de-nuit-untold', 804432, 'ARMAF CLUB DE NUIT UNTOLD EDP 105ML', 6, 'confirmed'],
  ['club-de-nuit-maleka', 804264, 'ARMAF CLUB DE NUIT MALEKA EDP F 105ML', 45, 'confirmed'],
  ['club-de-nuit-bling', 804543, 'ARMAF CLUB DE NUIT BLING EDP 75ML', 35, 'confirmed'],
  ['club-de-nuit-iconic', 804134, 'ARMAF CLUB DE NUIT ICONIC EDP M 105ML', 12, 'confirmed'],
  ['body-cream-so-candid', 805689, 'MAISON BODY CREAM SO CANDID', 52, 'confirmed'],
  ['body-cream-delilah', 805687, 'BODY CREAM DELILAH', 97, 'confirmed'],
  ['body-cream-salvo', 805691, 'MAISON BODY CREAM SALVO', 10, 'confirmed'],
  ['jasoor', 805662, 'LATTAFA JASOOR 100ML', 17, 'confirmed'],
  ['salvo', 804078, 'MAISON AL HAMBRA SALVO INTENSE M 100ML', 46, 'confirmed'],
  ['fakhar-platin', 804263, 'LATTAFA FAKHAR PLATIN EDP M 100ML', 30, 'confirmed'],
  ['fakhar-rose-o-mais-querido-pelas-mulheres', 804019, 'LATTAFA FAKHAR ROSE EDP 100ML', 119, 'confirmed'],

  // --- nome parecido mas não idêntico: vínculo "provável", pedir confirmação humana ---
  ['khamarah-qawah', 804660, 'LATTAFA KHAMRAH QAHWA SELO ANTIGO EDP', 23, 'probable'],
  ['musamam-black', 804549, 'LATTAFA MUSAMAM BLACK INTENSE EDP', 1, 'probable'],
  ['fakhar-black', 804018, 'LATTAFA FAKHAR PRETO EDP M 100ML', 57, 'probable'],
  ['fakhar-gold', 804020, 'LATTAFA FAKHAR GOLD EDP U 100ML SELO NOVO', 0, 'probable'],
];

export async function run(db) {
  const update = db.prepare(
    `UPDATE products SET olisek_id=?, olisek_name=?, olisek_link_status=?, stock=?, stock_source='olisek_import', updated_at=datetime('now') WHERE slug=?`
  );
  // Tudo ou nada (batch atômico): se um slug não existir, nada é gravado.
  const results = await db.batch(LINKS.map(([slug, olisekId, olisekName, stock, confidence]) => update.bind(olisekId, olisekName, confidence, stock, slug)));
  results.forEach((r, i) => { if (r.meta.changes !== 1) throw new Error('slug não encontrado: ' + LINKS[i][0]); });
  const confirmados = LINKS.filter((l) => l[4] === 'confirmed').length;
  console.log(`Vínculos aplicados: ${confirmados} confirmados, ${LINKS.length - confirmados} prováveis.`);
  const total = (await db.prepare('SELECT COUNT(*) AS n FROM products WHERE active=1').first()).n;
  const vinculados = (await db.prepare('SELECT COUNT(*) AS n FROM products WHERE olisek_id IS NOT NULL').first()).n;
  console.log(`Total de produtos vinculados à OliSek: ${vinculados} de ${total}.`);
}

await runAsScript(import.meta.url, run);
