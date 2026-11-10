# zivoop.com (site de vendas)

Site separado da plataforma: projeto próprio na Vercel (Root Directory = `site`) e banco próprio no Supabase
(`zivoop-site`, só a tabela `zivoop_leads` com os contatos do formulário "Fale com a gente").

- Não edite os arquivos desta pasta: ela é gerada por `publicar_site.py` a partir de `src/site.html`,
  `src/zivoop/`, `src/privacidade/` e `src/termos/`.
- Contatos: Supabase > projeto zivoop-site > Table Editor > zivoop_leads.
- Demonstrações dos modelos e painel ficam na plataforma (`ZIVOOP.app` em `src/site.html`).
