/* Dados do restaurante que o dono muda (painel Zivoop). O que ficar de fora usa o padrão do index.html.
   config.supabase: URL e anon key do projeto (Supabase > Project Settings > API). Sem isso o site roda em modo demonstração.
   config.turnos: horários em que aceita reserva, por dia (0 = domingo ... 6 = sábado). Dia fora da lista = fechado.
   config.reservas: duracaoMin (quanto tempo uma mesa fica presa por reserva), toleranciaMin (atraso aceito),
                    antecedenciaMin, diasAFrente, maxPessoas, folgaMax (lugares sobrando que ainda deixam reservar a mesa).
   mesas: id, lugares, x e z (metros a partir do centro do salão; z positivo = perto da entrada),
          forma "redonda" | "quadrada" | "retangular", area (Janela, Salão, Varanda...),
          reservavel false = mesa só para quem chega na hora.
   cardapio: [{ cat: "Pizzas", itens: [{ id, n (nome), d (descrição), p (preço), tag opcional }] }] */
window.DADOS = {
  config: {
    // nome: "Cantina Bella Vista",
    // whatsapp: "5511999999999",
    // endereco: "Rua das Oliveiras, 120, Centro",
    // turnos: { "0": ["11:30-16:00"], "5": ["18:30-23:30"], "6": ["11:30-16:00", "18:30-23:30"] },
    // reservas: { duracaoMin: 120, toleranciaMin: 20 },
    // taxaServico: 10,
    // supabase: { url: "https://abcdefgh.supabase.co", anonKey: "eyJ..." }
  }
  // mesas: [ { id: "1", lugares: 2, x: -5.9, z: -3.3, forma: "redonda", area: "Janela" }, ... ],
  // cardapio: [ ... ]
};
