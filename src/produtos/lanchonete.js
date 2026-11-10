/* ===== Zivoop Lanchonete: o que é só da lanchonete no painel =====
   Cozinha (fila na ordem de chegada), Entregas (motoboys, taxa por bairro e acerto do dia),
   Estoque por receita (insumos + quanto vai em cada lanche, custo e lucro), Contas a pagar e Fidelidade.
   Este arquivo entra antes do painel; as funções usam o que o painel define (sb, NEG, $, brl…) na hora em que rodam. */
window.ZV_PRODUTO = "lanchonete";
window.ZV_ONB = { t: "Vamos colocar sua lanchonete no ar", p: "Diga o nome e o WhatsApp que recebe os pedidos. O cardápio já vem pronto, com lanches, hot dog, pastéis, porções e combos. Você troca nomes, preços e fotos depois, aqui no painel." };
window.ZV_IC = {
  cozinha: '<path d="M5 12h14v8H5zM3 12h18M8 8c0-1.5 1-1.5 1-3M12 8c0-1.5 1-1.5 1-3M16 8c0-1.5 1-1.5 1-3"/>',
  entregas: '<path d="M2 7h12v9H2zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  contas: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>'
};
window.ZV_CURTAS = ["inicio", "pedidos", "cozinha", "entregas"];
window.zvAbas = a => {
  const i = a.findIndex(x => x[0] === "pedidos"); if (i >= 0) a.splice(i + 1, 0, ["cozinha", "Cozinha"], ["entregas", "Entregas"]);
  const e = a.find(x => x[0] === "estoque"); if (e) e[1] = "Estoque e receitas";
  const f = a.findIndex(x => x[0] === "financeiro"); if (f >= 0) a.splice(f + 1, 0, ["contas", "Contas a pagar"]);
  return a; };
window.ZV_TELAS = { cozinha: () => telaCozinha(), entregas: () => telaEntregas(), contas: () => telaContas(), clientes: () => telaClientesLanch(), estoque: () => telaEstoqueLanch() };
document.querySelectorAll(".logo").forEach(l => { if (!l.querySelector(".prod")) l.insertAdjacentHTML("beforeend", ' <span class="prod">Lanchonete</span>'); });
(() => { const s = document.createElement("style"); s.textContent = `
.logo .prod{font-weight:600;opacity:.65}
.coz{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(270px,1fr))}
.coz-c{background:var(--card);border:1px solid var(--line);border-top:6px solid var(--ok,#19B37A);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px}
.coz-c.am{border-top-color:#F2A33A}.coz-c.no{border-top-color:#E5484D}
.coz-h{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.coz-h b{font-size:30px;font-weight:850;letter-spacing:-.02em}
.coz-t{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}.coz-c.am .coz-t{color:var(--am-ink)}.coz-c.no .coz-t{color:var(--no-ink)}
.coz-c ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}.coz-c li{font-size:17px;line-height:1.3}.coz-c li b{font-size:19px;margin-right:4px}
.coz-c li small{display:block;font-size:14px;color:var(--ink2)}.coz-c li small.sem{color:var(--no-ink);font-weight:700}
.coz-obs{background:rgba(242,163,58,.14);border-radius:10px;padding:8px 10px;font-size:15px;font-weight:650}
.coz-c .b{min-height:52px;font-size:17px;margin-top:auto}
body.coz-cheia .side,body.coz-cheia .tabbar,body.coz-cheia .top .acts .b:not(.coz-sai){display:none!important}body.coz-cheia main{margin:0!important;max-width:none!important}
.ent{display:grid;gap:10px}.ent-c{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:grid;gap:8px}
.ent-c .lin{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap}.ent-c .end{font-size:15px}
.ent-c .acs{display:flex;gap:8px;flex-wrap:wrap}.ent-c select{min-width:150px}
.cont .r.venc b.v{color:var(--no-ink)}.cont .r.logo2 b.v{color:var(--am-ink)}
.rec{display:grid;gap:10px}@media (min-width:1200px){.rec{grid-template-columns:1fr 1fr}}.rec-c{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.rec-c .cab{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline}.rec-c .ln{display:grid;grid-template-columns:1fr 90px 36px;gap:6px;align-items:center;margin-top:6px}
.marg{font-weight:800}.marg.ok{color:var(--ok-ink)}.marg.am{color:var(--am-ink)}.marg.no{color:var(--no-ink)}
.fid{display:grid;gap:8px}.selos{display:flex;gap:3px;flex-wrap:wrap}.selos i{width:12px;height:12px;border-radius:50%;background:rgb(var(--inkrgb) / .12)}.selos i.on{background:var(--cobalt)}
`; document.head.appendChild(s); })();

