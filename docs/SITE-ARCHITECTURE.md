# Arquitetura do site

## Ativos confirmados

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

## Home — estrutura de seções (aprovada)

1. Hero cinematográfico (240 frames, scroll-scrubbing)
2. Proposta de valor
3. Vitrine / conteúdo social
4. Equipe real (múltiplas pessoas — ver docs/TEAM.md)
5. Diferenciais
6. Varejo x Atacado
7. Catálogo / produtos reais
8. Como comprar
9. Loja física
10. FAQ
11. CTA final + Footer

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
