// Limpa os nomes dos produtos já cadastrados: tira a marca, o volume e a
// concentração do nome (cada um já tem campo próprio e aparece ao lado),
// e padroniza o volume ("100ML" -> "100 ml"). Volume e concentração achados
// no nome preenchem os campos quando estiverem vazios. O endereço da página
// (slug) não muda, para não quebrar links já compartilhados.
//
//   npm run cf:limpar-nomes -- --remote --simular   (mostra antes/depois, não grava)
//   npm run cf:limpar-nomes -- --remote             (grava)
//
// Por padrão mexe só no catálogo importado. Com --todos inclui também os
// cadastros feitos pela loja.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tituloProduto } from './biblioteca-regras.js';
import { wrangler, targetFlag, D1_NAME } from './wrangler.js';

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

/** Mudanças a fazer (só as linhas em que algo muda). */
export function planejarLimpeza(produtos) {
  const mudancas = [];
  for (const p of produtos) {
    const t = tituloProduto(p.name, { marca: p.brand, volume: p.volume, concentracao: p.concentration });
    const novo = { name: t.nome, volume: t.volume, concentration: t.concentracao };
    if (novo.name !== p.name || (novo.volume || null) !== (p.volume || null) || (novo.concentration || null) !== (p.concentration || null)) {
      mudancas.push({ id: p.id, antes: p, depois: novo });
    }
  }
  return mudancas;
}

export function sqlLimpeza(mudancas) {
  return mudancas.map((m) => `UPDATE products SET name = ${q(m.depois.name)}, volume = ${q(m.depois.volume)}, concentration = ${q(m.depois.concentration)}, updated_at = datetime('now') WHERE id = ${Number(m.id)};`).join('\n') + '\n';
}

function consulta(target, sql) {
  const out = wrangler(['d1', 'execute', D1_NAME, target, '--json', `--command=${sql}`], { capture: true });
  return JSON.parse(out.slice(out.indexOf('[')))[0]?.results || [];
}

function main() {
  const argv = process.argv.slice(2);
  const target = targetFlag(argv);
  const simular = argv.includes('--simular');
  const where = argv.includes('--todos') ? '' : 'WHERE p.source IS NOT NULL';
  console.log(`Lendo os produtos (${target})...`);
  const produtos = consulta(target, `SELECT p.id, p.name, p.volume, p.concentration, b.name AS brand FROM products p LEFT JOIN brands b ON b.id = p.brand_id ${where} ORDER BY p.id`);
  const mudancas = planejarLimpeza(produtos);
  console.log(`\n${produtos.length} produto(s) lidos; ${mudancas.length} com nome a limpar.\n`);
  const fmt = (x) => [x.brand ? `[${x.brand}]` : '', x.name, x.concentration ? `· ${x.concentration}` : '', x.volume ? `· ${x.volume}` : ''].filter(Boolean).join(' ');
  for (const m of mudancas.slice(0, 40)) console.log(`  ${fmt(m.antes)}\n    -> ${fmt({ ...m.depois, brand: m.antes.brand })}`);
  if (mudancas.length > 40) console.log(`  ... e mais ${mudancas.length - 40}.`);
  if (simular || !mudancas.length) {
    if (simular) console.log('\nNada foi gravado. Para gravar, rode de novo sem --simular.');
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'essencia-nomes-'));
  try {
    for (let i = 0; i < mudancas.length; i += 400) {
      const arquivo = path.join(tmp, `nomes-${i}.sql`);
      fs.writeFileSync(arquivo, sqlLimpeza(mudancas.slice(i, i + 400)));
      wrangler(['d1', 'execute', D1_NAME, target, `--file=${arquivo}`], { capture: true });
      console.log(`  ${Math.min(i + 400, mudancas.length)}/${mudancas.length} gravados`);
    }
    console.log('\nPronto. Os nomes novos já aparecem no site e no /admin.');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error('\nErro:', e.message); process.exit(1); }
}
