# Essência Natural — V2 (catálogo + admin de verdade)

Este documento é o ponto de partida da V2. Para os detalhes de cada parte,
ver `docs/CATALOGO.md`, `docs/ADMIN.md` e `docs/OLISEK-INTEGRATION.md`.
Para o histórico da V1 (site estático), ver `docs/SITE-ARCHITECTURE.md`.

## O que a V2 é

A V1 era um site 100% estático: um `index.html` com tudo dentro (CSS, JS,
e o catálogo lido de `data/catalog.json`). A V2 transforma isso num
site com backend real:

- Um servidor Node (`server/app.js`) serve o site, uma API do catálogo, a
  página de cada produto e um painel administrativo.
- Um banco de dados SQLite (`data/essencia.sqlite`) guarda produtos,
  marcas, preços (com histórico de alterações), fotos e usuários do admin.
- Preço, estoque, fotos e o que aparece publicado passam a ser editáveis
  por alguém da loja em `/admin`, sem precisar mexer em código.
- A identidade visual (preto/dourado/creme, tipografia, tom de voz) é a
  mesma da V1 — **não houve redesign**. O HTML, CSS e a estrutura das
  seções da home continuam os mesmos; o que mudou foi de onde os dados
  vêm e o que existe por trás.

## Por que não usa Express, bcrypt, sharp, etc.

O ambiente onde este projeto foi construído bloqueia `npm install` (todo
pacote retorna `403 Forbidden` do registro do npm — confirmado, não é um
problema de rede). Por isso o backend inteiro usa **só módulos nativos do
Node 22+**:

| Em vez de...        | Usamos...                                  |
|----------------------|---------------------------------------------|
| Express              | `node:http` puro (`server/app.js`)          |
| better-sqlite3       | `node:sqlite` (`DatabaseSync`, nativo desde o Node 22, ainda experimental) |
| bcrypt               | `node:crypto` `scrypt` (`server/auth.js`)   |
| multer (upload)      | JSON com a imagem em base64 + validação real do arquivo por assinatura de bytes (`server/util.js`, `decodeImageDataUrl`) |
| sharp (otimizar imagem) | **não existe hoje** — ver limitação abaixo |
| EJS/Handlebars       | funções JS que montam HTML por template literal (`server/routes/*Pages.js`) |

Isso é bom por um lado (zero dependência para manter atualizada, zero
superfície de ataque de pacote de terceiro) e tem um custo: sem `sharp`,
não há redimensionamento/otimização automática de imagem no upload — ver
"Limitação conhecida" em `docs/CATALOGO.md`. Se o projeto for hospedado
num ambiente onde `npm install` funciona, adicionar `sharp` ali resolve
isso sem mudar mais nada (só `server/routes/adminApi.js`, função
`uploadImage`).

## Como rodar localmente

```bash
# 1. Popular o banco pela primeira vez (idempotente — não roda de novo se já tem dado)
node server/seed.js
node server/migrate-images.js

# 2. Subir o servidor
node server/app.js
# ou numa porta específica:
PORT=3000 node server/app.js
```

Abra `http://localhost:3000/`. O admin fica em `http://localhost:3000/admin/login`.

Se a senha do admin se perder, `node server/reset-admin-password.js` gera
uma nova senha temporária (imprime uma vez só no terminal — anote na hora).

## Onde hospedar (produção)

Isto **precisa** de um servidor que fica ligado o tempo todo (não é mais
um site estático de GitHub Pages/Netlify) **e** de um disco que não se
apaga entre um deploy e outro (o banco e as fotos enviadas pelo `/admin`
moram nele). Escolha feita em 23/09/2026: **Railway**, plano Hobby
(US$ 5/mês com US$ 5 de uso incluídos, 5 GB de volume) — publica sozinho a
cada `git push` no `main`, sem terminal. Não tem região no Brasil (a mais
próxima é US East, Virgínia); para um catálogo com checkout pelo WhatsApp a
diferença de latência é pequena. Se um dia a velocidade no Brasil virar
prioridade, a alternativa é o Fly.io (tem região em São Paulo), com a
mesma variável `STORAGE_DIR` descrita abaixo.

