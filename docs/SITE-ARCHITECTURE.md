# Arquitetura do site

## Ativos confirmados

### Sequência de 240 frames — REMOVIDA
O hero animado foi reprovado pelo cliente (frames gerados por IA, rosto que
muda de identidade, estética árabe genérica de estoque). O hero é estático
e **a pasta `assets/frames/` (240 arquivos, ~23 MB) foi removida do
repositório na V1.1**, depois de conferido que nenhum arquivo do site a
referenciava. Continua acessível no histórico do git (commits anteriores a
esta remoção) caso um dia seja necessária.

Este é o único ativo de vídeo/frame a ser usado no hero. Vídeos e fotos do
Instagram (ver `docs/SOCIAL-RESEARCH.md`) alimentam outras seções (vitrine
social, equipe, loja), não o hero.

## Home — estrutura IMPLEMENTADA (V1, 19/09/2026)

Ordem real das `<section>` no `index.html` (V1.1, 21/09/2026 — enxuta):

1. `#hero` — quem é a loja: logo em destaque, título, 2 CTAs
2. `#catalogo` — 34 produtos reais de `data/catalog.json`, com filtros por
   categoria, busca por nome/marca, ordenação, modal de detalhes e
   "Ver mais" em lotes de 12
3. `#marcas` — marcas disponíveis (visual; slots em `assets/brands/`)
4. `#canais` — Varejo x Atacado + linha discreta do processo de compra
5. `#equipe` — 4 integrantes com foto real (ver docs/TEAM.md)
6. `#social` — faixa compacta: Instagram e TikTok
7. `#envios` — envios para todo o Brasil (único bloco claro, creme/areia)
8. `#loja` — endereço, horários e "Como chegar" (Google Maps)
9. `#faq` — 4 perguntas, `<details>` nativo
10. `#rodape` — CTA final + footer de navegação

Removidas na V1.1: `#proposta` (repetia hero/canais/envios/loja) e
`#comprar` (virou uma linha dentro de `#canais`). Regra: cada seção tem UMA
função; se duas dizem a mesma coisa, fica só a mais útil.

Marcas: implementadas em `#marcas`, logo depois do catálogo (V1.1).

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
- `assets/frames/` removida na V1.1 (sem referências no site).
- Ver `docs/TODO-VERIFY.md` para as pendências de dados.

## Sacola (carrinho) e movimento — V1.2 (21/09/2026)

### Sacola que finaliza no WhatsApp
- Botão "+" em cada card e "Adicionar à sacola" no modal; ícone da sacola
  com contador no header; gaveta lateral (`<dialog id="sacola">`).
- Escolha de entrega: **retirar na loja** ou **receber em casa** (pede CEP,
  validado e com máscara). Nome e observação são opcionais.
- "Finalizar no WhatsApp" abre `wa.me/5511949614608` com o pedido pronto
  (itens, quantidades, entrega, CEP, nome, observação). **Não há pagamento
  nem cálculo de frete no site**: a equipe confirma estoque, valores e frete.
- Estado no `localStorage` (`en_sacola_v1`: id, quantidade, nome, marca,
  entrega, CEP, nome, obs), sempre em try/catch.
- Preços: aparecem sozinhos (card, modal, sacola e total) quando o
  `data/catalog.json` trouxer `price` como número em reais. Sem preço, nada
  é exibido. O total só aparece se TODOS os itens da sacola tiverem preço.
- Caminho futuro: migrar para plataforma de loja virtual ou checkout próprio
  quando houver preços, estoque e definição de frete (ver TODO-VERIFY).

### Movimento sutil (desligado com `prefers-reduced-motion`)
Poeira dourada em canvas no hero (pausa fora da tela/aba oculta), brasão
que acompanha o mouse, entrada escalonada do hero, seções que aparecem ao
rolar (com rede de segurança de 6 s), cards que entram em cascata, barra de
progresso de leitura, header que ganha corpo ao rolar, rota de envios com
pontos em movimento, e "Aberto agora / Fechado" na loja (horário de
Brasília, calculado pelos horários do site; não conhece feriados).

