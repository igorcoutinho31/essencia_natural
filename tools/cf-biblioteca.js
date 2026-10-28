// Importa a biblioteca de cadastros (pacote Atlântico + ONUH) para o site.
// Tudo entra OCULTO (fotos já liberadas pelos fornecedores) — a loja revisa e publica em
// lote no /admin (ver docs/CATALOGO.md, "Biblioteca").
//
// Antes: extraia o zip do catálogo numa pasta (precisa ter catalog.json e a
// pasta images/). Depois, na pasta do projeto:
//
//   npm run cf:biblioteca -- "C:\Users\...\catalogo" --remote --simular   (só mostra o que faria)
//   npm run cf:biblioteca -- "C:\Users\...\catalogo" --remote    (grava no site)
//
// Opções: --local (wrangler dev), --sem-fotos, --lote 100 (fotos por envio),
// --lado 800 (tamanho máximo da foto em pixels; menor = cabe mais).
// Pode rodar de novo quantas vezes quiser: o que já foi importado é pulado,
// e se a internet cair no meio, é só rodar de novo que continua de onde parou.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planejar, sqlCadastros, sqlLigarFotos } from './biblioteca-plano.js';
import { uploadSQL } from '../src/storage.js';
import { wrangler, targetFlag, D1_NAME, ROOT } from './wrangler.js';

export const FOTO = { lado: 800, qualidade: 78 }; // ~30–60 KB por foto de produto real
// Teto para as fotos guardadas no D1 (cada banco grátis vai até 500 MB;
// sobra espaço para os dados e para fotos enviadas pelo admin). As fotos
// ficam em base64 (+33%), e é isso que conta aqui.
export const TETO_FOTOS_BYTES = 380 * 1024 * 1024;

function arg(argv, nome, padrao) {
  const i = argv.indexOf(nome);
  return i === -1 ? padrao : argv[i + 1];
}

function consulta(target, sql) {
  const out = wrangler(['d1', 'execute', D1_NAME, target, '--json', `--command=${sql}`], { capture: true });
  const json = JSON.parse(out.slice(out.indexOf('[')));
  return json[0]?.results || [];
}

function executarArquivo(target, sql, tmp, nome) {
  const arquivo = path.join(tmp, nome);
  fs.writeFileSync(arquivo, sql);
  // A saída do wrangler (resultado de cada comando) não interessa aqui.
  wrangler(['d1', 'execute', D1_NAME, target, `--file=${arquivo}`], { capture: true });
}

