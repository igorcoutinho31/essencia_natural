# AGENTS.md

Instruções para agentes (Claude Code ou outros) trabalhando neste repositório.

## Antes de editar
1. Ler `CLAUDE.md` para contexto geral do projeto.
2. Ler `docs/TODO-VERIFY.md` para saber o que ainda não está confirmado —
   nunca publicar essas informações como definitivas.
3. Ler `docs/SITE-ARCHITECTURE.md` antes de mexer em qualquer coisa
   relacionada ao hero/frames.

## Regras não-negociáveis
- Não extrair, regenerar ou substituir os arquivos em `assets/frames/`
  sem instrução explícita — essa sequência de 240 frames já é definitiva
  como fonte do hero.
- Não inventar nomes, cargos, histórico de equipe, preços, endereço ou
  telefone. Usar somente o que está em `docs/BRAND-BRIEF.md`,
  `docs/TEAM.md`, `docs/PRODUCTS.md` — e o que não estiver lá, tratar como
  pendente (`docs/TODO-VERIFY.md`).
- Não publicar selos de garantia/originalidade ("100% Original Garantido"
  ou equivalente) sem confirmação explícita registrada em
  `docs/TODO-VERIFY.md` como resolvida.
- Não copiar identidade visual, texto ou layout de sites de benchmark
  (ex.: onuh.com.br) — usar apenas como referência de lógica comercial.
- Mudanças de design/estrutura no `index.html` exigem plano apresentado e
  aprovação explícita antes da implementação.
- Antes de comandos git destrutivos ou push, confirmar que não há trabalho
  manual concorrente do usuário no mesmo repositório.

## Fluxo de trabalho esperado
1. Analisar/auditar o que já existe (código, assets, docs) antes de propor
   mudanças.
2. Propor plano e aguardar aprovação quando a mudança for estrutural ou de
   design.
3. Implementar só o aprovado.
4. Manter os arquivos em `docs/` atualizados conforme novas informações
   chegam do cliente.