O que no código deixa isso funcionar:
- `package.json` — diz à hospedagem que é Node **22.x** (o banco usa
  `node:sqlite`, que só existe a partir do 22.13) e que o comando de
  start é `npm start` (`node server/start.js`). Nenhuma dependência de npm.
- `STORAGE_DIR` (`server/paths.js`) — quando definida, o banco vai para
  `$STORAGE_DIR/essencia.sqlite` e as fotos para `$STORAGE_DIR/uploads/`,
  ou seja, os dois dentro do **único** volume que o Railway permite por
  serviço. Sem ela (localmente), continua `data/` e `uploads/` do projeto.
- `server/start.js` — na primeira vez num volume vazio monta a base
  inteira sozinho (marcas, os 34 produtos, fotos, vínculos OliSek, logos e
  a conta `admin`, rodando os mesmos scripts da seção "Do zero" abaixo) e
  imprime a senha temporária do admin **uma vez** no log do deploy. Nos
  deploys seguintes não roda nada disso de novo — o que a equipe editar no
  `/admin` nunca é sobrescrito. Testado em 23/09/2026: a base montada assim
  sai idêntica (produtos, marcas, fotos, vínculos) à base de
  desenvolvimento.

O servidor responde `GET /health` com `{ ok: true }` e trata
`SIGTERM`/`SIGINT` com desligamento gracioso (espera até 10s as requisições
em andamento terminarem, pra não cortar um upload no meio da troca de
versão).

## Publicar no Railway (passo a passo)

1. Entre em <https://railway.com> com a conta do GitHub → **New Project** →
   **Deploy from GitHub repo** → escolha `igorcoutinho31/essencia_natural`
   (autorize o acesso do Railway ao repositório se ele pedir). O primeiro
   deploy começa sozinho — pode deixar; ele vai ser refeito no passo 4.
2. **Volume (disco permanente):** no quadro do projeto, clique com o botão
   direito no fundo (ou `Ctrl+K`) → **Volume** → escolha o serviço do site
   → em **Mount path** coloque `/data`.
3. **Variáveis:** abra o serviço → aba **Variables** → adicione:
   - `STORAGE_DIR` = `/data` (o mesmo Mount path do passo 2)
   - `TRUST_PROXY` = `1` (o Railway serve HTTPS na frente do Node; isso faz
     o cookie de login do `/admin` ganhar o atributo `Secure`)
   `PORT` não precisa — o Railway injeta sozinho.
4. O Railway refaz o deploy ao salvar as variáveis. Abra **Deployments** →
   o deploy mais recente → **Deploy Logs** e procure:
   `[start] Guardando banco e fotos em /data` e, logo abaixo,
   `Senha temporária (anote agora — não é mostrada de novo): ...`.
   **Anote essa senha** (vale a do deploy que mostra `/data`; se o primeiro
   deploy do passo 1 também imprimiu uma senha, ignore — aquela base era
   descartável e sumiu).
5. **Endereço público:** serviço → **Settings** → **Networking** →
   **Generate Domain**. O site fica em algo como
   `essencia-natural-production.up.railway.app`.
6. (Recomendado) **Settings** → **Healthcheck Path** = `/health`.
7. Abra `https://<endereço>/admin/login`, entre com `admin` + a senha do
   passo 4 e troque a senha (o sistema obriga).
8. Domínio próprio, quando houver: **Settings** → **Networking** →
   **Custom Domain** → o Railway mostra o registro CNAME para cadastrar no
   site onde o domínio foi comprado (ex.: Registro.br).

Daí em diante: todo `git push` no `main` publica sozinho, sem perder nada
do volume. Perdeu a senha do admin? No serviço, use o terminal/shell do
Railway (ou `railway run` pela CLI, se preferir) e rode
`npm run reset-admin-password`.

## Checklist para colocar no ar

