# AGENTS.md

Instruções para agentes (Claude Code ou outros) trabalhando neste repositório.

## Antes de editar
1. Ler `CLAUDE.md` para contexto geral do projeto.
2. Ler `docs/TODO-VERIFY.md` para saber o que ainda não está confirmado —
   nunca publicar essas informações como definitivas.
3. Ler `docs/SITE-ARCHITECTURE.md` antes de mexer em qualquer coisa
   relacionada ao hero.
4. O site tem backend (`src/`, Worker da Cloudflare com D1; o mesmo
   código roda no Node local por `server/`). Antes de mexer em catálogo,
   preço, estoque, admin ou OliSek, ler `docs/BACKEND.md` e o doc
   específico (`docs/CATALOGO.md`, `docs/ADMIN.md` ou
   `docs/OLISEK-INTEGRATION.md`). Hospedagem: `docs/CLOUDFLARE.md`.

## Regras não-negociáveis
- O hero animado de 240 frames foi aposentado e `assets/frames/` foi removida
  na V1.1. Não reintroduzir animação de frames nem canvas/scroll-scrub no hero.
- Não inventar nomes, cargos, histórico de equipe, preços, endereço ou
  telefone. Usar somente o que está em `docs/BRAND-BRIEF.md`,
  `docs/TEAM.md`, `docs/PRODUCTS.md` — e o que não estiver lá, tratar como
  pendente (`docs/TODO-VERIFY.md`).
- Não publicar selos de garantia/originalidade ("100% Original Garantido"
  ou equivalente) sem confirmação explícita registrada em
  `docs/TODO-VERIFY.md` como resolvida.
- Não copiar identidade visual, texto ou layout de sites de benchmark
  (ex.: onuh.com.br) — usar apenas como referência de lógica comercial.
- Mudanças de design/estrutura no `public/index.html` exigem plano apresentado e
  aprovação explícita antes da implementação.
- Antes de comandos git destrutivos ou push, confirmar que não há trabalho
  manual concorrente do usuário no mesmo repositório.
- Backend sem dependências de runtime: só JavaScript padrão e módulos
  `node:` suportados pelo Worker (`nodejs_compat`). O código de `src/` não
  pode usar `node:fs`, `node:sqlite` nem nada que só exista no Node — isso
  fica em `server/`, `scripts/` e `tools/`. O `wrangler` é a única
  dependência (de desenvolvimento).
- `src/` fala com o banco só pela API do D1 (`prepare/bind/first/all/run/
  batch`) e com as fotos só por `src/storage.js`. Mudança de esquema = novo
  arquivo em `migrations/` (idempotente, `IF NOT EXISTS`), nunca editar um
  já publicado.
- Estoque só muda por movimentação (`src/services/inventory.js`); nunca
  `UPDATE products SET stock` direto.
- Rodar `npm test` antes de dar uma mudança por concluída.
- Preço nunca é inventado em lugar nenhum (banco, API, admin, schema.org).
  Sem preço confirmado, o campo fica `null` e a interface mostra
  "Consulte" — nunca um número calculado.
- Estoque numérico exato nunca é mostrado ao cliente — só os três selos
  (Em estoque / Últimas unidades / Indisponível), ver `docs/CATALOGO.md`.
- Nenhum produto da OliSek é publicado no catálogo sem confirmação humana
  (ver "Curadoria" em `docs/CATALOGO.md`) — nunca automatizar isso sem
  esse passo.
- Senha/token de admin nunca vai para o front-end nem para o repositório
  (nem em comentário, nem em exemplo) — só existe como hash no banco.

## Fluxo de trabalho esperado
1. Analisar/auditar o que já existe (código, assets, docs) antes de propor
   mudanças.
2. Propor plano e aguardar aprovação quando a mudança for estrutural ou de
   design.
3. Implementar só o aprovado.
4. Manter os arquivos em `docs/` atualizados conforme novas informações
   chegam do cliente.
