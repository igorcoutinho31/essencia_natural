# Catálogo (arquitetura de dados e vitrine pública)

## Onde os dados moram

Tudo passa por `src/services/catalog.js` (e, para o estoque,
`src/services/inventory.js`) — são as únicas partes do código que falam
com o banco (D1 na Cloudflare; `.local/essencia.sqlite` no Node local). Rotas públicas,
rotas de admin e a integração com a OliSek nunca leem o SQLite direto:
todas chamam funções deste serviço. Isso é o que permitiu trocar "de onde
vem o estoque" (importação manual → API oficial da OliSek, liberada
05/10/2026) sem tocar em mais nada fora de `catalog.js` e `olisek.js`.

### Tabelas (ver `migrations/0001_init.sql` para o schema completo)
- `products` — nome, marca, categoria, notas, preço, `compare_price`
  (preço "de", para promoção), estoque, `stock_source` (`'olisek_api'` /
  `'olisek_import'` / `'manual'` / `'none'` — de onde veio o número, ver
  seção "Estoque" abaixo), `olisek_synced_at` (quando o botão "Sincronizar
  agora" chamou a API pela última vez para aquele produto — só
  informativo), `active` (publicado ou não), `featured` (destaque), e os
  três campos de vínculo com a OliSek: `olisek_id`, `olisek_name`,
  `olisek_link_status` (`'confirmed'` / `'probable'` / `'needs_review'` /
  `'unlinked'` — ver `docs/OLISEK-INTEGRATION.md`).
- `product_images` — um produto tem N fotos; uma é `is_main`.
- `price_history` — toda vez que `catalog.setPrice()` roda, uma
  linha nova é gravada aqui (preço antigo, novo, quem mudou, quando).
  Nunca é apagada, nem quando o produto é despublicado.
- `brands` — nome + slug + `logo_path` (17 das 18 marcas confirmadas já
  têm logo, ver seção "Grade de marcas" abaixo).
- `users` / `sessions` — login do admin (ver `docs/ADMIN.md`).

### `olisekId` / `olisekName` — nunca renomeados
Por decisão explícita do projeto, o nome que vem da OliSek
(`olisek_name`) é gravado como veio, mesmo que o site mostre um nome mais
curto (`name`) na vitrine. Exemplo real: o produto aparece como "SABAH" no
site, mas `olisek_name` guarda "AL WATANIAH SABAH AL WARD EDP 100ML" — o
nome completo da OliSek. Isso existe pra sempre ser possível conferir se o
vínculo está certo, sem depender de decorar qual produto é qual.

## "Não inventar preço" — como isso é garantido no código

- No banco, `price` é `NULL` até alguém digitar um valor em `/admin`.
- `catalog.rowToPublic()` só expõe o preço se o produto estiver
  `active`; se `price` for `NULL`, a API pública devolve `"price": null`.
- No front-end (`assets/js/catalogo.js`, `precoTexto()`), `price: null`
  vira o texto **"Consulte"** — nunca um número calculado, arredondado ou
  estimado.
- O mesmo vale para a página de produto (`src/routes/productPage.js`)
  e para o schema.org `Product` (`offers` só ganha o campo `price` quando
  ele existe de verdade).

## Publicado/oculto e "Consulte disponibilidade" (regra vigente)

**Decisão de 28/10/2026 (confirmada pelo responsável pelo site):** o
catálogo é **independente da OliSek** e funciona como vitrine + sacola de
orçamento pelo WhatsApp. Por isso:

1. **Aparece no site só o que a loja publicou** (`active = 1`, checkbox
   "Publicado no site" no admin, ou em lote). Estoque e vendas **não**
   decidem mais nada na vitrine — `isPubliclyVisible(row)` em
   `src/services/catalog.js` olha só o `active`.
