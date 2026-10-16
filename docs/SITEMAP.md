# Sitemap e validação no Google

## Implementação (16/10/2026)

`GET /sitemap.xml` agora é atendido por `server/routes/sitemap.js`, registrado
em `server/app.js`. O antigo arquivo estático, que listava só a home, foi
removido. O endereço público continua o mesmo.

A resposta XML UTF-8 contém a página inicial e todos os produtos retornados
por `catalogService.getPublicProducts()`, sem filtros ou paginação. Assim,
segue exatamente as regras das páginas de produto: `active = 1` e
`stock > 0 || sales >= 10`. Produtos ocultos/despublicados ficam de fora.
Não há rotas administrativas no sitemap.

Todas as URLs usam `https://www.lojaessencianatural.com.br`, independente
do host da requisição. Slugs são codificados para URL e o texto é escapado
para XML. A consulta acontece em cada pedido, com `Cache-Control: no-store`,
para refletir alterações no catálogo. HEAD retorna os mesmos cabeçalhos sem
corpo. Não são inventadas datas `lastmod`.

`robots.txt` informa o endereço absoluto do sitemap e preserva `Allow: /`,
`Disallow: /admin` e `Disallow: /api/admin`.

## Verificação local

Execute `node --test tests/sitemap.test.js`. O teste usa um banco temporário
isolado e verifica catálogo vazio, produtos públicos/ocultos/despublicados,
estoque zerado com dez vendas, caracteres especiais, atualização automática,
GET/HEAD, cabeçalhos, robots e respostas das rotas existentes. Não altera
o catálogo real nem acessa a OliSek.

## Depois de publicar

1. Abra `https://www.lojaessencianatural.com.br/sitemap.xml`: deve retornar
   XML com a home e os produtos atualmente públicos. A quantidade esperada
   é o total de produtos em `/api/products` mais uma URL da home.
2. Abra `https://www.lojaessencianatural.com.br/robots.txt` e confira a linha
   `Sitemap: https://www.lojaessencianatural.com.br/sitemap.xml`.
3. No Google Search Console, selecione a propriedade desse domínio e abra
   **Sitemaps**. Envie o endereço do sitemap (ou `sitemap.xml`, quando a
   interface já mostrar o prefixo do site).
4. Aguarde o processamento e confira o status, a última leitura e as páginas
   descobertas. A leitura deve ser posterior ao deploy; o total pode mudar
   conforme a disponibilidade dos produtos. Se houver erro, abra os detalhes.
5. Use **Inspeção de URL** com uma URL de produto listada e **Testar URL
   publicada** para conferir se o Google consegue acessá-la.

Enviar um sitemap não garante indexação nem atualização imediata da contagem.
Esta alteração local ainda precisa ser publicada para mudar o sitemap do site.

Referências oficiais:
- https://support.google.com/webmasters/answer/7451001?hl=pt-BR
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=pt-br