export async function otimizarFoto(arquivo, { lado = FOTO.lado, qualidade = FOTO.qualidade } = {}) {
  const sharp = (await import('sharp')).default;
  return sharp(arquivo, { failOn: 'none' })
    .rotate()
    .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: qualidade })
    .toBuffer();
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const argv = process.argv.slice(2);
  const simular = argv.includes('--simular');
  const comBanco = argv.includes('--remote') || argv.includes('--local');
  const target = comBanco ? targetFlag(argv) : (simular ? null : targetFlag(argv));
  const semFotos = argv.includes('--sem-fotos');
  const lote = Math.max(10, Math.min(300, parseInt(arg(argv, '--lote', '100'), 10) || 100));
  const lado = Math.max(300, Math.min(1600, parseInt(arg(argv, '--lado', String(FOTO.lado)), 10) || FOTO.lado));
  const comValor = new Set(['--lote', '--lado']);
  const pasta = argv.find((a, i) => !a.startsWith('--') && !comValor.has(argv[i - 1]));
  if (!pasta || !fs.existsSync(path.join(pasta, 'catalog.json'))) {
    throw new Error('Informe a pasta do catálogo extraído (a que tem catalog.json e images/). Ver o topo de tools/cf-biblioteca.js.');
  }
  const catalogo = JSON.parse(fs.readFileSync(path.join(pasta, 'catalog.json'), 'utf8'));
  const relatorio = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'relatorio-loja-2026-09-22.json'), 'utf8')).itens;

  if (simular) console.log(`Simulação — nada é gravado${target ? '' : ' (sem consultar o banco: considera o site vazio)'}.`);
  if (target) console.log(`Lendo o estado atual do banco (${target})...`);
  const estado = !target
    ? { slugs: [], sourceIds: [], marcas: [], produtosLoja: [], fotosExistentes: [] }
    : {
        slugs: consulta(target, 'SELECT slug FROM products').map((r) => r.slug),
        sourceIds: consulta(target, 'SELECT source_id FROM products WHERE source_id IS NOT NULL').map((r) => r.source_id),
        marcas: consulta(target, 'SELECT name, slug FROM brands'),
        produtosLoja: consulta(target, 'SELECT p.name, b.name AS brand FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE p.source IS NULL'),
        fotosExistentes: consulta(target, "SELECT key FROM uploads WHERE key LIKE 'biblioteca/%'").map((r) => r.key),
        bytesFotos: consulta(target, 'SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM upload_chunks')[0]?.n || 0,
      };

  const plano = planejar(catalogo, estado, relatorio);
  const r = plano.resumo;
  console.log(`\nNo pacote: ${r.total} produtos.`);
  console.log(`  Entram agora (ocultos): ${r.novos}   ·   já importados antes: ${r.jaImportados}   ·   iguais a cadastros da loja (pulados): ${r.repetidosDaLoja}`);
  console.log(`  Constam no relatório da loja: ${r.noRelatorio}   ·   sem foto: ${r.semFoto}   ·   marcas novas: ${r.marcasNovas}`);
  console.log('  Por categoria:', Object.entries(r.porCategoria).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log('  Por origem:', Object.entries(r.porOrigem).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log(`  Fotos a enviar: ${semFotos ? 0 : r.fotosNovas}`);
  if (simular) {
    console.log('\nNada foi gravado. Para importar de verdade, troque --simular por --remote.');
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'essencia-biblioteca-'));
  try {
    console.log('\n1/2 Gravando os cadastros (ocultos)...');
    if (plano.produtos.length || plano.marcasNovas.length) executarArquivo(target, sqlCadastros(plano), tmp, 'cadastros.sql');

    // Fotos que já estão no banco mas ainda não ligadas a produto (rodada
    // anterior interrompida): só liga.
    const jaEnviadas = plano.fotos.filter((f) => f.existe).map((f) => f.key);
    if (!semFotos && jaEnviadas.length) executarArquivo(target, sqlLigarFotos(plano, jaEnviadas), tmp, 'ligar-existentes.sql');

    const pendentes = semFotos ? [] : plano.fotos.filter((f) => !f.existe);
    console.log(`\n2/2 Enviando ${pendentes.length} foto(s) em lotes de ${lote}...`);
    let total = 0; let enviados = 0; let falhas = 0;
    let ocupado = estado.bytesFotos || 0; // base64 já guardado no banco
    for (let i = 0; i < pendentes.length; i += lote) {
      if (ocupado > TETO_FOTOS_BYTES) {
        console.log(`\nParei antes de encher o banco grátis: as fotos já ocupam ${mb(ocupado)} (teto ${mb(TETO_FOTOS_BYTES)}).`);
        console.log(`${pendentes.length - enviados} foto(s) ficaram de fora — esses produtos entram sem foto.`);
        console.log('Para caber mais, rode de novo com fotos menores (ex.: --lado 600) — o que já foi enviado é mantido.');
        break;
      }
      const grupo = pendentes.slice(i, i + lote);
      const partes = []; const ok = [];
      for (const f of grupo) {
        const arquivo = path.join(pasta, f.localPath);
        try {
          const bytes = await otimizarFoto(arquivo, { lado });
          total += bytes.length;
          ocupado += Math.ceil(bytes.length / 3) * 4;
          partes.push(uploadSQL(f.key, bytes, 'image/webp'));
          ok.push(f.key);
        } catch (e) {
          falhas += 1;
          console.warn(`  foto ignorada (${f.localPath}): ${e.message}`);
        }
      }
      if (ok.length) {
        partes.push(sqlLigarFotos(plano, ok));
        executarArquivo(target, partes.join('\n') + '\n', tmp, `fotos-${i / lote + 1}.sql`);
      }
      enviados += ok.length;
      console.log(`  ${enviados}/${pendentes.length} fotos enviadas (${mb(total)} até agora)`);
    }
    console.log(`\nPronto. ${r.novos} produto(s) entraram OCULTOS no /admin; ${enviados} foto(s) enviadas (${mb(total)}).`);
    if (falhas) console.log(`${falhas} foto(s) não puderam ser lidas e ficaram de fora (o produto entra sem foto).`);
    console.log('Próximo passo: /admin/produtos → filtros "Biblioteca" / "No relatório da loja" → selecionar → Publicar.');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error('\nErro:', e.message); process.exit(1); });
