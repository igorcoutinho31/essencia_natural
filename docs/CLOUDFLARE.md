# Hospedagem na Cloudflare — e a troca saindo do Railway

O site roda num **Worker** da Cloudflare com banco **D1** — as fotos
enviadas pelo `/admin` também ficam no D1 (arquitetura em `docs/BACKEND.md`). Este guia leva o site do Railway para a
Cloudflare **sem perder nada** (produtos, preços, estoque, fotos, contas e
senhas) e com o site no ar o tempo todo.

## Por que a Cloudflare

- O site fica na rede da Cloudflare, com servidores em São Paulo para os
  arquivos e as fotos. O Railway só tinha servidor nos EUA.
- Não há servidor nem disco para manter: banco e fotos são serviços
  gerenciados, com o banco recuperável minuto a minuto por 7 dias.
- HTTPS, proteção contra ataques e DNS no mesmo painel.
- **Custo zero**: tudo cabe no plano grátis (detalhes abaixo). O Railway
  (US$ 5/mês) pode ser desligado no fim.

## Custo: plano grátis

Nada aqui exige cartão de crédito. O projeto foi ajustado para os limites
grátis:

| Serviço                  | Limite grátis                          | Uso estimado da loja                                  |
|--------------------------|----------------------------------------|-------------------------------------------------------|
| Workers (pedidos)        | 100 mil por dia                        | ~40 por visitante novo; ~2.500 visitantes novos/dia cabem. Visitas repetidas quase não contam (fotos ficam 1 ano no navegador) |
| Workers (CPU)            | 10 ms por pedido                       | login ~4 ms (hash ajustado); páginas bem menos        |
| Arquivos estáticos       | ilimitado e grátis                     | home, CSS, JS, logos                                  |
| D1 (banco)               | 5 GB; 5 milhões de leituras/dia        | menos de 1 MB; ~100 leituras por visita               |
| Fotos (no D1)            | dentro dos 5 GB do D1                  | ~3 MB hoje; milhares de fotos cabem                    |
| Cron (sincronização)     | incluso                                 | a cada 30 min                                          |
| Domínio na Cloudflare    | plano Free                              | DNS + HTTPS                                            |
| Builds automáticos       | 3.000 min/mês                           | ~1 min por publicação                                  |

O que continua sendo pago é só o que a loja já paga hoje: o registro do
domínio `lojaessencianatural.com.br` no Registro.br (anual).

Se um dia o site passar dos 100 mil pedidos por dia, a Cloudflare recusa
os pedidos acima do limite até o dia virar (não cobra nada sozinha). Nesse
caso, a saída é o plano Workers Paid (US$ 5/mês) — sem mudar código.

Três ajustes foram feitos para caber no grátis:
- **Senha**: o hash antigo (scrypt N=16384, ~29 ms de CPU) não cabia nos
  10 ms. O novo (N=2048, ~3,5 ms) é compensado pelo bloqueio após 5
  tentativas erradas e pela senha mínima de 10 caracteres. Quem entrar no
  `/admin` do Railway depois do passo 1 já é convertido sem perceber;
  quem não entrar recebe uma senha temporária na importação (passo 4).
- **Cloudflare Images**: desligado. O navegador já reduz cada foto para
  1600px/WEBP antes do envio.
- **Fotos no D1 em vez do R2**: ativar o R2 pede cartão (ou PayPal), mesmo
  sem cobrar dentro da cota. Guardando as fotos no próprio banco, nenhum
  cartão é necessário. Se um dia quiser o R2, é só ligar no `wrangler.toml`
  (o código já suporta os dois).

## Passo a passo

### 1. Atualizar o site no Railway (prepara o backup)

Fazer o merge desta versão no `main`. O Railway publica sozinho, como
sempre, e a versão nova continua funcionando lá com o mesmo banco e as
mesmas senhas. Ela ganha o histórico de estoque e o botão de backup que
o passo 4 usa.

Confira: abra o site no Railway, entre no `/admin` e veja o menu **Estoque**.
**Peça para cada pessoa da equipe entrar uma vez no `/admin` do Railway**
nesse período: isso converte a senha dela para o formato do plano grátis
e ela continua com a mesma senha depois da troca.

### 2. Preparar a pasta no computador

Numa pasta nova e limpa:

```bash
git clone https://github.com/igorcoutinho31/essencia_natural.git
cd essencia_natural
npm install
npx wrangler login          # abre o navegador para autorizar sua conta
```

### 3. Criar o banco (uma vez só)

```bash
npx wrangler d1 create essencia-natural
```

O primeiro comando imprime um `database_id`. Copie e cole no
`wrangler.toml` (linha `database_id = "..."`), depois faça commit e push
dessa mudança.

### 4. Levar os dados do Railway

1. No site do Railway: `/admin/estoque` → **Baixar backup completo**.
   O arquivo traz produtos, preços, estoque, histórico, marcas, contas e
   fotos. Contém hashes de senha: não compartilhe e apague depois.
2. No computador:

```bash
npm run cf:importar -- caminho/do/essencia-natural-backup-....json --remote
```

