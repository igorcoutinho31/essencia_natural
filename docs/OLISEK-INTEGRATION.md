# Integração com a OliSek

## O que é a OliSek

Sistema de gestão que a Essência Natural usa hoje para estoque, preços,
cadastro de clientes e vendas da loja física. Não é um sistema feito pela
Essência Natural — é uma ferramenta de terceiros que a loja já usava antes
deste site existir.

## Estado real da integração (23/09/2026)

**Não existe hoje uma API oficial acessível.** O site da OliSek
(`https://www.olisek.com.br/`) menciona uma área de API/integração, mas
não abre publicamente, e não há documentação técnica encontrada. O
cliente está em processo de conseguir acesso direto com a OliSek — até
isso acontecer, a integração é **manual**: a loja exporta/copia os dados
de dentro do sistema OliSek e alguém confirma o vínculo no nosso `/admin`.

### O que funciona hoje (sem depender de nenhuma API)

**Atualização 23/09/2026 (tarde):** o cliente enviou o relatório de
movimentação da OliSek (`Essencia Natural.pdf`, exportado em
`https://olisek.com.br`, 22/09/2026 23:58) com ID, nome e estoque atual de
todos os itens já cadastrados na loja. A partir dele, **27 dos 34 produtos
do catálogo** agora têm `olisek_id` gravado no banco (script de importação:
`server/olisek-import-2026-09-23.js`, mantido no repositório como registro
do que foi importado e quando):

  | Produto no site | ID OliSek | Nome na OliSek | Estoque | Confiança |
  |------------------|-----------|-----------------|---------|-----------|
  | ATHEERI | 804491 | LATTAFA ATHEERI EDP F 100ML | 28 | confirmado |
  | KHAMARAH | 804502 | LATTAFA KHAMARA EDP U 100ML | 4 | confirmado |
  | Marshmallow Blush | 804547 | PARIS CORNER MARSHMALLOW BLUSH ED100ML | 50 | confirmado |
  | club de nuit Intense Man | 804007 | ARMAF CLUB DE NUIT INTENSE EDP M 105ML | 122 | confirmado |
  | Elysian Fields Kiss, QAWAFI | 805746 | QAWAFI ELYSIAN FIELDS KISS | 78 | confirmado |
  | Elysian Fields Silk, QAWAFI | 805745 | QAWAFI ELYSIAN FIELDS SILK 100ML | 18 | confirmado |
  | The Show Magnifique (Paris Corner) | 805684 | THE SHOW MAGNIFIQUE | 0 | confirmado |
  | Eqaab | 804290 | AL WATANIAH EQAAB EDP H 100ML | 1 | confirmado |
  | HIS CONFESSION | 804121 | LATTAFA HIS CONFESSION EDP M 100ML | 0 | confirmado |
  | AZM | 805708 | PARIS CORNER AZM 100ML | 12 | confirmado |
  | club de nuit WOMAN | 804055 | ARMAF CLUB DE NUIT WOMAN EDP 105ML | 45 | confirmado |
  | club de nuit UNTOLD | 804432 | ARMAF CLUB DE NUIT UNTOLD EDP 105ML | 6 | confirmado |
  | club de nuit MALEKA | 804264 | ARMAF CLUB DE NUIT MALEKA EDP F 105ML | 45 | confirmado |
  | club de nuit BLING | 804543 | ARMAF CLUB DE NUIT BLING EDP 75ML | 35 | confirmado |
  | club de nuit iconic | 804134 | ARMAF CLUB DE NUIT ICONIC EDP M 105ML | 12 | confirmado |
  | Body Cream SO CANDID | 805689 | MAISON BODY CREAM SO CANDID | 52 | confirmado |
  | Body Cream DELILAH | 805687 | BODY CREAM DELILAH | 97 | confirmado |
  | Body Cream SALVO | 805691 | MAISON BODY CREAM SALVO | 10 | confirmado |
  | JASOOR | 805662 | LATTAFA JASOOR 100ML | 17 | confirmado |
  | SALVO | 804078 | MAISON AL HAMBRA SALVO INTENSE M 100ML | 46 | confirmado |
  | Fakhar Platin | 804263 | LATTAFA FAKHAR PLATIN EDP M 100ML | 30 | confirmado |
  | Fakhar Rose, o mais querido pelas mulheres | 804019 | LATTAFA FAKHAR ROSE EDP 100ML | 119 | confirmado |
  | SABAH | 803958 | AL WATANIAH SABAH AL WARD EDP 100ML | 558 | **provável** |
  | KHAMARAH QAWAH | 804660 | LATTAFA KHAMRAH QAHWA SELO ANTIGO EDP | 23 | **provável** |
  | MUSAMAM BLACK | 804549 | LATTAFA MUSAMAM BLACK INTENSE EDP | 1 | **provável** |
  | Fakhar Black | 804018 | LATTAFA FAKHAR PRETO EDP M 100ML | 57 | **precisa revisão** |
  | Fakhar Gold | 804020 | LATTAFA FAKHAR GOLD EDP U 100ML SELO NOVO | 0 | **precisa revisão** |

  ⚠️ **Atualização 24/09/2026 (primeiro fechamento da V2):** o campo interno
  que guarda essa confiança deixou de ser `olisek_match_confidence`
  (`'confirmado'` / `'provavel'`) e virou `olisek_link_status`, com 4
  valores: `confirmed` / `probable` / `needs_review` / `unlinked`. Nessa
  migração, **Fakhar Black** e **Fakhar Gold** foram reclassificados de
  "provável" para **"precisa revisão"** (`needs_review`) — ver
  `server/olisek-link-status-2026-09-24.js`.

  ⚠️ **Atualização 23/09/2026 (segundo fechamento da V2— regra mudou):**
  no primeiro fechamento, um vínculo `needs_review`/`unlinked` fazia o selo
  público virar "Consulte disponibilidade" em vez do estoque. Essa regra
  **não existe mais**: o selo público hoje olha só o número de `stock` (ver
  `docs/CATALOGO.md`, seção "Estoque"), e `olisek_link_status` virou
  informação **só de admin** — ajuda o time a saber em quais produtos
  confiar menos antes de confirmar o vínculo, mas não muda mais o que o
  cliente vê. Na prática isso significa que **Fakhar Black** (estoque 57,
  `needs_review`) hoje mostra "Em estoque" normalmente, e **Fakhar Gold**
  (estoque 0, `needs_review`) mostra "Indisponível no momento" — e, como
  ainda não vendeu 10 vezes (`sales=0`), fica oculto do catálogo público
  até a loja confirmar o vínculo/estoque ou até acumular vendas reais.

  ⚠️ **Os itens marcados "provável" ou "precisa revisão" continuam
  precisando de confirmação humana antes de confiar 100% no estoque
  mostrado, mesmo que ele já apareça publicamente:**
  - **SABAH**: nome do site mais curto que o da OliSek (já registrado desde
    a primeira importação).
  - **KHAMARAH QAWAH**: o relatório só tem "LATTAFA KHAMRAH QAHWA **SELO
    ANTIGO** EDP" — não achamos uma versão sem "selo antigo"; pode ser o
    mesmo perfume ou uma embalagem antiga descontinuada.
  - **MUSAMAM BLACK**: o relatório só tem "LATTAFA MUSAMAM BLACK **INTENSE**
    EDP" (existe também um "MUSAMAM WHITE" separado) — a palavra "Intense"
    a mais não deixa 100% certo que é o mesmo item do site.
  - **Fakhar Black** (`needs_review`): vinculado por tradução ("Preto" =
    "Black"), ao produto "LATTAFA FAKHAR **PRETO** EDP M 100ML" — não é o
    mesmo texto, então vale confirmar com a loja se é essa a peça certa.
  - **Fakhar Gold** (`needs_review`): o relatório tem DOIS registros
    parecidos — "SELO ANTIGO" (ID 804583, estoque 0) e "SELO NOVO" (ID
    804020, estoque 0) — vinculamos ao "SELO NOVO" por ser a versão mais
    provável de estar em produção hoje, mas a loja precisa confirmar qual
    dos dois é o produto do site (ou se são dois produtos diferentes).

  Depois de confirmado, é só trocar o `olisek_link_status` para
  `'confirmed'` — pelo `/admin` (tela de produto → "Vínculo OliSek", campo
  "Status do vínculo", só admin/gerente) ou direto no banco. Isso não muda
  o que aparece pro cliente (o estoque já estava valendo), só limpa o
  filtro "Precisa revisão" do admin.

