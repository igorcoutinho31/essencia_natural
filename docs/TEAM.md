# Equipe

A equipe da loja é real e deve aparecer no site — a seção NÃO deve ser
reduzida a uma única pessoa.

## Integrantes confirmados (formação final, 23/09/2026)
Ordem de exibição no site (seção "Nossa equipe" e etapa "Escolher
atendimento" da sacola):

1. Bassam
2. Nicolly
3. Larissa
4. Livia

A Tamires saiu da equipe e foi removida do site (foto e nome) nesta data.
A grafia **Bassam** (com "m") foi definida pelo cliente no fechamento
final — substitui o "Bassan" usado até então. Na mesma data o cliente
corrigiu a grafia **Nicole → Nicolly** (site e docs atualizados).

Nenhum cargo, sobrenome, função ou história foi confirmado para ninguém.
No site, só o primeiro nome é publicado.

## Fotos oficiais
Retratos enviados pelo cliente em 23/09/2026 (mesmo cenário da loja com o
logo EN ao fundo, mesma luz e enquadramento), guardados em `assets/team/`
já otimizados para web (WebP, 900x1200 — proporção 3:4, ~65–105 KB cada):

| Arquivo | Pessoa | Uniforme |
|---|---|---|
| `bassam-v2.webp` | Bassam  | camisa social preta com logo dourado (foto trocada em 23/09/2026) |
| `nicolly.webp` | Nicolly | polo preta com logo dourado (foto trocada em 23/09/2026) |
| `larissa-v2.webp` | Larissa | polo preta com logo dourado (versão definitiva, sem a corrente com cruz) |
| `livia.webp`   | Livia   | polo preta com logo dourado |

Os originais em PNG ficam só na máquina do cliente, fora do repositório.

**Troca de foto = nome de arquivo novo.** O servidor manda o navegador
guardar imagens por 24h (`Cache-Control: max-age=86400`), então quem já
visitou o site continua vendo a foto antiga se o arquivo novo tiver o
mesmo nome. Por isso as fotos trocadas se chamam `larissa-v2.webp`, `bassam-v2.webp`
e `nicolly.webp` — ao trocar a foto de alguém, use um nome novo
(ex.: `nome-v2.webp`, `nome-v3.webp`) e atualize o `src` em `#equipe`.

A associação nome→foto veio do próprio nome do arquivo enviado pelo
cliente — não deduzir de novo a partir das imagens.

## Material de referência
- Existe vídeo em que a Nicolly apresenta a equipe de forma
  descontraída/cômica. Pode servir de referência de tom para textos ou
  bios da seção de equipe, mas o conteúdo exato (falas, cargos citados)
  ainda não foi transcrito/confirmado.

## Diretriz de implementação
- A seção "Equipe" no site deve ser planejada como um grid/carrossel que
  comporte múltiplas pessoas (não um bloco fixo para 1 nome).
- Fotos reais da equipe vão em `assets/team/`.
- Nenhum nome, cargo ou história deve ser inventado — usar apenas o que for
  confirmado pelo cliente.

## Cuidada pelo painel (28/10/2026)
A equipe agora fica no banco (`team_members`, `migrations/0007_equipe.sql`)
e a loja cuida dela em **`/admin/equipe`**: adicionar, renomear, trocar a
foto, esconder do site, reordenar e remover, sem mexer em código. A
formação acima entrou como lista inicial, com as fotos oficiais.

A seção `#equipe` da home e o modal "Escolher atendimento" da sacola
(`assets/js/atendimento.js`) leem a mesma lista de `GET /api/team` (só
primeiro nome e foto). A lista escrita em `index.html` ficou só de reserva,
para o caso de a API falhar. Fotos enviadas pelo painel ficam em
`/uploads/equipe/` e a foto trocada vai para a lixeira de 90 dias.
