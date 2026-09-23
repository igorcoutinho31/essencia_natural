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
um site estático de GitHub Pages/Netlify). Recomendação, considerando que
a loja ainda não tem hospedagem escolhida: **Railway** ou **Render** —
ambos têm plano gratuito/baixo custo, sobem um repositório Git direto (sem
configuração de servidor manual), e dão um domínio `https://` de graça
(`algumacoisa.up.railway.app` / `algumacoisa.onrender.com`) até a loja
decidir um domínio próprio. Os dois suportam Node 22 nativamente.
Passos, em qualquer um dos dois: conectar o repositório GitHub, apontar o
comando de start para `node server/app.js`, definir a variável de
ambiente `PORT` (os dois já injetam isso sozinhos) e pronto — não precisa
de banco externo porque o SQLite é um arquivo (mas atenção: em alguns
planos gratuitos o disco não é persistente entre deploys — nesse caso,
rodar `node server/seed.js` de novo depois do primeiro deploy, ou usar o
disco persistente pago do provedor).

O servidor responde `GET /health` com `{ ok: true }` (uso do próprio
provedor pra saber se o processo está de pé) e trata `SIGTERM`/`SIGINT` com
um desligamento gracioso — para de aceitar conexão nova e espera até 10s
as que já estavam em andamento terminarem antes de encerrar, em vez de
cortar no meio um upload de imagem no exato momento da troca de versão.

## Checklist para colocar no ar

Fechamento da V2 (24/09/2026) — siga esta lista, nesta ordem, na primeira
vez que o site for publicado de verdade (domínio real, não um teste). Cada
item existe por um motivo concreto explicado abaixo dele.

1. **Copiar `.env.example` para `.env`** (local) ou cadastrar as mesmas
   variáveis no painel do provedor (Railway/Render — produção nunca usa um
   arquivo `.env` no servidor, só variáveis de ambiente de verdade). Hoje
   isso é só `PORT` (o provedor injeta sozinho) e `TRUST_PROXY=1` (ver
   passo 7). `OLISEK_API_URL`/`OLISEK_API_KEY` ficam em branco até a OliSek
   liberar acesso — ver `docs/OLISEK-INTEGRATION.md`.
2. **Configurar um volume persistente** para `data/` (o arquivo
   `essencia.sqlite`) e para `uploads/` (fotos enviadas pelo `/admin` depois
   do primeiro deploy — ver o comentário em `.gitignore`). Sem isso, um
   redeploy comum na maioria dos provedores apaga o disco e o site volta ao
   zero (produtos, preços, fotos novas e a conta do admin somem). No
   Railway isso é um "Volume" anexado ao serviço; no Render, um "Disk". Faça
   este passo **antes** do primeiro deploy real, não depois.
3. **Inicializar o banco.** Duas situações diferentes:
   - **Recomendado, se já existe um `data/essencia.sqlite` de trabalho**
     (é o caso agora: já tem os 34 produtos, os 27 vínculos com a OliSek, as
     fotos importadas e os 17 logos de marca) — copie esse arquivo (e a
     pasta `uploads/`) direto para o volume persistente do passo 2, em vez
     de rodar os scripts de novo. Rodar tudo do zero em produção reconstrói
     só uma base parcial (ver abaixo).
   - **Do zero de verdade** (nenhum banco existe ainda) — rode, nesta
     ordem: `node server/seed.js` (marcas, os 34 produtos do
     `data/catalog.json`, conta administradora) → `node
     server/migrate-images.js` (fotos do catálogo antigo) → `node
     server/olisek-import-2026-09-23.js` (aplica os 27 vínculos reais com a
     OliSek) → `node server/olisek-link-status-2026-09-24.js` (reclassifica
     Fakhar Black/Gold para "precisa revisão") → `node
     server/import-marcas-logos-2026-09-23.js` (vincula os 17 logos de marca
     já recebidos do cliente, em `assets/brands/`). Todos são seguros de
     rodar mais de uma vez — não duplicam nem sobrescrevem dado já
     existente —, mas pular os últimos deixa a produção com menos vínculos
     OliSek e/ou sem os logos de marca, bem menos completo que a base atual
     de desenvolvimento.
4. **Confirmar a criação da conta administradora**: o próprio `seed.js`
   imprime, uma única vez no terminal, o usuário (`admin`) e uma senha
   temporária gerada na hora. Anote antes de fechar o terminal/log do
   deploy — ela não é mostrada de novo (se perder, `node
   server/reset-admin-password.js` gera outra).
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
   ou WEBP e confirmar que ela aparece no catálogo público. Isso valida que
   o volume persistente do passo 2 está mesmo montado em `uploads/` — se o
   volume estiver mal configurado, o upload "funciona" mas some no próximo
   deploy.
10. **Testar um backup do banco**: com o site no ar, baixar uma cópia de
    `data/essencia.sqlite` (pelo próprio provedor ou por um script simples)
    e confirmar que abre num SQLite local. Combine com a loja uma rotina
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
- **Logos das marcas**: recebido e aplicado (23/09/2026) — 17 das 18
  marcas confirmadas já têm logo em `assets/brands/`; só falta o logo da
  Armaf (não veio no `Marcas.zip`). O fallback pro nome em texto (com ou
  sem logo quebrado) continua funcionando pra ela.
- **6 marcas fora da lista confirmada** vieram no mesmo `Marcas.zip`
  (Amouage, Anfar, Ferassa, Maison Asrar, Volaré, Za'afaran) — não foram
  publicadas: precisa confirmar com a loja se ela realmente trabalha com
  elas antes de virar marca nova em `/#marcas` (ver `docs/TODO-VERIFY.md`).
- Otimização automática de imagem no upload (ver limitação acima).
- Testes automatizados formais (hoje a cobertura é manual, via Playwright,
  rodada durante o desenvolvimento — não há suíte de testes no repositório).
