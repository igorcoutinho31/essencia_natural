# Catálogo (arquitetura de dados e vitrine pública)

## Onde os dados moram

Tudo passa por `server/services/catalogService.js` — é a única parte do
código que fala com o banco (`data/essencia.sqlite`). Rotas públicas,
rotas de admin e a futura integração com a OliSek nunca leem o SQLite
direto: todas chamam funções deste serviço. Isso é o que permite trocar
"de onde vem o estoque" (hoje: importado manualmente; amanhã: API da
OliSek) sem tocar em mais nada.

### Tabelas (ver `server/db.js` para o schema completo)
- `products` — nome, marca, categoria, notas, preço, `compare_price`
  (preço "de", para promoção), estoque, `stock_source` (`'olisek_import'` /
  `'manual'` / `'none'` — de onde veio o número, ver seção "Estoque"
  abaixo), `active` (publicado ou não), `featured` (destaque), e os três
  campos de vínculo com a OliSek: `olisek_id`, `olisek_name`,
  `olisek_link_status` (`'confirmed'` / `'probable'` / `'needs_review'` /
  `'unlinked'` — ver `docs/OLISEK-INTEGRATION.md`).
- `product_images` — um produto tem N fotos; uma é `is_main`.
- `price_history` — toda vez que `catalogService.setPrice()` roda, uma
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
- `catalogService.rowToPublic()` só expõe o preço se o produto estiver
  `active`; se `price` for `NULL`, a API pública devolve `"price": null`.
- No front-end (`assets/js/catalogo.js`, `precoTexto()`), `price: null`
  vira o texto **"Consulte"** — nunca um número calculado, arredondado ou
  estimado.
- O mesmo vale para a página de produto (`server/routes/productPage.js`)
  e para o schema.org `Product` (`offers` só ganha o campo `price` quando
  ele existe de verdade).

## Estoque: nunca o número exato pro cliente, nunca um número inventado

**Atualizado no segundo fechamento da V2 (23/09/2026):** o selo de
estoque e a regra de "esse produto aparece no catálogo ou não" viraram
duas perguntas separadas — antes eram uma coisa só (o antigo estado
"Consulte disponibilidade"), agora cada uma tem sua própria função em
`catalogService.js`.

### 1. Qual selo mostrar (`computeAvailability(row)`)

Olha só o número de `stock` — três estados, nunca o número exato:

| `stock`      | Selo                     |
|--------------|--------------------------|
| `0`          | Indisponível no momento  |
| `1` a `10`   | Últimas unidades         |
| `11` ou mais | Em estoque               |

O limite "10" é o único número mágico do sistema e está isolado em uma
constante (`STOCK_THRESHOLD.ultimas`, topo de `catalogService.js`) —
mudar o limite é editar um número, não reescrever lógica.

### 2. Se o produto aparece no catálogo público (`isPubliclyVisible(row)`)

```js
function isPubliclyVisible(row) {
  return row.stock > 0 || row.sales >= 10;
}
```

Um produto só aparece na listagem pública, na página de produto e nos
relacionados se **tiver estoque OU já tiver vendido 10 ou mais vezes**
(`sales`, coluna nova — vendas acumuladas, dado real vindo da OliSek,
nunca estimado, começa em `0` até existir uma importação real de vendas;
ver `docs/OLISEK-INTEGRATION.md`). Isso dá três casos possíveis:

- **Estoque > 0** → aparece normalmente, com o selo da tabela acima.
- **Estoque zerado e `sales >= 10`** → continua aparecendo (é um produto
  que já provou ter saída), mas com o selo "Indisponível no momento", sem
  botão de comprar — só o link de consultar no WhatsApp.
- **Estoque zerado e `sales < 10`** → some do catálogo público (a página
  de produto devolve 404, como se estivesse despublicado) mas **nunca é
  apagado do banco** — continua existindo normalmente em `/admin`, com o
  filtro "Ocultos do catálogo" pra achar esses produtos rápido.

