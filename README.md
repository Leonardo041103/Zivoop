# Zivoop

Dois sites separados neste repositório:

| | O quê | Vercel | Banco (Supabase) |
|---|---|---|---|
| `site/` | zivoop.com, o site de vendas (gerado por `publicar_site.py` a partir de `src/site.html`) | projeto próprio, Root Directory = `site` | `zivoop-site` (só os contatos) |
| raiz (`public/`, `api/`) | app.zivoop.com: painel, sites dos clientes (`/<slug>`), demonstrações (`/modelos/...`), Zivoop Ofertas | projeto `zivoop` | `zivoop-pedidos` |

O site de vendas mostra as demonstrações pela plataforma (`ZIVOOP.app` em `src/site.html`).
Quando o domínio estiver pronto, troque para `https://app.zivoop.com` e publique de novo.


Site da Zivoop: página de vendas e demonstrações ao vivo dos 38 modelos de site pronto.

- `src/` — a página inicial (`index.html`), o script de demonstração (`demo.js`), favicon e imagem de compartilhamento.
- `public/` — o que vai para o ar (a Vercel publica esta pasta). É gerada pelo `publicar_zivoop.py` do gerador:

      python publicar_zivoop.py <pasta-dos-sites-gerados> <pasta-com-as-fotos-originais> <esta-pasta>

- Pedidos do formulário "Quero meu site" ficam na tabela `zivoop_leads` do projeto Supabase `zivoop-pedidos`
  (Table Editor). O site grava só pela função `zivoop_novo_lead`, que valida os dados; ninguém de fora lê a tabela.
- Preços dos planos e WhatsApp da Zivoop: objeto `ZIVOOP` no fim de `src/index.html`.
