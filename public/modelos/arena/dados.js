/* Dados da arena que o dono muda (painel Zivoop). O que ficar de fora usa o padrão do index.html.
   config.supabase: URL e anon key do projeto (Supabase > Project Settings > API). Sem isso o site roda em modo demonstração.
   config.pix: chave, nome e cidade do recebedor. config.portoes: { A: "Portão A · endereço", ... }.
   config.cotaMeia: parte dos ingressos que pode ser meia-entrada (0.4 = 40%). maxPorPedido, reservaMinutos (tempo para pagar o Pix).
   setores: id, nome, lado ("O" oeste, "L" leste, "N" norte, "S" sul, "C" no campo), ini e fim (de 0 a 1 ao longo do lado),
            filas, marcado (true = cadeira numerada), portao, cor, coberto, filaInicio (fila em que o setor começa, para camarote em cima).
            No campo ("C"): area [x0, z0, x1, z1] em metros e capacidade.
   eventos: id, titulo, sub, data "AAAA-MM-DD", hora, palco ("futebol" | "show" | "rodeio"), times [[sigla, cor], [sigla, cor]] no futebol,
            precos { setor: [inteira, meia] } — só os setores listados vão à venda nesse evento. */
window.DADOS = {
  config: {
    // nome: "Arena Vale do Sol",
    // whatsapp: "5511999999999",
    // pix: { chave: "financeiro@suaarena.com.br", nome: "Arena Vale do Sol", cidade: "Sua Cidade" },
    // supabase: { url: "https://abcdefgh.supabase.co", anonKey: "eyJ..." }
  }
  // eventos: [ { id: "final", titulo: "Final do Estadual", data: "2026-12-06", hora: "16:00", palco: "futebol", times: [["VSE", "#E5484D"], ["ATS", "#9AA3B5"]], precos: { central: [100, 50], leste: [50, 25] } } ]
};
