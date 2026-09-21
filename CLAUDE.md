# CLAUDE.md

Contexto do projeto para quem (humano ou agente) for trabalhar neste
repositório.

## O que é este projeto
Website oficial comercial da **Essência Natural**, loja física de
perfumaria com influência árabe (região da 25 de Março, São Paulo), com
venda no varejo e no atacado. O projeto terá Home, catálogo, equipe,
varejo/atacado, loja física, redes sociais, contato e FAQ — não é apenas
uma landing page de página única. Site estático (HTML/CSS/JS puro, sem
build step por enquanto).

## Estado atual
- `index.html` na raiz é a versão inicial publicada (hero com garrafa CSS
  estática, placeholders de WhatsApp/endereço) — **será substituída**, mas
  só depois de aprovação explícita do cliente.
- `assets/frames/`: REMOVIDA na V1.1 (hero animado aposentado; a pasta de
  240 frames, 23 MB, não era referenciada). Não reintroduzir a animação.
- `docs/`: toda a documentação viva do projeto (brand, equipe, produtos,
  pesquisa social/benchmark, arquitetura do site, pendências).
- `assets/`: estrutura de pastas para mídia organizada por finalidade
  (frames, instagram, tiktok, team, products, store) — em grande parte
  ainda vazia, a preencher conforme o cliente fornece material.
- Mídia bruta baixada do Instagram (94 arquivos) está FORA do repositório,
  em `C:\Users\Usuário\gallery-dl\instagram\essencianaturall__\` — copiar
  para `assets/` apenas o que for efetivamente usado no site.
- Repositório remoto: https://github.com/igorcoutinho31/essencia_natural
  (branch `main`).

## Regras de trabalho neste projeto
- Não inventar dados (endereço, telefone, nomes da equipe, preços, selos de
  garantia/originalidade). Tudo que não estiver confirmado vai para
  `docs/TODO-VERIFY.md`, nunca direto pro site como afirmação definitiva.
- Mudanças estruturais ou de design no `index.html` só depois de plano
  apresentado e aprovado explicitamente pelo cliente.
- Benchmark comercial (ex.: onuh.com.br) serve só para lógica de conversão
  (CTAs, varejo x atacado, como comprar, FAQ) — nunca copiar identidade
  visual, texto ou layout.
- Antes de rodar comandos git, verificar se não há trabalho manual do
  usuário em andamento no mesmo repositório (já houve conflito de comandos
  concorrentes nesta sessão).
- Ver `docs/TODO-VERIFY.md` para a lista atualizada de pendências antes de
  publicar qualquer afirmação nova.