`isStockReliable(row)` (vínculo OliSek confirmado/provável ou número
digitado à mão) continua existindo no código, mas hoje é só informação
pro admin — não decide mais nada da vitrine pública.

## Foto ausente: sempre um placeholder oficial, nunca uma imagem quebrada

Quando um produto não tem nenhuma foto em `product_images`, a API pública e
a página de produto devolvem `image: PLACEHOLDER_IMAGE`
(`/assets/images/placeholder-produto.svg` — um SVG desenhado à mão, na
identidade visual do site, sem nenhum byte de foto real embutido nele e
sem base64) em vez de um campo vazio. O front-end nunca precisa checar "e
se não tiver foto?" — sempre há uma imagem pra mostrar. `hasImage: false`
no JSON da API indica que é o placeholder, caso algum consumidor precise
distinguir os dois casos.

## API pública (`server/routes/publicApi.js`)

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
`server/seed.js` criou porque a loja confirmou trabalhar com elas
(constante `MARCAS_CONFIRMADAS`), mais as marcas dos dois scripts de
import de logo (ver abaixo) — mas nem toda marca cadastrada aparece
necessariamente na grade pública; ver a regra de visibilidade logo a
seguir.

**Logos — atualizado 23/09/2026:** o cliente enviou `Marcas.zip` (22
arquivos) e depois o logo da Armaf em separado.
`server/import-marcas-logos-2026-09-23.js` e
`server/import-marcas-novas-2026-09-23.js` (mantidos no repositório como
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
(`server/services/catalogService.js`) as filtra do resultado — não
aparecem em `GET /api/brands` nem em `/#marcas`. Nenhum produto foi
criado só pra fazer essas marcas aparecerem — regra explícita do
cliente.

## Curadoria: por que nem todo item da OliSek vira produto do site

A OliSek é o sistema de gestão de toda a loja — inclusive itens que não
são perfume (a loja vende outras coisas também). O vínculo com o site
**nunca é automático**: um produto só aparece publicado no catálogo se
alguém do time (vendedora ou admin) confirmar o vínculo em `/admin`
(hoje, isso é feito manualmente por `server/seed.js`; quando existir
importação de relatório da OliSek, o fluxo malha os IDs mas ainda exige
confirmação humana antes de publicar — ver `docs/OLISEK-INTEGRATION.md`).
Isso evita, por exemplo, um carregador de celular ou um acessório
qualquer aparecerem no meio da vitrine de perfumes.

## Limitação conhecida: otimização de imagem

O upload de foto em `/admin` valida que o arquivo é mesmo um JPG/PNG/WEBP
de verdade (lê a assinatura de bytes, não confia na extensão) e grava um
arquivo real em `/uploads/products/<slug>/`. O que **não existe hoje** é
redimensionamento/compressão automática — a imagem é salva do tamanho que
a pessoa mandou. Isso acontece porque o ambiente onde a V2 foi construída
bloqueia `npm install`, e a ferramenta padrão pra isso (`sharp`) é um
pacote do npm. Dois caminhos pra resolver, quando a loja escolher onde
hospedar:
1. Se o servidor de produção permitir `npm install`, adicionar `sharp` e
   redimensionar em `server/routes/adminApi.js` (`uploadImage`) antes de
   gravar o arquivo — é a solução mais simples.
2. Sem isso, o caminho é reduzir a imagem no navegador antes de enviar
   (usando `<canvas>`, que não depende de nenhum pacote) — dá mais
   trabalho de implementar mas funciona em qualquer hospedagem.
Enquanto isso não é feito, o cuidado prático é a pessoa que sobe a foto já
mandar um arquivo de tamanho razoável (a V1 usava fotos de até 700px de
largura, convertidas pra WebP — o mesmo padrão continua sendo uma boa
prática manual até a automação existir).
