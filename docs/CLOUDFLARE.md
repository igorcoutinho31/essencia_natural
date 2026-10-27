# Hospedagem na Cloudflare — e a troca saindo do Railway

O site roda num **Worker** da Cloudflare com banco **D1** e fotos no **R2**
(arquitetura em `docs/BACKEND.md`). Este guia leva o site do Railway para a
Cloudflare **sem perder nada** (produtos, preços, estoque, fotos, contas e
senhas) e com o site no ar o tempo todo.

## Por que a Cloudflare

- O site fica na rede da Cloudflare, com servidores em São Paulo para os
  arquivos e as fotos. O Railway só tinha servidor nos EUA.
- Não há servidor nem disco para manter: banco e fotos são serviços
  gerenciados, com backup do banco por 30 dias (Time Travel).
- HTTPS, proteção contra ataques e DNS no mesmo painel.
- Custo: plano **Workers Paid, US$ 5/mês** (o mesmo do Railway Hobby). Ele
  é necessário porque o login (scrypt) passa do limite de CPU do plano
  grátis. D1, R2 e Images ficam dentro das cotas incluídas com folga para o
  tamanho da loja.

## O que você precisa

- Conta na Cloudflare (<https://dash.cloudflare.com>) com o plano Workers Paid.
- Node 22 instalado no computador.
- Acesso ao painel do Registro.br (ou onde o domínio
  `lojaessencianatural.com.br` foi comprado).

## Passo a passo

### 1. Atualizar o site no Railway (prepara o backup)

Fazer o merge desta versão no `main`. O Railway publica sozinho, como
sempre, e a versão nova continua funcionando lá com o mesmo banco e as
mesmas senhas. Ela ganha o histórico de estoque e o botão de backup que
o passo 4 usa.

Confira: abra o site no Railway, entre no `/admin` e veja o menu **Estoque**.

### 2. Preparar a pasta no computador

Numa pasta nova e limpa:

```bash
git clone https://github.com/igorcoutinho31/essencia_natural.git
cd essencia_natural
npm install
npx wrangler login          # abre o navegador para autorizar sua conta
```

### 3. Criar o banco e o armazenamento de fotos (uma vez só)

```bash
npx wrangler d1 create essencia-natural
npx wrangler r2 bucket create essencia-natural-uploads
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

O comando aplica o esquema do banco, grava os dados e envia as fotos.
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
antes**, abra um produto, envie uma foto e confira o catálogo pelo celular.

Se o deploy reclamar do binding `IMAGES` (conta sem Cloudflare Images),
apague o bloco `[images]` do `wrangler.toml`. As fotos continuam sendo
reduzidas no navegador antes do envio.

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
| Backup                                | `/admin/estoque` → Baixar backup completo                          |
| Voltar o banco no tempo               | `npx wrangler d1 time-travel restore essencia-natural --timestamp=<data>` |
| Testar mudanças antes de publicar     | `npm run cf:importar -- backup.json --local` e `npm run cf:dev`    |
