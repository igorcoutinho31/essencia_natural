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

## O que falta / próximos passos conhecidos

- Preços reais de cada produto (todos os produtos hoje mostram "Consulte"
  — nenhum preço foi inventado).
- A lista completa de vínculos com a OliSek para os ~29 produtos que ainda
  estão como "aguardando vínculo" (ver `docs/OLISEK-INTEGRATION.md`).
- Logos das marcas (a grade de `/#marcas` mostra só o nome até a loja
  enviar os arquivos).
- Otimização automática de imagem no upload (ver limitação acima).
- Testes automatizados formais (hoje a cobertura é manual, via Playwright,
  rodada durante o desenvolvimento — não há suíte de testes no repositório).
