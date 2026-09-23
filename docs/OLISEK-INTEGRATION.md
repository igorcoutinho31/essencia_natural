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
- 5 produtos do catálogo já têm o `olisek_id` e o nome de origem da OliSek
  gravados no banco, com o estoque que a loja informou em 23/09/2026:

  | Produto no site | ID OliSek | Nome na OliSek                        | Estoque | Confiança |
  |------------------|-----------|-----------------------------------------|---------|-----------|
  | ATHEERI           | 804491    | LATTAFA ATHEERI EDP F 100ML              | 28      | confirmado |
  | KHAMARAH          | 804502    | LATTAFA KHAMARA EDP U 100ML              | 4       | confirmado |
  | Marshmallow Blush | 804547    | PARIS CORNER MARSHMALLOW BLUSH ED100ML   | 50      | confirmado |
  | club de nuit Intense Man | 804007 | ARMAF CLUB DE NUIT INTENSE EDP M 105ML | 122   | confirmado |
  | SABAH             | 803958    | AL WATANIAH SABAH AL WARD EDP 100ML      | 558     | **provável** |

  ⚠️ **SABAH está marcado como "provável", não "confirmado".** O nome do
  produto no site ("SABAH") é mais curto que o nome completo da OliSek
  ("AL WATANIAH SABAH AL WARD EDP 100ML") — a correspondência foi feita
  por nome parecido, não por conferência humana direta linha a linha. Vale
  a pena o time da loja confirmar isso olhando os dois sistemas lado a
  lado antes de confiar 100% no estoque desse item específico. Depois de
  confirmado, é só trocar `olisek_match_confidence` para `'confirmado'`
  (via `/admin`, quando a tela de confirmação existir, ou direto no banco).

- Os outros ~29 produtos do catálogo continuam **sem vínculo** —
  aparecem em `/admin/produtos` com o selo cinza "Aguardando vínculo" e
  estoque `0` (o que os mostra como "Indisponível" no site público — uma
  escolha deliberada: melhor mostrar indisponível do que inventar que tem
  estoque). Assim que a loja mandar a lista completa de IDs/nomes/estoque
  da OliSek, esses produtos são vinculados um a um.

- `server/services/olisekService.js` já tem uma função `parseReport(texto)`
  que lê um relatório colado (exportado/copiado manualmente da OliSek, em
  CSV simples) e devolve as linhas interpretadas — pronta pra alimentar
  uma tela de importação em lote no admin.

### O que ainda não existe (fica pronto para quando a API existir)
- Nenhuma chamada de rede para a OliSek acontece hoje — nem do navegador,
  nem do servidor. Isso é intencional: sem uma chave de API oficial, não
  há nada de verdade pra chamar, e simular uma resposta seria inventar
  dado.
- `olisekService.apiConfigured()` verifica duas variáveis de ambiente
  (`OLISEK_API_URL` e `OLISEK_API_KEY`) que hoje não existem em lugar
  nenhum — a função sempre devolve `false`.
- `olisekService.getStockFromApi(id)` já existe como função, mas lança um
  erro proposital (`501 not_implemented`) — é o "buraco" que vai ser
  preenchido quando a API existir.

## Onde a futura chave de API vai entrar

Quando a Essência Natural conseguir acesso oficial à API da OliSek:

1. A URL base e a chave/token de acesso vão em **variáveis de ambiente do
   servidor** (`OLISEK_API_URL`, `OLISEK_API_KEY`) — nunca em nenhum
   arquivo do repositório, e nunca em código que roda no navegador do
   cliente. No Railway/Render (ver README-V2.md), isso se configura no
   painel do provedor, na seção de variáveis de ambiente do serviço.
2. Só um arquivo muda: `server/services/olisekService.js`, função
   `getStockFromApi`. Hoje ela lança `501`; o comentário
   `// TODO(V3): fetch(...)` já mostra exatamente a forma da chamada que
   precisa entrar ali (servidor chamando a OliSek diretamente — nunca o
   navegador do cliente chamando a OliSek).
3. Nada mais no site precisa mudar: `catalogService`, as rotas públicas,
   a página de produto e o admin só conhecem a interface do
   `olisekService` (`getLocalStock`, `getStockFromApi`, `parseReport`) —
   não sabem (nem precisam saber) se o dado veio de uma API ou de uma
   importação manual.
4. Decisão de produto pendente para quando a API existir: rodar a sincronia
   automaticamente (ex.: a cada X minutos, um job no servidor chama a API
   e atualiza o estoque) ou manter como um botão manual em `/admin`
   ("Sincronizar agora"). Nenhuma das duas está implementada — é uma
   escolha que fica pra quando a API estiver disponível de verdade.

## Regra permanente: curadoria antes de publicar

Mesmo com a API funcionando, nenhum item da OliSek deve aparecer
automaticamente no catálogo público sem alguém confirmar que é um item
que a loja quer vender ali (a OliSek gerencia a loja inteira, não só
perfumes). Ver `docs/CATALOGO.md`, seção "Curadoria".
