# Regras do projeto

Valem para qualquer pessoa (ou assistente de IA) que trabalhe neste
repositório. Em caso de dúvida, a regra ganha da pressa.

## Dados e conteúdo
- **Não inventar dados**: endereço, telefone, nomes e cargos da equipe,
  preços, prazos, selos de garantia/originalidade. Usar só o que está em
  `docs/BRAND-BRIEF.md`, `docs/TEAM.md` e `docs/PRODUCTS.md`. O que não
  estiver confirmado vai para `docs/TODO-VERIFY.md`, nunca para o site como
  afirmação definitiva. Consultar o `TODO-VERIFY.md` antes de publicar
  qualquer afirmação nova.
- **Preço nunca é inventado** (banco, API, admin, schema.org). Sem preço
  confirmado, o campo fica `null` e a interface mostra "Consulte".
- **Estoque nunca aparece para o cliente**: nem número, nem selo. O site
  mostra sempre "Consulte disponibilidade". Aparece no site só o que está
  **publicado** (`active`); estoque e vendas não escondem produto (ver
  `docs/CATALOGO.md`).
- **Nenhum produto da OliSek é publicado sem confirmação humana** (ver
  "Curadoria" em `docs/CATALOGO.md`).
- **Fotos de fornecedor** (biblioteca) só ficam públicas depois que a loja
  confirmar a autorização de uso (ver `docs/CATALOGO.md`, "Biblioteca").
- **Benchmark** (ex.: onuh.com.br) serve só como referência de lógica
  comercial (CTAs, varejo x atacado, como comprar, FAQ). Nunca copiar
  identidade visual, texto ou layout.

## Design
- Mudanças estruturais ou de design no site (`public/index.html` e demais
  páginas públicas) só depois de um plano apresentado e **aprovado
  explicitamente** pelo responsável pela loja.
- O hero animado de 240 frames foi aposentado (`assets/frames/` removida na
  V1.1). Não reintroduzir animação de frames nem canvas/scroll-scrub. O
  vídeo curto das prateleiras no topo da home (V4) é filmagem real da loja,
  sem pessoas, e respeita "menos movimento" e economia de dados.
- A home carrega `assets/css/site.css` e os scripts de `assets/js/`, sem
  `<style>` ou `<script>` inline.

## Código
- Front-end em HTML/CSS/JS puro, sem etapa de build.
- Backend sem dependências de runtime. O código de `src/` roda no Worker da
  Cloudflare: só JavaScript padrão e módulos `node:` suportados pelo
  `nodejs_compat`. Nada de `node:fs`, `node:sqlite` ou outro recurso que só
  exista no Node; isso fica em `server/`, `scripts/` e `tools/`.
- `src/` fala com o banco só pela API do D1 (`prepare/bind/first/all/run/
  batch`) e com as fotos só por `src/storage.js`.
- Mudança de esquema do banco = **novo arquivo** em `migrations/`
  (idempotente). Nunca editar uma migração já publicada.
- Estoque só muda por movimentação (`src/services/inventory.js`), nunca com
  `UPDATE products SET stock` direto.
- Senha ou token de admin nunca vai para o front-end nem para o repositório
  (nem em comentário, nem em exemplo). Só existe como hash no banco.
- Backups baixados contêm hashes de senha: nunca entram no repositório (o
  `.gitignore` já bloqueia `*backup*.json` e `*.sqlite`).
- Rodar `npm test` antes de dar qualquer mudança por concluída.

## Fluxo de trabalho
1. Ler o que já existe (código, docs e `docs/TODO-VERIFY.md`) antes de
   propor mudanças. Antes de mexer em catálogo, preço, estoque, admin ou
   OliSek, ler `docs/BACKEND.md` e o documento específico
   (`docs/CATALOGO.md`, `docs/ADMIN.md`, `docs/OLISEK-INTEGRATION.md`).
2. Propor plano e aguardar aprovação quando a mudança for estrutural ou de
   design.
3. Implementar só o aprovado, num branch, com pull request para o `main`
   (o `main` publica o site sozinho).
4. Manter `docs/` atualizado conforme chegam informações da loja.
5. Antes de comandos git que reescrevem histórico ou de `push`, conferir se
   não há trabalho de outra pessoa em andamento no mesmo repositório.

## Material fora do repositório
- Mídia bruta baixada do Instagram (94 arquivos) fica fora do repositório.
  Copiar para `public/assets/` só o que for efetivamente usado no site.
- O pacote da biblioteca de fornecedores (zip de ~620 MB) também fica fora:
  o comando `npm run cf:biblioteca` lê a pasta extraída.
