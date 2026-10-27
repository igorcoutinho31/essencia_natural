# CLAUDE.md

Contexto do projeto para quem (humano ou agente) for trabalhar neste
repositório.

## O que é este projeto
Website oficial comercial da **Essência Natural**, loja física de
perfumaria com influência árabe (região da 25 de Março, São Paulo), com
venda no varejo e no atacado. O projeto terá Home, catálogo, equipe,
varejo/atacado, loja física, redes sociais, contato e FAQ — não é apenas
uma landing page de página única. Front-end em HTML/CSS/JS puro, sem
build step; backend em JavaScript sem dependências de runtime.

## Estado atual
- **V3 (10/2026): hospedagem na Cloudflare.** O backend (`src/`) roda num
  Worker com banco D1 e fotos no R2; o mesmo código roda no Node local
  (`server/`) para desenvolver e testar. Estoque com histórico de
  movimentações, login com limite de tentativas, cabeçalhos de segurança e
  SEO com o domínio oficial. Ver `docs/BACKEND.md` (arquitetura) e
  `docs/CLOUDFLARE.md` (hospedagem e a troca saindo do Railway).
- V2 (23/09/2026): o site ganhou backend (catálogo no banco, página de
  produto, painel `/admin`). A identidade visual não mudou desde então.
- Estrutura: `public/` (site estático: `index.html`, `links.html`,
  `assets/`), `src/` (backend), `migrations/` (banco), `server/` (Node
  local), `scripts/` (dados), `seed/` (catálogo inicial e fotos), `tools/`
  (comandos da Cloudflare), `tests/`, `docs/`. Mapa completo em `README.md`.
- `public/index.html` é a home — carrega `assets/css/site.css` e os scripts
  de `assets/js/` (sem `<style>`/`<script>` inline).
- `assets/frames/`: REMOVIDA na V1.1 (hero animado aposentado). Não
  reintroduzir a animação.
- `docs/`: toda a documentação viva do projeto (brand, equipe, produtos,
  pesquisa social/benchmark, arquitetura, pendências).
- Mídia bruta baixada do Instagram (94 arquivos) está FORA do repositório,
  em `C:\Users\Usuário\gallery-dl\instagram\essencianaturall__\` — copiar
  para `public/assets/` apenas o que for efetivamente usado no site.
- Repositório remoto: https://github.com/igorcoutinho31/essencia_natural
  (branch `main`).
- Antes de concluir qualquer mudança: `npm test`.

## Regras de trabalho neste projeto
- Não inventar dados (endereço, telefone, nomes da equipe, preços, selos de
  garantia/originalidade). Tudo que não estiver confirmado vai para
  `docs/TODO-VERIFY.md`, nunca direto pro site como afirmação definitiva.
- Mudanças estruturais ou de design no `public/index.html` só depois de plano
  apresentado e aprovado explicitamente pelo cliente.
- Benchmark comercial (ex.: onuh.com.br) serve só para lógica de conversão
  (CTAs, varejo x atacado, como comprar, FAQ) — nunca copiar identidade
  visual, texto ou layout.
- Antes de rodar comandos git, verificar se não há trabalho manual do
  usuário em andamento no mesmo repositório (já houve conflito de comandos
  concorrentes nesta sessão).
- Ver `docs/TODO-VERIFY.md` para a lista atualizada de pendências antes de
  publicar qualquer afirmação nova.
