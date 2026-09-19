# Arquitetura do site

## Ativos confirmados

### Sequência de 240 frames — APOSENTADA (19/09/2026)
O cliente reprovou o hero animado: a sequência é gerada por IA, o rosto muda
de identidade ao longo dos frames e o resultado caía no clichê de "estética
árabe genérica de estoque" que o BRAND-BRIEF manda evitar. O hero passou a
ser estático (composição geométrica em SVG/CSS, sem foto). Os 240 arquivos
continuam em `assets/frames/` mas **nenhum é carregado pelo site** — ver
"Pendências" no fim deste arquivo. Registro técnico original abaixo.

### Sequência de 240 frames (hero cinematográfico)
- Local: `assets/frames/`
- Origem: vídeo cinematográfico já existente de uma mulher borrifando
  perfume — sequência já extraída, NÃO regenerar/re-extrair.
- Quantidade: 240 arquivos
- Padrão de nome: `frame-0001.webp` … `frame-0240.webp` (4 dígitos,
  zero-padded)
- Formato: WebP
- Resolução: 1280x720 (confirmado em frame-0001, frame-0120, frame-0240)
- Tamanho total: ~23 MB (todos os 240 arquivos)

Este é o único ativo de vídeo/frame a ser usado no hero. Vídeos e fotos do
Instagram (ver `docs/SOCIAL-RESEARCH.md`) alimentam outras seções (vitrine
social, equipe, loja), não o hero.

## Home — estrutura IMPLEMENTADA (V1, 19/09/2026)

Ordem real das `<section>` no `index.html`:

1. `#hero` — estático, composição geométrica em SVG (sem foto, sem canvas)
2. `#proposta` — proposta de valor, 4 blocos, só fatos confirmados
3. `#catalogo` — 34 produtos reais de `data/catalog.json`, com filtros por
   categoria, busca por nome/marca, ordenação, modal de detalhes e
   "Ver mais" em lotes de 12
4. `#canais` — Varejo x Atacado, CTAs distintos
5. `#equipe` — 4 integrantes com foto real (ver docs/TEAM.md)
6. `#social` — Instagram e TikTok
7. `#comprar` — como comprar em 3 passos
8. `#envios` — envios para todo o Brasil (único bloco claro, creme/areia)
9. `#loja` — endereço, horários e link para o mapa
10. `#faq` — 4 perguntas, `<details>` nativo
11. `#rodape` — CTA final + footer

Seção "Diferenciais" não foi implementada: não há diferencial confirmado
que não repita a proposta de valor. "Vitrine/conteúdo social" virou o
bloco `#social` com links, sem imagens do Instagram embutidas.

Observação: marcas/categorias de perfumes devem aparecer em ponto
estratégico da Home (provavelmente entre Catálogo e Diferenciais, ou como
sub-bloco do Catálogo) — posição exata a decidir na implementação.

## Plano técnico do hero (240 frames) — a implementar

Requisitos definidos pelo cliente:
- Canvas responsivo (`<canvas>`, não `<img>` sequence solta no DOM)
- Scroll-scrubbing: o frame exibido avança conforme o scroll da seção
- Seção sticky (a sequência "prende" a tela enquanto o scroll avança)
- Animação via `requestAnimationFrame` (não trocar frame direto no evento
  de scroll, para evitar jank)
- Preload eficiente (não carregar os 240 arquivos de uma vez de forma
  bloqueante — estratégia a definir: preload progressivo / prioridade nos
  primeiros frames / lazy do restante)
- Preservação de proporção da imagem (object-fit equivalente dentro do
  canvas, sem distorcer 1280x720)
- Deve funcionar em desktop e mobile
- Fallback definido para quando canvas/JS falhar ou não estiver disponível
  (ex.: frame estático ou vídeo/gif substituto)
- Respeitar `prefers-reduced-motion` (reduzir ou remover o scrubbing,
  mostrar estado estático)
- Atenção especial a memória e performance em mobile (240 imagens 1280x720
  descompactadas em memória podem pesar — considerar downscale para
  mobile, ou canvas menor, ou reaproveitamento de buffer)
- Escopo: os frames animam **apenas a abertura (hero)**, não a página
  inteira.

Nada disso foi implementado ainda — aguardando aprovação para alterar o
`index.html`.

## Pendências de dados que afetam a arquitetura
Ver `docs/TODO-VERIFY.md` (endereço com conflito 213/215, equipe completa,
catálogo real, selos de confiança ainda não confirmados).


## Logo oficial (19/09/2026)
- Fornecido pelo cliente como JPG com fundo preto. O selo é um círculo
  perfeito: bbox de 699x699 centrada em (413,474), raio 349 — medido, não
  chutado. Recortado com máscara circular supersampled; os quatro cantos
  ficaram com alpha 0, sem halo escuro.
- `assets/images/logo-essencia-natural.png` — 700x700 RGBA, 535 KB. É o
  asset de referência.
- `assets/images/logo-essencia-natural.webp` — mesmo recorte, 70 KB. É o
  que o site realmente serve, via `<picture>` com o PNG como fallback.
- Usado no hero, no lugar do medalhão geométrico em SVG (removido). Nenhuma
  cor, proporção ou elemento do logo foi alterado — a integração é toda por
  volta dele: o padrão girih é mascarado no miolo, há um halo radial quente
  atrás e duas drop-shadows (preta para profundidade, dourada discreta).
- Tamanho: `clamp(180px,24vw,300px)` no desktop e `clamp(148px,42vw,232px)`
  abaixo de 900px, onde o painel vira uma faixa horizontal mais baixa.

## Decisões técnicas da V1
- Sem framework e sem build. HTML, CSS e JS puros num único `index.html`.
- **Zero script externo.** O GSAP foi removido na passada final: as duas
  seções que o usavam (contadores e "explosão das notas") saíram por
  conterem dados inventados. Só as fontes do Google continuam externas.
- O catálogo é renderizado por JS a partir de `data/catalog.json`. Isso
  exige servir por HTTP — abrir o `index.html` direto do disco faz o
  navegador bloquear o JSON por CORS, e a página mostra um aviso
  explicando em vez de falhar em silêncio.
- FAQ usa `<details>/<summary>` e o modal do catálogo usa `<dialog>`:
  acessibilidade de teclado e foco vêm do navegador, sem JS extra.

## Pendências
- `assets/frames/` (240 arquivos, ~23 MB) não é mais usado por nenhuma
  parte do site. Os arquivos foram mantidos porque o `AGENTS.md` proíbe
  removê-los sem instrução explícita. Se a V1 for publicada como está,
  são 23 MB de peso morto no repositório — decisão do cliente.
- Ver `docs/TODO-VERIFY.md` para as pendências de dados.