- **7 produtos continuam sem vínculo** — não encontramos, no relatório
  enviado, nenhum item com nome parecido o bastante para linkar com
  segurança:

  | Produto no site | Por quê ficou de fora |
  |---|---|
  | VICTORIOSO | A OliSek só tem variações com sufixo ("...FEARLESS", "...HEROIC", "...LEGACY", "...MYTH") — não dá pra saber qual delas é a do site. |
  | MANDARINSKY | Nenhum item com nome parecido no relatório. |
  | JAMRAH x BURKAN | Nenhum item com esse nome composto; existe um "FERASSA BURKAN" isolado, mas não é claramente o mesmo produto. |
  | MAAHIR BLACK x WHITE | A OliSek só tem "MAAHIR GOLD" e "MAAHIR HONOR" — nenhum "BLACK x WHITE". |
  | perfume FATIMA com sabonetes em formato de Rosas | Existe um "ZIMAYA FATIMA PINK" na OliSek, mas é claramente outro produto (não é o kit com sabonetes). |
  | SO CANDID | A OliSek tem 3 variações diferentes de "SO CANDID" (body splash, body cream e um EDP "pour homme") e não dá pra saber qual delas é a do site — a "Body Cream SO CANDID" já foi vinculada separadamente por ter nome inequívoco. |
  | Aurora | Já sinalizado em `docs/TODO-VERIFY.md` como possivelmente não sendo um produto avulso; a OliSek tem várias linhas "Aurora Scents ..." mas nenhuma chamada só "Aurora". |

  Esses 7 ficam com `olisek_link_status = 'unlinked'` e, por não terem
  nenhum estoque confiável (nem OliSek, nem número digitado à mão), o
  campo `stock` fica no padrão `0`. Pela regra de visibilidade atual
  (`stock > 0 || sales >= 10` — ver `docs/CATALOGO.md`, seção "Estoque"),
  como nenhum deles vendeu 10+ vezes ainda (`sales=0`, sem dado real de
  vendas), **os 7 ficam ocultos do catálogo público** (a página do produto
  devolve 404) até que a loja confirme o vínculo com um estoque real acima
  de 0, digite um número à mão em `/admin`, ou eles acumulem vendas reais
  suficientes. **Nenhum dos 7 é apagado do banco** — continuam existindo
  normalmente em `/admin`, no filtro "Ocultos do catálogo".

