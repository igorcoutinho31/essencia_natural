# Backend — catálogo, estoque e painel /admin

Ponto de partida para quem mexe em catálogo, preço, estoque, fotos ou admin.
Detalhes de cada parte: `docs/CATALOGO.md`, `docs/ADMIN.md`,
`docs/OLISEK-INTEGRATION.md`. Hospedagem e migração: `docs/CLOUDFLARE.md`.
Histórico da V1 (site estático): `docs/SITE-ARCHITECTURE.md`.

## Arquitetura (V3, 10/2026 — Cloudflare)

```
public/      site estático (index.html, links.html, robots.txt, assets/)
             + _headers (cabeçalhos de segurança/cache da Cloudflare)
src/         o backend: um roteador só (src/app.js) que recebe um Request
             e devolve um Response — padrão Web, sem framework
  worker.js    entrada na Cloudflare (fetch + cron)
  routes/      API pública, página de produto, API e páginas do admin
  services/    catalog (produtos), inventory (estoque), olisek, backup
  auth.js      senhas (scrypt), sessões, limite de tentativas de login
  http.js      respostas e cabeçalhos de segurança
migrations/  esquema do banco (D1), aplicado em ordem
server/      servidor Node local: o MESMO src/app.js com SQLite embutido
             (sqlite-d1.js imita a API do D1) e a pasta .local/uploads
scripts/     scripts de dados: base inicial, importações históricas,
             reset de senha (banco local)
seed/        dados iniciais: catalog.json + fotos dos 34 produtos
tools/       comandos da Cloudflare: importar dados, contas do admin, teste
tests/       testes automáticos (npm test)
```

Onde cada coisa roda:

| Peça            | Na Cloudflare (produção)        | No Node local (`npm run dev`)        |
|-----------------|----------------------------------|--------------------------------------|
| Código          | Worker `src/worker.js`           | `server/app.js`                      |
| Banco           | D1 (SQLite gerenciado)           | `.local/essencia.sqlite` (`node:sqlite`) |
| Fotos do admin  | D1 (tabelas `uploads`); R2 opcional | `.local/uploads/`                 |
| Estáticos       | Static Assets (`public/`)        | `server/static.js` lendo `public/`   |
| Otimização foto | navegador (+ Images, se ligado)  | só navegador                          |

Como as duas pontas usam o mesmo `src/`, o que passa nos testes locais é o
mesmo código que roda na Cloudflare. O código de `src/` só fala com o banco
pela API do D1 (`prepare().bind().first()/all()/run()`, `batch()`) e com
as fotos pela interface de `src/storage.js` — trocar de banco ou de
armazenamento é trocar esse adaptador, não as rotas.

Sem dependências de runtime: tudo é JavaScript/Node nativo (`node:crypto`
para senhas, `node:sqlite` só no Node local). A única dependência do
projeto é o `wrangler` (CLI da Cloudflare), como ferramenta de
desenvolvimento.

## Como rodar localmente

```bash
npm install          # só instala o wrangler (ferramenta); o site não precisa
npm run dev          # http://localhost:3000
```

`npm run dev` sobe o servidor com o banco que já existir em `.local/`.
Para montar a base inicial (24 marcas, 34 produtos, fotos, vínculos OliSek
e a conta `admin` com senha temporária impressa no terminal):

```bash
node scripts/base-inicial.js
npm run dev
```

(`npm start` faz as duas coisas sozinho — é o que o Railway roda.)
Admin em `http://localhost:3000/admin/login`. Perdeu a senha local?
`npm run reset-admin-password`.

Para testar no runtime real da Cloudflare, sem publicar nada:

```bash
npm run cf:importar -- --do-zero --local   # base inicial no D1 local
npm run cf:dev                              # http://127.0.0.1:8787
```

## Testes

```bash
npm test                                    # suíte completa, sem rede (~5s)
npm run cf:smoke -- http://127.0.0.1:8787   # contra um site no ar (só leitura)
```

`npm test` cobre: catálogo público e regra de visibilidade, sitemap, SEO da
página de produto, login/bloqueio/troca de senha, permissões
vendedora × admin, CSRF, cabeçalhos de segurança, movimentações de estoque
(incluindo baixas simultâneas), sincronização OliSek com API simulada,
upload/otimização de foto, backup → importação e o servidor Node.

## Banco de dados

Esquema em `migrations/` (0001 = tabelas da V2; 0002 = estoque e
segurança; 0003 = fotos guardadas no D1). Na Cloudflare: `npm run cf:migrar`. No Node: aplicado sozinho
ao abrir o banco (os arquivos são idempotentes).

Tabelas: `products`, `brands`, `product_images`, `price_history`,
`stock_movements` (livro-razão do estoque), `users`, `sessions`,
`login_attempts`, `settings`, `uploads` + `upload_chunks` (fotos, quando
não se usa R2: cada foto em pedaços de 64 KB de base64, porque o D1 limita
o tamanho de cada comando SQL — ver `src/storage.js`).

