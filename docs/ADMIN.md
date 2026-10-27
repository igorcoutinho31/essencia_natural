# Painel administrativo (`/admin`)

## Acesso

`https://www.lojaessencianatural.com.br/admin/login`. A primeira conta é
criada junto com a base inicial (usuário `admin`, senha temporária gerada
na hora — anotada no terminal, nunca gravada em nenhum arquivo do
projeto). No primeiro login, o sistema **obriga** a trocar a senha antes
de liberar qualquer outra tela ou ação. Senha nova: no mínimo 8
caracteres; trocar a senha encerra as sessões abertas em outros aparelhos.

Senha perdida ou conta nova: na Cloudflare,
`npm run cf:admin -- resetar-senha <usuario> --remote` ou
`npm run cf:admin -- criar <usuario> "<Nome>" [--vendedora] --remote`; no
Node local, `npm run reset-admin-password`. Ver `docs/CLOUDFLARE.md`.

Proteção contra tentativa e erro: 5 senhas erradas seguidas para o mesmo
usuário (ou 20 vindas do mesmo IP) em 15 minutos bloqueiam o login por 15
minutos — mesmo com a senha certa. Ninguém precisa desbloquear: passa
sozinho (ou `resetar-senha`, que também limpa o bloqueio).

Login é feito com sessão de verdade: ao entrar, o servidor cria uma linha
na tabela `sessions` e manda um cookie `en_admin_sessao` (`httpOnly`,
`SameSite=Lax`, `Secure`), que expira em 7 dias. Não existe token nem senha em
lugar nenhum do JavaScript que roda no navegador — o cookie é opaco e o
navegador manda ele sozinho em cada requisição pro mesmo domínio.

## As duas contas

**Atualizado no fechamento da V2 (24/09/2026):** a vendedora ficou restrita
exatamente aos 4 campos da regra 7 do fechamento — preço, promoção, fotos e
destaque. Publicar/ocultar e ajustar estoque manual, que antes eram dela
também, passaram a ser só de admin/gerente (o zero de estoque de um produto
recém-cadastrado não é uma afirmação de ninguém, e decidir isso é uma
responsabilidade da administração, não da venda do dia a dia).

| Pode fazer...                                    | Vendedora | Admin/Gerente |
|---------------------------------------------------|:---------:|:--------------:|
| Ver e buscar produtos, usar as abas de filtro (Sem preço, Sem imagem, etc.) | ✅ | ✅ |
| Editar preço e preço "de" (promoção)                | ✅         | ✅              |
| Marcar/desmarcar como destaque                      | ✅         | ✅              |
| Trocar as fotos (subir, reordenar, definir principal, excluir) | ✅ | ✅        |
| Publicar/ocultar um produto no site (`active`)      | ❌         | ✅              |
| Movimentar estoque (entrada, saída, ajuste) e ver o histórico | ❌ | ✅     |
| Tela `/admin/estoque`, CSV e backup completo          | ❌         | ✅              |
| Editar nome, marca, categoria, notas, descrição      | ❌         | ✅              |
| Editar o vínculo OliSek (ID, nome, status)           | ❌         | ✅              |
| Criar produto novo                                  | ❌         | ✅              |
| Despublicar em definitivo / apagar                  | ❌         | ✅ (soft-delete — histórico fica) |
| Ver o histórico completo de alterações de preço      | ❌         | ✅              |
| Importar relatório da OliSek / confirmar vínculo     | ❌         | ✅              |
| Cadastrar marca nova                                 | ❌         | ✅              |

Essa divisão está em `src/routes/adminApi.js` (função `isAdmin`/
`requireAdmin`, usada em cada rota que precisa ser exclusiva de admin) —
nunca só no front-end: mesmo que alguém edite o HTML da página no
navegador pra fazer os campos aparecerem, a tentativa de salvar é
recusada pelo servidor com `403` (a vendedora nem vê os campos de
estoque/OliSek na tela — eles não são só desabilitados, são omitidos).

## Telas

- `/admin/login` — usuário e senha.
- `/admin/trocar-senha` — obrigatória no primeiro acesso; disponível a
  qualquer momento depois disso.
