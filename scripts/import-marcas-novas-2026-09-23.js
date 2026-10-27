// Script de uso único — segundo fechamento da V2, rodada 2 (23/09/2026,
// à noite). O cliente confirmou 6 marcas novas que apareciam nos
// relatórios de estoque da loja mas ainda não tinham entrado em
// `MARCAS_CONFIRMADAS` (scripts/seed.js), e mandou o logo da Armaf que
// faltava do `Marcas.zip` original.
//
// O que este script faz:
//  - Garante (`ensureBrand`, idempotente) que as 6 marcas novas existem em
//    `brands`: Amouage, Anfar, Ferassa, Maison Asrar, Volaré, Ard Al
//    Zaafaran. NÃO cria nenhum produto pra elas — o cliente foi explícito
//    que isso não deve acontecer só por causa da marca.
//  - Liga o logo de cada uma delas (já copiado e padronizado pelo slug em
//    `assets/brands/`) via `brands.logo_path`.
//  - Liga o logo da Armaf, que já existia como marca confirmada desde o
//    primeiro `Marcas.zip` mas tinha ficado sem arquivo.
//
// Escopo confirmado com o cliente (23/09/2026, à noite): a regra "só
// mostra marca com produto público" vale só pras 6 marcas novas — as 18
// marcas confirmadas no primeiro fechamento (Afnan, Rasasi, Zimaya etc.)
// continuam aparecendo em `/#marcas` do jeito que já apareciam, mesmo sem
// produto ativo vinculado. Por isso este script marca `requires_product=1`
// só nas 6 novas (ver `brands.requires_product` em migrations/0001_init.sql e
// `catalog.getBrandsPublic()` em src/services/catalog.js) — elas ficam cadastradas com logo
// no banco, mas só entram na grade pública quando tiverem pelo menos um
// produto ativo E publicamente visível vinculado.
import * as catalog from '../src/services/catalog.js';
import { runAsScript } from './script-db.js';

const MARCAS_NOVAS = ['Amouage', 'Anfar', 'Ferassa', 'Maison Asrar', 'Volaré', 'Ard Al Zaafaran'];

const LOGO_BY_SLUG = {
  'amouage': 'amouage.png',
  'anfar': 'anfar.png',
  'ferassa': 'ferassa.jpg',
  'maison-asrar': 'maison-asrar.png',
  'volare': 'volare.png',
  'ard-al-zaafaran': 'ard-al-zaafaran.jpg',
  'armaf': 'armaf.jpg', // já existia como marca; só faltava o logo
};

export async function run(db) {
  for (const nome of MARCAS_NOVAS) {
    const id = await catalog.ensureBrand(db, nome);
    await db.prepare('UPDATE brands SET requires_product = 1 WHERE id = ?').bind(id).run();
    console.log(`marca garantida (requires_product=1): ${nome} (id ${id})`);
  }
  let changed = 0;
  for (const [slug, filename] of Object.entries(LOGO_BY_SLUG)) {
    const { meta } = await db.prepare('UPDATE brands SET logo_path = ? WHERE slug = ?').bind(`/assets/brands/${filename}`, slug).run();
    changed += meta.changes;
    if (meta.changes === 0) console.log(`  aviso: nenhuma marca com slug "${slug}" encontrada — logo NÃO aplicado.`);
  }
  console.log(`Logos vinculados nesta rodada: ${changed}.`);
}

await runAsScript(import.meta.url, run);
