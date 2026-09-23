# TODO / Verify

Itens que precisam de confirmação explícita do cliente antes de publicar. Nada
nesta lista deve virar afirmação definitiva no site sem checar aqui primeiro.

## Endereço — CONFLITO EM ABERTO
- Material visual recente indica: **Sobreloja 215**
- Menção anterior (fonte anterior, não descartada): **Sobreloja 213**
- Decisão atual: usar **215** como valor vigente no site, mas manter este
  registro até confirmação final do cliente.
- Endereço completo assumido como vigente:
  Rua Comendador Afonso Kherlakian, 79 — Galeria Pagé — Sobreloja 215

## Equipe
- Nomes confirmados até agora: Nicole, Bassan, Tamires, Larissa.
- Fotos oficiais dos quatro entregues em 19/09/2026 e publicadas na seção
  "Nossa equipe" da Home. Associação nome→foto confirmada pelo cliente
  (ver tabela em `docs/TEAM.md`).
- GRAFIA "BASSAN" — PENDENTE: o cliente levantou a dúvida Bassam x Bassan
  e optou por manter **Bassan**, que é a grafia registrada aqui e em
  `docs/TEAM.md`. Confirmar com a própria pessoa antes de considerar
  fechado; se for Bassam, trocar no site e nos dois docs.
- Cargos, sobrenomes, funções e histórias: NENHUM confirmado para nenhum
  dos quatro. Por isso o site publica só o primeiro nome. Não preencher
  sem confirmação.
- Existem outros integrantes ainda não identificados corretamente (cargos,
  sobrenomes, função na loja) — não inventar nada até confirmação.
- Há vídeo em que a Nicole apresenta a equipe de forma descontraída/cômica —
  possível fonte de copy/tom para a seção de equipe, mas roteiro exato ainda
  não transcrito/confirmado.

## Confiança / Selos comerciais
- NÃO publicar "100% Original Garantido" ou selo equivalente sem confirmação
  explícita do cliente. Pode existir uma seção de confiança no layout, mas
  com as afirmações marcadas como pendentes até então.

## Contato
- WhatsApp principal: 11 94961-4608 (confirmado pelo cliente)
- Contato secundário conhecido: 11 95930-9876 (confirmado pelo cliente,
  função/uso ainda não definido — se é loja física, atacado, ou outra linha)

## Catálogo / Produtos
- Catálogo real de 34 itens integrado em 19/09/2026 a partir do pacote do
  Instagram. Fonte de verdade: `data/catalog.json`. Ver `docs/PRODUCTS.md`.
- PREÇOS — PENDENTE: nenhum dos 34 itens tem `price` ou `wholesale_price`.
  O site NÃO exibe preço, nem "a partir de", nem "consultar preço" em
  formato de preço — só o botão "Consultar no WhatsApp". Só publicar valor
  depois de preencher o JSON com dados confirmados pelo cliente.
- MARCAS — PENDENTE: só 3 dos 34 itens têm marca (QAWAFI, Paris Corner),
  porque só nesses a legenda citava. Não deduzir marca pela foto do frasco.
- NOTAS OLFATIVAS — PARCIAL: só 9 dos 34 têm notas estruturadas. Os demais
  não exibem notas. Não preencher por semelhança nem por busca externa.
- NOMES VINDOS DE LEGENDA — PENDENTE: quatro nomes carregam texto que não é
  o nome do produto (`Elysian Fields Kiss, QAWAFI`, `Elysian Fields Silk,
  QAWAFI`, `perfume FATIMA com sabonetes em formato de Rosas`, `Fakhar
  Rose, o mais querido pelas mulheres`). Publicados como estão, sem
  reescrita por conta própria. Confirmar o nome correto com o cliente e
  corrigir em `data/catalog.json`.
- `Aurora` está classificado como `Marca / Coleção` e pode não ser um
  produto avulso — confirmar se deve sair do catálogo.

## Envios
- Rede social menciona "Envios para todo o Brasil" — usar como informação
  válida, mas confirmar se há custo, prazo, transportadora antes de detalhar
  na linha de processo de `#canais` e no FAQ.

## Frames do hero
- Resolvido na V1.1: `assets/frames/` (240 frames) removida do repositório.
  Só existe no histórico do git.

## Marcas (`#marcas`) — PENDENTE
- A seção existe, mas só tem as duas marcas citadas no catálogo (QAWAFI e
  Paris Corner), como texto — não há logo/foto delas. Lista completa de
  marcas e logos/fotos: aguardando o cliente (pasta `assets/brands/`).