- `/admin/produtos` — lista com busca (nome, marca ou ID da OliSek) e uma
  barra de abas com contador, na ordem definida no segundo fechamento da
  V2: `Todos`, `Em estoque`, `Estoque baixo`, `Vendidos`, `Indisponíveis`, `Ocultos do
  catálogo`, `Sem preço`, `Sem imagem`, `Sem vínculo OliSek`, `Precisa
  revisão` (ver `ADMIN_FILTERS` em `src/services/catalog.js`),
  mostrando de cada produto: o vínculo com a OliSek (`confirmado` /
  `provável` / `precisa revisão` / `sem vínculo` — ver
  `docs/OLISEK-INTEGRATION.md`, hoje só informativo pro admin, não muda
  mais o que aparece pro cliente), se tem foto, selo de disponibilidade
  (3 estados baseados só no estoque — ver `docs/CATALOGO.md`) com o total
  de vendas acumuladas embaixo quando existir, se está publicado (e,
  quando publicado mas fora do catálogo — estoque zerado com menos de 10
  vendas —, o selo "Oculto do catálogo" em vez de "Publicado"), preço e se
  é destaque.
- `/admin/produtos/novo` — só admin/gerente.
- `/admin/produtos/:id` — a tela de edição de um produto: cadastro
  completo (só admin), vínculo OliSek (leitura pra todo mundo; formulário
  editável de ID/nome/status só pra admin, via `PUT
  /api/admin/products/:id/olisek`), preço + destaque + histórico (histórico
  só admin), estoque/publicar-ou-ocultar (só admin), e fotos.

## Estoque (`/admin/estoque` e tela do produto)

Só administração. Toda mudança de estoque é uma **movimentação** com
histórico (quando, tipo, quantidade, saldo antes → depois, motivo, quem):

- **Entrada**: chegou mercadoria (soma ao saldo).
- **Saída**: venda, avaria, brinde... (subtrai; motivo obrigatório). Se a
  saída for maior que o saldo, é recusada — o estoque nunca fica negativo.
- **Ajuste de contagem**: define o saldo contado na prateleira (motivo
  obrigatório); o sistema registra a diferença.
- Importação de relatório e sincronização da OliSek também aparecem no
  histórico, com o autor (ou "Sincronização automática").

Na tela do produto fica o formulário de movimentação e as últimas 20
movimentações. Em `/admin/estoque`: saldos de todos os produtos com
filtros (estoque baixo 1–10, zerados, origem não confirmada), as últimas
50 movimentações, **Baixar saldos (CSV)**, **Baixar movimentações (CSV)**
(abrem direto no Excel), **Sincronizar todos com a OliSek** (se a API
estiver configurada) e **Baixar backup completo** (dados + fotos; contém
hashes de senha — guardar em lugar privado).

## Preço: como o histórico funciona

Toda vez que alguém salva um preço em `/admin/produtos/:id`, o servidor
(`catalog.setPrice`) grava uma linha nova em `price_history` com:
preço antigo, preço novo, preço "de" antigo/novo, quem fez (nome do
usuário logado) e quando (timestamp do servidor). Essa linha nunca é
apagada — nem se o produto for despublicado depois. Só admin/gerente vê
essa tabela na tela de edição; a vendedora vê só a confirmação de que
salvou.

Exemplo de como uma linha do histórico aparece:

```
23/09/2026 15:40 · R$ 179,90 → R$ 159,90 · alterado por Vendedora Teste
```

## Fotos

Upload é feito por um formulário simples: escolher o arquivo (pode ser a
foto direto da câmera do celular). O navegador reduz a imagem para no
máximo 1600px e converte para WEBP antes de enviar, e manda como um
`data:` URL dentro de um JSON. O servidor então:
1. Confere que o arquivo é mesmo um JPG/PNG/WEBP de verdade, lendo os
   primeiros bytes do arquivo (não confia na extensão nem no que o
   navegador diz que é).
2. Recusa arquivos maiores que 8MB.
3. Na Cloudflare, passa a imagem pelo Cloudflare Images (mesmo limite de
   1600px, WEBP) e fica com o resultado se ele for menor.
4. Grava o arquivo no R2 (Cloudflare) ou em `.local/uploads/` (Node), e
   ela é servida em `/uploads/products/<slug>/<arquivo>`.
5. Registra a foto no banco (`product_images`), marcando como principal
   se for a primeira foto do produto.

Dá pra escolher qual foto é a principal (☆) e excluir fotos (🗑) — excluir
apaga o arquivo do armazenamento, não só a referência no banco.

## Importação de relatório da OliSek

A tela de importar um relatório colado (`/api/admin/olisek/parse`, ainda
sem uma tela dedicada no admin — hoje é uma rota de API pronta para uma
interface simples ser plugada) aceita um texto simples (CSV: `id;nome;estoque`
ou `id,nome,estoque`, com ou sem cabeçalho) e devolve as linhas já
identificando quais IDs já existem vinculados no banco. Confirmar o
vínculo de um produto (`/api/admin/olisek/link`) é uma ação exclusiva de
admin/gerente — nunca acontece sozinho.