## Estoque (livro-razão)

Todo número de estoque tem histórico. Nenhum código altera
`products.stock` direto: cada mudança é uma linha em `stock_movements`
(tipo, quantidade, saldo antes → depois, motivo, quem, quando) e um trigger
do banco grava o saldo no produto. Tipos: `inicial`, `entrada`, `saida`,
`ajuste` (contagem física), `olisek_import` (relatório colado),
`olisek_api` (sincronização).

- O saldo nunca fica negativo: a saída é recusada (409) se for maior que o
  saldo, e o banco tem `CHECK (stock_after >= 0)`.
- Leitura do saldo e gravação do novo acontecem num único comando SQL, então
  duas baixas ao mesmo tempo nunca se perdem nem passam do saldo.
- Saída e ajuste exigem motivo. Só a administração movimenta estoque.
- `/admin/estoque`: saldos, filtros (baixo, zerado, origem não
  confirmada), últimas movimentações, CSV de saldos e de movimentações,
  sincronização em lote com a OliSek e backup completo.
- O cliente não vê estoque: o site mostra sempre "Consulte disponibilidade"
  e só os produtos publicados (ver `docs/CATALOGO.md`).

## Segurança

- Senhas com scrypt (as mesmas de antes continuam valendo); senha nova com
  no mínimo 10 caracteres; trocar a senha encerra as outras sessões.
  Custo do scrypt ajustado (N=2048, ~3,5 ms) para caber nos 10 ms de CPU
  do plano grátis de Workers; senhas da V2 (N=16384) continuam valendo e
  são regravadas no formato novo no primeiro login certo.
- Senha temporária: até trocar, a conta não consegue fazer mais nada.
- 5 senhas erradas para o mesmo usuário (ou 20 do mesmo IP) em 15 minutos
  bloqueiam o login por 15 minutos.
- Cookie de sessão `HttpOnly`, `SameSite=Lax` e `Secure` (HTTPS).
- Pedidos que alteram dados no admin precisam vir do próprio site
  (verificação do cabeçalho `Origin` — proteção contra CSRF).
- Cabeçalhos em todas as respostas: CSP, HSTS, `X-Frame-Options`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Admin com
  `noindex` e `no-store`.
- Erros internos não mostram detalhes técnicos para quem está de fora.
- Fotos: formato validado pelos bytes (JPG/PNG/WEBP), nunca pela extensão.

## Contas do admin

| Onde        | Resetar senha / criar conta                                          |
|-------------|-----------------------------------------------------------------------|
| Cloudflare  | `npm run cf:admin -- resetar-senha admin --remote` · `criar <usuario> "<Nome>" [--vendedora] --remote` |
| Node local  | `npm run reset-admin-password`                                        |

A senha temporária aparece uma vez no terminal; o primeiro login obriga a
trocar. Só o hash vai para o banco.

## Backup

**Automático — ninguém precisa fazer nada** (`src/services/autoBackup.js`,
migração 0004):

- **Cópia semanal dos dados.** O cron do Worker (a cada 30 min) confere se a
  última cópia tem 7+ dias e, se tiver, faz outra. Guarda as **12 mais
  recentes** (~3 meses). A cópia é feita inteira em SQL dentro do D1
  (`INSERT … SELECT json_object(…)`), porque o plano grátis dá só 10 ms de
  CPU ao Worker — serializar milhares de produtos em JavaScript não caberia.
- **Fotos apagadas ficam 90 dias** numa fila (`upload_trash`) antes de sumir
  de vez, para uma cópia de até ~3 meses ainda encontrar as fotos que cita.
- **Time Travel do D1:** volta o banco inteiro para qualquer minuto dos
  últimos 7 dias (`npx wrangler d1 time-travel restore essencia-natural
  --timestamp=<data>`).

Em `/admin/estoque` → **Backups automáticos** aparece a data da última cópia
e um link para baixar cada uma (só administração). **Baixar cópia dos dados
agora** gera uma cópia na hora. Esses arquivos trazem **só os dados** (sem
fotos — 1000 fotos num JSON passariam do limite do Worker) e contêm os
hashes das senhas: guarde em lugar privado.

**Restaurar** (substitui todos os dados; as fotos que já estão no site são
mantidas): `npm run cf:importar -- arquivo.json --remote`.

**Cópia completa com fotos, fora da Cloudflare** (só se for trocar de
hospedagem ou por precaução extra; roda no PC, sem limite de CPU):
`npx wrangler d1 export essencia-natural --remote --output=essencia-completa.sql`.
Esse `.sql` traz o banco inteiro, fotos incluídas (tabelas `uploads`).

O que as cópias automáticas **não** cobrem: perder a própria conta da
Cloudflare (as cópias moram nela). Para isso, a `d1 export` acima de tempos
em tempos — é responsabilidade de quem mantém o site, não da loja.

