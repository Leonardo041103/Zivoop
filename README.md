# zivoop.com

Site da Zivoop: página de vendas e demonstrações ao vivo dos 38 modelos de site pronto.

- `src/` — a página inicial (`index.html`), o script de demonstração (`demo.js`), favicon e imagem de compartilhamento.
- `public/` — o que vai para o ar (a Vercel publica esta pasta). É gerada pelo `publicar_zivoop.py` do gerador:

      python publicar_zivoop.py <pasta-dos-sites-gerados> <pasta-com-as-fotos-originais> <esta-pasta>

- Pedidos do formulário "Quero meu site" ficam na tabela `zivoop_leads` do projeto Supabase `zivoop-pedidos`
  (Table Editor). O site grava só pela função `zivoop_novo_lead`, que valida os dados; ninguém de fora lê a tabela.
- Preços dos planos e WhatsApp da Zivoop: objeto `ZIVOOP` no fim de `src/index.html`.
