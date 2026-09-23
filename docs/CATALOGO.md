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
  (preço "de", para promoção), estoque, `active` (publicado ou não),
  `featured` (destaque), e os três campos de vínculo com a OliSek:
  `olisek_id`, `olisek_name`, `olisek_match_confidence`.
- `product_images` — um produto tem N fotos; uma é `is_main`.
- `price_history` — toda vez que `catalogService.setPrice()` roda, uma
  linha nova é gravada aqui (preço antigo, novo, quem mudou, quando).
  Nunca é apagada, nem quando o produto é despublicado.
- `brands` — nome + slug; hoje sem logo (a loja ainda vai enviar).
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

## Estoque: nunca o número exato pro cliente

`catalogService.stockStatus(stock)` traduz o número em um dos três
selos, e é isso — nunca o número — que qualquer tela pública mostra:

| Estoque         | Selo               |
|-----------------|---------------------|
| 0                | Indisponível         |
| 1 a 10           | Últimas unidades      |
| 11 ou mais       | Em estoque            |

O limite "10" é o único número mágico do sistema e está isolado em uma
constante (`STOCK_THRESHOLD.ultimas`, topo de `catalogService.js`) —
mudar o limite é editar um número, não reescrever lógica.

## API pública (`server/routes/publicApi.js`)

- `GET /api/products` — lista os produtos publicados (`active=1`).
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
Mostra galeria, notas (topo/coração/fundo, quando existem), selo de
estoque, preço ou "Consulte", botão de adicionar à sacola (desabilitado
se `indisponivel`) e produtos relacionados.

## Grade de marcas (`/#marcas`)

Vem de `GET /api/brands` (`assets/js/marcas.js`) — nenhuma marca é escrita
à mão no `index.html`. As marcas que aparecem são exatamente as que
`server/seed.js` cadastrou porque a loja confirmou trabalhar com elas (17
nomes, mais QAWAFI e Paris Corner que já apareciam no catálogo antigo:
ver a lista completa em `server/seed.js`, constante `MARCAS_CONFIRMADAS`).
Sem logo enviado, cada marca vira um cartão só com o nome, linkando pro
WhatsApp com uma mensagem pronta perguntando pelos perfumes daquela marca.

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
