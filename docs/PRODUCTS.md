# Produtos

## ⚠️ Atualizado na V2 (23/09/2026)

**`data/catalog.json` não é mais a fonte de verdade** — ele só serve hoje
como o histórico do que foi importado uma vez (por `server/seed.js`) para
dentro do banco de dados (`data/essencia.sqlite`). Para incluir, remover,
precificar ou corrigir um produto agora, o caminho é `/admin` (ver
`docs/ADMIN.md`) — não editar mais o JSON esperando que o site reflita a
mudança. Detalhes da nova arquitetura em `docs/CATALOGO.md`. O restante
deste documento descreve o catálogo como ele **entrou** no site (19/09/2026)
e continua útil como registro histórico dos dados de origem.

## Catálogo real (integrado ao site em 19/09/2026)

Fonte de verdade **até a V2**: **`data/catalog.json`**. O site renderiza os
cards por JavaScript a partir desse arquivo — nenhum produto está escrito
à mão no `index.html`. Para incluir, remover ou corrigir um item, edite o
JSON.

- Total: **34 itens**
- Origem: pacote extraído do Instagram @essencianaturall__ enviado pelo
  cliente (campo `generated_from` do próprio JSON)
- Imagens: `assets/catalog/`, uma por item, convertidas de JPG para WebP
  (máx. 700px de largura, proporção 3:4). De 19,3 MB para 1,79 MB.

### Campos por item
| Campo | Preenchido | Observação |
|---|---|---|
| `id`, `name`, `category`, `image`, `description`, `date`, `instagram_post_url` | 34/34 | |
| `notes` (topo/coração/fundo) | 9/34 | só exibido quando existe |
| `brand` | 3/34 | QAWAFI (2), Paris Corner (1) |
| `price`, `wholesale_price` | 0/34 | **todos null** — ver TODO-VERIFY. `price` (número em reais) faz o site exibir valor e total da sacola |

### Categorias
Perfume (30), Body Cream (3), Marca / Coleção (1).

### O que o site exibe
Imagem, nome, marca (quando existe), categoria, notas olfativas (quando
existem) e um botão "Consultar no WhatsApp" com link individual por
produto. Campos vazios não geram linha. Preço não é exibido de forma
alguma. São 12 cards no primeiro carregamento e o restante entra pelo
botão "Ver mais produtos", sem recarregar a página.

## Pendências de qualidade do catálogo
Nada disso foi corrigido por conta própria — são dados do cliente. Ver
`docs/TODO-VERIFY.md`.

- Quatro nomes vieram da legenda do Instagram e carregam texto que não é
  o nome do produto: `Elysian Fields Kiss, QAWAFI` e `Elysian Fields
  Silk, QAWAFI` (repetem a marca, que já está no campo `brand`),
  `perfume FATIMA com sabonetes em formato de Rosas` e `Fakhar Rose, o
  mais querido pelas mulheres`.
- `Aurora` está como categoria `Marca / Coleção`, sem notas e com
  descrição "Aurora❤️" — provavelmente não é um produto avulso.
- Ainda não há levantamento de marcas trabalhadas na loja como um todo:
  os 31 itens sem `brand` não tiveram a marca citada na legenda.
- Preços de varejo e condições de atacado (mínimo de pedido, faixas,
  combos) continuam sem levantamento.