## Cache de CSS/JS

HTML, JS e CSS são revalidados a cada visita (304 leve quando nada mudou);
imagens ficam 24h em cache. Ao mexer em qualquer `.js` ou `.css`, suba o
`?v=AAAAMMDD-N` em `public/index.html` e em `src/routes/productPage.js`.

## Teste final antes de publicar (desktop + mobile)

Roteiro mínimo do **segundo fechamento da V2** (23/09/2026), que trocou o
antigo modelo de 4 estados pela regra do fechamento da V2 — atualizado
para a regra de 28/10/2026: publicado/oculto + "Consulte disponibilidade"
(ver `docs/CATALOGO.md`):

1. Home carrega, catálogo lista só os produtos **publicados** e nenhum
   produto oculto aparece na busca nem na navegação por marca/categoria.
2. Produto **publicado** (com ou sem estoque): abre `/produto/:slug` com o
   selo "Consulte disponibilidade", botão "Adicionar à sacola" habilitado,
   botão do WhatsApp com a mensagem "...gostaria de consultar o valor do
   produto [NOME]" quando não há preço, ou a mensagem padrão quando há.
3. Nenhum lugar do site mostra "Em estoque", "Últimas unidades",
   "Indisponível" nem número de estoque.
4. Produto **oculto** (desmarcado "Publicado no site"): não aparece na
   listagem pública nem na busca; `/produto/:slug` dele devolve 404;
   continua existindo em `/admin`, aba "Ocultos".
5. Produto **sem preço**: mostra "Consulte" (nunca "R$ 0,00" nem um valor
   calculado) e o botão de WhatsApp pede o valor, com "produto" no texto
   da mensagem (não mais "perfume").
6. Um produto sem foto mostra o placeholder oficial (nunca uma imagem
   quebrada, inclusive quando o arquivo referenciado no banco não existe
   mais em disco — testar renomeando/apagando um arquivo de upload e
   confirmando que a página cai pro placeholder sozinha); um produto sem
   marca ou sem logo de marca mostra o nome em texto, nunca um espaço
   vazio nem um ícone de imagem quebrada.
7. Sacola: adicionar um produto disponível, tentar adicionar um
   indisponível (não deve entrar), finalizar pelo WhatsApp e conferir a
   mensagem gerada.
8. `/admin`: os 11 filtros da lista de produtos (Todos, Em estoque,
   Estoque baixo, Vendidos, Publicados, Ocultos, Estoque zerado, Sem preço,
   Sem imagem, Sem vínculo OliSek, Precisa revisão) mostram contagens condizentes
   entre si e com "Todos"; a vendedora só vê/edita preço, promoção, fotos
   e destaque; a administração vê e edita tudo, incluindo as movimentações de
   estoque e o formulário de vínculo OliSek, e consegue salvar um upload de imagem
   novo.
9. Login/logout do admin funcionando (sessão expira, cookie unset no
   logout).
10. Repetir os passos 1–7 numa viewport de celular (largura ~375px) —
    catálogo, modal de produto e sacola continuam usáveis sem scroll
    horizontal.

## O que falta / próximos passos conhecidos

- Preços reais de cada produto (todos os produtos hoje mostram "Consulte"
  — nenhum preço foi inventado).
- A lista completa de vínculos com a OliSek para os produtos que ainda
  estão como "aguardando vínculo", "provável" ou "precisa revisão" (ver
  `docs/OLISEK-INTEGRATION.md`).
- **Dado real de vendas acumuladas (`sales`)**: a coluna existe e a regra
  de visibilidade já olha pra ela, mas nenhuma importação real de vendas
  da OliSek aconteceu ainda — todo produto está com `sales=0`. Até isso
  existir, um produto zerado só volta a aparecer no catálogo com estoque
  novo, nunca só por vendas.
- **Logos das marcas**: concluído (23/09/2026) — as 24 marcas cadastradas
  (as 18 originais + 6 novas confirmadas depois) têm logo em
  `public/assets/brands/`, incluindo a Armaf, que veio num segundo envio. O
  fallback pro nome em texto (sem logo, ou se o arquivo quebrar depois)
  continua funcionando normalmente.
- **6 marcas novas cadastradas sem produto vinculado ainda** (Amouage,
  Anfar, Ferassa, Maison Asrar, Volaré, Ard Al Zaafaran) — confirmadas
  pelo cliente, com logo, mas ficam de fora de `/#marcas` até algum
  produto do catálogo ser realmente dessa marca (`brands.requires_product`
  — ver `docs/CATALOGO.md`). Nenhum produto foi criado só por causa
  delas.
- Apagar o projeto antigo no painel do Railway (o serviço já está parado
  desde o fim do período de teste; ver `docs/CLOUDFLARE.md`, passo 8).
