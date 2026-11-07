/* Zivoop plataforma: liga o site do modelo ao banco.
   Pedidos e agendamentos vão para o painel do dono (além do WhatsApp) e os horários já tomados somem da agenda. */
(function () {
  var Z = window.ZV; if (!Z) return;
  var pad = function (n) { return String(n).padStart(2, "0"); };
  Z.rpc = function (fn, body) {
    return fetch(Z.api + "/rest/v1/rpc/" + fn, { method: "POST", headers: { apikey: Z.key, Authorization: "Bearer " + Z.key, "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { if (!r.ok) throw new Error((j && (j.message || j.hint)) || ("HTTP " + r.status)); return j; }); });
  };
  var ERROS = { horario_ocupado: "Esse horário acabou de ser reservado. Escolha outro.", horario_passado: "Esse horário já passou.", muitos_pendentes: "Você já tem agendamentos esperando confirmação.",
    muitos_pedidos: "Muitos pedidos em pouco tempo. Fale com a loja pelo WhatsApp.", indisponivel: "Essa data acabou de ser reservada. Escolha outra.", datas_invalidas: "Confira as datas.", nome_obrigatorio: "Digite seu nome.", negocio_inexistente: "Este site está fora do ar." };
  Z.erro = function (e) { var m = String((e && e.message) || e); for (var k in ERROS) if (m.indexOf(k) >= 0) return ERROS[k]; return "Não deu para salvar agora. Confira a internet e tente de novo."; };
  var conv = function (l) { return (l || []).map(function (o) { return { p: o.profissional || "", a: Date.parse(o.inicio), b: Date.parse(o.fim) }; }); };
  Z.busy = conv(Z.ocupados);
  var hoje = function () { var d = new Date(Date.now() - 3 * 3600e3); return d.toISOString().slice(0, 10); };
  Z.refresh = function () { return Z.rpc("zv_ocupados", { p_slug: Z.slug, p_de: hoje(), p_dias: 62 }).then(function (l) { Z.busy = conv(l); }).catch(function () {}); };
  var ts = function (dia, hora) { return Date.parse(dia + "T" + hora + ":00-03:00"); };
  var profsDe = function () { try { return (CONFIG.profissionais || []).map(function (p) { return typeof p === "string" ? p : p.nome; }); } catch (e) { return []; } };
  var cap = function () { try { return CONFIG.capacidade || 1; } catch (e) { return 1; } };
  /* um horário está livre se algum profissional possível não tem nada nele */
  Z.livre = function (dia, hora, minutos, prof) {
    var a = ts(dia, hora), b = a + minutos * 60000, c = cap();
    var ocupado = function (p) { var n = 0; for (var i = 0; i < Z.busy.length; i++) { var o = Z.busy[i]; if ((o.p === p || o.p === "") && o.a < b && o.b > a) n++; } return n >= c; };
    var ps = prof ? [prof] : profsDe(); if (!ps.length) ps = [""];
    for (var i = 0; i < ps.length; i++) if (!ocupado(ps[i])) return true;
    return false;
  };
  function ligarAgenda() {
    if (typeof slotsDisponiveis !== "function" || typeof order === "undefined") return;
    var origSlots = slotsDisponiveis;
    var dur = function () { try { return Math.max(duracaoTotal(), CONFIG.slotStep || 30); } catch (e) { return 30; } };
    slotsDisponiveis = function (k) { var l = origSlots(k); if (!k || !l.length) return l; var m = dur(); return l.filter(function (h) { return Z.livre(k, h, m, order.prof); }); };
    var origEnviar = enviar;
    enviar = function () {
      var f = faltando(); if (f) { toast(f); return; }
      var sh = typeof semHorario === "function" && semHorario();
      var servicos = cart.map(function (l) { return { id: l.id, nome: l.nome, qty: l.qty || 1, dur: l.dur || 0 }; });
      var w = window.open("", "_blank");
      var depois = function () { var o = window.open; window.open = function (u) { if (w && !w.closed) { w.location = u; return w; } return o.apply(window, arguments); }; try { origEnviar(); } finally { window.open = o; } };
      var falhou = function (e) { if (w) w.close(); toast(Z.erro(e)); Z.refresh().then(function () { if (typeof renderCart === "function") renderCart(); if (typeof render === "function") render(); }); };
      if (sh) { Z.rpc("zv_novo_pedido", { p_slug: Z.slug, p_nome: order.nome, p_whatsapp: order.tel, p_itens: servicos, p_total: total(), p_pagamento: null, p_entrega: "Orçamento / sem horário", p_detalhes: { extra: order.extra } }).then(depois).catch(falhou); return; }
      var modoDia = !!CONFIG.modoDia, hora = modoDia ? "08:00" : order.hora, min = modoDia ? 600 : dur();
      Z.rpc("zv_agendar", { p_slug: Z.slug, p_inicio: new Date(ts(order.data, hora)).toISOString(), p_minutos: min, p_prof: order.prof || "", p_nome: order.nome, p_whatsapp: order.tel,
        p_servicos: servicos, p_total: total(), p_obs: null, p_detalhes: { extra: order.extra, cupom: order.cupom || null } })
        .then(function (r) { if (r && r.profissional && !order.prof && profsDe().length) order.prof = r.profissional; Z.refresh(); depois(); }).catch(falhou);
    };
    if (typeof render === "function") render();
  }
  function ligarPedido() {
    if (typeof enviar !== "function" || typeof cart === "undefined" || typeof slotsDisponiveis === "function") return;
    var origEnviar = enviar;
    enviar = function () {
      var f = faltando(); if (f) { toast(f); return; }
      var itens = cart.map(function (l) { return { id: l.id, nome: l.nome, qty: l.qty, precoUnit: l.precoUnit, cfg: l.cfg || null, obs: l.obs || null, un: l.un || null }; });
      var m = typeof modo === "function" ? modo() : null, ent = m ? (m.label || m.msg || "") : "";
      if (m && m.form === "endereco" && order.end) ent += ": " + [order.end.rua, order.end.num, order.end.comp, order.end.bairro].filter(Boolean).join(", ");
      var corpo = { p_slug: Z.slug, p_nome: order.nome, p_whatsapp: order.tel, p_itens: itens, p_total: total(), p_pagamento: order.pag || null, p_entrega: ent,
        p_detalhes: { tipo: order.tipo, end: order.end || null, extra: order.extra, troco: order.troco || null, cupom: order.cupom || null, ref: order.end && order.end.ref || null } };
      origEnviar();
      Z.rpc("zv_novo_pedido", corpo).catch(function () { /* o pedido já foi pelo WhatsApp */ });
    };
  }
  /* reservas: datas e horários já reservados entram como ocupados antes do site montar o calendário */
  if (Z.tipo === "reserva") { window.DADOS = window.DADOS || {}; DADOS.config = DADOS.config || {}; DADOS.config.ocupado = (Z.ocupReserva || []).slice(); }
  function ligarReserva() {
    if (typeof enviar !== "function" || typeof res === "undefined" || typeof unidadesSel !== "function") return;
    var origEnviar = enviar;
    var hh = function (m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); };
    var mais1 = function (k) { return addDia(k, 1); };
    enviar = function () {
      var f = faltando(); if (f) { toast(f); return; }
      var us = unidadesSel(), multi = !!CONFIG.multi, ini, fim, ocup = [];
      if (M === "noites") { ini = res.ini + "T14:00:00-03:00"; fim = res.fim + "T12:00:00-03:00"; us.forEach(function (x) { for (var i = 0; i < x.q; i++) ocup.push({ u: x.u.id, de: res.ini, ate: res.fim }); }); }
      else if (M === "horas") { var h0 = res.hora, h1 = res.hora + res.dur * 60; ini = res.ini + "T" + hh(h0) + ":00-03:00"; fim = new Date(Date.parse(ini) + res.dur * 3600e3).toISOString(); us.forEach(function (x) { ocup.push({ u: x.u.id, data: res.ini, de: hh(h0), ate: hh(h1) }); }); }
      else { var ds = diasLista(), ult = ds[ds.length - 1]; ini = ds[0] + "T00:00:00-03:00"; fim = mais1(ult) + "T00:00:00-03:00";
        us.forEach(function (x) { if (multi) ds.forEach(function (k) { ocup.push({ u: x.u.id, data: k, q: x.q }); }); else ocup.push({ u: x.u.id, de: ds[0], ate: ult }); }); }
      var itens = us.map(function (x) { return { u: x.u.id, q: x.q, estoque: estoque(x.u), nome: x.u.n }; });
      var w = window.open("", "_blank");
      Z.rpc("zv_reservar", { p_slug: Z.slug, p_itens: itens, p_inicio: new Date(ini).toISOString(), p_fim: new Date(fim).toISOString(), p_nome: res.nome, p_whatsapp: res.tel, p_total: total(),
          p_detalhes: { ocup: ocup, servicos: us.map(function (x) { return { id: x.u.id, nome: x.u.n, qty: x.q }; }), modo: M, pessoas: res.pessoas, extra: res.extra, adicionais: res.adic } })
        .then(function () { ocup.forEach(function (o) { OCUP.push(o); });
          var o = window.open; window.open = function (u) { if (w && !w.closed) { w.location = u; return w; } return o.apply(window, arguments); }; try { origEnviar(); } finally { window.open = o; } })
        .catch(function (e) { if (w) w.close(); toast(/indisponivel/.test(String(e.message)) ? "Essa data acabou de ser reservada. Escolha outra." : Z.erro(e));
          Z.rpc("zv_reservas_ocupadas", { p_slug: Z.slug }).then(function (l) { OCUP.length = 0; (l || []).forEach(function (x) { x = (x && x.zv_reservas_ocupadas) || x; if (x) OCUP.push(x); }); if (typeof render === "function") render(); }).catch(function () {}); });
    };
  }
  document.addEventListener("DOMContentLoaded", function () { if (Z.tipo === "reserva") ligarReserva(); if (Z.tipo === "agenda") ligarAgenda(); else if (Z.tipo === "pedido") ligarPedido(); });
})();