O comando aplica o esquema do banco e grava os dados e as fotos. Se
alguma conta ainda estiver com a senha no formato antigo (a pessoa não
entrou no Railway depois do passo 1), o comando imprime uma **senha
temporária** para ela no final — anote e repasse; o primeiro login obriga
a trocar.
Rodar de novo **substitui** tudo pelo conteúdo do arquivo novo, então dá
para repetir com um backup mais recente na hora da troca (passo 7).

> Sem acesso ao Railway? `npm run cf:importar -- --do-zero --remote` monta a
> base inicial do repositório e imprime uma senha temporária para `admin`.

### 5. Publicar e testar no endereço provisório

```bash
npm run cf:deploy
```

O site sobe em `https://essencia-natural.<sua-conta>.workers.dev`. Teste:

```bash
npm run cf:smoke -- https://essencia-natural.<sua-conta>.workers.dev
```

Depois teste à mão: entre no `/admin` com o **mesmo usuário e senha de
antes** (ou a temporária impressa no passo 4), abra um produto, envie uma foto e confira o catálogo pelo celular.


### 6. OliSek (opcional)

Só se a loja for usar a API:

```bash
npx wrangler secret put OLISEK_LOGIN
npx wrangler secret put OLISEK_PASSWORD
```

Para sincronizar o estoque sozinho a cada 30 minutos (só produtos com
vínculo **confirmado**), troque `OLISEK_AUTO_SYNC = "1"` no
`wrangler.toml` e publique de novo. Ver `docs/OLISEK-INTEGRATION.md`.

### 7. Trocar o domínio

1. Cloudflare → **Add a domain** → `lojaessencianatural.com.br` → plano Free
   (o plano do domínio é separado do plano Workers). A Cloudflare mostra
   dois *nameservers*.
2. No Registro.br, troque os servidores DNS do domínio por esses dois.
   A propagação leva de minutos a algumas horas.
3. **Logo antes de apontar o domínio**, para não perder nenhuma alteração
   feita no Railway nesse meio-tempo: baixe um backup novo no Railway e
   rode o passo 4 de novo. Combine com a loja de não editar nada no
   `/admin` até o fim desta etapa.
4. Cloudflare → Workers & Pages → `essencia-natural` → **Settings →
   Domains & Routes → Add → Custom domain**: adicione
   `www.lojaessencianatural.com.br` e também `lojaessencianatural.com.br`.
5. Rules → **Redirect Rules** → modelo *"Redirect from root to WWW"*, para
   o endereço sem `www` ir para o oficial em todas as páginas (o Worker já
   faz isso nas páginas dinâmicas; a regra cobre também a home).
6. SSL/TLS → **Always Use HTTPS** ligado.

Confira `https://www.lojaessencianatural.com.br/` e rode o
`npm run cf:smoke` com esse endereço.

### 8. Desligar o Railway

Deixe o Railway ligado por alguns dias como reserva, sem usar o `/admin`
dele. Quando estiver tudo certo, baixe um último backup (guarde em lugar
seguro), apague o serviço no Railway e remova o `railway.json` do
repositório.

> **Como foi feito (27–28/10/2026):** o período de teste do Railway acabou
> antes da troca e o serviço foi desligado, sem backup possível. A base foi
> recriada com `npm run cf:importar -- --do-zero --remote` (o catálogo
> inicial do repositório); o que a equipe tinha editado no `/admin` do
> Railway não veio. O domínio passou para a conta Cloudflare da loja
> (`jill`/`kaiser.ns.cloudflare.com`), o redirecionamento sem `www` → `www`
> é uma Redirect Rule manual (Hostname = `lojaessencianatural.com.br`), e a
> publicação automática (Builds) está ligada no `main`, sem Preview builds.
> `railway.json` removido do repositório.

## Publicação automática a cada `git push`

Cloudflare → Workers & Pages → `essencia-natural` → **Settings → Builds →
Connect** → escolha o repositório `igorcoutinho31/essencia_natural`, branch
`main`, e use como **Deploy command**:

```
npx wrangler d1 migrations apply essencia-natural --remote && npx wrangler deploy
```

Assim, toda mudança no `main` aplica as migrações novas do banco (se houver)
e publica o site, como o Railway fazia.

## Dia a dia

| Preciso de...                         | Comando / lugar                                                   |
|---------------------------------------|-------------------------------------------------------------------|
| Ver erros e acessos                   | Cloudflare → Worker → **Logs** (observability ligada)             |
| Resetar a senha de alguém             | `npm run cf:admin -- resetar-senha <usuario> --remote`             |
| Criar conta (administração/vendedora) | `npm run cf:admin -- criar <usuario> "<Nome>" [--vendedora] --remote` |
| Desativar conta                       | `npm run cf:admin -- desativar <usuario> --remote`                 |
| Backup                                | Automático (semanal, 12 cópias). Emergência: `/admin/estoque` → Backups automáticos |
| Voltar o banco no tempo (até 7 dias)  | `npx wrangler d1 time-travel restore essencia-natural --timestamp=<data>` |
| Testar mudanças antes de publicar     | `npm run cf:importar -- backup.json --local` e `npm run cf:dev`    |
