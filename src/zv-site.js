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
    muitos_pedidos: "Muitos pedidos em pouco tempo. Fale com a loja pelo WhatsApp.", indisponivel: "Essa data acabou de ser reservada. Escolha outra.", datas_invalidas: "Confira as datas.", nome_obrigatorio: "Digite seu nome.", negocio_inexistente: "Este site está fora do ar.", muitos_agendamentos: "Muitos agendamentos em pouco tempo. Tente de novo em alguns minutos.", itens_demais: "Pedido grande demais. Divida em dois.", pedido_grande_demais: "Pedido grande demais. Divida em dois." };
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
        p_detalhes: { tipo: order.tipo, end: order.end || null, extra: order.extra, troco: order.troco || null, cupom: order.cupom || null, ref: order.end && order.end.ref || null, taxa: typeof taxaEntrega === "function" ? taxaEntrega() : null } };
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
  /* "Leve junto" aprendido: o que os clientes deste negócio mais levam com os itens do carrinho.
     Sem vendas suficientes, fica a sugestão fixa do modelo. */
  function ligarCombos() {
    var C = Z.combos || {}; if (!Object.keys(C).length || typeof cart === "undefined" || typeof ALL === "undefined") return;
    var aprendidos = function (base, fora) {
      var sc = {}, motivo = {};
      base.forEach(function (id) { (C[id] || []).forEach(function (p) { var b = p[0], pc = +p[1] || 0;
        if (!ALL[b] || ALL[b].consulta || fora.indexOf(b) >= 0) return; if (!(b in sc) || pc > sc[b]) { sc[b] = pc; motivo[b] = id; } }); });
      return Object.keys(sc).sort(function (x, y) { return sc[y] - sc[x]; }).slice(0, 4).map(function (b) { return { id: b, pc: sc[b], de: motivo[b] }; });
    };
    var nomeDe = function (id) { return ALL[id] ? ALL[id].n : ""; }, V = Z.tipo === "agenda" ? ["faz", "faz"] : ["pede", "leva"];
    var botao = typeof chip === "function" ? function (i) { return chip(i); }
      : function (i) { var x = ALL[i]; return '<button class="sug-chip" onclick="addServ(\'' + i + '\')">+ ' + x.n + (typeof precoTxt === "function" ? " <b>" + precoTxt(x) + "</b>" : "") + "</button>"; };
    var bloco = function (lista, titulo) {
      return '<div class="suggest"><b>' + titulo + '</b><div class="sug-row">' + lista.map(function (s) { return botao(s.id); }).join("") + "</div>" +
        '<small style="display:block;margin-top:6px;opacity:.7">' + lista[0].pc + "% de quem " + V[0] + " " + nomeDe(lista[0].de) + " também " + V[1] + " " + nomeDe(lista[0].id) + "</small></div>";
    };
    if (typeof suggestBlock === "function") {
      var origSug = suggestBlock;
      suggestBlock = function () {
        try { if (CONFIG.unico) return origSug(); var ids = cart.map(function (l) { return l.id; }), l = aprendidos(ids, ids);
          return l.length ? bloco(l, Z.tipo === "agenda" ? "Quem faz isso também faz" : "Quem pede isso também leva") : origSug(); } catch (e) { return origSug(); }
      };
    }
    if (typeof leveJunto === "function") {
      var origLeve = leveJunto;
      leveJunto = function () {
        try { var id = modal.item.id, l = aprendidos([id], [id].concat(cart.map(function (x) { return x.id; })));
          if (!l.length) return origLeve();
          return '<div class="opt-group"><label>' + (Z.tipo === "agenda" ? "Quem faz este também faz" : "Quem pede este também leva") + '</label><div class="sug-row">' + l.slice(0, 3).map(function (s) { return botao(s.id); }).join("") + "</div></div>"; } catch (e) { return origLeve(); }
      };
    }
  }
  /* QR code na mesa (?mesa=código): o carrinho manda direto para a cozinha, sem WhatsApp, e aparece a barra
     com Chamar garçom e Conta. Pagamento é no fim, ao pedir a conta (Pix na hora, se a loja tiver chave). */
  function ligarMesa() {
    var q = (location.search.match(/[?&]mesa=([a-f0-9]{16,64})/i) || [])[1];
    if (!q || Z.tipo !== "pedido" || typeof cart === "undefined" || typeof renderCart !== "function") return;
    var M = null, ocupado = false, h = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
    var din = function (v) { return typeof brl === "function" ? brl(v) : "R$ " + (+v).toFixed(2).replace(".", ","); };
    var un = function (r) { return (r && r.zv_mesa_qr) || r; };
    var css = document.createElement("style");
    css.textContent = ".zv-mesa{position:fixed;left:0;right:0;bottom:0;z-index:70;display:flex;align-items:center;gap:8px;padding:10px max(12px,env(safe-area-inset-left)) calc(10px + env(safe-area-inset-bottom));" +
      "background:var(--paper,#fff);color:var(--ink,#111);border-top:1px solid var(--line,rgba(0,0,0,.12));box-shadow:0 -8px 24px rgba(0,0,0,.12);font-family:inherit}" +
      ".zv-mesa .zm-t{flex:1;min-width:0;line-height:1.15}.zv-mesa .zm-t small{display:block;font-size:12px;opacity:.65}.zv-mesa .zm-t b{font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}" +
      ".zv-mesa button{min-height:46px;padding:0 14px;border-radius:12px;font:inherit;font-weight:700;font-size:14.5px;border:1px solid var(--line,rgba(0,0,0,.15));background:transparent;color:inherit;cursor:pointer}" +
      ".zv-mesa button.pri{background:var(--c2);color:var(--c2ink,#111);border-color:transparent}.zv-mesa button[disabled]{opacity:.6;cursor:default}" +
      ".zv-mesa button:focus-visible{outline:3px solid var(--c2);outline-offset:2px}" +
      "body.zv-na-mesa{padding-bottom:calc(76px + env(safe-area-inset-bottom))}body.zv-na-mesa .fab{bottom:calc(80px + env(safe-area-inset-bottom))}" +
      "body.zv-na-mesa .wa-float,body.zv-na-mesa .zap-float{display:none}" +
      ".zm-lin{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px dashed var(--line,rgba(0,0,0,.12));font-size:15px}.zm-lin small{opacity:.65}" +
      ".zm-ped{font-size:12.5px;opacity:.65;margin:14px 0 2px}.zm-ped:first-child{margin-top:0}";
    document.head.appendChild(css);
    var bar = document.createElement("div"); bar.className = "zv-mesa"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Sua mesa");
    var pinta = function () {
      var ch = (M && M.chamados) || [];
      bar.innerHTML = '<div class="zm-t"><small>Você está na</small><b>' + h(M ? M.mesa : "mesa") + "</b></div>" +
        '<button id="zmGar" ' + (ch.indexOf("garcom") >= 0 ? "disabled" : "") + ">" + (ch.indexOf("garcom") >= 0 ? "Garçom a caminho" : "Chamar garçom") + "</button>" +
        '<button class="pri" id="zmConta">' + (ch.indexOf("conta") >= 0 ? "Conta pedida" : "Conta") + "</button>";
      bar.querySelector("#zmGar").onclick = chamarGarcom; bar.querySelector("#zmConta").onclick = abrirConta;
    };
    var atualizar = function () { return Z.rpc("zv_mesa_qr", { p_qr: q }).then(function (r) { r = un(r); if (r && r.mesa) { M = r; pinta(); } return M; }); };
    var totalConta = function () { return ((M && M.conta) || []).reduce(function (s, p) { return s + (+p.total || 0); }, 0); };
    function chamarGarcom() {
      if (ocupado) return; ocupado = true;
      Z.rpc("zv_mesa_chamar", { p_qr: q, p_tipo: "garcom", p_detalhe: null })
        .then(function () { toast("Chamamos o garçom. Ele já vem até a " + M.mesa + "."); return atualizar(); })
        .catch(function (e) { toast(/muitos/.test(e.message) ? "Já avisamos o garçom. Aguarde um instante." : Z.erro(e)); })
        .then(function () { ocupado = false; });
    }
    var pag = null;
    function abrirConta() {
      atualizar().catch(function () {}).then(function () {
        var L = (M && M.conta) || [], pedida = ((M && M.chamados) || []).indexOf("conta") >= 0;
        document.getElementById("shTitle").textContent = "Conta da " + M.mesa;
        var body = document.getElementById("shBody"), foot = document.getElementById("shFoot");
        body.innerHTML = L.length ? L.map(function (p) {
          return '<div class="zm-ped">Pedido nº ' + p.numero + ", " + new Date(p.em).toTimeString().slice(0, 5) + "</div>" + (p.itens || []).map(function (i) {
            return '<div class="zm-lin"><span>' + h(i.qty) + "× " + h(i.nome) + (i.cfg ? " <small>(" + h(i.cfg) + ")</small>" : "") + "</span><span>" + din((+i.precoUnit || 0) * (+i.qty || 0)) + "</span></div>"; }).join(""); }).join("")
          : '<div class="empty">Nada pedido por aqui ainda.<br>Escolha no cardápio e peça direto desta mesa.</div>';
        var ops = ["Pix", "Cartão", "Dinheiro"], temPix = typeof CONFIG !== "undefined" && CONFIG.pix && CONFIG.pix.chave && !/SUA_CHAVE/i.test(CONFIG.pix.chave);
        foot.innerHTML = '<div class="totrow"><span style="font-weight:600">Total da mesa</span><span class="tv">' + din(totalConta()) + "</span></div>" +
          (pedida ? '<div class="hint" style="margin-top:10px">Pedimos a conta' + (pag ? " (" + h(pag) + ")" : "") + ". O garçom já traz.</div>" : "") +
          (L.length ? '<div class="field" style="margin-top:14px"><label>Como vai pagar?</label><div class="opts" style="grid-template-columns:repeat(3,1fr)">' +
            ops.map(function (o) { return '<button class="o2 center ' + (pag === o ? "sel" : "") + '" data-p="' + o + '">' + o + "</button>"; }).join("") + "</div></div>" +
            '<button class="send" id="zmPedeConta"' + (pag ? "" : " disabled") + ">" + (pedida ? "Avisar de novo" : "Pedir a conta") + "</button>" +
            (temPix && pag === "Pix" ? '<button class="send" id="zmPix" style="margin-top:8px;background:transparent;color:inherit;border:1px solid var(--line)">Pagar com Pix agora</button>' : "") : "");
        foot.querySelectorAll("[data-p]").forEach(function (b) { b.onclick = function () { pag = b.dataset.p; abrirConta(); }; });
        var bc = foot.querySelector("#zmPedeConta"); if (bc) bc.onclick = function () { bc.disabled = true;
          Z.rpc("zv_mesa_chamar", { p_qr: q, p_tipo: "conta", p_detalhe: pag }).then(function () { toast("Conta pedida. O garçom já traz."); return atualizar(); })
            .then(function () { closeAll(); }).catch(function (e) { bc.disabled = false; toast(Z.erro(e)); }); };
        var bp = foot.querySelector("#zmPix"); if (bp) bp.onclick = function () {
          Z.rpc("zv_mesa_chamar", { p_qr: q, p_tipo: "conta", p_detalhe: "Pix" }).catch(function () {}).then(atualizar);
          showConfirm({ num: "M" + Date.now().toString(36).slice(-5).toUpperCase(), titulo: "Pix da " + M.mesa, sub: "Pague o total da mesa e mostre o comprovante ao garçom.", valorPix: totalConta(), pixTitulo: "Total da mesa", passos: [], waUrl: "" });
          var a = document.querySelector("#conf a.conf-btn"); if (a) a.remove(); };
        openSheet("mesa");
      });
    }
    /* carrinho da mesa: sem entrega, sem WhatsApp, nome opcional (só depois que o código da mesa confere) */
    function trocarCarrinho() {
    total = function () { return Math.max(0, subtotal() - descontoCupom()); };
    faltando = function () { return ""; };
    var origRender = renderCart;
    renderCart = function () {
      origRender(); if (!M || !cart.length) return;
      document.getElementById("shTitle").textContent = "Pedido da " + M.mesa;
      document.getElementById("shFoot").innerHTML =
        '<div class="field"><label>Seu nome <small>opcional</small></label><input class="txt" id="zmNome" placeholder="Para o garçom saber de quem é" value="' + h(order.nome) + '"></div>' +
        '<div class="field"><label>Observação <small>opcional</small></label><input class="txt" id="zmObs" placeholder="Ex.: sem cebola, trazer junto com a bebida" value="' + h(Z.mesaObs || "") + '"></div>' +
        '<div style="margin-top:16px"><div class="totrow"><span style="font-weight:600">Total</span><span class="tv">' + din(total()) + "</span></div></div>" +
        '<button class="send" id="sendBtn">Pedir na ' + h(M.mesa) + "</button>" +
        '<div class="hint">O pedido vai direto para a cozinha. Você paga no fim, quando pedir a conta.</div>';
      document.getElementById("zmNome").oninput = function () { order.nome = this.value; };
      document.getElementById("zmObs").oninput = function () { Z.mesaObs = this.value; };
      document.getElementById("sendBtn").onclick = enviar;
    };
    enviar = function () {
      if (!M || ocupado || !cart.length) return; ocupado = true;
      var b = document.getElementById("sendBtn"); if (b) { b.disabled = true; b.textContent = "Enviando…"; }
      var itens = cart.map(function (l) { return { id: l.id, nome: l.nome, qty: l.qty, precoUnit: l.precoUnit, cfg: l.cfg || null, obs: l.obs || null, un: l.un || null }; });
      Z.rpc("zv_mesa_pedir", { p_qr: q, p_itens: itens, p_total: total(), p_nome: (order.nome || "").trim() || null, p_obs: (Z.mesaObs || "").trim() || null })
        .then(function (num) { num = (num && num.zv_mesa_pedir) || num; ocupado = false; Z.mesaObs = "";
          showConfirm({ num: num, titulo: "Pedido nº " + num + " na cozinha", sub: "Já estamos preparando. Quer mais alguma coisa? É só pedir de novo por aqui.",
            valorPix: 0, passos: [["Pedido feito, " + new Date().toTimeString().slice(0, 5), true], ["Em preparo", false], ["Chega na " + M.mesa, false]], waUrl: "", depois: "Voltar ao cardápio" });
          var a = document.querySelector("#conf a.conf-btn"); if (a) a.remove();
          cart = []; onCartChange(); atualizar().catch(function () {}); })
        .catch(function (e) { ocupado = false; if (b) { b.disabled = false; b.textContent = "Pedir na " + M.mesa; }
          toast(/mesa_invalida/.test(e.message) ? "Este QR não vale mais. Peça um novo ao garçom." : Z.erro(e)); });
    };
    }
    atualizar().then(function (r) {
      if (!r) return; trocarCarrinho(); document.body.appendChild(bar); document.body.classList.add("zv-na-mesa");
      setInterval(function () { if (!document.hidden) atualizar().catch(function () {}); }, 20000);
    }).catch(function (e) { if (/mesa_invalida/.test(String(e.message))) toast("Este QR de mesa não vale mais. Peça um novo ao garçom."); });
  }
  document.addEventListener("DOMContentLoaded", function () { ligarCombos(); ligarMesa(); });
  document.addEventListener("DOMContentLoaded", function () { if (Z.tipo === "reserva") ligarReserva(); if (Z.tipo === "agenda") ligarAgenda(); else if (Z.tipo === "pedido") ligarPedido(); });
})();