2. **O cliente vê sempre "Consulte disponibilidade"** (`PUBLIC_AVAILABILITY`)
   — nunca "Em estoque"/"Últimas unidades"/"Indisponível" e nunca o número.
   O número do sistema pode estar desatualizado; quem confirma é a equipe,
   no WhatsApp. O JSON-LD da página de produto também não afirma
   disponibilidade (`InStock`/`OutOfStock`) ao Google.
3. **Todo produto publicado pode ir para a sacola de orçamento.** O filtro
   "Só em estoque" saiu da vitrine.
4. **O estoque continua existindo no `/admin`** — histórico de movimentações,
   filtros "Estoque baixo" e "Estoque zerado", selo interno pelo número real
   (`computeAvailability`, limite `STOCK_THRESHOLD.ultimas = 10`). Serve à
   equipe; não aparece para o cliente.

Cuidado combinado com a loja: produto que saiu de linha continua no site
até alguém **ocultar** — o sistema não esconde sozinho.

Para voltar a mostrar selos de estoque no futuro (por exemplo, com a OliSek
sincronizada ou venda direta no site), basta `rowToPublic` voltar a usar
`computeAvailability(row)` e `isPubliclyVisible` voltar a considerar o
estoque — o restante já está pronto.

> **Histórico:** de 23/09 a 28/10/2026 valia a regra do fechamento da V2 —
> três selos pelo número de estoque e produto oculto quando `stock = 0` e
> `sales < 10`. Substituída pela regra acima.

## Biblioteca de cadastros (fornecedores) — 28/10/2026

Um pacote coletado de sites de fornecedores (**Atlântico**, 997 itens, e
**ONUH**, 1.913 — `catalog.json` + pasta `images/`, ~610 MB) entra no
admin como **biblioteca**: tudo **oculto**, para a loja escolher o que
publicar. Importação: `npm run cf:biblioteca` (`tools/cf-biblioteca.js`;
regras em `tools/biblioteca-regras.js` e `tools/biblioteca-plano.js`).

**Decisões (confirmadas pelo responsável pelo site em 28/10/2026):**

- **Só fatos do fornecedor:** nome, marca, volume, concentração, notas
  olfativas e família (extraídas da descrição da ONUH). O **texto de venda
  da ONUH não é copiado** — o campo descrição fica vazio. Preço e estoque
  não vêm do pacote.
- **Fotos liberadas** (28/10/2026): os fornecedores autorizaram o uso, e
  todas as fotos importadas são públicas assim que o produto é publicado
  (`migrations/0006_fotos_liberadas.sql`). O painel não mostra nome nem
  link de fornecedor. Foto com logo ou marca d'água de outra empresa: tirar
  em `/admin/fotos`. (O mecanismo `product_images.licensed` continua no
  código, sem uso na tela.)
- **Nome de vitrine limpo**: o nome não repete marca, volume nem
  concentração, que têm campo próprio ("AL WATANIAH EQAAB EDP H 100ML" vira
  "Eqaab", marca Al Wataniah, EDP, 100 ml — `tituloProduto` em
  `tools/biblioteca-regras.js`). O título da página, o Google e a
  mensagem de WhatsApp juntam tudo ("Al Wataniah Eqaab 100 ml").
- **Fotos em alta**: a importação guarda o endereço do original de cada foto
  (`foto_origem`); quando o produto é publicado, o site troca sozinho pela
  melhor versão (ver `docs/ADMIN.md`).
- **Uma foto por produto**, reduzida no PC para 800 px/WEBP (~30–60 KB).
  As fotos ficam no D1; o importador para antes de passar de ~380 MB
  (o banco grátis vai até 500 MB) e aceita `--lado 600` para caber mais.
- **Marcas:** grafias diferentes da mesma marca são unificadas
  ("Maison Al Hambra" = "Maison Alhambra", "Wataniah" = "Al Wataniah");
  marcas novas entram com `requires_product = 1` (só aparecem em
  `/#marcas` quando tiverem produto publicado). "OPENBOX", "Miniaturas"
  etc. não viram marca.