Fechamento da V2 (24/09/2026), atualizado para o Railway em 23/09/2026 —
siga na primeira vez que o site for publicado de verdade.

1. **Variáveis de ambiente** no painel do Railway (produção nunca usa um
   arquivo `.env`): `STORAGE_DIR` e `TRUST_PROXY=1` (ver "Publicar no
   Railway", passo 3). `OLISEK_API_URL`/`OLISEK_API_KEY` ficam em branco
   até a OliSek liberar acesso — ver `docs/OLISEK-INTEGRATION.md`. Todas as
   variáveis estão explicadas em `.env.example`.
2. **Volume persistente** montado no mesmo caminho de `STORAGE_DIR` (passo
   2). Sem ele, todo deploy novo apaga produtos, preços, fotos novas e a
   conta do admin. Faça antes de divulgar o link.
3. **Inicializar o banco.** No Railway é automático (`server/start.js`, ver
   acima). Fora dele, ou pra recriar uma base local do zero, rode nesta
   ordem: `node server/seed.js` (as 24 marcas confirmadas, os 34 produtos
   do `data/catalog.json`, conta administradora) → `node
   server/migrate-images.js` (fotos do catálogo antigo) → `node
   server/olisek-import-2026-09-23.js` (os 27 vínculos reais com a
   OliSek) → `node server/olisek-link-status-2026-09-24.js` (Fakhar
   Black/Gold para "precisa revisão") → `node
   server/import-marcas-logos-2026-09-23.js` (17 logos do primeiro
   `Marcas.zip`) → `node server/import-marcas-novas-2026-09-23.js` (logo da
   Armaf + as 6 marcas confirmadas depois, com `requires_product=1` — ver
   `docs/CATALOGO.md`). Todos são seguros de rodar mais de uma vez.
4. **Senha temporária do admin**: aparece uma única vez no log do deploy
   (Railway) ou no terminal (local). Se perder, `npm run
   reset-admin-password` gera outra.
5. **Trocar a senha temporária no primeiro login** em `/admin/login` — o
   sistema já obriga isso automaticamente (`must_change_password`), mas
   confirme que o fluxo realmente pede a troca antes de liberar o painel
   pra equipe.
6. **Apontar o domínio da loja** (quando houver um, em vez do domínio
   temporário do provedor) nas configurações de domínio do Railway/Render,
   e aguardar a propagação de DNS antes de divulgar o link.
7. **Confirmar HTTPS e `TRUST_PROXY`**: Railway e Render já servem HTTPS
   automaticamente na frente do processo Node — nesse caso, defina
   `TRUST_PROXY=1` (ver `.env.example` e `server/auth.js`,
   `isSecureRequest`) para o cookie de sessão do `/admin` ganhar o atributo
   `Secure` de verdade. Sem isso, o cookie ainda funciona, mas fica exposto
   a um downgrade pra HTTP que não precisaria existir.
8. **Definir a URL canônica e as tags Open Graph com o domínio final**: hoje
   `server/routes/productPage.js` monta `og:image` e a URL do produto sem
   um domínio absoluto (ver o comentário "Canônico e URL absolutas... não
   inventamos aqui" no próprio arquivo) porque o domínio de produção ainda
   não existia. Depois de decidir o domínio, atualizar isso e a
   `sitemap.xml`/`robots.txt` da raiz do projeto.
9. **Testar um upload de foto de produto de ponta a ponta** em produção
   (não só local): abrir `/admin`, editar um produto, subir uma imagem JPG
   ou WEBP e confirmar que ela aparece no catálogo público. Depois faça
   um redeploy (Deployments → Redeploy) e confira que a foto continua lá —
   isso valida que o volume está montado no mesmo caminho de `STORAGE_DIR`.
   Se não estiver, o upload "funciona" mas some no próximo deploy.
10. **Testar um backup do banco**: com o site no ar, baixar uma cópia de
    `$STORAGE_DIR/essencia.sqlite` (no Railway, `/data/essencia.sqlite`,
    pelo shell do serviço) e confirmar que abre num SQLite local. O Railway
    também tem backup de volume (serviço → aba **Backups**: manual ou
    agendado diário/semanal/mensal) — confira se está liberado no plano
    contratado e deixe um agendamento semanal ligado. Combine com a loja uma rotina
    (mesmo que manual, semanal) até existir algo automático — hoje não há
    backup automático configurado.
11. **Testar o fluxo do WhatsApp de ponta a ponta em produção**: abrir o
    catálogo publicado, tentar "Consultar no WhatsApp" num produto sem
    preço (mensagem deve pedir o *valor*) e num produto com preço (mensagem
    genérica), depois montar uma sacola e finalizar pelo botão da sacola —
    confirmar que o número que abre é o `5511949614608` de verdade e que a
    mensagem chega formatada e legível.
12. **Repetir os testes de ponta a ponta desktop + mobile** (ver seção
    seguinte) apontando para a URL de produção, não para `localhost` — o
    comportamento por trás de um proxy real (cookies, HTTPS, cache de
    estático) pode diferir do ambiente local.

## Teste final antes de publicar (desktop + mobile)

Roteiro mínimo do **segundo fechamento da V2** (23/09/2026), que trocou o
antigo modelo de 4 estados/"Consulte disponibilidade" pela regra atual —
estoque com 3 selos simples + visibilidade separada por `stock`/`sales`
(ver `docs/CATALOGO.md`). Pensado pra cobrir exatamente essa mudança sem
virar uma suíte pesada:

1. Home carrega, catálogo lista os produtos publicamente visíveis
   (`stock > 0 || sales >= 10` — hoje só os com estoque, já que não existe
   dado real de vendas ainda) e nenhum produto oculto do catálogo aparece
   na busca nem na navegação por marca/categoria.
2. Produto **com estoque**: abre `/produto/:slug` com o selo certo ("Em
   estoque" ou "Últimas unidades"), botão "Adicionar à sacola" habilitado,
   botão do WhatsApp com a mensagem "...gostaria de consultar o valor do
   produto [NOME]" quando não há preço, ou a mensagem padrão quando há.
3. Produto **zerado com 10+ vendas** (hoje não existe nenhum de verdade —
   simular só numa cópia de teste do banco, nunca em produção): continua
   aparecendo no catálogo e na página própria, selo "Indisponível no
   momento", botão de comprar desabilitado, botão de WhatsApp funcionando
   normalmente pra consulta.
4. Produto **oculto** (zerado, menos de 10 vendas): não aparece na
   listagem pública nem na busca; `/produto/:slug` dele devolve 404;
   continua existindo em `/admin`, aba "Ocultos do catálogo".
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
8. `/admin`: os 9 filtros da lista de produtos (Todos, Em estoque,
   Vendidos, Indisponíveis, Ocultos do catálogo, Sem preço, Sem imagem,
   Sem vínculo OliSek, Precisa revisão) mostram contagens condizentes
   entre si e com "Todos"; a vendedora só vê/edita preço, promoção, fotos
   e destaque; a administração vê e edita tudo, incluindo estoque manual e
   o formulário de vínculo OliSek, e consegue salvar um upload de imagem
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
  `assets/brands/`, incluindo a Armaf, que veio num segundo envio. O
  fallback pro nome em texto (sem logo, ou se o arquivo quebrar depois)
  continua funcionando normalmente.
- **6 marcas novas cadastradas sem produto vinculado ainda** (Amouage,
  Anfar, Ferassa, Maison Asrar, Volaré, Ard Al Zaafaran) — confirmadas
  pelo cliente, com logo, mas ficam de fora de `/#marcas` até algum
  produto do catálogo ser realmente dessa marca (`brands.requires_product`
  — ver `docs/CATALOGO.md`). Nenhum produto foi criado só por causa
  delas.
- Otimização automática de imagem no upload (ver limitação acima).
- Testes automatizados formais (hoje a cobertura é manual, via Playwright,
  rodada durante o desenvolvimento — não há suíte de testes no repositório).
