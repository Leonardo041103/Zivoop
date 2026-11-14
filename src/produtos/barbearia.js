/* ===== Zivoop Barbearia: o que é só da barbearia no painel =====
   Hoje (agenda de cada barbeiro + lembretes de amanhã), Barbeiros e comissões, Clube de assinatura,
   Lista de espera (um por vez, por ordem de chegada), Hora de voltar, Sinal por Pix e Recibo do mês.
   Banco próprio: projeto Supabase só da barbearia. */
window.ZV_PRODUTO = "barbearia";
(() => { const B = { url: "https://yqpaqwwdfeyesxvbbcwy.supabase.co", key: "sb_publishable_yFqNbiwT-PEvOI1RVDXhIw_vNgMjB-H" };   // banco próprio da barbearia (projeto zivoop-site no Supabase)
  if (!window.ZV_SB_URL && B.url.indexOf("{{") < 0) { window.ZV_SB_URL = B.url; window.ZV_SB_KEY = B.key; } })();
window.ZV_ONB = { t: "Vamos colocar sua barbearia no ar", p: "Diga o nome e o WhatsApp da barbearia. Os serviços e os horários já vêm prontos. Você troca preços, barbeiros e fotos depois, aqui no painel." };
window.ZV_CURTAS = ["inicio", "agenda", "clube", "clientes"];
window.ZV_IC = {
  barbeiros: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.4 2.8-5.3 5.5-5.3s4.9 1.9 5.5 5.3M16 4.5l4 4M20 4.5l-4 4"/>',
  clube: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
  espera: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  contas: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
  recibo: '<path d="M7 3h10v18H7zM10 7h4M10 11h4M10 15h2"/>',
  robo: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5"/>'
};
window.zvAbas = a => {
  const ini = a.find(x => x[0] === "inicio"); if (ini) ini[1] = "Hoje";
  const c = a.find(x => x[0] === "catalogo"); if (c) c[1] = "Serviços";
  const i = a.findIndex(x => x[0] === "clientes"); a.splice(i + 1, 0, ["robo", "Robô de atendimento"], ["barbeiros", "Barbeiros"], ["clube", "Clube"], ["espera", "Lista de espera"]);
  const f = a.findIndex(x => x[0] === "financeiro"); a.splice(f + 1, 0, ["contas", "Contas a pagar"], ["recibo", "Recibo do mês"]);
  return a; };
window.ZV_TELAS = { inicio: () => telaHoje(), barbeiros: () => telaBarbeiros(), clube: () => telaClube(), espera: () => telaEspera(), contas: () => telaContas(),
  recibo: () => telaRecibo(), robo: () => telaRobo(), clientes: () => telaClientesBarb(), site: () => telaSiteBarb() };
document.querySelectorAll(".logo").forEach(l => { if (!l.querySelector(".prod")) l.insertAdjacentHTML("beforeend", ' <span class="prod">Barbearia</span>'); });
(() => { const s = document.createElement("style"); s.textContent = `
.logo .prod{font-weight:600;opacity:.65}
.hoje{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
.hoje .col h3{display:flex;justify-content:space-between;align-items:center;margin:0 0 8px;font-size:16px}.hoje .col h3 span{font-size:13px;color:var(--ink2);font-weight:600}
.hj{display:grid;grid-template-columns:52px 1fr auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}.hj:first-of-type{border-top:0}
.hj .h{font-weight:800;font-variant-numeric:tabular-nums;font-size:16px}.hj .q{min-width:0}.hj .q b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hj .q span{font-size:13px;color:var(--ink2);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hj .ac{display:flex;gap:6px}
.hj.atendido{opacity:.55}.hj.faltou .q b{text-decoration:line-through}.hj.agora{background:color-mix(in srgb,var(--cobalt) 8%,transparent);border-radius:10px;padding-left:8px;padding-right:8px}
.icb{width:38px;height:38px;border-radius:10px;border:1px solid var(--line);background:var(--card);display:grid;place-items:center;cursor:pointer;color:inherit}
.icb.ok{background:var(--ok);border-color:var(--ok);color:#fff}.icb svg{width:18px;height:18px}
.brb{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(290px,1fr))}.brb .card h2{display:flex;justify-content:space-between;align-items:baseline}
.brb dl{display:grid;grid-template-columns:1fr auto;gap:6px 12px;margin:10px 0 12px}.brb dt{color:var(--ink2)}.brb dd{margin:0;font-weight:700;text-align:right;font-variant-numeric:tabular-nums}
.brb .apagar{font-size:22px;font-weight:850}
.ass .r .st{font-size:12.5px}.ass .r.atr .st{color:var(--no-ink);font-weight:700}.ass .r.logo2 .st{color:var(--am-ink);font-weight:700}
.planos{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}.plano{border:1px solid var(--line);border-radius:14px;padding:12px 14px}.plano b{display:block;font-size:17px}.plano .pr{font-size:20px;font-weight:850;margin-top:4px}
.esp-dia{margin-bottom:12px}.esp-dia h2{display:flex;justify-content:space-between;align-items:baseline}.esp .r.prim{background:color-mix(in srgb,var(--cobalt) 7%,transparent);border-radius:10px;padding-left:8px;padding-right:8px}
.rb-conv{display:grid;gap:12px;grid-template-columns:minmax(0,320px) minmax(0,1fr)}@media (max-width:860px){.rb-conv{grid-template-columns:minmax(0,1fr)}}
.rb-lst .r{cursor:pointer}.rb-lst .r.on{background:color-mix(in srgb,var(--cobalt) 9%,transparent);border-radius:10px;padding-left:8px;padding-right:8px}
.rb-lst .ult{display:block;font-size:12.5px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.rb-chat .msgs{height:min(56vh,520px);flex:none}.msg.cli{align-self:flex-start;background:var(--card);border:1px solid var(--line);border-bottom-left-radius:5px}
.msg.bot{align-self:flex-end;background:color-mix(in srgb,var(--cobalt) 14%,var(--card));border-bottom-right-radius:5px}.msg.eu{align-self:flex-end;background:var(--cobalt);color:#fff;border-bottom-right-radius:5px}
.msg small{display:block;font-size:11px;opacity:.6;margin-top:3px}
.simops{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:86%}.simops button{border:1px solid var(--cobalt);color:var(--cobalt);background:var(--card);border-radius:999px;padding:7px 12px;font:inherit;font-size:13.5px;font-weight:650;cursor:pointer}
.rb-sim{background:linear-gradient(180deg,color-mix(in srgb,var(--ok) 6%,var(--card)),var(--card))}
.rec-mes{max-width:860px}.rec-mes table{width:100%;border-collapse:collapse}.rec-mes td{padding:7px 0;border-top:1px solid var(--line)}.rec-mes td:last-child{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.rec-mes .tot td{font-size:18px;font-weight:850}
@media print{.side,.tabbar,.top .acts,.seg,.no-print,.toast{display:none!important}main{margin:0!important;padding:0!important}.card{break-inside:avoid;box-shadow:none}}
`; document.head.appendChild(s); })();

