# Essência Natural — site oficial

Site da **Essência Natural**, perfumaria árabe e importada na Galeria Pagé
(25 de Março, São Paulo): catálogo com página de cada produto, sacola que
fecha o pedido pelo WhatsApp e painel `/admin` para a equipe cuidar de
preços, fotos e estoque.

Endereço: <https://www.lojaessencianatural.com.br>

## Estrutura

| Pasta         | O que tem                                                              |
|---------------|------------------------------------------------------------------------|
| `public/`     | o site que o visitante vê (HTML, CSS, JS, imagens)                     |
| `src/`        | o backend: catálogo, estoque, admin, login (roda na Cloudflare)        |
| `migrations/` | estrutura do banco de dados                                           |
| `server/`     | o mesmo backend rodando no Node, para desenvolver e testar localmente  |
| `scripts/`    | scripts de dados (base inicial, importações, reset de senha local)     |
| `seed/`       | dados iniciais do catálogo (34 produtos e fotos)                        |
| `tools/`      | comandos da Cloudflare (importar dados, contas do admin, teste no ar)  |
| `tests/`      | testes automáticos                                                    |
| `docs/`       | documentação: marca, equipe, produtos, arquitetura, pendências         |

## Comandos

```bash
npm install                    # uma vez (instala o wrangler, CLI da Cloudflare)
node scripts/base-inicial.js   # cria o banco local com o catálogo inicial
npm run dev                    # site local em http://localhost:3000
npm test                       # testes automáticos
npm run cf:dev                 # roda no runtime da Cloudflare, local
npm run cf:deploy              # publica na Cloudflare
npm run cf:biblioteca -- <pasta> --remote   # importa a biblioteca de fornecedores (ver docs/CATALOGO.md)
```

## Leia antes de mexer

- `CLAUDE.md` e `AGENTS.md`: regras do projeto. Não inventar preço,
  endereço ou equipe, e nunca mostrar estoque numérico ao cliente.
- `docs/BACKEND.md`: arquitetura, estoque, segurança e testes.
- `docs/CLOUDFLARE.md`: hospedagem e a troca saindo do Railway.
- `docs/TODO-VERIFY.md`: o que ainda não foi confirmado pela loja.
