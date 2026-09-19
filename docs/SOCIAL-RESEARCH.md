# Pesquisa social / Benchmark

## Ativos próprios já coletados
- Instagram (@essencianaturall__): 94 arquivos baixados (fotos + vídeos +
  metadados JSON) em `C:\Users\Usuário\gallery-dl\instagram\essencianaturall__\`
  (fora do repositório do projeto).
- TikTok (@essencia.natura): já existem materiais analisados/fornecidos
  (screenshots, vídeos, referências visuais e de linguagem do perfil). O
  que ainda está pendente é o download completo/organizado do perfil via
  ferramenta (bloqueado por proteção anti-bot / bug de extração do yt-dlp
  nesse perfil específico) — não a existência de material de referência.
- Sequência de 240 frames (`assets/frames/`): já extraída previamente a
  partir de um vídeo cinematográfico de uma mulher borrifando perfume. Ver
  detalhes técnicos em `docs/SITE-ARCHITECTURE.md`. NÃO regenerar nem
  extrair novos frames — usar exatamente essa sequência.

## Benchmark comercial: onuh.com.br

Usado **apenas como referência de lógica comercial** — não copiar
identidade visual, textos ou layout.

Estrutura observada:
1. Header com CTA WhatsApp fixo
2. Hero com proposta de valor + CTAs (tabela de atacado / catálogo)
3. Métricas-chave (fragrâncias, marcas, estados)
4. Prova social (Reclame Aqui)
5. Segmentação **Lojista (CNPJ) x Revendedor (MEI)**, CTAs distintos por
   perfil
6. Diferenciais numerados (originalidade, variedade, condições flexíveis,
   formalização CNPJ/MEI, prazo de entrega, atendimento humano)
7. Marcas parceiras
8. Catálogo em destaque
9. "Como funciona" em 3 passos: Fale no WhatsApp → Receba tabela/mix →
   Receba em 2–4 dias
10. Selo de originalidade + manifesto de marca
11. FAQ comercial
12. CTA final + Footer

Conclusão de uso: todo o funil da ONUH converte para WhatsApp, sem carrinho
— o "checkout" é a conversa. Vamos adaptar essa lógica de conversão (CTAs
claros, separação varejo/atacado, "como comprar", FAQ comercial), mas com
tom humano/social/loja física em vez de tom de distribuidora B2B
corporativa. Ver `docs/BRAND-BRIEF.md` para a diretriz de tom e
`docs/SITE-ARCHITECTURE.md` para a estrutura de página adaptada.