/* ---------------- cozinha ---------------- */
const minDe = t => Math.max(0, Math.floor((Date.now() - new Date(t)) / 60000));
function cardCoz(p) { const m = minDe(p.criado_em), cls = m >= 20 ? "no" : m >= 12 ? "am" : "", d = p.detalhes || {};
  const onde = d.mesa ? "Mesa " + esc(d.mesa) : /entreg/i.test(p.entrega || "") || (d.end && d.end.rua) ? "Entrega" : /retir|balc/i.test(p.entrega || "") ? "Retirada" : esc(p.entrega || "Balcão");
  return `<article class="coz-c ${cls}"><div class="coz-h"><b>#${p.numero}</b><span class="coz-t" title="Tempo desde que o pedido chegou">${m} min</span></div>
    <div class="muted" style="font-weight:700">${onde} · ${esc(p.nome)}</div>
    <ul>${(p.itens || []).map(i => `<li><b>${i.qty || 1}×</b>${esc(i.nome || i.n)}${i.cfg ? String(i.cfg).split(/,\s*/).map(x => `<small class="${/^sem /i.test(x.trim()) ? "sem" : ""}">${esc(x)}</small>`).join("") : ""}${i.obs ? `<small class="sem">${esc(i.obs)}</small>` : ""}</li>`).join("")}</ul>
    ${d.obs ? `<div class="coz-obs">${esc(d.obs)}</div>` : ""}
    ${p.etapa === "novo" ? `<button class="b sec" onclick="cozMover('${p.id}','preparo')">Começar</button>` : `<button class="b pri" onclick="cozMover('${p.id}','pronto')">Pronto</button>`}</article>`; }
async function telaCozinha() { const m = $("main");
  const { data, error } = await sb.from("zv_pedidos").select("*").eq("negocio", NEG.id).in("etapa", ["novo", "preparo"]).order("criado_em").limit(80);
  if (TAB !== "cozinha") return; if (error) { m.innerHTML = topo("Cozinha") + `<div class="card vazio">${esc(erro(error))}</div>`; return; }
  const P = data || [], cheia = document.body.classList.contains("coz-cheia");
  m.innerHTML = topo("Cozinha", `<button class="b sec sm coz-sai" onclick="cozCheia()">${cheia ? "Sair da tela cheia" : "Tela cheia"}</button>`) +
    (cheia ? "" : `<p class="muted" style="margin:-8px 0 14px;font-size:14px">Os pedidos ficam na ordem em que chegaram. Toque em “Começar” quando for para a chapa e em “Pronto” quando sair. O tempo fica amarelo com 12 minutos e vermelho com 20.</p>`) +
    (P.length ? `<div class="coz">${P.map(cardCoz).join("")}</div>` : `<div class="card vazio">Nenhum pedido na fila. Quando chegar um, ele aparece aqui sozinho, com aviso sonoro.</div>`);
  clearInterval(salaoT); salaoT = setInterval(() => { if (TAB === "cozinha") telaCozinha(); else clearInterval(salaoT); }, 12000); }
async function cozMover(id, etapa) { const { error } = await sb.from("zv_pedidos").update({ etapa }).eq("id", id); if (error) return toast(erro(error)); telaCozinha(); }
function cozCheia() { const on = document.body.classList.toggle("coz-cheia");
  try { if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); else if (!on && document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
  telaCozinha(); }
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("coz-cheia")) { document.body.classList.remove("coz-cheia"); if (TAB === "cozinha") telaCozinha(); } });

/* ---------------- entregas ---------------- */
const motoboys = () => (NEG.dados && NEG.dados.motoboys) || [];
const ehEntrega = p => { const d = p.detalhes || {}; return !!(d.end && (d.end.rua || d.end.bairro)) || /entreg/i.test(p.entrega || ""); };
function taxaDe(p) { const d = p.detalhes || {}; if (d.taxa != null) return Number(d.taxa) || 0;
  const e = (cfg().entregas || []).find(x => x.bairros), b = e && d.end ? e.bairros.find(x => x.n === d.end.bairro) : null; return b && b.taxa ? Number(b.taxa) : 0; }
