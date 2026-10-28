# Hospedagem na Cloudflare

O site roda num **Worker** da Cloudflare com banco **D1**. As fotos (as
enviadas pelo `/admin` e as da biblioteca de fornecedores) também ficam no
D1. A arquitetura do código está em `docs/BACKEND.md`.

Tudo está na conta Cloudflare **da loja** (não numa conta pessoal):

| O quê                | Onde / valor                                                        |
|----------------------|---------------------------------------------------------------------|
| Worker               | `essencia-natural` (Workers & Pages)                                |
| Banco D1             | `essencia-natural` (id no `wrangler.toml`)                          |
| Endereço oficial     | `https://www.lojaessencianatural.com.br`                            |
| Endereço sem `www`   | redireciona para o oficial (Redirect Rule, ver "Domínio")           |
| Endereço provisório  | `https://essencia-natural.lojaessencianatural.workers.dev`          |
| Publicação           | automática a cada mudança no `main` (Builds, ver abaixo)            |

## Custo: plano grátis

Nada aqui exige cartão de crédito. O projeto foi ajustado para os limites
grátis:

| Serviço                  | Limite grátis                               | Uso estimado da loja                                  |
|--------------------------|---------------------------------------------|-------------------------------------------------------|
| Workers (pedidos)        | 100 mil por dia                             | ~40 por visitante novo; ~2.500 visitantes novos/dia cabem. Visitas repetidas quase não contam (fotos ficam 1 ano no navegador) |
| Workers (CPU)            | 10 ms por pedido                            | login ~4 ms (hash ajustado); páginas bem menos        |
| Arquivos estáticos       | ilimitado                                   | home, CSS, JS, logos                                  |
| D1 (banco)               | 500 MB por banco; 5 milhões de leituras/dia | dados: poucos MB; fotos: até ~380 MB (teto do importador da biblioteca) |
| Cron                     | incluso                                     | a cada 30 min (backup semanal, limpezas, OliSek)      |
| Domínio na Cloudflare    | plano Free                                  | DNS + HTTPS                                           |
| Builds automáticos       | 3.000 min/mês                               | ~1 min por publicação                                 |

O único custo é o que a loja já paga: o registro do domínio
`lojaessencianatural.com.br` no Registro.br (anual).

Se um dia o site passar dos 100 mil pedidos por dia, a Cloudflare recusa
os pedidos acima do limite até o dia virar (não cobra nada sozinha). A
saída, nesse caso, é o plano Workers Paid (US$ 5/mês), sem mudar código.

Ajustes feitos para caber no grátis:
- **Senha**: hash scrypt N=2048 (~3,5 ms de CPU), compensado pelo bloqueio
  após 5 tentativas erradas e pela senha mínima de 10 caracteres. Hashes
  antigos são convertidos no próximo login.
- **Fotos no D1 em vez do R2**: ativar o R2 pede cartão, mesmo sem cobrar
  dentro da cota. Se um dia quiser o R2, é só ligar no `wrangler.toml` (o
  código já suporta os dois).
- **Cloudflare Images**: desligado. O navegador reduz cada foto para
  1600px/WEBP antes do envio pelo `/admin`.
- **Backups dentro do banco**: o backup semanal é montado pelo próprio D1
  (SQL), sem gastar CPU do Worker.

## Publicação automática

Cloudflare → Workers & Pages → `essencia-natural` → **Settings → Builds**:
repositório `igorcoutinho31/essencia_natural`, branch `main`, *Preview
builds* desligado e **Deploy command**:

```
npx wrangler d1 migrations apply essencia-natural --remote && npx wrangler deploy
```

Toda mudança que entra no `main` aplica as migrações novas do banco (se
houver) e publica o site em cerca de 1 minuto. Acompanhe em
**Deployments**.

## Domínio

- O domínio está na conta Cloudflare da loja (servidores DNS
  `jill.ns.cloudflare.com` e `kaiser.ns.cloudflare.com`, configurados no
  Registro.br).
- O Worker atende `www.lojaessencianatural.com.br` e
  `lojaessencianatural.com.br` (*Custom domains*, declarados no
  `wrangler.toml`).
- **Rules → Redirect Rules**: regra manual com *Hostname equals*
  `lojaessencianatural.com.br`, destino dinâmico
  `concat("https://www.lojaessencianatural.com.br", http.request.uri.path)`,
  status 301, mantendo a query string.
- SSL/TLS → **Always Use HTTPS** ligado.

## Dia a dia

| Preciso de...                         | Comando / lugar                                                   |
|---------------------------------------|-------------------------------------------------------------------|
| Ver erros e acessos                   | Cloudflare → Worker → **Logs** (observability ligada)             |
| Conferir se o site está no ar         | `npm run cf:smoke -- https://www.lojaessencianatural.com.br`      |
| Resetar a senha de alguém             | `npm run cf:admin -- resetar-senha <usuario> --remote`            |
| Criar conta (administração/vendedora) | `npm run cf:admin -- criar <usuario> "<Nome>" [--vendedora] --remote` |
| Desativar conta                       | `npm run cf:admin -- desativar <usuario> --remote`                |
| Listar contas                         | `npm run cf:admin -- listar --remote`                             |
| Importar a biblioteca de fornecedores | `npm run cf:biblioteca -- <pasta> --remote` (ver `docs/CATALOGO.md`) |
| Backup                                | Automático (semanal, 12 cópias). Emergência: `/admin/estoque` → Backups automáticos |
| Voltar o banco no tempo (até 7 dias)  | `npx wrangler d1 time-travel restore essencia-natural --timestamp=<data>` |
| Testar mudanças antes de publicar     | `npm run cf:importar -- backup.json --local` e `npm run cf:dev`   |

Os comandos `cf:*` rodam no seu computador e pedem login na Cloudflare
(`npx wrangler login`, com a conta da loja) na primeira vez.

## OliSek (opcional)

Só se a loja for usar a API:

```bash
npx wrangler secret put OLISEK_LOGIN
npx wrangler secret put OLISEK_PASSWORD
```

Para sincronizar o estoque sozinho a cada 30 minutos (só produtos com
vínculo **confirmado**), troque `OLISEK_AUTO_SYNC = "1"` no
`wrangler.toml`. Ver `docs/OLISEK-INTEGRATION.md`.

## Montar tudo do zero (outra conta ou recuperação)

1. `git clone`, `npm install` e `npx wrangler login`.
2. `npx wrangler d1 create essencia-natural` e copiar o `database_id` e o
   `account_id` para o `wrangler.toml`.
3. Dados:
   - de um backup baixado do `/admin`:
     `npm run cf:importar -- <backup>.json --remote`;
   - ou a base inicial do repositório:
     `npm run cf:importar -- --do-zero --remote`.

   As duas formas **substituem** tudo o que houver no banco. A senha
   temporária do `admin` aparece uma vez no terminal.
4. `npm run cf:deploy` e conferir com `npm run cf:smoke -- <endereço>`.
5. Ligar a publicação automática e o domínio (seções acima).

## Histórico

Até 10/2026 o site rodava no Railway. O período de teste acabou antes da
troca e o serviço parou sem backup possível, então a base na Cloudflare foi
recriada com `npm run cf:importar -- --do-zero --remote` (27–28/10/2026).
Pendente do lado da loja: apagar o projeto antigo no painel do Railway.
