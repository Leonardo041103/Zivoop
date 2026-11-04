/* Dados do cinema que o dono muda (painel Zivoop). O que ficar de fora usa o padrão do index.html.
   config.supabase: URL e anon key do projeto (Supabase > Project Settings > API). Sem isso o site roda em modo demonstração.
   filmes: id (sem espaço), t (título), g (gênero e duração), c (classificação), sess [[hora, versão]],
           dias [0=dom..6=sáb] opcional, de/ate "AAAA-MM-DD" opcional, cartaz "cartazes/arquivo.jpg" opcional,
           trailer "trailers/arquivo.mp4" opcional. */
window.DADOS = {
  config: {
    // nome: "Cine Aurora",
    // whatsapp: "5511999999999",
    // pix: { chave: "contato@seucinema.com.br", nome: "Cine Aurora", cidade: "Sua Cidade" },
    // precos: { inteira: 36, meia: 18 },
    // supabase: { url: "https://abcdefgh.supabase.co", anonKey: "eyJ..." }
  }
  // filmes: [ { id: "filme1", t: "Nome do filme", g: "Drama, 2h", c: "14", sess: [["19:00","Legendado"]], cartaz: "cartazes/filme1.jpg", trailer: "trailers/filme1.mp4" } ]
};
