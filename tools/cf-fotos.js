// Padroniza e melhora as fotos do site (regras em tools/fotos-plano.js):
//  - cadastros antigos da loja ganham a foto do pacote do fornecedor (fundo
//    limpo, mesmo padrão do resto do catálogo), quando o perfume existe lá;
//  - produtos do catálogo importado ganham a foto em alta (1200 px).
// As fotos antigas vão para a lixeira de 90 dias. Por padrão, só os
// produtos publicados (com --todos, também os ocultos — ocupa mais banco).
//
// Precisa da pasta do pacote extraído (a que tem catalog.json e images/):
//   npm run cf:fotos -- "C:\Users\...\catalogo" --remote --simular   (só mostra)
//   npm run cf:fotos -- "C:\Users\...\catalogo" --remote             (grava)
// Opções: --todos, --lado 1200 (tamanho máximo da foto), --lote 40,
// --pular 12,40 (ids de cadastros antigos que NÃO devem trocar de foto —
// confira a lista de pares na simulação).
// Pode rodar de novo: o que já foi feito é pulado.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planejarFotos, sqlTrocas } from './fotos-plano.js';
import { otimizarFoto, TETO_FOTOS_BYTES } from './cf-biblioteca.js';
import { uploadSQL } from '../src/storage.js';
import { wrangler, targetFlag, D1_NAME } from './wrangler.js';

function arg(argv, nome, padrao) {
  const i = argv.indexOf(nome);
  return i === -1 ? padrao : argv[i + 1];
}

function consulta(target, sql) {
  const out = wrangler(['d1', 'execute', D1_NAME, target, '--json', `--command=${sql}`], { capture: true });
  return JSON.parse(out.slice(out.indexOf('[')))[0]?.results || [];
}

function executar(target, sql, tmp, nome) {
  const arquivo = path.join(tmp, nome);
  fs.writeFileSync(arquivo, sql);
  wrangler(['d1', 'execute', D1_NAME, target, `--file=${arquivo}`], { capture: true });
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const argv = process.argv.slice(2);
  const target = targetFlag(argv);
  const simular = argv.includes('--simular');
  const todos = argv.includes('--todos');
  const lado = Math.max(600, Math.min(1600, parseInt(arg(argv, '--lado', '1200'), 10) || 1200));
  const lote = Math.max(5, Math.min(100, parseInt(arg(argv, '--lote', '40'), 10) || 40));
  const pular = new Set(String(arg(argv, '--pular', '')).split(',').map((x) => parseInt(x, 10)).filter(Boolean));
  const comValor = new Set(['--lado', '--lote', '--pular']);
  const pasta = argv.find((a, i) => !a.startsWith('--') && !comValor.has(argv[i - 1]));
  if (!pasta || !fs.existsSync(path.join(pasta, 'catalog.json'))) {
    throw new Error('Informe a pasta do catálogo extraído (a que tem catalog.json e images/).');
  }
  const catalogo = JSON.parse(fs.readFileSync(path.join(pasta, 'catalog.json'), 'utf8'));

  console.log(`Lendo os produtos (${target})...`);
  const linhas = consulta(target, `SELECT p.id, p.name, b.name AS brand, p.source, p.source_id AS sourceId, p.active,
    (SELECT group_concat(pi.file_path, '|') FROM product_images pi WHERE pi.product_id = p.id) AS imgs
    FROM products p LEFT JOIN brands b ON b.id = p.brand_id ORDER BY p.id`);
  const produtos = linhas.map((r) => ({ ...r, active: !!r.active, imagens: r.imgs ? String(r.imgs).split('|') : [] }));
  const bytesFotos = consulta(target, 'SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM upload_chunks')[0]?.n || 0;

  const plano = planejarFotos(catalogo, produtos.filter((p) => !pular.has(p.id)), { todos });
  const r = plano.resumo;
  console.log(`\n${todos ? 'Todos os produtos' : 'Produtos publicados'}:`);
  console.log(`  Cadastros antigos da loja que ganham a foto padronizada: ${r.daLoja}`);
  console.log(`  Produtos do catálogo importado que ganham foto em alta:  ${r.importados}`);
  console.log(`  Fotos a enviar: ${r.fotosNovas} (até ${lado} px)   ·   banco de fotos hoje: ${mb(bytesFotos)}`);
  const pares = plano.trocas.filter((t) => t.daLoja);
  if (pares.length) {
    console.log('\n  Pares encontrados (confira se é o mesmo perfume; se não for, use --pular id):');
    for (const t of pares) console.log(`    id ${t.productId}: ${t.nome}  ->  ${t.parecido || 'mesmo nome no pacote'}`);
  }
  if (plano.semPar.length) {
    console.log(`\n  ${plano.semPar.length} cadastro(s) antigo(s) sem foto equivalente no pacote (ficam como estão):`);
    for (const p of plano.semPar) console.log(`    - ${[p.brand, p.name].filter(Boolean).join(' ')} (id ${p.id})`);
    console.log('  Ocultar ou manter esses fica a critério da loja, pelo /admin.');
  }
  if (simular || !plano.fotos.length) {
    console.log(simular ? '\nNada foi gravado. Para gravar, rode de novo sem --simular.' : '\nNada a fazer.');
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'essencia-fotos-'));
  try {
    let ocupado = bytesFotos, enviadas = 0, total = 0, falhas = 0;
    for (let i = 0; i < plano.fotos.length; i += lote) {
      if (ocupado > TETO_FOTOS_BYTES) {
        console.log(`\nParei antes de encher o banco grátis (${mb(ocupado)}). Rode com --lado 1000 para caber mais.`);
        break;
      }
      const grupo = plano.fotos.slice(i, i + lote);
      const partes = [], ok = [];
      for (const f of grupo) {
        try {
          const bytes = await otimizarFoto(path.join(pasta, f.localPath), { lado, qualidade: 82 });
          total += bytes.length; ocupado += Math.ceil(bytes.length / 3) * 4;
          partes.push(uploadSQL(f.key, bytes, 'image/webp'));
          ok.push(f.key);
        } catch (e) {
          falhas += 1;
          console.warn(`  foto ignorada (${f.localPath}): ${e.message}`);
        }
      }
      if (ok.length) {
        partes.push(sqlTrocas(plano, ok));
        executar(target, partes.join('\n') + '\n', tmp, `fotos-${i / lote + 1}.sql`);
      }
      enviadas += ok.length;
      console.log(`  ${enviadas}/${plano.fotos.length} fotos (${mb(total)})`);
    }
    console.log(`\nPronto. ${enviadas} foto(s) enviadas; as antigas foram para a lixeira de 90 dias.`);
    if (falhas) console.log(`${falhas} foto(s) não puderam ser lidas e ficaram como estavam.`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error('\nErro:', e.message); process.exit(1); });