const svgI = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I_OK = svgI('<path d="M5 12.5l4.5 4.5L19 7.5"/>'), I_X = svgI('<path d="M7 7l10 10M17 7L7 17"/>'), I_ZAP = svgI('<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/>');
const diaBR = d => new Date(d + (String(d).length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
const primeiro = n => String(n || "").trim().split(/\s+/)[0];
const servTxt = x => (x.servicos || []).map(s => s.nome).join(" + ") || "Horário";
const enviados = () => { try { return JSON.parse(localStorage.getItem("zv-lemb-" + NEG.id) || "{}"); } catch (e) { return {}; } };
function marcarEnviado(id) { try { const e = enviados(); e[id] = Date.now(); localStorage.setItem("zv-lemb-" + NEG.id, JSON.stringify(e)); } catch (e) {} }

/* ---------------- hoje ---------------- */
let HOJE = [], AMANHA = [];
async function telaHoje() { const m = $("main"), d0 = new Date(); d0.setHours(0, 0, 0, 0); const d1 = new Date(d0.getTime() + 864e5), d2 = new Date(d0.getTime() + 2 * 864e5);
  const [a, c, e] = await Promise.all([sb.from("zv_agendamentos").select("*").eq("negocio", NEG.id).gte("inicio", d0.toISOString()).lt("inicio", d2.toISOString()).neq("nome", "Bloqueio").order("inicio"),
    sb.from("zv_assinantes").select("id,vence,ativo").eq("negocio", NEG.id).eq("ativo", true),
    sb.from("zv_espera").select("id,dia").eq("negocio", NEG.id).eq("status", "esperando").gte("dia", isoD(d0)).lte("dia", isoD(d1))]);
  if (TAB !== "inicio") return;
  const todos = a.data || []; HOJE = todos.filter(x => new Date(x.inicio) < d1); AMANHA = todos.filter(x => new Date(x.inicio) >= d1 && ["pendente", "confirmado"].includes(x.status));
  AGS = todos;   // o detalhe de cada horário (verAg) usa esta lista
  const ativos = HOJE.filter(x => x.status !== "cancelado"), feito = HOJE.filter(x => x.status === "atendido"), faltas = HOJE.filter(x => x.status === "faltou");
  const ass = c.data || [], atras = ass.filter(x => x.vence < isoD(new Date())), esp = e.data || [];
  const ps = profs().length ? profs() : [""], agora = Date.now(), env = enviados();
  const linha = x => { const ini = new Date(x.inicio), now = ini <= agora && new Date(x.fim) > agora;
    return `<div class="hj ${x.status} ${now && ["pendente", "confirmado"].includes(x.status) ? "agora" : ""}"><span class="h">${hhmm(x.inicio)}</span><button class="q" style="all:unset;cursor:pointer;min-width:0" onclick="verAg('${x.id}')"><b>${esc(x.nome)}</b><span>${esc(servTxt(x))} · ${brl(x.total)}</span></button>
      <span class="ac">${x.status === "pendente" ? `<button class="b pri sm" onclick="statusAg('${x.id}','confirmado')">Confirmar</button>`
        : x.status === "confirmado" ? `<button class="icb ok" title="Atendido" aria-label="${esc(x.nome)} foi atendido" onclick="statusAg('${x.id}','atendido')">${I_OK}</button><button class="icb" title="Faltou" aria-label="${esc(x.nome)} faltou" onclick="statusAg('${x.id}','faltou')">${I_X}</button>`
        : pillStatus(x.status)}</span></div>`; };
  const lemb = x => `Oi, ${primeiro(x.nome)}! Passando para lembrar do seu horário amanhã às ${hhmm(x.inicio)} na ${NEG.nome}${x.profissional ? " com o " + x.profissional : ""}. Se não puder vir, me avisa que eu libero o horário para outro cliente.`;
  m.innerHTML = topo("Hoje", `<a class="b sec sm" href="${siteURL()}" target="_blank" rel="noopener">Ver meu site</a>`) +
    `<div class="kpis"><div class="card kpi"><small>Horários hoje</small><b>${ativos.length}</b><div class="sub">${feito.length} ${feito.length === 1 ? "atendido" : "atendidos"}</div></div>
      <div class="card kpi"><small>Faturado hoje</small><b>${brl(feito.reduce((s, x) => s + Number(x.total), 0))}</b><div class="sub">${brl(ativos.filter(x => x.status !== "faltou").reduce((s, x) => s + Number(x.total), 0))} na agenda</div></div>
      <div class="card kpi"><small>Faltas hoje</small><b style="color:${faltas.length ? "var(--no-ink)" : "inherit"}">${faltas.length}</b><div class="sub">${esp.length ? esp.length + " na lista de espera" : "lista de espera vazia"}</div></div>
      <div class="card kpi"><small>Clube</small><b>${ass.length}</b><div class="sub">${atras.length ? `<span style="color:var(--no-ink);font-weight:700">${atras.length} atrasado${atras.length > 1 ? "s" : ""}</span>` : "todos em dia"}</div></div></div>
    ${esp.length && faltas.length ? `<div class="card" style="border-color:var(--cobalt);margin-bottom:12px"><b>Abriu horário e tem gente esperando.</b> <a href="#espera">Avisar o primeiro da lista de espera</a></div>` : ""}
    <div class="hoje">${ps.map(p => { const L = HOJE.filter(x => x.status !== "cancelado" && (x.profissional === p || !profs().length));
      return `<section class="card col"><h3>${esc(p || "Agenda de hoje")}<span>${L.length} ${L.length === 1 ? "horário" : "horários"}</span></h3>${L.length ? L.map(linha).join("") : '<p class="vazio">Livre hoje.</p>'}</section>`; }).join("")}</div>
    <div class="card" style="margin-top:12px"><h2>Lembrete para amanhã</h2><p class="muted" style="font-size:14px;margin:-4px 0 8px">Um toque em cada um abre o WhatsApp com a mensagem pronta. Quem recebe lembrete falta bem menos.</p>
      <div class="lst">${AMANHA.length ? AMANHA.map(x => `<div class="r"><span><b>${hhmm(x.inicio)} · ${esc(x.nome)}</b><br><span class="muted" style="font-size:12.5px">${esc(servTxt(x))}${x.profissional ? " com " + esc(x.profissional) : ""}</span></span>
        ${x.whatsapp ? (env[x.id] ? `<span class="pill ok">Enviado</span>` : `<a class="b ok sm" target="_blank" rel="noopener" href="${zapLink(x.whatsapp, lemb(x))}" onclick="marcarEnviado('${x.id}');setTimeout(telaHoje,400)">Lembrar</a>`) : '<span class="muted">sem WhatsApp</span>'}</div>`).join("") : '<p class="vazio">Ninguém marcado para amanhã ainda.</p>'}</div></div>`;
  clearInterval(salaoT); salaoT = setInterval(() => { if (TAB === "inicio") telaHoje(); else clearInterval(salaoT); }, 60000); }

/* ---------------- barbeiros e comissões ---------------- */
let brbPer = "mes", BRB = {};
const comissoes = () => (NEG.dados && NEG.dados.comissoes) || {};
function periodoBrb() { const h = new Date(); let a, b;
  if (brbPer === "semana") { a = new Date(h); a.setDate(h.getDate() - ((h.getDay() + 6) % 7)); a.setHours(0, 0, 0, 0); b = new Date(a.getTime() + 7 * 864e5); }
  else if (brbPer === "passado") { a = new Date(h.getFullYear(), h.getMonth() - 1, 1); b = new Date(h.getFullYear(), h.getMonth(), 1); }
  else { a = new Date(h.getFullYear(), h.getMonth(), 1); b = new Date(h.getFullYear(), h.getMonth() + 1, 1); }
  return [a, b]; }
async function telaBarbeiros() { const m = $("main"), [a, b] = periodoBrb();
  const [r, l] = await Promise.all([sb.from("zv_agendamentos").select("profissional,total,status,servicos").eq("negocio", NEG.id).gte("inicio", a.toISOString()).lt("inicio", b.toISOString()).neq("nome", "Bloqueio").limit(5000),
    sb.from("zv_lancamentos").select("valor,descricao,data").eq("negocio", NEG.id).eq("categoria", "Comissões").gte("data", isoD(a)).lt("data", isoD(b)).limit(2000)]);
  if (TAB !== "barbeiros") return;
  const A = r.data || [], pagos = l.data || [], C = comissoes(), ps = profs();
  BRB = {}; ps.forEach(p => { const meus = A.filter(x => x.profissional === p), at = meus.filter(x => x.status === "atendido"), fat = at.reduce((s, x) => s + Number(x.total), 0), pct = Number(C[p] || 0);
    const pago = pagos.filter(x => (x.descricao || "").startsWith("Comissão " + p + " ")).reduce((s, x) => s + Number(x.valor), 0);
    BRB[p] = { at: at.length, faltas: meus.filter(x => x.status === "faltou").length, fat, pct, com: Math.round(fat * pct) / 100, pago }; });
  const nomePer = { mes: "Este mês", passado: "Mês passado", semana: "Esta semana" };
  m.innerHTML = topo("Barbeiros", `<button class="b sec sm" onclick="ir('site')">Mudar a equipe</button>`) +
    `<div class="seg" style="max-width:460px;margin-bottom:14px" role="group" aria-label="Período">${Object.entries(nomePer).map(([k, t]) => `<button aria-pressed="${brbPer === k}" onclick="brbPer='${k}';telaBarbeiros()">${t}</button>`).join("")}</div>` +
    (ps.length ? `<div class="brb">${ps.map((p, i) => { const x = BRB[p], falta = Math.max(0, x.com - x.pago);
      return `<div class="card"><h2>${esc(p)}<span class="muted" style="font-size:13px;font-weight:600">${x.at} atendimentos</span></h2>
        <dl><dt>Faturou</dt><dd>${brl(x.fat)}</dd><dt>Comissão</dt><dd><label style="display:inline-flex;gap:4px;align-items:center"><input class="t" style="width:64px;min-height:34px;text-align:right" inputmode="decimal" id="pct${i}" value="${x.pct || ""}" placeholder="0" aria-label="Comissão de ${esc(p)} em %" onchange="salvarPct('${esc(p)}',this.value)">%</label></dd>
          <dt>Comissão do período</dt><dd>${brl(x.com)}</dd><dt>Já pago</dt><dd>${brl(x.pago)}</dd><dt>Faltas dos clientes</dt><dd>${x.faltas}</dd></dl>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span><span class="muted" style="font-size:13px">A pagar</span><br><span class="apagar">${brl(falta)}</span></span>
          ${falta > 0 ? `<button class="b pri" onclick="pagarComissao('${esc(p)}')">Paguei</button>` : x.pct ? '<span class="pill ok">Em dia</span>' : '<span class="muted" style="font-size:13px">Defina a %</span>'}</div></div>`; }).join("")}</div>
      <p class="muted" style="font-size:13px;margin-top:12px">A comissão é calculada sobre os horários marcados como atendidos. Ao tocar em “Paguei”, o valor sai do caixa como “Comissões”.</p>`
    : `<div class="card vazio">Cadastre os barbeiros em “Meu site”, no campo de profissionais. Cada um aparece aqui com o que faturou e a comissão.</div>`); }
async function salvarPct(p, v) { const n = Math.min(100, Math.max(0, num(v) || 0)); const ok = await salvarDados(d => { d.comissoes = Object.assign({}, d.comissoes || {}, { [p]: n }); }, "Comissão salva."); if (ok) telaBarbeiros(); }
async function pagarComissao(p) { const x = BRB[p], v = Math.round((x.com - x.pago) * 100) / 100, [a, b] = periodoBrb();
  if (!confirm(`Registrar que você pagou ${brl(v)} de comissão para ${p}?`)) return;
  const fim = new Date(b.getTime() - 864e5), per = `${a.toLocaleDateString("pt-BR").slice(0, 5)} a ${fim.toLocaleDateString("pt-BR").slice(0, 5)}`;
  const dia = isoD(new Date()) < isoD(b) ? isoD(new Date()) : isoD(fim);
  const { error } = await sb.from("zv_lancamentos").insert({ negocio: NEG.id, tipo: "saida", valor: v, categoria: "Comissões", descricao: `Comissão ${p} (${per})`, data: dia });
  if (error) return toast(erro(error)); toast("Comissão paga. Saiu do caixa."); telaBarbeiros(); }

/* ---------------- clube de assinatura ---------------- */
let ASS = [];
const clube = () => Object.assign({ ativo: false, planos: [] }, cfg().clube || {});
const statusAss = x => { const d = Math.round((new Date(x.vence + "T12:00:00") - new Date(isoD(new Date()) + "T12:00:00")) / 864e5);
  return d < 0 ? ["atr", `atrasado ${-d} ${-d === 1 ? "dia" : "dias"}`] : d <= 3 ? ["logo2", d === 0 ? "vence hoje" : `vence em ${d} ${d === 1 ? "dia" : "dias"}`] : ["", "em dia até " + x.vence.split("-").reverse().slice(0, 2).join("/")]; };
async function telaClube() { const m = $("main"); const { data, error } = await sb.from("zv_assinantes").select("*").eq("negocio", NEG.id).order("ativo", { ascending: false }).order("vence").limit(2000);
  if (TAB !== "clube") return; if (error) { m.innerHTML = topo("Clube") + `<div class="card vazio">${esc(erro(error))}</div>`; return; }
  ASS = data || []; const C = clube(), at = ASS.filter(x => x.ativo), atr = at.filter(x => x.vence < isoD(new Date())), rec = at.reduce((s, x) => s + Number(x.valor), 0);
  m.innerHTML = topo("Clube de assinatura", `<button class="b sec sm" onclick="editarPlanos()">Planos</button><button class="b pri sm" onclick="novoAssinante()">Novo assinante</button>`) +
    `<p class="muted" style="margin:-8px 0 14px;font-size:14px">O cliente paga um valor fixo por mês e corta quantas vezes o plano deixar. Você tem um dinheiro certo todo mês, e ele volta sempre. ${C.ativo ? "Os planos aparecem no seu site." : "Ligue o clube em “Planos” para ele aparecer no site."}</p>
    <div class="kpis"><div class="card kpi"><small>Assinantes</small><b>${at.length}</b></div><div class="card kpi"><small>Receita fixa por mês</small><b>${brl(rec)}</b></div>
      <div class="card kpi"><small>Atrasados</small><b style="color:${atr.length ? "var(--no-ink)" : "inherit"}">${atr.length}</b><div class="sub">${brl(atr.reduce((s, x) => s + Number(x.valor), 0))}</div></div>
      <div class="card kpi"><small>Planos</small><b>${C.planos.length}</b><div class="sub">${C.ativo ? "no site" : "clube desligado"}</div></div></div>
    ${C.planos.length ? `<div class="planos" style="margin-bottom:14px">${C.planos.map(p => `<div class="plano"><b>${esc(p.nome)}</b><span class="muted" style="font-size:13.5px">${esc(p.inclui || "")}</span><div class="pr">${brl(p.preco)}<small class="muted" style="font-size:13px;font-weight:600">/mês</small></div><span class="muted" style="font-size:12.5px">${(n => n + (n === 1 ? " assinante" : " assinantes"))(at.filter(x => x.plano === p.nome).length)}</span></div>`).join("")}</div>` : ""}
    <div class="card ass"><h2>Assinantes</h2><div class="lst">${ASS.length ? ASS.map(x => { const [k, t] = x.ativo ? statusAss(x) : ["", "cancelado"], plano = C.planos.find(p => p.nome === x.plano), lim = plano && plano.limite;
      return `<div class="r ${k}" style="${x.ativo ? "" : "opacity:.5"}"><span><b>${esc(x.nome)}</b><br><span class="muted" style="font-size:12.5px">${esc(x.plano)} · ${brl(x.valor)}${lim ? ` · usou ${x.usos} de ${lim}` : ` · ${x.usos} ${x.usos === 1 ? "uso" : "usos"} no mês`}</span><br><span class="st">${t}</span></span>
        <span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${x.ativo ? `<button class="b sec sm" onclick="usoClube('${x.id}')">+1 uso</button>${k === "atr" || k === "logo2" ? (x.whatsapp ? `<a class="b sec sm" target="_blank" rel="noopener" href="${zapLink(x.whatsapp, `Oi, ${primeiro(x.nome)}! A mensalidade do clube (${x.plano}, ${brl(x.valor)}) ${k === "atr" ? "venceu dia " + x.vence.split("-").reverse().slice(0, 2).join("/") : "vence dia " + x.vence.split("-").reverse().slice(0, 2).join("/")}.${(cfg().pix || {}).chave ? " Pix: " + cfg().pix.chave : ""} Valeu!`)}">Cobrar</a>` : "") : ""}<button class="b ok sm" onclick="receberClube('${x.id}')">Recebi</button>` : ""}<button class="b sec sm" aria-label="Mais opções de ${esc(x.nome)}" onclick="editarAssinante('${x.id}')">…</button></span></div>`; }).join("")
      : '<p class="vazio">Nenhum assinante ainda. Monte os planos e ofereça no balcão: “por R$ 99 você corta 4 vezes no mês”.</p>'}</div></div>`; }
function editarPlanos() { const C = clube(), L = clone(C.planos.length ? C.planos : [{ nome: "Corte ilimitado", preco: 120, inclui: "cortes à vontade no mês", limite: 0 }, { nome: "4 cortes", preco: 89, inclui: "4 cortes por mês", limite: 4 }, { nome: "Corte + barba", preco: 149, inclui: "4 cortes e 4 barbas por mês", limite: 8 }]);
  const linha = (p, i) => `<div class="card" style="margin-top:8px;padding:10px"><div class="grid2"><label class="f">Nome<input class="t" id="pN${i}" value="${esc(p.nome || "")}" maxlength="60"></label><label class="f">Preço por mês<input class="t" id="pP${i}" inputmode="decimal" value="${p.preco != null ? String(p.preco).replace(".", ",") : ""}"></label></div>
    <div class="grid2" style="margin-top:8px"><label class="f">O que inclui<input class="t" id="pI${i}" value="${esc(p.inclui || "")}" maxlength="80"></label><label class="f">Usos por mês (0 = sem limite)<input class="t" id="pL${i}" inputmode="numeric" value="${p.limite || 0}"></label></div></div>`;
  const desenha = () => abrirSheet(`<h2>Planos do clube</h2><label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-weight:650"><input type="checkbox" id="pA" ${C.ativo || !C.planos.length ? "checked" : ""}> Mostrar o clube no site</label>
    <p class="muted" style="font-size:13.5px;margin:6px 0 0">Deixe o nome em branco para tirar um plano.</p>${L.map(linha).join("")}<button class="b sec wide" style="margin-top:10px" id="pMais">+ Plano</button><button class="b pri wide" style="margin-top:8px" id="pOk">Salvar e publicar</button>`);
  const ler = () => L.forEach((p, i) => { p.nome = $("pN" + i).value.trim(); p.preco = num($("pP" + i).value) || 0; p.inclui = $("pI" + i).value.trim(); p.limite = parseInt($("pL" + i).value) || 0; });
  const ligar = () => { $("pMais").onclick = () => { ler(); L.push({ nome: "", preco: 0, inclui: "", limite: 0 }); desenha(); ligar(); };
    $("pOk").onclick = async () => { ler(); const ok = await salvarDados(d => { d.config = d.config || {}; d.config.clube = { ativo: $("pA").checked, planos: L.filter(p => p.nome).slice(0, 8) }; }, "Planos salvos."); if (ok) { fecharSheet(); telaClube(); } }; };
  desenha(); ligar(); }
function novoAssinante(x) { const C = clube(); if (!C.planos.length) return editarPlanos(); x = x || {};
  abrirSheet(`<h2>${x.id ? "Assinante" : "Novo assinante"}</h2><label class="f" style="margin-top:12px">Nome<input class="t" id="aN" maxlength="80" value="${esc(x.nome || "")}"></label>
  <label class="f" style="margin-top:10px">WhatsApp<input class="t" id="aZ" inputmode="tel" value="${esc(x.whatsapp || "")}"></label>
  <label class="f" style="margin-top:10px">Plano<select class="t" id="aP">${C.planos.map(p => `<option ${x.plano === p.nome ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}</select></label>
  <div class="grid2" style="margin-top:10px"><label class="f">Valor por mês<input class="t" id="aV" inputmode="decimal" value="${x.valor != null ? String(x.valor).replace(".", ",") : String(C.planos[0].preco).replace(".", ",")}"></label><label class="f">${x.id ? "Vence em" : "Primeiro vencimento"}<input class="t" type="date" id="aD" value="${x.vence || isoD(new Date())}"></label></div>
  <p class="err" id="aErr" role="alert"></p><button class="b pri wide" style="margin-top:8px" onclick="salvarAssinante('${x.id || ""}')">Salvar</button>
  ${x.id ? `<button class="b no wide" style="margin-top:8px" onclick="cancelarAssinante('${x.id}',${!x.ativo})">${x.ativo ? "Cancelar assinatura" : "Reativar assinatura"}</button>` : ""}`);
  $("aP").onchange = () => { const p = C.planos.find(p => p.nome === $("aP").value); if (p) $("aV").value = String(p.preco).replace(".", ","); }; }
const editarAssinante = id => novoAssinante(ASS.find(x => x.id === id));
async function salvarAssinante(id) { const n = $("aN").value.trim(); if (n.length < 2) return $("aErr").textContent = "Escreva o nome.";
  const row = { nome: n, whatsapp: $("aZ").value.replace(/\D/g, "") || null, plano: $("aP").value, valor: num($("aV").value) || 0, vence: $("aD").value };
  const { error } = id ? await sb.from("zv_assinantes").update(row).eq("id", id) : await sb.from("zv_assinantes").insert(Object.assign({ negocio: NEG.id }, row));
  if (error) return $("aErr").textContent = erro(error); fecharSheet(); toast(id ? "Salvo." : "Assinante no clube."); telaClube(); }
async function cancelarAssinante(id, ativo) { if (!ativo && !confirm("Cancelar a assinatura? Ele sai da receita fixa.")) return;
  const { error } = await sb.from("zv_assinantes").update({ ativo }).eq("id", id); if (error) return toast(erro(error)); fecharSheet(); telaClube(); }
async function receberClube(id) { const x = ASS.find(a => a.id === id); if (!confirm(`Recebeu ${brl(x.valor)} de ${x.nome}?`)) return;
  const { data, error } = await sb.rpc("zv_clube_receber", { p_id: id }); if (error) return toast(erro(error));
  const nv = (data && data.zv_clube_receber) || data; toast("Recebido. Próximo vencimento: " + String(nv).split("-").reverse().slice(0, 2).join("/") + "."); telaClube(); }
async function usoClube(id) { const x = ASS.find(a => a.id === id), p = clube().planos.find(p => p.nome === x.plano);
  if (p && p.limite && x.usos >= p.limite && !confirm(`${x.nome} já usou os ${p.limite} do plano este mês. Marcar mesmo assim?`)) return;
  const { error } = await sb.from("zv_assinantes").update({ usos: x.usos + 1 }).eq("id", id); if (error) return toast(erro(error)); telaClube(); }

/* ---------------- lista de espera ---------------- */
let ESP = [];
async function telaEspera() { const m = $("main"); const { data, error } = await sb.from("zv_espera").select("*").eq("negocio", NEG.id).in("status", ["esperando", "avisado"]).gte("dia", isoD(new Date())).order("dia").order("criado_em").limit(500);
  if (TAB !== "espera") return; if (error) { m.innerHTML = topo("Lista de espera") + `<div class="card vazio">${esc(erro(error))}</div>`; return; }
  ESP = data || []; const dias = [...new Set(ESP.map(x => x.dia))];
  m.innerHTML = topo("Lista de espera") + `<p class="muted" style="margin:-8px 0 14px;font-size:14px">Quem não achou horário no site entra aqui, por ordem de chegada. Quando abrir uma vaga, avise o primeiro da fila. Se ele não quiser, toque em “Não quis” e o próximo sobe. Um por vez, sem disparo em massa.</p>` +
    (dias.length ? dias.map(d => { const L = ESP.filter(x => x.dia === d), fila = L.filter(x => x.status === "esperando");
      return `<div class="card esp-dia esp"><h2>${diaBR(d)}<span class="muted" style="font-size:13px;font-weight:600">${fila.length} esperando</span></h2><div class="lst">${L.map(x => { const prim = fila[0] === x;
        const msg = `Oi, ${primeiro(x.nome)}! Abriu um horário na ${NEG.nome} para ${diaBR(x.dia)}${x.profissional ? " com o " + x.profissional : ""}. Quer que eu marque para você? Me diz que eu já reservo.`;
        return `<div class="r ${prim ? "prim" : ""}"><span><b>${x.status === "esperando" ? fila.indexOf(x) + 1 + "º · " : ""}${esc(x.nome)}</b><br><span class="muted" style="font-size:12.5px">${x.profissional ? "quer com " + esc(x.profissional) + " · " : ""}entrou ${desde(x.criado_em)}${x.status === "avisado" ? " · avisado " + desde(x.avisado_em) : ""}</span></span>
          <span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${x.status === "avisado" ? `<button class="b ok sm" onclick="espStatus('${x.id}','marcou')">Marcou</button><button class="b sec sm" onclick="espStatus('${x.id}','saiu')">Não quis</button>`
            : prim ? `<a class="b pri sm" target="_blank" rel="noopener" href="${zapLink(x.whatsapp, msg)}" onclick="espStatus('${x.id}','avisado')">Avisar que abriu vaga</a>` : ""}<button class="b sec sm" aria-label="Tirar ${esc(x.nome)} da lista" onclick="espStatus('${x.id}','saiu')">×</button></span></div>`; }).join("")}</div></div>`; }).join("")
      : `<div class="card vazio">Ninguém esperando. No site, quando um dia está lotado, o cliente vê o botão “Me avise se abrir vaga”.</div>`); }
async function espStatus(id, status) { const upd = { status }; if (status === "avisado") upd.avisado_em = new Date().toISOString();
  const { error } = await sb.from("zv_espera").update(upd).eq("id", id); if (error) return toast(erro(error)); setTimeout(telaEspera, status === "avisado" ? 300 : 0); }

/* ---------------- clientes: hora de voltar ---------------- */
async function telaClientesBarb() { await telaClientes(); if (TAB !== "clientes") return;
  const de = new Date(Date.now() - 240 * 864e5); const { data } = await sb.from("zv_agendamentos").select("nome,whatsapp,inicio").eq("negocio", NEG.id).eq("status", "atendido").gte("inicio", de.toISOString()).order("inicio").limit(5000);
  if (TAB !== "clientes") return; const por = {}; (data || []).forEach(x => { const k = (x.whatsapp || "").replace(/\D/g, ""); if (!k) return; (por[k] = por[k] || { nome: x.nome, z: k, d: [] }).d.push(new Date(x.inicio)); });
  const L = Object.values(por).map(c => { const ult = c.d[c.d.length - 1], dias = Math.floor((Date.now() - ult) / 864e5);
    let media = 30; if (c.d.length >= 2) media = Math.round((ult - c.d[0]) / 864e5 / (c.d.length - 1));
    media = Math.max(10, Math.min(60, media)); return Object.assign(c, { dias, media, passou: dias - media }); })
    .filter(c => c.passou >= 3 && c.dias < 150).sort((a, b) => b.passou - a.passou).slice(0, 15);
  const html = `<div class="card" style="margin-bottom:14px"><h2>Hora de voltar</h2><p class="muted" style="font-size:14px;margin:-4px 0 8px">Clientes que já passaram do tempo de costume entre um corte e outro. Uma mensagem traz eles de volta.</p>
    <div class="lst">${L.length ? L.map(c => `<div class="r"><span><b>${esc(c.nome)}</b><br><span class="muted" style="font-size:12.5px">último corte há ${c.dias} dias · costuma vir a cada ${c.media}</span></span>
      <a class="b ok sm" target="_blank" rel="noopener" href="${zapLink(c.z, `Fala, ${primeiro(c.nome)}! Já faz ${c.dias} dias do seu último corte aqui na ${NEG.nome}. Bora dar um trato no visual? É só escolher o horário: ${siteURL()}`)}">Chamar</a></div>`).join("")
      : '<p class="vazio">Ninguém atrasado. Quem passar do tempo de costume aparece aqui.</p>'}</div></div>`;
  const t = $("main").querySelector(".top + p"); if (t) t.insertAdjacentHTML("afterend", html); }

/* ---------------- meu site: sinal por Pix ---------------- */
async function telaSiteBarb() { await telaSite(); if (TAB !== "site") return;
  const s = cfg().sinal || "", pct = (s.match(/(\d+(?:[.,]\d+)?)\s*%/) || [])[1], rs = (s.match(/R\$\s*(\d+(?:[.,]\d+)?)/) || [])[1], modo = pct ? "pct" : rs ? "rs" : "nao";
  const html = `<div class="card" style="margin-bottom:14px" id="cSinal"><h2>Sinal para garantir o horário</h2><p class="muted" style="font-size:14px;margin:-4px 0 10px">Com sinal, quem marca e não vem perde o valor. O site mostra o Pix na hora de agendar. ${(cfg().pix || {}).chave ? "" : "<b>Preencha a chave Pix mais abaixo para o sinal funcionar.</b>"}</p>
    <div class="grid2"><label class="f">Cobrar sinal<select class="t" id="snM"><option value="nao" ${modo === "nao" ? "selected" : ""}>Não cobrar</option><option value="pct" ${modo === "pct" ? "selected" : ""}>Uma % do serviço</option><option value="rs" ${modo === "rs" ? "selected" : ""}>Um valor fixo</option></select></label>
      <label class="f">Quanto<input class="t" id="snV" inputmode="decimal" value="${pct || rs || ""}" placeholder="ex.: 30"></label></div>
    <button class="b pri" style="margin-top:10px" onclick="salvarSinal()">Salvar sinal</button></div>`;
  const t = $("main").querySelector(".top"); if (t) t.insertAdjacentHTML("afterend", html); }
async function salvarSinal() { const mo = $("snM").value, v = num($("snV").value);
  if (mo !== "nao" && !(v > 0)) return toast("Escreva quanto é o sinal.");
  const txt = mo === "pct" ? `Sinal de ${String(v).replace(".", ",")}% por Pix para garantir o horário. Se não puder vir, avise com antecedência.` : mo === "rs" ? `Sinal de R$ ${v.toFixed(2).replace(".", ",")} por Pix para garantir o horário. Se não puder vir, avise com antecedência.` : "";
  await salvarDados(d => { d.config = d.config || {}; if (txt) d.config.sinal = txt; else delete d.config.sinal; }, txt ? "Sinal ligado. Já aparece no site." : "Sinal desligado."); }

/* ---------------- recibo do mês ---------------- */
let recMes = null;
async function telaRecibo() { recMes = recMes || isoD(new Date()).slice(0, 7); const m = $("main"), [y, mo] = recMes.split("-").map(Number), a = new Date(y, mo - 1, 1), b = new Date(y, mo, 1);
  const [ag, la] = await Promise.all([sb.from("zv_agendamentos").select("profissional,total,status,servicos").eq("negocio", NEG.id).gte("inicio", a.toISOString()).lt("inicio", b.toISOString()).neq("nome", "Bloqueio").limit(8000),
    sb.from("zv_lancamentos").select("tipo,valor,categoria").eq("negocio", NEG.id).gte("data", isoD(a)).lt("data", isoD(b)).limit(8000)]);
  if (TAB !== "recibo") return;
  const A = ag.data || [], L = la.data || [], at = A.filter(x => x.status === "atendido"), fal = A.filter(x => x.status === "faltou");
  const soma = l => l.reduce((s, x) => s + Number(x.valor), 0), ent = L.filter(x => x.tipo === "entrada"), sai = L.filter(x => x.tipo === "saida");
  const porCat = l => { const o = {}; l.forEach(x => o[x.categoria || "Outros"] = (o[x.categoria || "Outros"] || 0) + Number(x.valor)); return Object.entries(o).sort((p, q) => q[1] - p[1]); };
  const serv = {}; at.forEach(x => (x.servicos || []).forEach(s => serv[s.nome] = (serv[s.nome] || 0) + (s.qty || 1)));
  const porB = {}; at.forEach(x => { const k = x.profissional || "Sem barbeiro"; porB[k] = porB[k] || { n: 0, v: 0 }; porB[k].n++; porB[k].v += Number(x.total); });
  const meses = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return isoD(d).slice(0, 7); });
  const nomeMes = k => new Date(k + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const tabela = (rows, tot) => `<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${typeof v === "number" ? brl(v) : v}</td></tr>`).join("")}${tot ? `<tr class="tot"><td>${tot[0]}</td><td>${brl(tot[1])}</td></tr>` : ""}</table>`;
  m.innerHTML = topo("Recibo do mês", `<select class="t no-print" style="min-height:38px" aria-label="Mês" onchange="recMes=this.value;telaRecibo()">${meses.map(k => `<option value="${k}" ${k === recMes ? "selected" : ""}>${nomeMes(k)}</option>`).join("")}</select><button class="b pri sm" onclick="print()">Imprimir ou salvar PDF</button>`) +
    `<div class="rec-mes"><div class="card" style="margin-bottom:12px"><h2 style="text-transform:capitalize">${esc(NEG.nome)} · ${nomeMes(recMes)}</h2>
      <div class="kpis" style="margin-top:10px"><div class="kpi"><small>Entrou</small><b>${brl(soma(ent))}</b></div><div class="kpi"><small>Saiu</small><b>${brl(soma(sai))}</b></div><div class="kpi"><small>Sobrou</small><b style="color:${soma(ent) - soma(sai) < 0 ? "var(--no-ink)" : "var(--ok-ink)"}">${brl(soma(ent) - soma(sai))}</b></div>
      <div class="kpi"><small>Atendimentos</small><b>${at.length}</b><div class="sub">ticket médio ${brl(at.length ? at.reduce((s, x) => s + Number(x.total), 0) / at.length : 0)}</div></div></div></div>
    <div class="cols2"><div class="card"><h2>O que entrou</h2>${tabela(porCat(ent), ["Total", soma(ent)])}</div><div class="card"><h2>O que saiu</h2>${sai.length ? tabela(porCat(sai), ["Total", soma(sai)]) : '<p class="vazio">Nada lançado.</p>'}</div></div>
    <div class="cols2" style="margin-top:12px"><div class="card"><h2>Por barbeiro</h2>${Object.keys(porB).length ? tabela(Object.entries(porB).sort((p, q) => q[1].v - p[1].v).map(([k, x]) => [k + " · " + x.n + " atend.", x.v])) : '<p class="vazio">—</p>'}</div>
      <div class="card"><h2>Serviços mais feitos</h2>${Object.keys(serv).length ? tabela(Object.entries(serv).sort((p, q) => q[1] - p[1]).slice(0, 8).map(([k, n]) => [k, n + "×"])) : '<p class="vazio">—</p>'}
        <p class="muted" style="font-size:13px;margin:10px 0 0">Faltas no mês: <b>${fal.length}</b>${A.length ? ` (${Math.round(fal.length / Math.max(1, at.length + fal.length) * 100)}% dos horários)` : ""}.</p></div></div>
    <p class="muted" style="font-size:12.5px;margin-top:12px">Este resumo junta o caixa, os atendimentos e as comissões do mês. Dá para mandar para o contador como PDF.</p></div>`; }


/* ---------------- robô do WhatsApp ---------------- */
// O robô atende no WhatsApp da barbearia: marca, remarca, cancela, mostra preços, cuida da lista de espera e oferece vaga mais cedo.
let RB = { conv: null, contatos: [], canal: null, sim: [] };
const robo = () => Object.assign({ ativo: true, lembrete: true, horaLembrete: "18:00", antecipar: true, limiteDia: 60, minutosOferta: 20, nome: "", tom: "leve", faq: [] }, cfg().robo || {});
async function chamarRobo(acao, corpo) { const { data: s } = await sb.auth.getSession();
  const r = await fetch(SB_URL + "/functions/v1/zv-robo?acao=" + acao, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.session.access_token, apikey: SB_KEY }, body: JSON.stringify(Object.assign({ negocio: NEG.id }, corpo)) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || "O robô não respondeu agora."); return j; }
async function telaRobo() { const m = $("main");
  const [c, k, ex] = await Promise.all([sb.rpc("zv_canal_status", { p_neg: NEG.id }), sb.from("zv_bot_contatos").select("*").eq("negocio", NEG.id).not("ultima_in", "is", null).order("ultima_in", { ascending: false }).limit(60), sb.rpc("zv_canais_ext_status", { p_neg: NEG.id })]);
  if (TAB !== "robo") return; RB.ext = ex.error ? null : (ex.data || []);
  RB.canal = c.data || null; RB.contatos = (k.data || []).filter(x => !String(x.whatsapp).startsWith("550000")); const R = robo(), ligado = RB.canal && RB.canal.ligado;
  const precisa = RB.contatos.filter(x => x.humano_ate && Date.parse(x.humano_ate) > Date.now());
  m.innerHTML = topo("Robô de atendimento", `<button class="b sec sm" onclick="ajustesRobo()">Ajustes</button>`) +
    `<p class="muted" style="margin:-8px 0 14px;font-size:14px">O robô responde seus clientes no WhatsApp, no Instagram, no Messenger e no Telegram da barbearia, de dia e de noite: marca, remarca e cancela horários, mostra os preços, coloca na lista de espera e, quando alguém desmarca, oferece a vaga ao próximo da fila, um por vez. Quem decide o horário é a sua agenda, então ele não marca dois clientes no mesmo lugar.</p>
    <div class="kpis"><div class="card kpi"><small>WhatsApp</small><b style="font-size:20px">${ligado ? (RB.canal.pausado ? "Pausado" : "Conectado") : "Não conectado"}</b><div class="sub">${ligado ? "número final " + esc(RB.canal.final) + (RB.canal.qualidade && RB.canal.qualidade !== "GREEN" ? ` · <span style="color:var(--no-ink);font-weight:700">qualidade em alerta</span>` : " · qualidade boa") : `<a href="#" onclick="conectarWhats();return false">Conectar agora</a>`}</div></div>
      <div class="card kpi"><small>Robô</small><b style="font-size:20px">${R.ativo ? "Ligado" : "Desligado"}</b><div class="sub">${R.lembrete ? "lembrete às " + esc(R.horaLembrete) : "sem lembrete"}${R.antecipar ? " · avisa vagas" : ""}</div></div>
      <div class="card kpi"><small>Conversas</small><b>${RB.contatos.length}</b><div class="sub">${precisa.length ? `<span style="color:var(--am-ink);font-weight:700">${precisa.length} esperando você</span>` : "nenhuma esperando você"}</div></div>
      <div class="card kpi"><small>Proteção</small><b style="font-size:20px">${R.limiteDia}/dia</b><div class="sub">8h às 21h · 1 por cliente</div></div></div>
    ${ligado ? "" : `<div class="card" style="margin-bottom:12px;border-color:var(--cobalt)"><h2>Conecte o WhatsApp da barbearia</h2><p class="muted" style="font-size:14px">É pelo WhatsApp oficial da Meta, o jeito seguro: o número não é bloqueado por usar robô. Enquanto não conecta, teste o robô aqui embaixo.</p><button class="b pri" onclick="conectarWhats()">Conectar WhatsApp</button></div>`}
    <div class="card" style="margin-bottom:12px"><h2>Link para a bio do Instagram</h2><p class="muted" style="font-size:14px;margin:-4px 0 10px">Quem toca agenda conversando: escolhe o serviço pela foto, o barbeiro, o dia e o horário, em menos de 1 minuto. O robô do WhatsApp também manda esse link.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><code style="padding:9px 12px;border-radius:10px;background:var(--paper);border:1px solid var(--line);font-size:14px;overflow-wrap:anywhere">${esc(siteURL() + "?chat")}</code>
      <button class="b pri sm" onclick="navigator.clipboard.writeText('${esc(siteURL() + "?chat")}').then(()=>toast('Link copiado. Cole na bio do Instagram.'))">Copiar link</button><a class="b sec sm" href="${esc(siteURL() + "?chat")}" target="_blank" rel="noopener">Ver como fica</a></div></div>
    ${htmlCanaisExt()}
    <div class="rb-conv"><div class="card rb-lst"><h2>Conversas</h2><div class="lst">${RB.contatos.length ? RB.contatos.map(x => { const h = x.humano_ate && Date.parse(x.humano_ate) > Date.now();
        return `<div class="r ${RB.conv === x.whatsapp ? "on" : ""}" role="button" tabindex="0" onclick="abrirConv('${x.whatsapp}')"><span style="min-width:0"><b>${esc(x.nome || fmtZap(x.whatsapp))}</b><span class="ult">${CANAL_ROT[x.canal] && x.canal !== "whatsapp" ? CANAL_ROT[x.canal] + " · " : ""}${x.optout ? "pediu para não receber mensagens" : x.etapa === "oferta" ? "recebeu oferta de vaga" : desde(x.ultima_in)}</span></span>${h ? '<span class="pill am">Você</span>' : '<span class="pill ok">Robô</span>'}</div>`; }).join("")
        : '<p class="vazio">As conversas do WhatsApp aparecem aqui.</p>'}</div></div>
      <div class="card rb-chat ${RB.conv ? "" : "rb-sim"}" id="rbChat">${RB.conv ? "" : htmlSim()}</div></div>`;
  if (RB.conv) abrirConv(RB.conv); else ligarSim(); }
const CANAL_ROT = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", telegram: "Telegram" };
const fmtZap = z => { const c = String(z).match(/^(ig|fb|tg):/); if (c) { const x = RB.contatos && RB.contatos.find(k => k.whatsapp === z); return x && x.telefone ? fmtZap(x.telefone) : "Cliente do " + CANAL_ROT[{ ig: "instagram", fb: "messenger", tg: "telegram" }[c[1]]]; }
  z = String(z).replace(/^55/, ""); return z.length >= 10 ? `(${z.slice(0, 2)}) ${z.slice(2, -4)}-${z.slice(-4)}` : z; };
/* outros canais: Instagram Direct, Messenger e Telegram (o mesmo robô, a mesma agenda) */
const CANAIS_EXT = [
  ["instagram", "Instagram Direct", "Quem manda mensagem no Direct é atendido pelo robô. Precisa de conta profissional do Instagram ligada a uma página do Facebook."],
  ["messenger", "Messenger do Facebook", "Quem manda mensagem para a página da barbearia no Facebook é atendido pelo robô."],
  ["telegram", "Telegram", "Você cria o robô da barbearia no Telegram em 2 minutos e ele já começa a atender."]];
function htmlCanaisExt() { if (RB.ext === null) return "";
  const l = RB.ext || [], de = t => l.find(x => x.tipo === t);
  return `<div class="card" style="margin-bottom:12px"><h2>Outros canais</h2><p class="muted" style="font-size:14px;margin:-4px 0 10px">O mesmo robô, com as mesmas regras e a mesma agenda. Antes de marcar, ele pede o WhatsApp do cliente: é por lá que vão o lembrete e o aviso de vaga.</p>
    <div class="lst">${CANAIS_EXT.map(([t, nome, txt]) => { const c = de(t); return `<div class="r" style="align-items:center"><span style="min-width:0"><b>${nome}</b><span class="ult" style="display:block;font-size:13px;color:var(--ink2)">${c ? "Conectado: " + esc(c.nome || "") : txt}</span></span>
      ${c ? `<span style="display:flex;gap:6px;align-items:center"><span class="pill ok">ligado</span><button class="b sec sm" onclick="desconectarCanal('${t}')">Desligar</button></span>` : `<button class="b pri sm" onclick="conectarCanal('${t}')">Conectar</button>`}</div>`; }).join("")}</div></div>`; }
function conectarCanal(t) {
  const passos = t === "telegram" ? `<ol style="margin:0 0 10px;padding-left:20px;display:grid;gap:6px;font-size:14.5px"><li>No Telegram, abra o <b>@BotFather</b> e mande <b>/newbot</b>.</li><li>Dê o nome da barbearia e um usuário terminado em “bot” (ex.: barbeariadomrocha_bot).</li><li>Copie o <b>token</b> que ele mandar e cole aqui.</li></ol>
      <label class="f">Token do robô<input class="t" id="cxT" type="password" autocomplete="off" placeholder="123456789:AA..."></label>`
    : `<ol style="margin:0 0 10px;padding-left:20px;display:grid;gap:6px;font-size:14.5px"><li>No app da Meta que você usa no WhatsApp (developers.facebook.com), adicione o produto <b>${t === "instagram" ? "Instagram" : "Messenger"}</b>.</li>
      <li>Ligue a página do Facebook da barbearia${t === "instagram" ? " (que precisa estar conectada à conta profissional do Instagram)" : ""} e gere o <b>token de acesso da página</b>.</li><li>Copie a <b>identificação da página</b> (em Sobre &gt; Transparência da página) e o token, e cole aqui.</li></ol>
      <label class="f">Identificação da página do Facebook<input class="t" id="cxP" inputmode="numeric" autocomplete="off"></label>
      <label class="f" style="margin-top:8px">Token de acesso da página<input class="t" id="cxT" type="password" autocomplete="off"></label>`;
  abrirSheet(`<h2>Conectar ${CANAIS_EXT.find(x => x[0] === t)[1]}</h2><p class="muted" style="font-size:14px;margin:6px 0 10px">${t === "telegram" ? "Grátis e sem aprovação." : "A Meta precisa aprovar o uso de robô em páginas de terceiros (revisão do app). Enquanto isso, só quem tem acesso ao app consegue conversar. A Zivoop te ajuda na primeira vez."}</p>
    ${passos}<p class="err" id="cxE" role="alert"></p><button class="b pri wide" id="cxB" style="margin-top:6px" onclick="salvarCanalExt('${t}')">Conectar</button>
    <p class="muted" style="font-size:12.5px;margin:8px 0 0">O token fica guardado só no servidor. Nem o painel consegue ler de volta.</p>`); }
async function salvarCanalExt(t) { $("cxB").disabled = true; $("cxE").textContent = "";
  try { const r = await chamarRobo("conectar", { tipo: t, token: $("cxT").value.trim(), pagina: $("cxP") ? $("cxP").value.trim() : "" });
    fecharSheet(); toast((CANAIS_EXT.find(x => x[0] === t)[1]) + " conectado" + (r.nome ? " (" + r.nome + ")" : "") + ". O robô já está atendendo por lá."); telaRobo(); }
  catch (e) { $("cxE").textContent = e.message; $("cxB").disabled = false; } }
async function desconectarCanal(t) { if (!confirm("Desligar o robô no " + CANAL_ROT[t] + "? As conversas ficam guardadas.")) return;
  try { await chamarRobo("desconectar", { tipo: t }); toast("Desligado."); telaRobo(); } catch (e) { toast(e.message); } }
function htmlSim() { return `<div><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:0">Testar o robô</h2><button class="b sec sm" onclick="recomecarSim()">Recomeçar</button></div>
  <p class="muted" style="font-size:13.5px;margin:4px 0 0">Escreva como um cliente escreveria. Os horários marcados no teste entram na agenda como “Teste do robô” e saem quando você toca em Recomeçar.</p>
  <div class="msgs" id="simMsgs">${RB.sim.map(x => `<div class="msg ${x[0] === "c" ? "eu" : "cli"}">${esc(x[1])}</div>`).join("") || '<div class="msg cli">Oi! Mande uma mensagem como se fosse um cliente. Ex.: “quero cortar amanhã depois das 5”.</div>'}</div>
  <div class="sug">${["oi", "quero cortar amanhã depois das 5", "quanto custa a barba?", "qual é meu horário?", "preciso remarcar", "quero cancelar", "atendente"].map(s => `<button onclick="simEnviar('${s}')">${s}</button>`).join("")}</div>
  <form class="envio" onsubmit="event.preventDefault();simEnviar($('simTxt').value)"><input class="t" id="simTxt" autocomplete="off" placeholder="Escreva como cliente…" aria-label="Mensagem de teste"><button class="b pri">Enviar</button></form></div>`; }
function ligarSim() { const b = $("simMsgs"); if (b) b.scrollTop = b.scrollHeight; }
async function simEnviar(txt) { txt = String(txt || "").trim(); if (!txt) return; const box = $("simMsgs"); if (!box) return; $("simTxt").value = "";
  if (!RB.sim.length) box.innerHTML = ""; RB.sim.push(["c", txt]); box.insertAdjacentHTML("beforeend", `<div class="msg eu">${esc(txt)}</div><div class="msg cli pensando" id="simPens">digitando…</div>`); box.scrollTop = box.scrollHeight;
  try { const r = await chamarRobo("simular", { texto: txt }); $("simPens").remove();
    document.querySelectorAll("#simMsgs .simops").forEach(e => e.remove());
    (r.respostas.length ? r.respostas : [r.humano ? "(o robô ficou quieto: a conversa passou para você)" : "(sem resposta)"]).forEach(x => { const tx = typeof x === "string" ? x : x.texto; RB.sim.push(["r", tx]);
      box.insertAdjacentHTML("beforeend", `<div class="msg cli">${esc(tx)}${x.link ? `<a class="b sec sm" style="display:flex;margin-top:8px;justify-content:center" href="${esc(x.link.url)}" target="_blank" rel="noopener">${esc(x.link.botao)}</a>` : ""}</div>`);
      if (x.opcoes && x.opcoes.length) { const ids = x.opcoes.length === 2 && /^sim$/i.test(x.opcoes[0]) ? ["sim", "nao"] : x.opcoes.map((_, i) => String(i + 1));
        box.insertAdjacentHTML("beforeend", `<div class="simops" role="group" aria-label="Opções do robô">${x.opcoes.map((o, i) => `<button onclick="simEnviar('${ids[i]}')">${esc(o)}</button>`).join("")}</div>`); } }); }
  catch (e) { const p = $("simPens"); if (p) p.textContent = e.message; } box.scrollTop = box.scrollHeight; }
async function recomecarSim() { try { await chamarRobo("simular", { recomecar: true }); } catch (e) {} RB.sim = []; RB.conv = null; telaRobo(); }
async function abrirConv(z) { RB.conv = z; document.querySelectorAll(".rb-lst .r").forEach(r => r.classList.toggle("on", r.getAttribute("onclick").includes(z)));
  const box = $("rbChat"); if (!box) return; const c = RB.contatos.find(x => x.whatsapp === z) || {}, h = c.humano_ate && Date.parse(c.humano_ate) > Date.now();
  const { data } = await sb.from("zv_bot_msgs").select("id,dir,texto,criado_em").eq("negocio", NEG.id).eq("whatsapp", z).order("criado_em", { ascending: false }).order("id", { ascending: false }).limit(80);
  const L = (data || []).reverse(), janela = c.canal === "telegram" || (c.ultima_in && Date.now() - Date.parse(c.ultima_in) < 23.5 * 3600e3), zapDe = c.telefone || (/^\d+$/.test(z) ? z : "");
  box.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><h2 style="margin:0">${esc(c.nome || fmtZap(z))}${c.canal && c.canal !== "whatsapp" ? ` <span class="pill bl" style="font-size:12px;vertical-align:middle">${CANAL_ROT[c.canal]}</span>` : ""}</h2><span style="display:flex;gap:6px">
      ${h ? `<button class="b sec sm" onclick="devolverRobo('${z}')">Devolver para o robô</button>` : `<button class="b sec sm" onclick="assumirConv('${z}')">Assumir a conversa</button>`}<button class="b sec sm" onclick="RB.conv=null;telaRobo()">Testar o robô</button></span></div>
    <p class="muted" style="font-size:13px;margin:4px 0 0">${h ? "Você está atendendo: o robô fica quieto até você devolver (ou por 2 horas)." : "O robô está atendendo. Se precisar, assuma a conversa."}</p>
    <div class="msgs" id="convMsgs">${L.map(x => `<div class="msg ${x.dir === "in" ? "cli" : x.dir === "dono" ? "eu" : "bot"}">${esc(x.texto)}<small>${x.dir === "out" ? "robô · " : x.dir === "dono" ? "você · " : ""}${new Date(x.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></div>`).join("") || '<p class="vazio">Sem mensagens.</p>'}</div>
    ${janela ? `<form class="envio" onsubmit="event.preventDefault();responderConv('${z}')"><input class="t" id="convTxt" autocomplete="off" placeholder="Responder como a barbearia…" aria-label="Sua resposta"><button class="b pri">Enviar</button></form>`
      : `<p class="muted" style="font-size:13px;margin:8px 0 0">Faz mais de 24 horas que o cliente não escreve. Pelas regras do ${CANAL_ROT[c.canal] || "WhatsApp"}, só dá para responder quando ele mandar mensagem de novo. ${zapDe ? `<a href="${zapLink(zapDe, "")}" target="_blank" rel="noopener">Chamar no seu WhatsApp</a>` : ""}</p>`}`;
  const mm = $("convMsgs"); if (mm) mm.scrollTop = mm.scrollHeight; }
async function responderConv(z) { const t = $("convTxt").value.trim(); if (!t) return; $("convTxt").disabled = true;
  try { await chamarRobo("enviar", { whatsapp: z, texto: t }); toast("Enviado."); await telaRobo(); } catch (e) { toast(e.message); $("convTxt").disabled = false; } }
async function assumirConv(z) { const { error } = await sb.from("zv_bot_contatos").update({ humano_ate: new Date(Date.now() + 2 * 3600e3).toISOString() }).eq("negocio", NEG.id).eq("whatsapp", z); if (error) return toast(erro(error)); telaRobo(); }
async function devolverRobo(z) { const { error } = await sb.from("zv_bot_contatos").update({ humano_ate: null, estado: {} }).eq("negocio", NEG.id).eq("whatsapp", z); if (error) return toast(erro(error)); toast("O robô voltou a atender."); telaRobo(); }
let FAQ = [];
const FAQ_SUG = ["Aceitam cartão?", "Tem estacionamento?", "Atendem criança?", "Precisa marcar ou pode chegar?", "Fazem pigmentação de barba?", "Vendem produtos (pomada, óleo)?"];
function linhasFaq() { return FAQ.map((f, i) => `<div class="card" style="padding:10px;margin-top:8px"><input class="t" id="fqP${i}" placeholder="Pergunta" value="${esc(f.p || "")}" maxlength="120" aria-label="Pergunta ${i + 1}">
  <textarea class="t" id="fqR${i}" rows="2" style="margin-top:6px" placeholder="Resposta do robô (deixe em branco para tirar)" maxlength="500" aria-label="Resposta ${i + 1}">${esc(f.r || "")}</textarea></div>`).join(""); }
function lerFaq() { FAQ.forEach((f, i) => { const a = $("fqP" + i), b = $("fqR" + i); if (a) { f.p = a.value.trim(); f.r = b.value.trim(); } }); }
function maisFaq(sug) { lerFaq(); (sug ? FAQ_SUG.filter(q => !FAQ.some(f => f.p === q)).map(p => ({ p, r: "" })) : [{ p: "", r: "" }]).forEach(f => FAQ.push(f)); $("fqL").innerHTML = linhasFaq(); }
function ajustesRobo() { const R = robo(); FAQ = clone(R.faq || []);
  abrirSheet(`<h2>Ajustes do robô</h2><label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-weight:650"><input type="checkbox" id="rbA" ${R.ativo ? "checked" : ""}> Robô ligado</label>
    <div class="grid2" style="margin-top:10px"><label class="f">Nome do atendente (opcional)<input class="t" id="rbNm" maxlength="20" placeholder="Ex.: Bia" value="${esc(R.nome || "")}"></label>
      <label class="f">Jeito de falar<select class="t" id="rbTm"><option value="leve" ${R.tom !== "formal" ? "selected" : ""}>Descontraído, com emoji</option><option value="formal" ${R.tom === "formal" ? "selected" : ""}>Formal, sem emoji</option></select></label></div>
    <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-weight:650"><input type="checkbox" id="rbL" ${R.lembrete ? "checked" : ""}> Mandar lembrete na véspera</label>
    <div class="grid2" style="margin-top:8px"><label class="f">Horário do lembrete<input class="t" type="time" id="rbH" value="${esc(R.horaLembrete)}"></label><label class="f">Tempo para responder uma vaga (min)<input class="t" inputmode="numeric" id="rbM" value="${R.minutosOferta}"></label></div>
    <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-weight:650"><input type="checkbox" id="rbV" ${R.antecipar ? "checked" : ""}> Oferecer vaga que abriu (lista de espera e quem quer adiantar)</label>
    <label class="f" style="margin-top:10px">Máximo de mensagens por iniciativa do robô, por dia<input class="t" inputmode="numeric" id="rbD" value="${R.limiteDia}"></label>
    <p class="muted" style="font-size:13px;margin:10px 0 0">Para o número não ser bloqueado, o robô só manda mensagem primeiro entre 8h e 21h, no máximo 1 por dia para cada cliente, nunca para quem escreveu SAIR, e para sozinho se a Meta avisar que o número está sendo denunciado.</p>
    ${RB.canal && RB.canal.ligado ? `<button class="b sec wide" style="margin-top:12px" onclick="pausarCanal(${!RB.canal.pausado})">${RB.canal.pausado ? "Retomar os envios" : "Pausar os envios por iniciativa"}</button>` : ""}
    <h3 style="margin:16px 0 0;font-size:16px">Perguntas frequentes</h3><p class="muted" style="font-size:13px;margin:4px 0 0">O robô responde só o que estiver aqui ou no seu site. O que ele não souber, passa para você, sem inventar.</p>
    <div id="fqL">${linhasFaq()}</div><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="b sec sm" onclick="maisFaq()">+ Pergunta</button><button class="b sec sm" onclick="maisFaq(true)">Sugerir perguntas comuns</button></div>
    <button class="b pri wide" style="margin-top:12px" onclick="salvarRobo()">Salvar</button>`); }
async function salvarRobo() { const r = { ativo: $("rbA").checked, lembrete: $("rbL").checked, horaLembrete: $("rbH").value || "18:00", antecipar: $("rbV").checked,
    minutosOferta: Math.min(120, Math.max(5, parseInt($("rbM").value) || 20)), limiteDia: Math.min(250, Math.max(5, parseInt($("rbD").value) || 60)),
    nome: $("rbNm").value.trim().slice(0, 20), tom: $("rbTm").value };
  lerFaq(); r.faq = FAQ.filter(f => f.p && f.r).slice(0, 40);
  const ok = await salvarDados(d => { d.config = d.config || {}; d.config.robo = r; }, "Ajustes do robô salvos."); if (ok) { fecharSheet(); telaRobo(); } }
async function pausarCanal(p) { const { error } = await sb.rpc("zv_canal_pausar", { p_neg: NEG.id, p_pausado: p }); if (error) return toast(erro(error)); fecharSheet(); telaRobo(); }
function conectarWhats() { abrirSheet(`<h2>Conectar o WhatsApp</h2><p class="muted" style="font-size:14px;margin:6px 0 10px">Use um número que ainda não está no aplicativo do WhatsApp (ou migre o da barbearia). A Zivoop te ajuda na primeira vez.</p>
  <ol style="margin:0 0 10px;padding-left:20px;display:grid;gap:6px;font-size:14.5px"><li>Entre em business.facebook.com com a conta da barbearia e crie o app do WhatsApp (tipo “Empresa”).</li><li>Em WhatsApp &gt; Configuração da API, adicione o número e confirme o código por SMS.</li><li>Copie a <b>Identificação do número de telefone</b> e gere um <b>token permanente</b> (usuário do sistema).</li><li>Cole os dois aqui.</li></ol>
  <label class="f">Identificação do número de telefone<input class="t" id="cwP" inputmode="numeric" autocomplete="off"></label>
  <label class="f" style="margin-top:8px">Token permanente<input class="t" id="cwT" type="password" autocomplete="off"></label>
  <label class="f" style="margin-top:8px">Número com DDD<input class="t" id="cwN" inputmode="tel" placeholder="(11) 99999-9999"></label>
  <p class="err" id="cwE" role="alert"></p><button class="b pri wide" style="margin-top:6px" onclick="salvarCanal()">Conectar</button>
  <p class="muted" style="font-size:12.5px;margin:8px 0 0">O token fica guardado só no servidor. Nem o painel consegue ler de volta.</p>`); }
async function salvarCanal() { const { error } = await sb.rpc("zv_canal_salvar", { p_neg: NEG.id, p_phone_id: $("cwP").value.trim(), p_token: $("cwT").value.trim(), p_numero: $("cwN").value });
  if (error) return $("cwE").textContent = /phone_id/.test(error.message) ? "A identificação do número tem só números (copie da Meta)." : /token/.test(error.message) ? "O token parece incompleto." : erro(error);
  fecharSheet(); toast("WhatsApp conectado."); telaRobo(); }
