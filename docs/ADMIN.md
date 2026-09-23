# Painel administrativo (`/admin`)

## Acesso

`https://SEU-DOMINIO/admin/login`. A primeira conta é criada por
`server/seed.js` (usuário `admin`, senha temporária gerada na hora —
anotada no terminal quando o script roda, nunca gravada em nenhum
arquivo do projeto). No primeiro login, o sistema **obriga** a trocar a
senha antes de liberar qualquer outra tela. Se a senha se perder, rode
`node server/reset-admin-password.js` — ele gera outra temporária pro
usuário `admin` já existente.

Login é feito com sessão de verdade: ao entrar, o servidor cria uma linha
na tabela `sessions` e manda um cookie `en_admin_sessao` (`httpOnly`,
`SameSite=Lax`), que expira em 7 dias. Não existe token nem senha em
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
| Ajustar o estoque manualmente                       | ❌         | ✅              |
| Editar nome, marca, categoria, notas, descrição      | ❌         | ✅              |
| Editar o vínculo OliSek (ID, nome, status)           | ❌         | ✅              |
| Criar produto novo                                  | ❌         | ✅              |
| Despublicar em definitivo / apagar                  | ❌         | ✅ (soft-delete — histórico fica) |
| Ver o histórico completo de alterações de preço      | ❌         | ✅              |
| Importar relatório da OliSek / confirmar vínculo     | ❌         | ✅              |
| Cadastrar marca nova                                 | ❌         | ✅              |

Essa divisão está em `server/routes/adminApi.js` (função `isAdmin`/
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
  V2: `Todos`, `Em estoque`, `Vendidos`, `Indisponíveis`, `Ocultos do
  catálogo`, `Sem preço`, `Sem imagem`, `Sem vínculo OliSek`, `Precisa
  revisão` (ver `ADMIN_FILTERS` em `server/services/catalogService.js`),
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

## Preço: como o histórico funciona

Toda vez que alguém salva um preço em `/admin/produtos/:id`, o servidor
(`catalogService.setPrice`) grava uma linha nova em `price_history` com:
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

Upload é feito por um formulário simples: escolher o arquivo, ele é lido
no navegador e mandado pro servidor como um `data:` URL dentro de um JSON
(não existe `<form multipart>` porque isso exigiria a biblioteca `multer`,
que é do npm — bloqueado neste ambiente, ver README-V2.md). O servidor
então:
1. Confere que o arquivo é mesmo um JPG/PNG/WEBP de verdade, lendo os
   primeiros bytes do arquivo (não confia na extensão nem no que o
   navegador diz que é).
2. Recusa arquivos maiores que 8MB.
3. Salva como arquivo de verdade em `/uploads/products/<slug>/`.
4. Registra a foto no banco (`product_images`), marcando como principal
   se for a primeira foto do produto.

Dá pra escolher qual foto é a principal (☆) e excluir fotos (🗑) — excluir
apaga o arquivo do disco, não só a referência no banco. **Não existe hoje**
redimensionamento automático da imagem — ver a limitação documentada em
`docs/CATALOGO.md`.

## Importação de relatório da OliSek

A tela de importar um relatório colado (`/api/admin/olisek/parse`, ainda
sem uma tela dedicada no admin — hoje é uma rota de API pronta para uma
interface simples ser plugada) aceita um texto simples (CSV: `id;nome;estoque`
ou `id,nome,estoque`, com ou sem cabeçalho) e devolve as linhas já
identificando quais IDs já existem vinculados no banco. Confirmar o
vínculo de um produto (`/api/admin/olisek/link`) é uma ação exclusiva de
admin/gerente — nunca acontece sozinho.