- `server/services/olisekService.js` já tem uma função `parseReport(texto)`
  que lê um relatório colado (exportado/copiado manualmente da OliSek, em
  CSV simples) e devolve as linhas interpretadas — pronta pra alimentar
  uma tela de importação em lote no admin.

- Também recebemos, junto com o relatório de movimentação, um segundo
  arquivo da OliSek (`Estoque Essencia Natural.pdf`, 50 páginas): é a lista
  **mestre** de produtos cadastrados na plataforma (a maioria com
  quantidade 0), incluindo categorias que não têm nada a ver com a loja de
  perfumes (ex.: `SWAP`, `LACRADO`, `XIAOMI` — celulares). Não tem ID nem
  preço, só nome/categoria/quantidade. Não foi usado para vincular nada:
  serve só como referência de nomes, caso um vínculo "provável" precise ser
  conferido manualmente depois.

### API oficial liberada (05/10/2026)

A OliSek abriu uma API REST documentada em `https://olisek.com.br/api`
(v1). Autenticação por **login/senha** (não uma chave fixa): `POST
/v1/auth` devolve um token JWT (Bearer) válido por 24h. Endpoints usados
por este site: `GET /v1/getProduct?id=X` (um produto, pelo `id_product` —
é o que guardamos como `olisek_id`) e `GET /v1/listProducts` (busca
paginada, reservado para uma futura tela de match manual). A API também
tem rotas de clientes e dados da empresa que este site não usa.

- `server/services/olisekService.js` agora faz a chamada de verdade:
  autentica, guarda o token em memória (renovando sozinho perto do
  vencimento ou se a OliSek devolver `401`), e expõe `getStockFromApi`,
  `getProductFromApi` e `listProductsFromApi`.
- `olisekService.apiConfigured()` verifica duas variáveis de ambiente,
  **`OLISEK_LOGIN`** e **`OLISEK_PASSWORD`** (nunca em nenhum arquivo do
  repositório, nunca em código que roda no navegador — só variável de
  ambiente do servidor no Railway/Render, ver `README-V2.md`). Enquanto
  ficarem em branco, a função devolve `false` e nenhuma chamada é feita —
  a importação manual de relatório continua funcionando normalmente.
- `OLISEK_API_URL` é opcional (padrão `https://olisek.com.br/api/v1`).
- **Este ambiente de desenvolvimento não tem acesso de rede a
  `olisek.com.br`** (proxy de saída bloqueia o domínio) — a implementação
  foi escrita e revisada contra a documentação oficial da API, mas **ainda
  não foi testada contra o servidor de verdade**. O primeiro teste real
  (login + busca de um produto conhecido, ex. ATHEERI/804491) precisa
  acontecer com acesso de rede de verdade — local, no Railway, ou em
  qualquer ambiente que alcance a internet pública.

### Como sincronizar hoje: botão manual em `/admin`

Decisão tomada em 05/10/2026: sincronização **sob demanda**, nunca
automática em segundo plano. Na tela de produto, seção "Vínculo OliSek",
um produto que já tem `olisek_id` vinculado ganha o botão **"Sincronizar
agora com a OliSek"** (só aparece se `OLISEK_LOGIN`/`OLISEK_PASSWORD`
estiverem configurados). Ao clicar:

1. Chama `POST /api/admin/products/:id/olisek/sync` (`adminApi.syncOlisekStock`).
2. Que chama `catalogService.syncStockFromOlisek(id)` → `olisekService.getStockFromApi(olisekId)`.
3. Grava o estoque retornado, marca `stock_source = 'olisek_api'` e
   `olisek_synced_at = datetime('now')`.

Isso **não muda `olisek_link_status` sozinho** — um vínculo `probable` ou
`needs_review` continua precisando de confirmação humana (regra 6: nunca
inferir "confirmado" automaticamente), mesmo depois de sincronizado pela
API. Um job automático (rodar a cada X minutos sozinho) fica como ideia
futura, não implementada — a estrutura (`olisekService`/`catalogService`)
já suporta isso sem mudar mais nada, se um dia for decidido.

## Regra permanente: curadoria antes de publicar

Mesmo com a API funcionando, nenhum item da OliSek deve aparecer
automaticamente no catálogo público sem alguém confirmar que é um item
que a loja quer vender ali (a OliSek gerencia a loja inteira, não só
perfumes). Ver `docs/CATALOGO.md`, seção "Curadoria".
