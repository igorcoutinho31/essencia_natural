# App no celular (PWA)

O site pode ser instalado na tela inicial do celular e abre como um app:
tela cheia, com o ícone da loja e sem a barra do navegador. Não passa por
loja de aplicativos e não custa nada.

## Como o cliente instala
- **iPhone (Safari):** botão Compartilhar → **Adicionar à Tela de Início**.
- **Android (Chrome):** menu ⋮ → **Instalar app** (ou o aviso que o
  próprio Chrome mostra).

## Como funciona
| Arquivo | Para quê |
|---|---|
| `public/manifest.webmanifest` | nome, ícones (192 e 512), cores e atalhos (Catálogo, WhatsApp) |
| `public/sw.js` | service worker: guarda CSS/JS/ícones no aparelho e mostra a página offline |
| `public/offline.html` | o que aparece quando o cliente abre o app sem internet |
| `public/assets/js/app.js` | registra o service worker (só em HTTPS) |

Regras do service worker:
- páginas e API sempre vêm da rede (preço, publicação e equipe mudam pelo
  painel);
- `/admin`, `/api` e `/uploads` nunca passam pelo cache dele;
- ao mudar a lógica de `sw.js`, troque a constante `VERSAO` no topo do
  arquivo: o aparelho baixa o novo e apaga o cache antigo.

O app abre em `/?origem=app`, o que permite separar nas estatísticas
quem entrou pelo app.

## Próximos passos (com o redesenho do site)
- Ícone "maskable" (com margem de segurança) para o Android recortar
  certinho em qualquer formato.
- Convite discreto "Instale nosso app" no celular, com instruções para
  iPhone — entra no plano visual, que precisa de aprovação.