- **Caixa aberta:** itens "OPENBOX" (produto de caixa aberta) não são
  importados — a loja não vende.
- **Categorias** limpas: Perfume, Body Splash, Kit, Miniatura, Skincare,
  Cuidados corporais, Óleo perfumado, Cabelos, Casa e ambiente, Outros.
- **Relatório da loja:** cada item é comparado com os nomes do relatório de
  estoque da OliSek de 22/09/2026 (`seed/relatorio-loja-2026-09-22.json` —
  só nomes, sem quantidades). Quem bate ganha o selo "no relatório da loja"
  (filtro próprio no admin) — é o mix real da loja, bom ponto de partida
  para publicar. ~325 dos 2.910 batem.
- **Repetidos:** item igual a um cadastro que a loja já tem (mesma marca e
  mesmo nome, ignorando volume/EDP) é pulado.
- `olisek_id` continua vazio: os códigos do fornecedor (`source_id`) não são
  da OliSek.

Rodar o importador de novo é seguro: o que já entrou é pulado e, se cair a
conexão no meio, continua de onde parou.

## Foto ausente: sempre um placeholder oficial, nunca uma imagem quebrada

Quando um produto não tem nenhuma foto em `product_images`, a API pública e
a página de produto devolvem `image: PLACEHOLDER_IMAGE`
(`/assets/images/placeholder-produto.svg` — um SVG desenhado à mão, na
identidade visual do site, sem nenhum byte de foto real embutido nele e
sem base64) em vez de um campo vazio. O front-end nunca precisa checar "e
se não tiver foto?" — sempre há uma imagem pra mostrar. `hasImage: false`
no JSON da API indica que é o placeholder, caso algum consumidor precise
distinguir os dois casos.

## API pública (`src/routes/public.js`)

- `GET /api/products` — lista os produtos publicados: `active=1` **e**
  `isPubliclyVisible(row)` (ver seção "Estoque" acima — estoque zerado
  com poucas vendas não entra nessa lista, mesmo estando `active`).
  Filtros por querystring: `q` (busca por nome/marca), `brand` (slug da
  marca), `genero`, `categoria`, `disponibilidade`
  (`em_estoque`/`ultimas`/`indisponivel`), `destaque=true`. O front-end
  hoje busca a lista inteira uma vez e filtra no navegador (mais rápido
  pra quem tá navegando); os filtros de querystring existem para quem
  quiser consumir a API diretamente.
- `GET /api/products/slug/:slug` — um produto + até 4 relacionados (mesma
  marca primeiro, depois mesma categoria).
- `GET /api/brands` — todas as marcas cadastradas, com a contagem de
  produtos ativos de cada uma.

## Página de produto (`/produto/:slug`)

Renderizada no servidor (não é a mesma SPA do catálogo). Cada produto tem
URL própria, com `<title>`, `og:description`, `og:image` e um JSON-LD
`Product` — só preenchidos com o que existe de verdade (ver seção acima).
Um produto que não passa em `isPubliclyVisible(row)` nem chega a ter
página renderizada: a rota devolve 404, igual a um produto despublicado.
Mostra galeria (sempre com pelo menos uma imagem — o placeholder oficial
quando não há foto real, com `onerror` cobrindo o caso de o arquivo
existir no banco mas não existir mais em disco), notas (topo/coração/
fundo, quando existem), selo de disponibilidade (um dos 3 estados),
preço ou "Consulte", botão de adicionar à sacola (desabilitado quando o
estado é `indisponivel` — inclusive no caso "zerado mas com 10+ vendas",
que aparece só pra consulta no WhatsApp, nunca pra compra direta) e
produtos relacionados.

## Grade de marcas (`/#marcas`)