const endTxt = d => d && d.end ? [[d.end.rua, d.end.num].filter(Boolean).join(", "), d.end.bairro, d.end.comp].filter(Boolean).join(" · ") : "";
let ENT = [];
async function telaEntregas() { const m = $("main"), ini = new Date(); ini.setHours(0, 0, 0, 0);
  const [a, h] = await Promise.all([sb.from("zv_pedidos").select("*").eq("negocio", NEG.id).in("etapa", ["novo", "preparo", "pronto"]).order("criado_em").limit(150),
    sb.from("zv_pedidos").select("*").eq("negocio", NEG.id).eq("etapa", "entregue").gte("atualizado_em", ini.toISOString()).limit(600)]);
  if (TAB !== "entregas") return;
  ENT = (a.data || []).filter(ehEntrega); const feitas = (h.data || []).filter(ehEntrega), MB = motoboys();
  const acerto = {}; feitas.forEach(p => { const d = p.detalhes || {}, k = d.motoboy || "Sem motoboy"; const x = acerto[k] = acerto[k] || { n: 0, taxa: 0, din: 0 };
    x.n++; x.taxa += taxaDe(p); if (/dinheiro/i.test(p.pagamento || "")) x.din += Number(p.total) || 0; });
  const card = p => { const d = p.detalhes || {}, saiu = !!d.saiu_em;
    return `<div class="ent-c"><div class="lin"><b>#${p.numero} · ${esc(p.nome)}</b>${saiu ? `<span class="pill bl">Saiu ${desde(d.saiu_em)}${d.motoboy ? " com " + esc(d.motoboy) : ""}</span>` : p.etapa === "pronto" ? `<span class="pill ok">Pronto para sair</span>` : `<span class="pill am">Na cozinha</span>`}</div>
      <div class="end">${esc(endTxt(d)) || '<span class="muted">Sem endereço</span>'}${d.ref ? `<br><span class="muted">Referência: ${esc(d.ref)}</span>` : ""}</div>
      <div class="lin muted" style="font-size:14px"><span>${brl(p.total)} · ${esc(p.pagamento || "")}${d.troco ? " · troco para " + esc(d.troco) : ""}</span><span>Taxa ${brl(taxaDe(p))}</span></div>
      <div class="acs">${saiu ? `<button class="b pri sm" onclick="entEntregue('${p.id}')">Entregue</button>${d.motoboy ? zapMoto(p) : ""}`
        : `<select class="t" id="mb-${p.id}" aria-label="Motoboy do pedido ${p.numero}"><option value="">Motoboy…</option>${MB.map(x => `<option ${d.motoboy === x.nome ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select><button class="b pri sm" onclick="entSaiu('${p.id}')">Saiu para entrega</button>`}
        ${p.whatsapp ? `<a class="b sec sm" target="_blank" rel="noopener" href="${zapLink(p.whatsapp, saiu ? `Olá, ${p.nome}! Seu pedido nº ${p.numero} saiu para entrega${d.motoboy ? " com o " + d.motoboy : ""}.` : `Olá, ${p.nome}! Recebemos seu pedido nº ${p.numero}.`)}">Avisar cliente</a>` : ""}</div></div>`; };
  const bairros = ((cfg().entregas || []).find(x => x.bairros) || {}).bairros || [];
  m.innerHTML = topo("Entregas", `<button class="b sec sm" onclick="editarMotoboys()">Motoboys</button><button class="b sec sm" onclick="editarBairros()">Taxa por bairro</button>`) +
    `<p class="muted" style="margin:-8px 0 14px;font-size:14px">Escolha o motoboy, toque em “Saiu para entrega” e mande o endereço para ele pelo WhatsApp. No fim do dia, o acerto de cada motoboy aparece embaixo.</p>` +
    `<div class="cols2"><div><div class="ent">${ENT.length ? ENT.map(card).join("") : `<div class="card vazio">Nenhuma entrega agora.</div>`}</div></div>
     <div class="card"><h2>Acerto de hoje</h2><div class="lst">${Object.keys(acerto).length ? Object.entries(acerto).map(([k, x]) => `<div class="r"><span><b>${esc(k)}</b><br><span class="muted" style="font-size:12.5px">${x.n} ${x.n === 1 ? "entrega" : "entregas"}${x.din ? " · recebeu " + brl(x.din) + " em dinheiro" : ""}</span></span><b title="Total das taxas de entrega">${brl(x.taxa)}</b></div>`).join("") : '<p class="vazio">As entregas feitas hoje aparecem aqui.</p>'}</div>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">O valor à direita é a soma das taxas de entrega. ${MB.length ? "" : "Cadastre seus motoboys no botão “Motoboys”."}</p>
      ${bairros.length ? `<h2 style="margin-top:16px">Taxa por bairro</h2><div class="lst">${bairros.map(b => `<div class="r"><span>${esc(b.n)}</span><b>${b.taxa == null ? "a combinar" : b.taxa ? brl(b.taxa) : "grátis"}</b></div>`).join("")}</div>` : ""}</div></div>`;
  clearInterval(salaoT); salaoT = setInterval(() => { if (TAB === "entregas") telaEntregas(); else clearInterval(salaoT); }, 20000); }
function zapMoto(p) { const d = p.detalhes || {}, mb = motoboys().find(x => x.nome === d.motoboy); if (!mb || !mb.zap) return "";
  const t = `Entrega #${p.numero}\n${p.nome}${p.whatsapp ? " · " + p.whatsapp : ""}\n${endTxt(d)}${d.ref ? "\nReferência: " + d.ref : ""}\nCobrar: ${brl(p.total)} (${p.pagamento || ""}${d.troco ? ", troco para " + d.troco : ""})\nMapa: https://maps.google.com/?q=${encodeURIComponent(endTxt(d))}`;
  return `<a class="b sec sm" target="_blank" rel="noopener" href="${zapLink(mb.zap, t)}">Mandar para ${esc(mb.nome)}</a>`; }
async function entSaiu(id) { const p = ENT.find(x => x.id === id), mb = $("mb-" + id).value; if (!mb && motoboys().length) return toast("Escolha o motoboy.");
  const d = Object.assign({}, p.detalhes || {}, { motoboy: mb || null, saiu_em: new Date().toISOString() });
  const { error } = await sb.from("zv_pedidos").update({ detalhes: d, etapa: "pronto" }).eq("id", id); if (error) return toast(erro(error)); toast("Saiu para entrega."); telaEntregas(); }
async function entEntregue(id) { const p = ENT.find(x => x.id === id), d = Object.assign({}, p.detalhes || {}, { entregue_em: new Date().toISOString() });
  const { error } = await sb.from("zv_pedidos").update({ detalhes: d, etapa: "entregue" }).eq("id", id); if (error) return toast(erro(error)); toast("Entregue. Valor lançado no caixa."); telaEntregas(); }
function editarMotoboys() { const L = clone(motoboys());
  const linha = (x, i) => `<div class="grid2" style="margin-top:8px"><input class="t" id="mbN${i}" placeholder="Nome" value="${esc(x.nome || "")}"><input class="t" id="mbZ${i}" inputmode="tel" placeholder="WhatsApp" value="${esc(x.zap || "")}"></div>`;
  const desenha = () => abrirSheet(`<h2>Motoboys</h2><p class="muted" style="font-size:14px;margin:4px 0 6px">O WhatsApp serve para mandar o endereço da entrega com um toque. Deixe o nome em branco para tirar alguém.</p>${L.map(linha).join("")}
    <button class="b sec wide" style="margin-top:10px" id="mbMais">+ Motoboy</button><button class="b pri wide" style="margin-top:8px" id="mbOk">Salvar</button>`);
  const ler = () => L.forEach((x, i) => { x.nome = $("mbN" + i).value.trim(); x.zap = $("mbZ" + i).value.trim(); });
  const ligar = () => { $("mbMais").onclick = () => { ler(); L.push({ nome: "", zap: "" }); desenha(); ligar(); };
    $("mbOk").onclick = async () => { ler(); const ok = await salvarDados(d => { d.motoboys = L.filter(x => x.nome).slice(0, 30); }, "Motoboys salvos."); if (ok) { fecharSheet(); telaEntregas(); } }; };
  if (!L.length) L.push({ nome: "", zap: "" }); desenha(); ligar(); }
function editarBairros() { const ents = clone(cfg().entregas || []); let e = ents.find(x => x.bairros); if (!e) { e = ents.find(x => x.form === "endereco"); if (!e) return toast("Seu site não tem entrega ligada."); e.bairros = []; }
  const L = e.bairros;
  const linha = (b, i) => `<div style="display:grid;grid-template-columns:1fr 110px;gap:8px;margin-top:8px"><input class="t" id="bN${i}" placeholder="Bairro" value="${esc(b.n || "")}"><input class="t" id="bT${i}" inputmode="decimal" placeholder="a combinar" value="${b.taxa == null ? "" : String(b.taxa).replace(".", ",")}"></div>`;
  const desenha = () => abrirSheet(`<h2>Taxa por bairro</h2><p class="muted" style="font-size:14px;margin:4px 0 6px">No site, o cliente escolhe o bairro e a taxa entra sozinha no pedido. Taxa 0 é grátis; em branco fica “a combinar”. Deixe o bairro em branco para tirar.</p>${L.map(linha).join("")}
    <label class="f" style="margin-top:12px">Entrega grátis acima de (R$)<input class="t" id="bGr" inputmode="decimal" placeholder="não tem" value="${e.gratisAcima ? String(e.gratisAcima).replace(".", ",") : ""}"></label>
    <button class="b sec wide" style="margin-top:10px" id="bMais">+ Bairro</button><button class="b pri wide" style="margin-top:8px" id="bOk">Salvar e publicar</button>`);
  const ler = () => L.forEach((b, i) => { b.n = $("bN" + i).value.trim(); const v = $("bT" + i).value.trim(); b.taxa = v === "" ? null : num(v); });
  const ligar = () => { $("bMais").onclick = () => { ler(); L.push({ n: "", taxa: null }); desenha(); ligar(); };
    $("bOk").onclick = async () => { ler(); e.bairros = L.filter(b => b.n).slice(0, 80); const g = num($("bGr").value); if (g) e.gratisAcima = g; else delete e.gratisAcima;
      const ok = await salvarDados(d => { d.config = d.config || {}; d.config.entregas = ents; }, "Taxas salvas. Já estão no site."); if (ok) { fecharSheet(); telaEntregas(); } }; };
  if (!L.length) L.push({ n: "", taxa: null }); desenha(); ligar(); }

/* ---------------- clientes: fidelidade e quem sumiu ---------------- */
const fidCfg = () => Object.assign({ ativo: true, meta: 10, premio: "1 lanche" }, cfg().fidelidade || {});
async function telaClientesLanch() { await telaClientes(); if (TAB !== "clientes") return;
  const f = fidCfg(), meta = Math.max(2, parseInt(f.meta) || 10), C = CLI || [];
  const ganhou = f.ativo ? C.filter(c => Math.floor((c.selos || 0) / meta) > (c.premios_usados || 0)) : [];
  const perto = f.ativo ? C.filter(c => !ganhou.includes(c) && (c.selos || 0) % meta >= meta - 2 && (c.selos || 0) > 0).slice(0, 8) : [];
  const sumiu = C.filter(c => c.ultimo_em && (c.qtd || 0) >= 2 && Date.now() - new Date(c.ultimo_em) > 30 * 864e5).slice(0, 12);
  const selos = c => { const n = (c.selos || 0) - (c.premios_usados || 0) * meta, k = Math.max(0, Math.min(meta, n)); return `<span class="selos" aria-label="${k} de ${meta} selos">${Array.from({ length: meta }, (_, i) => `<i class="${i < k ? "on" : ""}"></i>`).join("")}</span>`; };
  const html = `<div class="cols2" style="margin-bottom:14px"><div class="card fid"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:0">Cartão fidelidade</h2><button class="b sec sm" onclick="editarFid()">${f.ativo ? "Ajustar" : "Ligar"}</button></div>
      <p class="muted" style="margin:0;font-size:14px">${f.ativo ? `A cada <b>${meta} pedidos entregues</b>, o cliente ganha <b>${esc(f.premio)}</b>. Os selos contam sozinhos.` : "Desligado. Ligue para premiar quem volta sempre."}</p>
      ${ganhou.length ? `<h3 style="margin:8px 0 0;font-size:15px">Ganharam o prêmio</h3><div class="lst">${ganhou.map(c => `<div class="r"><span><b>${esc(c.nome)}</b><br>${selos({ ...c, selos: meta })}</span><span style="display:flex;gap:6px">${c.whatsapp ? `<a class="b sec sm" target="_blank" rel="noopener" href="${zapLink(c.whatsapp, `Oi, ${c.nome.split(" ")[0]}! Você completou ${meta} pedidos no ${NEG.nome} e ganhou ${f.premio}. É só pedir e avisar que é o prêmio!`)}">Avisar</a>` : ""}<button class="b ok sm" onclick="deuPremio('${c.id}')">Dei o prêmio</button></span></div>`).join("")}</div>` : ""}
      ${perto.length ? `<h3 style="margin:8px 0 0;font-size:15px">Quase lá</h3><div class="lst">${perto.map(c => `<div class="r"><span>${esc(c.nome)}</span>${selos(c)}</div>`).join("")}</div>` : ""}</div>
    <div class="card"><h2>Sumiram há mais de 30 dias</h2>${sumiu.length ? `<div class="lst">${sumiu.map(c => `<div class="r"><span><b>${esc(c.nome)}</b><br><span class="muted" style="font-size:12.5px">${c.qtd} pedidos · último ${desde(c.ultimo_em)}</span></span>${c.whatsapp ? `<a class="b sec sm" target="_blank" rel="noopener" href="${zapLink(c.whatsapp, `Oi, ${c.nome.split(" ")[0]}! Faz tempo que você não pede no ${NEG.nome}. Que tal um lanche hoje?${Object.keys(cfg().cupons || {})[0] ? " Use o cupom " + Object.keys(cfg().cupons)[0] + " no site." : ""} ${siteURL()}`)}">Chamar de volta</a>` : ""}</div>`).join("")}</div>` : '<p class="vazio">Ninguém sumido. Quem pediu 2 vezes ou mais e parou aparece aqui.</p>'}</div></div>`;
  const topoEl = $("main").querySelector(".top + p"); if (topoEl) topoEl.insertAdjacentHTML("afterend", html); }
function editarFid() { const f = fidCfg(); abrirSheet(`<h2>Cartão fidelidade</h2><label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-weight:650"><input type="checkbox" id="fA" ${f.ativo ? "checked" : ""}> Ligado</label>
  <div class="grid2" style="margin-top:10px"><label class="f">Pedidos para ganhar<input class="t" id="fM" inputmode="numeric" value="${f.meta}"></label><label class="f">Prêmio<input class="t" id="fP" maxlength="60" value="${esc(f.premio)}"></label></div>
  <button class="b pri wide" style="margin-top:12px" onclick="salvarFid()">Salvar</button>`); }
async function salvarFid() { const meta = Math.min(50, Math.max(2, parseInt($("fM").value) || 10)), premio = $("fP").value.trim() || "1 lanche";
  const ok = await salvarDados(d => { d.config = d.config || {}; d.config.fidelidade = { ativo: $("fA").checked, meta, premio }; }, "Fidelidade salva."); if (ok) { fecharSheet(); telaClientesLanch(); } }
async function deuPremio(id) { const c = CLI.find(x => x.id === id); const { error } = await sb.from("zv_clientes").update({ premios_usados: (c.premios_usados || 0) + 1 }).eq("id", id);
  if (error) return toast(erro(error)); toast("Prêmio marcado como entregue."); telaClientesLanch(); }

/* ---------------- estoque por receita (ficha técnica) ---------------- */
// insumos ficam no estoque com o código "ins:<nome>"; a receita diz quanto de cada insumo vai em cada item do cardápio
const INS_PADRAO = [["Pão de hambúrguer", "un", .8], ["Hambúrguer 120g", "un", 2.6], ["Queijo muçarela", "fatia", .45], ["Presunto", "fatia", .35], ["Bacon", "g", .05], ["Ovo", "un", .7],
  ["Alface", "folha", .12], ["Tomate", "fatia", .2], ["Milho", "g", .02], ["Batata palha", "g", .04], ["Maionese da casa", "g", .02], ["Calabresa", "g", .04], ["Filé de frango", "un", 2.4],
  ["Pão de hot dog", "un", .7], ["Salsicha", "un", .55], ["Purê", "g", .02], ["Massa de pastel", "un", .6], ["Carne moída", "g", .04], ["Frango desfiado", "g", .035], ["Batata congelada", "g", .02],
  ["Refri lata", "un", 3], ["Refri 2 litros", "un", 7.5], ["Embalagem", "un", .5]];
const REC_PADRAO = {
  "x-burger": [["Pão de hambúrguer", 1], ["Hambúrguer 120g", 1], ["Queijo muçarela", 2], ["Maionese da casa", 15], ["Embalagem", 1]],
  "x-salada": [["Pão de hambúrguer", 1], ["Hambúrguer 120g", 1], ["Queijo muçarela", 2], ["Alface", 2], ["Tomate", 2], ["Maionese da casa", 15], ["Embalagem", 1]],
  "x-bacon": [["Pão de hambúrguer", 1], ["Hambúrguer 120g", 1], ["Queijo muçarela", 2], ["Bacon", 40], ["Alface", 2], ["Tomate", 2], ["Maionese da casa", 15], ["Embalagem", 1]],
  "x-egg": [["Pão de hambúrguer", 1], ["Hambúrguer 120g", 1], ["Queijo muçarela", 2], ["Ovo", 1], ["Alface", 2], ["Tomate", 2], ["Maionese da casa", 15], ["Embalagem", 1]],
  "x-tudo": [["Pão de hambúrguer", 1], ["Hambúrguer 120g", 2], ["Queijo muçarela", 3], ["Presunto", 2], ["Bacon", 40], ["Ovo", 1], ["Alface", 2], ["Tomate", 2], ["Milho", 20], ["Batata palha", 15], ["Maionese da casa", 20], ["Embalagem", 1]],
  "x-calabresa": [["Pão de hambúrguer", 1], ["Calabresa", 100], ["Queijo muçarela", 2], ["Maionese da casa", 15], ["Embalagem", 1]],
  "x-frango": [["Pão de hambúrguer", 1], ["Filé de frango", 1], ["Queijo muçarela", 2], ["Alface", 2], ["Tomate", 2], ["Milho", 20], ["Embalagem", 1]],
  "dog-simples": [["Pão de hot dog", 1], ["Salsicha", 1], ["Purê", 40], ["Batata palha", 15], ["Embalagem", 1]],
  "dog-completo": [["Pão de hot dog", 1], ["Salsicha", 2], ["Purê", 50], ["Milho", 20], ["Batata palha", 20], ["Embalagem", 1]],
  "pastel-carne": [["Massa de pastel", 1], ["Carne moída", 80]], "pastel-frango": [["Massa de pastel", 1], ["Frango desfiado", 80]],
  "batata-p": [["Batata congelada", 300], ["Embalagem", 1]], "refri-lata": [["Refri lata", 1]], "refri-2l": [["Refri 2 litros", 1]]
};
const insId = n => "ins:" + n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
let INS = [], FICHAS = [], estAba = "insumos";
async function telaEstoqueLanch() { const m = $("main");
  const [a, b] = await Promise.all([sb.from("zv_estoque").select("*").eq("negocio", NEG.id).like("item", "ins:%").order("nome"), sb.from("zv_fichas").select("*").eq("negocio", NEG.id)]);
  if (TAB !== "estoque") return; if (a.error) { m.innerHTML = topo("Estoque e receitas") + `<div class="card vazio">${esc(erro(a.error))}</div>`; return; }
  INS = a.data || []; FICHAS = b.data || [];
  const seg = `<div class="seg" style="max-width:420px;margin-bottom:14px" role="group" aria-label="Ver">${[["insumos", "Insumos"], ["receitas", "Receitas e lucro"]].map(([k, l]) => `<button aria-pressed="${estAba === k}" onclick="estAba='${k}';telaEstoqueLanch()">${l}</button>`).join("")}</div>`;
  m.innerHTML = topo("Estoque e receitas", estAba === "insumos" ? `<button class="b pri sm" onclick="novoInsumo()">Novo insumo</button>` : "") + seg + (estAba === "insumos" ? htmlInsumos() : htmlReceitas()); }
function htmlInsumos() {
  if (!INS.length) return `<div class="card"><h2>Comece pelos insumos</h2><p class="muted" style="font-size:14px">Insumo é o que você compra para fazer os lanches: pão, hambúrguer, queijo, salsicha, massa de pastel, refri. Com a quantidade de cada um na receita do lanche, o estoque baixa sozinho a cada pedido entregue e você vê o lucro de cada lanche.</p>
    <button class="b pri" style="margin-top:6px" onclick="usarListaPronta()">Começar com a lista pronta</button> <button class="b sec" style="margin-top:6px" onclick="novoInsumo()">Cadastrar do zero</button></div>`;
  const baixos = INS.filter(i => Number(i.qtd) <= Number(i.minimo) && Number(i.minimo) > 0);
  return `<p class="muted" style="margin:-4px 0 14px;font-size:14px">Fica amarelo quando chega no mínimo. Toque em “+ Compra” quando chegar mercadoria: a quantidade sobe e, se quiser, o custo vai para Contas a pagar.</p>
    ${baixos.length ? `<div class="card" style="border-color:#F2A33A;margin-bottom:12px"><b>Comprar logo:</b> ${baixos.map(i => esc(i.nome)).join(", ")}</div>` : ""}
    <div class="card scroll"><table class="tb"><thead><tr><th>Insumo</th><th>Tem</th><th>Mínimo</th><th>Custo por ${"un."}</th><th></th></tr></thead><tbody>${INS.map(i => `<tr class="${Number(i.qtd) <= Number(i.minimo) && Number(i.minimo) > 0 ? "baixo" : ""}">
      <td><b>${esc(i.nome)}</b><br><span class="muted" style="font-size:12.5px">por ${esc(i.un)}</span></td><td><input inputmode="decimal" id="iq-${i.item}" value="${Number(i.qtd)}" aria-label="Quanto tem de ${esc(i.nome)}"></td>
      <td><input inputmode="decimal" id="im-${i.item}" value="${Number(i.minimo)}" aria-label="Mínimo de ${esc(i.nome)}"></td><td><input inputmode="decimal" id="ic-${i.item}" value="${i.custo != null ? String(i.custo).replace(".", ",") : ""}" placeholder="R$" aria-label="Custo de ${esc(i.nome)}"></td>
      <td style="white-space:nowrap"><button class="b sec sm" onclick="salvarIns('${i.item}')">Salvar</button> <button class="b sec sm" onclick="compraIns('${i.item}')">+ Compra</button></td></tr>`).join("")}</tbody></table></div>`; }
function custoItem(id) { let c = 0, falta = false; FICHAS.filter(f => f.item === id).forEach(f => { const i = INS.find(x => x.item === f.insumo); if (!i || i.custo == null) falta = true; else c += Number(i.custo) * Number(f.qtd); }); return { c, falta }; }
function htmlReceitas() { if (!INS.length) return `<div class="card vazio">Cadastre os insumos primeiro, na aba “Insumos”.</div>`;
  const its = []; menu().forEach(c => (c.items || []).forEach(i => { if (i.id !== "monte-lanche") its.push({ ...i, cat: c.cat }); }));
  return `<p class="muted" style="margin:-4px 0 14px;font-size:14px">Diga quanto de cada insumo vai em cada item. O custo e o lucro aparecem na hora, e o estoque baixa sozinho quando o pedido é entregue.</p><div class="rec">${its.map(i => {
    const L = FICHAS.filter(f => f.item === i.id), { c, falta } = custoItem(i.id), p = Number(i.p || (i.v && i.v[0] && i.v[0].p) || 0), mg = p > 0 ? (p - c) / p : 0;
    return `<div class="rec-c"><div class="cab"><b>${esc(i.n)} <span class="muted" style="font-weight:500;font-size:13px">${esc(i.cat)}</span></b>${L.length ? `<span>custo ${brl(c)}${falta ? "*" : ""} · vende ${brl(p)} · <span class="marg ${mg >= .55 ? "ok" : mg >= .35 ? "am" : "no"}">lucro ${brl(p - c)} (${Math.round(mg * 100)}%)</span></span>` : `<span class="muted">sem receita</span>`}</div>
      ${L.map(f => { const ins = INS.find(x => x.item === f.insumo); return `<div class="ln"><span>${esc(ins ? ins.nome : f.insumo)}</span><span>${String(Number(f.qtd)).replace(".", ",")} ${esc(ins ? ins.un : "")}</span><button class="b sec sm" aria-label="Tirar ${esc(ins ? ins.nome : "")}" onclick="tirarDaReceita('${i.id}','${f.insumo}')">×</button></div>`; }).join("")}
      <div class="ln"><select class="t" id="rs-${i.id}" aria-label="Insumo para ${esc(i.n)}"><option value="">+ insumo…</option>${INS.map(x => `<option value="${x.item}">${esc(x.nome)} (${esc(x.un)})</option>`).join("")}</select><input class="t" id="rq-${i.id}" inputmode="decimal" placeholder="qtd" aria-label="Quantidade"><button class="b pri sm" aria-label="Pôr na receita" onclick="porNaReceita('${i.id}')">+</button></div>
      ${falta ? `<p class="muted" style="font-size:12px;margin:6px 0 0">* falta o custo de algum insumo.</p>` : ""}</div>`; }).join("")}</div>`; }
async function porNaReceita(item) { const ins = $("rs-" + item).value, q = num($("rq-" + item).value); if (!ins) return toast("Escolha o insumo."); if (!q || q <= 0) return toast("Escreva a quantidade.");
  const { error } = await sb.from("zv_fichas").upsert({ negocio: NEG.id, item, insumo: ins, qtd: q }, { onConflict: "negocio,item,insumo" }); if (error) return toast(erro(error)); telaEstoqueLanch(); }
async function tirarDaReceita(item, ins) { const { error } = await sb.from("zv_fichas").delete().eq("negocio", NEG.id).eq("item", item).eq("insumo", ins); if (error) return toast(erro(error)); telaEstoqueLanch(); }
async function usarListaPronta() { toast("Montando a lista…");
  const rows = INS_PADRAO.map(([n, un, c]) => ({ negocio: NEG.id, item: insId(n), nome: n, un, custo: c, qtd: 0, minimo: 0 }));
  let r = await sb.from("zv_estoque").upsert(rows, { onConflict: "negocio,item" }); if (r.error) return toast(erro(r.error));
  const ids = new Set(); menu().forEach(c => (c.items || []).forEach(i => ids.add(i.id)));
  const fs = []; Object.entries(REC_PADRAO).forEach(([it, L]) => { if (ids.has(it)) L.forEach(([n, q]) => fs.push({ negocio: NEG.id, item: it, insumo: insId(n), qtd: q })); });
  if (fs.length) { r = await sb.from("zv_fichas").upsert(fs, { onConflict: "negocio,item,insumo" }); if (r.error) return toast(erro(r.error)); }
  toast("Pronto. Confira os custos e diga quanto tem de cada um."); telaEstoqueLanch(); }
function novoInsumo() { abrirSheet(`<h2>Novo insumo</h2><label class="f" style="margin-top:12px">Nome<input class="t" id="nI" maxlength="40" placeholder="Ex.: Pão de hambúrguer"></label>
  <div class="grid2" style="margin-top:10px"><label class="f">Medida<select class="t" id="nU">${["un", "fatia", "g", "kg", "ml", "L", "folha", "porção"].map(x => `<option>${x}</option>`).join("")}</select></label><label class="f">Custo de 1 (R$)<input class="t" id="nC" inputmode="decimal" placeholder="0,00"></label></div>
  <div class="grid2" style="margin-top:10px"><label class="f">Quanto tem agora<input class="t" id="nQ" inputmode="decimal" placeholder="0"></label><label class="f">Avisar quando chegar em<input class="t" id="nM" inputmode="decimal" placeholder="0"></label></div>
  <button class="b pri wide" style="margin-top:12px" onclick="salvarNovoIns()">Salvar</button>`); }
async function salvarNovoIns() { const n = $("nI").value.trim(); if (!n) return toast("Escreva o nome.");
  const { error } = await sb.from("zv_estoque").upsert({ negocio: NEG.id, item: insId(n), nome: n, un: $("nU").value, custo: num($("nC").value), qtd: num($("nQ").value) || 0, minimo: num($("nM").value) || 0 }, { onConflict: "negocio,item" });
  if (error) return toast(erro(error)); fecharSheet(); telaEstoqueLanch(); }
async function salvarIns(id) { const { error } = await sb.from("zv_estoque").update({ qtd: num($("iq-" + id).value) || 0, minimo: num($("im-" + id).value) || 0, custo: num($("ic-" + id).value) }).eq("negocio", NEG.id).eq("item", id);
  toast(error ? erro(error) : "Salvo."); if (!error) telaEstoqueLanch(); }
function compraIns(id) { const i = INS.find(x => x.item === id);
  abrirSheet(`<h2>Chegou ${esc(i.nome)}</h2><div class="grid2" style="margin-top:12px"><label class="f">Quanto chegou (${esc(i.un)})<input class="t" id="cpQ" inputmode="decimal"></label><label class="f">Quanto pagou no total (R$)<input class="t" id="cpV" inputmode="decimal" placeholder="opcional"></label></div>
  <label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-weight:650"><input type="checkbox" id="cpPagar"> Ainda vou pagar (vai para Contas a pagar)</label>
  <button class="b pri wide" style="margin-top:12px" onclick="salvarCompra('${id}')">Salvar</button>`); }
async function salvarCompra(id) { const i = INS.find(x => x.item === id), q = num($("cpQ").value), v = num($("cpV").value); if (!q || q <= 0) return toast("Escreva quanto chegou.");
  const upd = { qtd: Number(i.qtd) + q }; if (v && v > 0) upd.custo = Math.round(v / q * 10000) / 10000;
  let r = await sb.from("zv_estoque").update(upd).eq("negocio", NEG.id).eq("item", id); if (r.error) return toast(erro(r.error));
  if (v && v > 0) { r = $("cpPagar").checked ? await sb.from("zv_contas").insert({ negocio: NEG.id, descricao: "Compra: " + i.nome, valor: v, vence: isoD(new Date(Date.now() + 7 * 864e5)), categoria: "Fornecedor" })
      : await sb.from("zv_lancamentos").insert({ negocio: NEG.id, tipo: "saida", valor: v, categoria: "Fornecedor", descricao: "Compra: " + i.nome }); if (r.error) return toast(erro(r.error)); }
  fecharSheet(); toast("Estoque atualizado."); telaEstoqueLanch(); }
