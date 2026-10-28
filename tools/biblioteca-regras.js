// Regras que transformam um item do pacote da biblioteca (catalog.json,
// schemaVersion 2 — coleta Atlântico + ONUH) num produto da loja. Funções
// puras, sem banco nem arquivos: usadas por tools/cf-biblioteca.js e
// testadas em tests/biblioteca.test.js.
//
// Regras do projeto respeitadas aqui (decisão de 28/10/2026):
//  - Só FATOS dos fornecedores: nome, marca, volume, concentração, notas e
//    família olfativa. O texto de venda da ONUH NÃO é copiado (description
//    fica vazia).
//  - Nada de preço nem estoque (o pacote já não traz).
//  - Tudo entra OCULTO; as fotos entram liberadas (os fornecedores
//    autorizaram o uso em 28/10/2026).

const SEM_ACENTO = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Chave para comparar textos: minúsculas, sem acento, só letras e números. */
export function chave(s) {
  return SEM_ACENTO(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const SIGLAS = new Set(['EDP', 'EDT', 'EDC', 'EDP.', 'VIP', 'XL', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'UV', 'SPF', 'CK', 'DKNY', 'CH']);

/** Nome limpo: tira pontuação solta no começo (".. AEROSOL ..."), espaços
 *  repetidos e, se vier TODO EM MAIÚSCULAS, deixa com iniciais maiúsculas
 *  (mantendo siglas como EDP/EDT e volumes como 100ml). */
export function limparNome(nome) {
  let n = String(nome || '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim();
  const letras = n.replace(/[^\p{L}]/gu, '');
  if (letras && letras === letras.toUpperCase()) {
    n = n.split(' ').map((w) => {
      if (SIGLAS.has(w)) return w;
      if (/^\d+([.,]\d+)?(ML|G|GR|KG|L)$/.test(w)) return w.toLowerCase();
      return w.charAt(0) + w.slice(1).toLowerCase();
    }).join(' ');
  }
  return n;
}

// Grafias diferentes da mesma marca (chave sem espaços -> chave canônica).
const MARCA_ALIAS = {
  wataniah: 'alwataniah',
  maisonalhambra: 'maisonalhambra',
  maisonalhambraparis: 'maisonalhambra',
  alharamainperfumes: 'alharamain',
  armafperfumes: 'armaf',
  lattafaperfumes: 'lattafa',
  aurorascents: 'aurorascents',
  frenchavenueparfums: 'frenchavenue',
};

// "Marcas" do pacote que na verdade são seções de loja, não marcas.
const NAO_MARCAS = new Set(['openbox', 'miniaturas', 'miniatura', 'kits', 'kit', 'decants', 'decant', 'outros', 'diversos', 'perfumaria']);

export function chaveMarca(nome) {
  const k = chave(nome).replace(/ /g, '');
  if (!k || NAO_MARCAS.has(k)) return null;
  return MARCA_ALIAS[k] || k;
}

/** Categoria limpa a partir da categoria de origem + nome. */
export function categoria(item) {
  const t = chave(`${item.category || ''} ${item.sourceCategory || ''} ${item.name || ''}`);
  const tem = (...ps) => ps.some((p) => new RegExp(`\\b${p}\\b`).test(t));
  if (tem('skincare', 'serum', 'serum facial', 'creme facial', 'mascara facial', 'protetor solar', 'toner', 'cleanser')) return 'Skincare';
  if (tem('cabelo', 'cabelos', 'hair mist', 'shampoo', 'condicionador')) return 'Cabelos';
  if (tem('body splash', 'splash')) return 'Body Splash';
  if (tem('coffret', 'kit', 'kits', 'gift set', 'set')) return 'Kit';
  if (tem('miniatura', 'miniaturas', 'mini')) return 'Miniatura';
  if (tem('aerosol ambiente', 'ambiente', 'aromatizador', 'difusor', 'home spray', 'incenso', 'bakhoor', 'bakhour')) return 'Casa e ambiente';
  if (tem('oleo perfumado', 'oleo', 'oil', 'attar', 'roll on')) return 'Óleo perfumado';
  if (tem('body cream', 'creme corporal', 'locao', 'hidratante', 'hidratantes', 'body lotion', 'cuidados corporais', 'desodorante', 'sabonete', 'body mist', 'pasta', 'body butter')) return 'Cuidados corporais';
  if (tem('perfume', 'perfumes', 'perfumaria', 'edp', 'edt', 'parfum', 'extrait', 'eau', 'nicho', 'designer', 'arabe', 'frances')) return 'Perfume';
  return 'Outros';
}

/** Notas e família extraídas do texto da ONUH (fatos), sem copiar o texto. */
export function extrairNotas(descricao) {
  const d = String(descricao || '').replace(/\s+/g, ' ');
  const pega = (rotulo, proximos) => {
    const m = new RegExp(`${rotulo}\\s*:\\s*(.+?)(?=\\s*(?:${proximos})|…|\\.\\.\\.|$)`, 'i').exec(d);
    if (!m) return null;
    const v = m[1].replace(/[.;\s]+$/, '').trim();
    return v && v.length <= 300 ? v : null;
  };
  const fim = 'Notas de (?:Topo|Saída|Saida|Cora[cç][aã]o|Corpo|Meio|Fundo|Base)|Fam[ií]lia Olfativa|Indicado|Ocasi[aã]o|Fixa[cç][aã]o|Proje[cç][aã]o';
  return {
    topo: pega('Notas de (?:Topo|Sa[ií]da)', fim),
    coracao: pega('Notas de (?:Cora[cç][aã]o|Corpo|Meio)', fim),
    fundo: pega('Notas de (?:Fundo|Base)', fim),
    familia: pega('Fam[ií]lia Olfativa', fim),
  };
}

// Palavras que não ajudam a reconhecer um produto entre o relatório da loja
// e a biblioteca (volume, concentração, gênero, etc.).
const GENERICAS = new Set(['edp', 'edt', 'edc', 'eau', 'de', 'du', 'la', 'le', 'parfum', 'perfume', 'toilette', 'extrait', 'ml', 'm', 'f', 'u', 'h',
  'masc', 'fem', 'unissex', 'unisex', 'masculino', 'feminino', 'selo', 'novo', 'antigo', 'tester', 'the', 'by', 'intense', 'and', 'e', 'for', 'men', 'women', 'pour', 'homme', 'femme', 'spray']);

const UNIDADES = new Set(['ml', 'g', 'gr', 'grs', 'kg', 'l', 'oz']);

/** Palavras que identificam o produto: tira as genéricas e os VOLUMES
 *  ("100ml", "100 ml", "250g"), mas mantém números do nome ("212", "No 5"). */
export function tokens(nome) {
  const ws = chave(nome).split(' ').filter(Boolean);
  const out = new Set();
  ws.forEach((w, i) => {
    if (GENERICAS.has(w) || UNIDADES.has(w)) return;
    if (/^\d+([.,]\d+)?(ml|g|gr|grs|kg|l|oz)$/.test(w)) return;
    if (/^\d+$/.test(w) && UNIDADES.has(ws[i + 1])) return;
    out.add(w);
  });
  return out;
}

/** Prepara o relatório da loja para busca rápida. */
export function indiceRelatorio(itens) {
  const lista = itens.map((i) => ({ nome: i.nome, t: tokens(i.nome) })).filter((i) => i.t.size);
  const porToken = new Map();
  lista.forEach((i, idx) => i.t.forEach((w) => { if (!porToken.has(w)) porToken.set(w, []); porToken.get(w).push(idx); }));
  return { lista, porToken };
}

/** Melhor item do relatório para este produto, ou null. Exige que quase
 *  todas as palavras "de verdade" batam (Jaccard >= 0,8) e que pelo menos
 *  uma delas não seja só a marca. */
export function casarRelatorio(indice, nome, marca) {
  const t = tokens(nome);
  const tm = tokens(marca || '');
  if (!t.size) return null;
  const candidatos = new Set();
  t.forEach((w) => (indice.porToken.get(w) || []).forEach((i) => candidatos.add(i)));
  let melhor = null;
  for (const i of candidatos) {
    const r = indice.lista[i].t;
    // A marca pode aparecer só de um lado ("LATTAFA ATHEERI" x "Atheeri").
    const a = new Set([...t].filter((w) => !tm.has(w)));
    const b = new Set([...r].filter((w) => !tm.has(w)));
    if (!a.size || !b.size) continue;
    let inter = 0; a.forEach((w) => { if (b.has(w)) inter += 1; });
    const j = inter / (a.size + b.size - inter);
    if (j >= 0.8 && (!melhor || j > melhor.j)) melhor = { j, nome: indice.lista[i].nome };
  }
  return melhor ? melhor.nome : null;
}