Vem de `GET /api/brands` (`assets/js/marcas.js`) — nenhuma marca é escrita
à mão no `index.html`. As marcas cadastradas em `brands` são todas as que
`scripts/seed.js` criou porque a loja confirmou trabalhar com elas
(constante `MARCAS_CONFIRMADAS`), mais as marcas dos dois scripts de
import de logo (ver abaixo) — mas nem toda marca cadastrada aparece
necessariamente na grade pública; ver a regra de visibilidade logo a
seguir.

**Logos — atualizado 23/09/2026:** o cliente enviou `Marcas.zip` (22
arquivos) e depois o logo da Armaf em separado.
`scripts/import-marcas-logos-2026-09-23.js` e
`scripts/import-marcas-novas-2026-09-23.js` (mantidos no repositório como
registro do que foi importado) padronizaram os nomes pelo slug da marca,
salvaram em `assets/brands/` e ligaram o logo de cada marca via
`brands.logo_path`. Hoje as 24 marcas cadastradas têm logo — nenhuma
ficou sem.

Sem logo cadastrado — ou se o arquivo do logo quebrar/for removido depois
— o cartão cai pro nome em texto (`cartaoTexto()` em `assets/js/marcas.js`,
com um listener de `error` na `<img>` cobrindo o segundo caso), nunca um
ícone de imagem quebrada. Nenhum logo é inventado: uma marca sem arquivo
confirmado pela loja fica como texto até o logo real chegar.

**Regra de visibilidade — `brands.requires_product`:** as 18 marcas
confirmadas no primeiro fechamento da V2 sempre aparecem em `/#marcas`,
mesmo sem nenhum produto do catálogo de 34 itens vinculado a elas ainda
— é assim desde a V1 e o cliente confirmou manter esse comportamento. Já
as marcas confirmadas depois só porque apareciam num relatório de
estoque da loja, sem nenhum produto do site ligado a elas — hoje: Amouage,
Anfar, Ferassa, Maison Asrar, Volaré e Ard Al Zaafaran — nascem com
`requires_product = 1` e só entram na grade pública quando tiverem pelo
menos um produto **ativo e publicamente visível** (`isPubliclyVisible`,
ver seção "Estoque" acima) vinculado. Até lá, elas existem normalmente em
`brands` (com logo já ligado) mas `getBrandsPublic()`
(`src/services/catalog.js`) as filtra do resultado — não
aparecem em `GET /api/brands` nem em `/#marcas`. Nenhum produto foi
criado só pra fazer essas marcas aparecerem — regra explícita do
cliente.

## Curadoria: por que nem todo item da OliSek vira produto do site

A OliSek é o sistema de gestão de toda a loja — inclusive itens que não
são perfume (a loja vende outras coisas também). O vínculo com o site
**nunca é automático**: um produto só aparece publicado no catálogo se
alguém do time (vendedora ou admin) confirmar o vínculo em `/admin`
(hoje, isso é feito manualmente por `scripts/seed.js`; quando existir
importação de relatório da OliSek, o fluxo malha os IDs mas ainda exige
confirmação humana antes de publicar — ver `docs/OLISEK-INTEGRATION.md`).
Isso evita, por exemplo, um carregador de celular ou um acessório
qualquer aparecerem no meio da vitrine de perfumes.

## Otimização de imagem

Resolvido na migração para a Cloudflare (10/2026), nas duas pontas:
1. O navegador reduz a foto para no máximo 1600px e converte para WEBP
   (qualidade 85) antes de enviar — vale em qualquer hospedagem.
2. Opcional (desligado por padrão, para ficar no plano grátis — ver
   `wrangler.toml`): o Worker ainda passa a imagem pelo Cloudflare Images
   (binding `IMAGES`, ver `src/images.js`) e fica com o resultado só se ele
   for menor. Se o serviço não estiver disponível, grava a imagem como
   chegou — o upload nunca falha por causa da otimização.
O formato real do arquivo continua sendo validado pelos bytes (JPG/PNG/WEBP).
