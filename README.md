# Site da Essência Natural · lojaessencianatural.com.br

Site oficial da **Essência Natural**, perfumaria árabe e importada na
região da 25 de Março (São Paulo), com venda no varejo e no atacado.

- **Para o cliente:** catálogo com página de cada produto e uma sacola que
  fecha o pedido pelo WhatsApp com a vendedora escolhida.
- **Para a equipe:** painel `/admin` para cadastrar produtos, preços, fotos e
  estoque, publicar ou ocultar itens e acompanhar o histórico.

No ar em **https://www.lojaessencianatural.com.br**, hospedado no plano
grátis da Cloudflare. Cada mudança que entra no `main` é publicada sozinha
em cerca de 1 minuto.

## Como abrir no computador

1. Instale o [Node.js](https://nodejs.org/) **22.13 ou mais novo** (o
   instalador "LTS" serve) e o [Git](https://git-scm.com/).
2. Abra o terminal (no Windows, o PowerShell) dentro desta pasta.
3. Rode, só na primeira vez:

   ```
   npm install
   npm run base-inicial
   ```

   O segundo comando cria um banco local com o catálogo inicial e mostra
   **uma vez** a senha temporária da conta `admin`. Anote.
4. Para abrir o site:

   ```
   npm run dev
   ```

5. Acesse **http://localhost:3000** (site) e **http://localhost:3000/admin**
   (painel). Para encerrar, use Ctrl+C no terminal.

O banco e as fotos locais ficam na pasta `.local/`, que nunca vai para o
GitHub. Nada do que você faz no computador mexe no site no ar.

## Onde editar

| O que mudar | Arquivo |
|---|---|
| Textos e seções da página inicial | `public/index.html` |
| Página de links (bio do Instagram) | `public/links.html` |
| Cores, fontes e espaçamentos | `public/assets/css/site.css` (cores no início, em `:root`) |
| Fonte dos títulos e nomes (Cormorant Garamond com acentos ajustados) | `public/assets/fonts/` |
| Página de cada produto | `src/routes/productPage.js` e `public/assets/css/product.css` |
| Catálogo da home (busca, filtros, cards) | `public/assets/js/catalogo.js` |
| Sacola e envio do pedido pelo WhatsApp | `public/assets/js/sacola.js` e `public/assets/js/atendimento.js` |
| Grade de marcas | `public/assets/js/marcas.js` (as marcas vêm do banco) |
| Menu do celular | `public/assets/js/menu.js` |
| Animações discretas | `public/assets/js/vida.js` |
| Equipe (nomes e fotos) | pelo painel, em `/admin/equipe` |
| Logos de marcas, ícones | `public/assets/brands/`, `public/assets/icons/` |
| Telas do painel `/admin` | `src/routes/adminPages.js` e `public/assets/css/admin.css` |
| App no celular (ícone, offline) | `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html` |
| Regras do catálogo (o que é público, filtros) | `src/services/catalog.js` |
| Estoque (entradas, saídas, histórico) | `src/services/inventory.js` |
| Cabeçalhos de segurança e cache | `public/_headers` e `src/http.js` (manter iguais) |
| Endereço oficial, domínio, banco | `wrangler.toml` |

Produtos, preços, fotos de produto, equipe e contas **não ficam no código**:
são cuidados pelo `/admin` do site no ar. Arrumações em lote (nomes e fotos)
ficam em `/admin/ferramentas`, com prévia antes de gravar — sem terminal.

## Estrutura

```
public/        o site que o visitante vê (HTML, CSS, JS, imagens)
src/           o servidor: catálogo, estoque, admin e login (roda na Cloudflare)
  routes/      páginas e APIs (público, produto, admin)
  services/    regras de negócio (catálogo, estoque, backups, OliSek)
migrations/    estrutura do banco de dados (um arquivo por mudança)
server/        o mesmo servidor rodando no Node, para usar no computador e nos testes
scripts/       montagem da base inicial e reset de senha local
seed/          catálogo inicial (34 produtos e fotos) e o relatório da loja
tools/         comandos da Cloudflare (importar dados, contas, biblioteca, teste no ar)
tests/         testes automáticos
docs/          documentação (ver tabela abaixo)
wrangler.toml  configuração da Cloudflare (Worker, banco, domínio, agendamentos)
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | abre o site no computador (http://localhost:3000) |
| `npm run base-inicial` | cria o banco local com o catálogo inicial |
| `npm test` | roda os testes automáticos |
| `npm run reset-admin-password` | nova senha temporária para o `admin` local |
| `npm run cf:dev` | roda no ambiente da Cloudflare, no computador |
| `npm run cf:admin -- <ação> --remote` | contas do `/admin` no site no ar (criar, resetar senha, desativar) |
| `npm run cf:biblioteca -- <pasta> --remote` | importa a biblioteca de fornecedores (tudo oculto) |
| `node tools/logos-ouro.cjs previa.jpg` | gera os logos das marcas em dourado (`public/assets/brands/ouro/`) |
| `npm run cf:smoke -- <endereço>` | confere se o site no ar está respondendo certo |
| `npm run cf:importar` | substitui o banco da Cloudflare por um backup (recuperação) |

Os comandos `cf:*` com `--remote` mexem no **site no ar** e pedem login na
conta Cloudflare da loja (`npx wrangler login`). Detalhes em
`docs/CLOUDFLARE.md`.

## Testes

```
npm test
```

Testam o catálogo público, o login e a segurança do admin, o estoque, os
backups, as fotos e a importação da biblioteca, sem precisar de internet
nem de conta na Cloudflare. Rodar sempre antes de enviar uma mudança.

## Como publicar uma mudança

1. Crie um branch, faça a mudança e rode `npm test`.
2. Envie o branch para o GitHub e abra um pull request para o `main`.
3. Ao fazer o merge, a Cloudflare publica o site sozinha (acompanhe em
   Workers & Pages → `essencia-natural` → Deployments).

Mudanças de design ou de estrutura do site precisam de um plano aprovado
antes (ver `docs/REGRAS.md`).

## Documentação

| Documento | Assunto |
|---|---|
| `docs/REGRAS.md` | regras do projeto (leia antes de mexer) |
| `docs/TODO-VERIFY.md` | o que ainda falta a loja confirmar |
| `docs/CLOUDFLARE.md` | hospedagem, domínio, custos, publicação e dia a dia |
| `docs/BACKEND.md` | arquitetura do servidor, banco, estoque, segurança e backups |
| `docs/ADMIN.md` | o painel `/admin`, tela por tela |
| `docs/CATALOGO.md` | regras do catálogo, curadoria e biblioteca de fornecedores |
| `docs/OLISEK-INTEGRATION.md` | integração com o sistema da loja (OliSek) |
| `docs/SITEMAP.md` | sitemap e Google Search Console |
| `docs/APP.md` | o site instalado como app no celular (PWA) |
| `docs/BRAND-BRIEF.md`, `docs/TEAM.md`, `docs/PRODUCTS.md` | dados confirmados da marca, equipe e produtos |
| `docs/SITE-ARCHITECTURE.md`, `docs/SOCIAL-RESEARCH.md` | estrutura da home e pesquisa de referência |

## Segurança

- Senhas e tokens nunca entram no código: senhas existem só como hash no
  banco, e os segredos da Cloudflare são gravados com
  `npx wrangler secret put`.
- Backups baixados do `/admin` contêm hashes de senha. Guarde em lugar
  seguro e nunca envie para o GitHub (o `.gitignore` já bloqueia).
- O backup do banco é automático, toda semana, com as últimas 12 cópias
  (ver `docs/BACKEND.md`).
