/* ===== Módulos que mais de um software da Zivoop usa (entram antes do arquivo do produto) ===== */
(() => { const s = document.createElement("style"); s.textContent = `.cont .r.venc b.v{color:var(--no-ink)}.cont .r.logo2 b.v{color:var(--am-ink)}`; document.head.appendChild(s); })();
/* ---------------- contas a pagar ---------------- */
let CONTAS = [];
async function telaContas() { const m = $("main"), hoje = isoD(new Date()), d7 = isoD(new Date(Date.now() + 7 * 864e5)), mes = hoje.slice(0, 8) + "01";
  const [a, b] = await Promise.all([sb.from("zv_contas").select("*").eq("negocio", NEG.id).is("pago_em", null).order("vence").limit(300),
    sb.from("zv_contas").select("*").eq("negocio", NEG.id).gte("pago_em", mes).order("pago_em", { ascending: false }).limit(200)]);
  if (TAB !== "contas") return; if (a.error) { m.innerHTML = topo("Contas a pagar") + `<div class="card vazio">${esc(erro(a.error))}</div>`; return; }
  CONTAS = a.data || []; const pagas = b.data || [], soma = L => L.reduce((s, x) => s + Number(x.valor), 0);
  const venc = CONTAS.filter(x => x.vence < hoje), sem = CONTAS.filter(x => x.vence >= hoje && x.vence <= d7);
  const dt = s => s.split("-").reverse().slice(0, 2).join("/");
  const linha = x => `<div class="r ${x.vence < hoje ? "venc" : x.vence <= d7 ? "logo2" : ""}"><span><b>${esc(x.descricao)}</b><br><span class="muted" style="font-size:12.5px">${x.vence < hoje ? "Venceu " : "Vence "}${dt(x.vence)} · ${esc(x.categoria)}${x.mensal ? " · todo mês" : ""}</span></span>
    <span style="display:flex;gap:8px;align-items:center"><b class="v">${brl(x.valor)}</b><button class="b ok sm" onclick="pagarConta('${x.id}')">Pagar</button><button class="b sec sm" aria-label="Apagar ${esc(x.descricao)}" onclick="apagarConta('${x.id}')">×</button></span></div>`;
  m.innerHTML = topo("Contas a pagar", `<button class="b pri sm" onclick="novaConta()">Nova conta</button>`) +
    `<p class="muted" style="margin:-8px 0 14px;font-size:14px">Fornecedor, aluguel, luz, gás, funcionário. Ao tocar em “Pagar”, a conta sai do caixa sozinha. Conta de todo mês já volta para o mês seguinte.</p>
    <div class="kpis"><div class="card kpi"><small>Vencidas</small><b style="color:${venc.length ? "var(--no-ink)" : "inherit"}">${brl(soma(venc))}</b><div class="sub">${venc.length} ${venc.length === 1 ? "conta" : "contas"}</div></div>
      <div class="card kpi"><small>Vence em 7 dias</small><b>${brl(soma(sem))}</b><div class="sub">${sem.length} ${sem.length === 1 ? "conta" : "contas"}</div></div>
      <div class="card kpi"><small>Tudo em aberto</small><b>${brl(soma(CONTAS))}</b></div><div class="card kpi"><small>Pago neste mês</small><b>${brl(soma(pagas))}</b></div></div>
    <div class="cols2"><div class="card cont"><h2>Em aberto</h2><div class="lst">${CONTAS.length ? CONTAS.map(linha).join("") : '<p class="vazio">Nenhuma conta em aberto. Cadastre as contas do mês em “Nova conta”.</p>'}</div></div>
      <div class="card"><h2>Pagas neste mês</h2><div class="lst">${pagas.length ? pagas.map(x => `<div class="r"><span>${esc(x.descricao)}<br><span class="muted" style="font-size:12.5px">pago ${dt(x.pago_em)}</span></span><b>${brl(x.valor)}</b></div>`).join("") : '<p class="vazio">—</p>'}</div></div></div>`; }
function novaConta() { abrirSheet(`<h2>Nova conta</h2><label class="f" style="margin-top:12px">O que é<input class="t" id="cD" maxlength="120" placeholder="Ex.: Pão do fornecedor, aluguel, gás"></label>
  <div class="grid2" style="margin-top:10px"><label class="f">Valor<input class="t" id="cV" inputmode="decimal" placeholder="0,00"></label><label class="f">Vence em<input class="t" id="cVe" type="date" value="${isoD(new Date())}"></label></div>
  <label class="f" style="margin-top:10px">Tipo<select class="t" id="cC">${["Fornecedor", "Aluguel", "Contas (luz, água, gás, internet)", "Funcionários", "Impostos", "Embalagens", "Manutenção", "Outros"].map(x => `<option>${x}</option>`).join("")}</select></label>
  <label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-weight:650"><input type="checkbox" id="cM"> Repete todo mês</label>
  <p class="err" id="cErr" role="alert" style="margin-top:8px"></p><button class="b pri wide" style="margin-top:6px" onclick="salvarConta()">Salvar</button>`); }
async function salvarConta() { const desc = $("cD").value.trim(), v = num($("cV").value), ve = $("cVe").value;
  if (!desc) return $("cErr").textContent = "Escreva o que é a conta."; if (!v || v <= 0) return $("cErr").textContent = "Escreva o valor."; if (!ve) return $("cErr").textContent = "Escolha a data de vencimento.";
  const { error } = await sb.from("zv_contas").insert({ negocio: NEG.id, descricao: desc, valor: v, vence: ve, categoria: $("cC").value, mensal: $("cM").checked });
  if (error) return $("cErr").textContent = erro(error); fecharSheet(); toast("Conta salva."); telaContas(); }
async function pagarConta(id) { const c = CONTAS.find(x => x.id === id); if (!confirm(`Marcar “${c.descricao}” (${brl(c.valor)}) como paga hoje?`)) return;
  const { error } = await sb.rpc("zv_pagar_conta", { p_conta: id }); if (error) return toast(erro(error)); toast(c.mensal ? "Paga. A do mês que vem já está na lista." : "Paga. Saiu do caixa."); telaContas(); }
async function apagarConta(id) { if (!confirm("Apagar esta conta?")) return; const { error } = await sb.from("zv_contas").delete().eq("id", id); if (error) return toast(erro(error)); telaContas(); }

