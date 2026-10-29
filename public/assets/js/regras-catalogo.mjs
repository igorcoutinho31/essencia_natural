// Regras do catálogo: nome de vitrine, marca, categoria, notas e "mesmo
// produto". Funções puras, sem banco nem arquivos, usadas em dois lugares:
//  - no navegador, pela tela /admin/ferramentas (arrumar nomes e padronizar
//    fotos — o trabalho pesado roda no aparelho de quem usa o painel, para
//    não estourar os 10 ms de CPU do Worker no plano grátis);
//  - no computador, pelo importador (tools/cf-biblioteca.js, via
//    tools/biblioteca-regras.js).
// Testadas em tests/biblioteca.test.js e tests/ferramentas.test.js.
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
  // "Collector'S Edition" -> "Collector's Edition"
  return n.replace(/(\p{L})(['’])S(?=\s|$)/gu, '$1$2s');
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
  alhambra: 'maisonalhambra',
};

// "Marcas" do pacote que na verdade são seções de loja, não marcas.
const NAO_MARCAS = new Set(['openbox', 'miniaturas', 'miniatura', 'kits', 'kit', 'decants', 'decant', 'outros', 'diversos', 'perfumaria']);

export function chaveMarca(nome) {
  const k = chave(nome).replace(/ /g, '');
  if (!k || NAO_MARCAS.has(k)) return null;
  return MARCA_ALIAS[k] || k;
}

const RE_VOLUME = /(^|\s)(\d+(?:[.,]\d+)?)\s?(ml|g|gr|grs|kg|l|oz)(?=\s|$)/i;
const CONCENTRACOES = [
  [/(^|\s)extrait de parfum(?=\s|$)/i, 'Extrait de Parfum'],
  [/(^|\s)eau de parfum(?=\s|$)/i, 'EDP'],
  [/(^|\s)eau de toilette(?=\s|$)/i, 'EDT'],
  [/(^|\s)eau de cologne(?=\s|$)/i, 'EDC'],
  [/(^|\s)edp(?=\s|$)/i, 'EDP'],
  [/(^|\s)edt(?=\s|$)/i, 'EDT'],
  [/(^|\s)edc(?=\s|$)/i, 'EDC'],
  [/(^|\s)extrait(?=\s|$)/i, 'Extrait de Parfum'],
];
const RE_VOLUME_CAMPO = /^(\d+(?:[.,]\d+)?)\s*(ml|g|gr|grs|kg|l|oz)$/i;
const volumeBonito = (n, u) => `${n.replace('.', ',')} ${u.toLowerCase().replace(/^grs?$/, 'g')}`;

/** Tira a marca do começo/meio do nome ("Lattafa Khamrah" -> "Khamrah"),
 *  inclusive quando vem repetida ou com outra grafia ("Maison Al Hambra
 *  Maison Alhambra Lovely Cherie" -> "Lovely Cherie"). */
function semMarca(palavras, marca) {
  const alvo = chaveMarca(marca);
  if (!alvo) return palavras;
  // "Al Rasasi" = "Rasasi", "Wataniah" = "Al Wataniah"
  const mesma = (k) => k === alvo || k === 'al' + alvo || 'al' + k === alvo;
  let ws = palavras.slice();
  for (let mudou = true; mudou;) {
    mudou = false;
    for (let i = 0; i < ws.length && !mudou; i += 1) {
      for (let n = Math.min(5, ws.length - i); n >= 1; n -= 1) {
        if (mesma(chaveMarca(ws.slice(i, i + n).join(' '))) && ws.length - n > 0) {
          ws = ws.slice(0, i).concat(ws.slice(i + n));
          mudou = true;
          break;
        }
      }
    }
  }
  return ws;
}

/**
 * Nome de vitrine: sem a marca, sem volume e sem concentração (que já têm
 * campo próprio e aparecem ao lado do nome), sem a letra de gênero solta do
 * fim ("... EDP H 100ML"). Volume e concentração achados no nome preenchem
 * os campos quando estiverem vazios.
 *   tituloProduto('LATTAFA KHAMRAH DUKHAN 100ML', { marca: 'Lattafa' })
 *     -> { nome: 'Khamrah Dukhan', volume: '100 ml', concentracao: null }
 */
export function tituloProduto(nomeOriginal, { marca = null, volume = null, concentracao = null } = {}) {
  let n = limparNome(nomeOriginal);
  let vol = volume ? String(volume).trim() : null;
  const vc = vol && RE_VOLUME_CAMPO.exec(vol);
  if (vc) vol = volumeBonito(vc[1], vc[2]);
  let conc = concentracao ? String(concentracao).trim() : null;
  const v = RE_VOLUME.exec(n);
  if (v) {
    if (!vol) vol = volumeBonito(v[2], v[3]);
    n = n.replace(new RegExp(RE_VOLUME.source, 'gi'), ' ');
  }
  for (const [re, nome] of CONCENTRACOES) {
    if (re.test(n)) {
      if (!conc) conc = nome;
      n = n.replace(new RegExp(re.source, 'gi'), ' ');
    }
  }
  let ws = n.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  while (ws.length > 1 && /^[HMFU]$/i.test(ws[ws.length - 1])) ws.pop();
  ws = semMarca(ws, marca);
  // Palavras repetidas em sequência ("Body Splash Body Splash").
  for (let k = 3; k >= 1; k -= 1) {
    for (let i = 0; i + 2 * k <= ws.length; i += 1) {
      if (chave(ws.slice(i, i + k).join(' ')) === chave(ws.slice(i + k, i + 2 * k).join(' '))) { ws.splice(i + k, k); i -= 1; }
    }
  }
  const limpo = ws.join(' ').replace(/^[\s\-–·|,.]+|[\s\-–·|,.]+$/g, '').trim();
  return { nome: limpo || limparNome(nomeOriginal), volume: vol, concentracao: conc };
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

/** Produto de caixa aberta ("OPENBOX ..." no nome ou como marca do
 *  fornecedor): a loja não vende, então não entra no site. */
export function ehCaixaAberta(nome, marca) {
  return /(^|[^a-z])open\s?box([^a-z]|$)/i.test(`${nome || ''} ${marca || ''}`);
}

/** Chave de "mesmo produto": marca + palavras do nome (sem volume/EDP...). */
export function chaveProduto(nome, marca) {
  return `${chaveMarca(marca) || ''}|${[...tokens(nome)].sort().join(' ')}`;
}

// ---------- ferramentas do painel ----------

/** Mudanças de nome para a tela "Arrumar nomes". Recebe
 *  [{ id, name, brand, volume, concentration }] e devolve só os que mudam:
 *  [{ id, antes: {...}, depois: { name, volume, concentration } }]. */
export function mudancasDeNomes(produtos) {
  const out = [];
  for (const p of produtos) {
    const t = tituloProduto(p.name, { marca: p.brand, volume: p.volume, concentracao: p.concentration });
    const depois = { name: t.nome, volume: t.volume || null, concentration: t.concentracao || null };
    if (depois.name !== p.name || depois.volume !== (p.volume || null) || depois.concentration !== (p.concentration || null)) {
      out.push({ id: p.id, antes: { name: p.name, brand: p.brand || null, volume: p.volume || null, concentration: p.concentration || null }, depois });
    }
  }
  return out;
}

// mesmo perfume ignorando a marca repetida no nome ("Lattafa Khamrah EDP
// 100 ml" = "KHAMRAH" da Lattafa)
function chaveSemMarca(nome, marca) { return chaveProduto(tituloProduto(nome, { marca }).nome, marca); }

// "esqueleto" do nome: sem vogais e sem letras repetidas, para casar
// grafias diferentes do mesmo nome árabe ("KHAMARAH" = "Khamrah")
function esqueleto(nome, marca) {
  return [...tokens(tituloProduto(nome, { marca }).nome)]
    .map((w) => (/^\d+$/.test(w) ? w : w.replace(/[aeiouy]/g, '').replace(/(.)\1+/g, '$1')))
    .filter(Boolean).sort().join(' ');
}

/** Pares para a tela "Padronizar fotos": cada cadastro da loja (sem
 *  origem, fotos antigas) com o mesmo perfume do catálogo importado que tem
 *  foto. Recebe [{ id, name, brand, source, image, hasImage }] e devolve
 *  { pares: [{ id, nome, marca, imagem, de, deNome, deImagem, exato }], semPar: [...] }.
 *  Sem marca no cadastro da loja, só casa se todas as opções forem da mesma
 *  marca (senão é ambíguo e fica de fora). */
export function paresDeFotos(produtos) {
  const porChave = new Map(), porEsqueleto = new Map();
  for (const p of produtos) {
    if (!p.source || !p.hasImage || !p.image) continue;
    const k = chaveSemMarca(p.name, p.brand);
    if (!porChave.has(k)) porChave.set(k, p);
    const e = esqueleto(p.name, p.brand);
    if (!e) continue;
    if (!porEsqueleto.has(e)) porEsqueleto.set(e, []);
    porEsqueleto.get(e).push(p);
  }
  const pares = [], semPar = [];
  for (const p of produtos) {
    if (p.source) continue;
    let alvo = porChave.get(chaveSemMarca(p.name, p.brand)), exato = !!alvo;
    if (!alvo) {
      const marcaP = chaveMarca(p.brand);
      const ops = (porEsqueleto.get(esqueleto(p.name, p.brand)) || []).filter((o) => !marcaP || chaveMarca(o.brand) === marcaP);
      if (ops.length && new Set(ops.map((o) => chaveMarca(o.brand))).size === 1) alvo = ops[0];
    }
    if (!alvo) { semPar.push({ id: p.id, nome: p.name, marca: p.brand || null }); continue; }
    if (p.image === alvo.image) continue; // já padronizado
    pares.push({ id: p.id, nome: p.name, marca: p.brand || null, imagem: p.hasImage ? p.image : null,
      de: alvo.id, deNome: [alvo.brand, tituloProduto(alvo.name, { marca: alvo.brand }).nome].filter(Boolean).join(' '), deImagem: alvo.image, exato });
  }
  return { pares, semPar };
}