- Não publicar marca sem confirmação. Não criar logo fictício.
- Como adicionar: ver o comentário no `#marcas` do `index.html`.

## Domínio final / SEO — PENDENTE
- Sem domínio definido: `canonical`, `og:url`, URLs absolutas de `og:image`
  e `twitter:image`, `url`/`image` do JSON-LD e o `sitemap.xml` (hoje
  rascunho com host `DOMINIO-FINAL-PENDENTE`) dependem dele.
- `og:image`/`twitter:image` estão com caminho relativo: o WhatsApp só
  mostra a prévia com URL absoluta. Trocar quando o domínio existir.
- `robots.txt` liberado para todos, sem a linha `Sitemap:` (acrescentar
  depois do domínio).
- JSON-LD sem CEP (não confirmado) e com endereço "Sobreloja 215" (ver o
  conflito 213/215 acima).
- O favicon usa o monograma EN recortado do logo redondo (699 px); um
  logo vetorial melhoraria o ícone.

## Conteúdo inventado REMOVIDO na passada final (19/09/2026)
Estas afirmações estavam no ar e não tinham nenhuma fonte confirmada. Foram
removidas do site. Se alguma for verdadeira, o cliente precisa confirmar por
escrito antes de voltar:

- Seção "A origem": "18 meses de maceração", "12 países de origem dos
  ingredientes", "0% álcool sintético ou fixadores artificiais" e
  "3 gerações de perfumistas árabes". Seção inteira substituída por
  `#proposta`, que só usa fatos já confirmados no BRAND-BRIEF.
- Seção "A explosão das notas": pirâmide olfativa inventada (Cardamomo &
  Açafrão / Rosa Damascena & Oud / Âmbar & Almíscar Branco) apresentada
  como se fosse de um produto da loja. Seção inteira removida.
- Rodapé: endereço "Rua 25 de Março" e o aviso de protótipo. Substituídos
  pelo endereço real da Galeria Pagé.
- A vitrine fictícia (Oud Royal, Âmbar Noturno, Rosa do Deserto, Almíscar
  Real) já havia sido substituída pelo catálogo real.

## Textos comerciais publicados que NÃO são dado de origem
Escritos para o site a partir de fatos já confirmados. Não afirmam preço,
prazo, frete, garantia, mínimo de pedido nem originalidade. Vale o cliente
ler e aprovar:
- (`#proposta` e `#comprar` foram removidas na V1.1.)
- `#canais`: textos de varejo e atacado (os títulos e CTAs vieram do cliente).
- `#faq`: as 4 respostas.
- `#rodape`: o CTA final.

## SEO
- Ver "Domínio final / SEO" acima. og:image, favicon, JSON-LD e robots já
  existem; falta o que depende do domínio.

## Sacola / vendas online — PENDENTE
- Preços: o cliente vai enviar a lista. **Atualizado na V2**: preço não é
  mais um campo do JSON — é editado em `/admin/produtos/:id`, por produto,
  e fica guardado em `data/essencia.sqlite` (com histórico completo de
  quem mudou e quando, ver `docs/ADMIN.md`). Atacado (preço "de"/promoção)
  segue sob consulta enquanto não houver política definida. Confirmar com
  o cliente se o preço pode ser público.
- Frete/prazo/transportadora e pedido mínimo do atacado: não definidos. O
  site só coleta o CEP e a equipe responde no WhatsApp.
- Pagamento online e nota fiscal: exigem uma plataforma de pagamento à
  parte — fora do escopo da V2 (que resolveu estoque/preço/admin, mas o
  checkout continua sendo por WhatsApp, de propósito).
- "Aberto agora" segue os horários fixos do site; não sabe de feriados ou
  fechamentos extraordinários. Se isso incomodar, remover o bloco
  `statusLoja` de `assets/js/vida.js`.

## V2 — pendências específicas do catálogo/admin (23/09/2026)
- Confirmar se o vínculo "SABAH" → OliSek 803958 está mesmo certo (está
  marcado como "provável", não "confirmado" — ver
  `docs/OLISEK-INTEGRATION.md`).
- Lista completa de vínculos OliSek para os outros ~29 produtos — o
  cliente disse que vai enviar.
- Logos das marcas: nenhum foi enviado ainda (ver `docs/CATALOGO.md`,
  seção "Grade de marcas").
- Otimização automática de imagem no upload do admin: não existe hoje
  (ver a limitação documentada em `docs/CATALOGO.md`).
- Senha temporária do admin: gerada por `server/seed.js`/
  `server/reset-admin-password.js` e entregue fora do repositório (nunca
  commitada). Trocar assim que possível.

