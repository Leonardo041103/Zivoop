// Agente da Zivoop: o dono escreve como falaria com um funcionário e o agente muda o site, a agenda e o painel.
// Funciona com IA (OpenAI ou compatível, se houver chave) e, sem chave, com um entendedor de frases comuns em português.
// Este arquivo não depende de Deno nem de Node: só fetch. Usado pela Edge Function e pelos testes.

export function criarDB(url, headers) {
  const h = Object.assign({ "Content-Type": "application/json" }, headers);
  const req = async (method, path, body, extra) => {
    const r = await fetch(url + "/rest/v1/" + path, { method, headers: Object.assign({}, h, extra || {}), body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
    if (!r.ok) throw new Error((j && j.message) || t || ("HTTP " + r.status));
    return j;
  };
  return {
    sel: p => req("GET", p),
    ins: (t, b) => req("POST", t, b, { Prefer: "return=representation" }),
    upd: (p, b) => req("PATCH", p, b, { Prefer: "return=representation" }),
    del: p => req("DELETE", p),
    rpc: (f, b) => req("POST", "rpc/" + f, b),
  };
}

const sem = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const brl = v => "R$ " + Number(v || 0).toFixed(2).replace(".", ",");
const numero = s => { if (s == null) return null; let t = String(s).replace(/r\$|reais|real/gi, "").trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, ""); t = t.replace(",", "."); const n = parseFloat(t); return isNaN(n) ? null : Math.round(n * 100) / 100; };
const pad = n => String(n).padStart(2, "0");
const agoraSP = () => new Date(Date.now() - 3 * 3600e3);
const hojeSP = () => agoraSP().toISOString().slice(0, 10);
const DIAS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const NICHOS = [["hamburgueria", "hamburgueria|burger|lanchonete|lanche"], ["pizzaria", "pizzaria|pizza"], ["acai", "acai|acaiteria"], ["marmitaria", "marmita|marmitaria|quentinha"],
  ["pastelaria", "pastel|pastelaria"], ["padaria", "padaria|panificadora|confeitaria"], ["mini-mercado", "mercado|mercadinho|mercearia|minimercado"], ["acougue", "acougue|carnes"],
  ["hortifruti", "hortifruti|sacolao|verdura|feira"], ["distribuidora", "distribuidora|bebida"], ["adega", "adega|vinho"], ["farmacia", "farmacia|drogaria"], ["floricultura", "floricultura|flor"],
  ["gas-agua", "gas|agua"], ["loja-roupa", "roupa|moda|boutique"], ["materiais-construcao", "construcao|material"], ["autopecas", "autopeca|pecas"], ["agropecuaria", "agropecuaria|racao|agro"],
  ["barbearia", "barbearia|barbeiro|barber"], ["salao", "salao|cabeleireir|beleza"], ["studio-unhas", "unha|manicure|nail"], ["clinica-estetica", "estetica"], ["dentista", "dentista|odonto"],
  ["petshop", "pet|banho e tosa"], ["veterinaria", "veterinari"], ["personal", "personal"], ["academia", "academia|crossfit"], ["escola-aulas", "aula|escola|curso"],
  ["tatuagem", "tatuagem|tattoo|tatuador"], ["fotografo", "fotograf"], ["oficina-mecanica", "oficina|mecanic"], ["lava-jato", "lava jato|lavajato|lava rapido|estetica automotiva"],
  ["assistencia-celular", "celular|assistencia"], ["pousada", "pousada|hotel|hostel"], ["chacara", "chacara|sitio"], ["quadra-society", "quadra|society|futebol"], ["aluguel-festa", "festa|aluguel"]];
export const nichoDe = t => { const s = sem(t); for (const [n, re] of NICHOS) if (new RegExp("\\b(" + re + ")").test(s)) return n; return null; };

/* ------------------------------------------------------------ contexto do negócio */
async function contexto(db, negId, donoId, siteUrl) {
  const l = await db.sel(`zv_negocios?select=*&dono=eq.${donoId}&order=criado_em` + (negId ? `&id=eq.${negId}` : ""));
  const neg = l && l[0]; if (!neg) return null;
  let pad = { config: {}, menu: [], textos: {} };
  try { const r = await fetch(`${siteUrl}/modelos/${neg.nicho}/padrao.json`); if (r.ok) pad = await r.json(); } catch (e) {}
  const C = { db, neg, pad, mudou: false, feitos: [] };
  C.menu = () => JSON.parse(JSON.stringify(C.neg.dados.menu || C.pad.menu || []));
  C.cfg = () => Object.assign({}, C.pad.config || {}, C.neg.dados.config || {});
  C.salvar = async (f, extra) => { const d = JSON.parse(JSON.stringify(C.neg.dados || {})); f(d); const r = await db.upd(`zv_negocios?id=eq.${C.neg.id}`, Object.assign({ dados: d }, extra || {})); C.neg = r[0] || C.neg; C.mudou = true; };
  return C;
}
function acharItem(C, nome) {
  const alvo = sem(nome).replace(/^(o|a|os|as|um|uma) /, ""); if (!alvo) return null;
  let melhor = null, nota = 0;
  C.menu().forEach((c, ci) => (c.items || []).forEach((it, ii) => {
    const n = sem(it.n); let s = 0;
    if (n === alvo) s = 100; else if (n.includes(alvo) || alvo.includes(n)) s = 60 + Math.min(n.length, alvo.length) / Math.max(n.length, alvo.length) * 30;
    else { const a = new Set(alvo.split(" ").filter(w => w.length > 2)), b = n.split(" ").filter(w => w.length > 2); const k = b.filter(w => a.has(w)).length; if (k) s = 30 + k / Math.max(a.size, b.length) * 30; }
    if (s > nota) { nota = s; melhor = { ci, ii, it, cat: c.cat }; }
  }));
  return nota >= 45 ? melhor : null;
}
const nomesParecidos = (C, nome) => { const a = sem(nome).split(" ").filter(w => w.length > 2); return C.menu().flatMap(c => c.items || []).filter(it => a.some(w => sem(it.n).includes(w.slice(0, 4)))).slice(0, 4).map(i => i.n); };

/* ------------------------------------------------------------ ações (as mesmas para a IA e para as frases) */
export const ACOES = {
  async mudar_preco(C, { item, preco, opcao }) {
    const p = numero(preco); if (p == null || p < 0) return "Não entendi o preço. Escreva assim: “muda o X pra R$ 29,90”.";
    const a = acharItem(C, item); if (!a) { const s = nomesParecidos(C, item); return `Não achei “${item}” no ${C.neg.tipo === "agenda" ? "serviços" : "cardápio"}.` + (s.length ? ` Você quis dizer ${s.join(", ")}?` : ""); }
    let antes;
    await C.salvar(d => { d.menu = d.menu || C.menu(); const it = d.menu[a.ci].items[a.ii];
      if (it.v && it.v.length) { const op = opcao ? it.v.find(v => sem(v.l).includes(sem(opcao))) : null;
        if (!op && it.v.length > 1 && !opcao) { antes = "OPCOES"; return; }
        const alvo = op || it.v[0]; antes = alvo.p; alvo.p = p; if (alvo === it.v[0]) it.p = p; }
      else { antes = it.p; it.p = p; } });
    if (antes === "OPCOES") { C.mudou = false; return `${a.it.n} tem ${a.it.v.map(v => v.l).join(", ")}. Qual delas fica ${brl(p)}?`; }
    C.feitos.push("preço"); return `Feito! ${a.it.n}${opcao ? " (" + opcao + ")" : ""} agora custa ${brl(p)}${antes != null ? ` (antes ${brl(antes)})` : ""}. Já está no ar.`;
  },
  async adicionar_item(C, { nome, preco, categoria, descricao, duracao }) {
    const p = numero(preco); if (!nome) return "Qual o nome do item?"; if (p == null) return `Qual o preço de ${nome}?`;
    if (acharItem(C, nome) && sem(acharItem(C, nome).it.n) === sem(nome)) return `${nome} já está no ${C.neg.tipo === "agenda" ? "site" : "cardápio"}. Quer mudar o preço?`;
    let cat;
    await C.salvar(d => { d.menu = d.menu || C.menu(); let ci = categoria ? d.menu.findIndex(c => sem(c.cat).includes(sem(categoria)) || sem(categoria).includes(sem(c.cat))) : -1;
      if (ci < 0 && categoria) { d.menu.push({ cat: categoria, key: "c" + Date.now().toString(36), items: [] }); ci = d.menu.length - 1; }
      if (ci < 0) ci = Math.max(0, d.menu.findIndex(c => !(c.items || []).some(i => i.vis || i.g)));
      if (!d.menu.length) d.menu.push({ cat: "Novidades", key: "novidades", items: [] });
      const it = { id: "i" + Date.now().toString(36), n: nome, d: descricao || "", p, e: C.neg.tipo === "agenda" ? "✨" : "🆕" }; if (C.neg.tipo === "agenda") it.dur = parseInt(duracao) || 30;
      d.menu[ci].items.push(it); cat = d.menu[ci].cat; });
    C.feitos.push("item"); return `Adicionei ${nome} por ${brl(p)} em “${cat}”. Já aparece no site. Quer colocar uma foto? É só mandar pelo painel, em ${C.neg.tipo === "agenda" ? "Serviços" : "Catálogo"}.`;
  },
  async remover_item(C, { item }) {
    const a = acharItem(C, item); if (!a) return `Não achei “${item}”.`;
    await C.salvar(d => { d.menu = d.menu || C.menu(); d.menu[a.ci].items.splice(a.ii, 1); });
    return `Tirei ${a.it.n} do site.`;
  },
  async ocultar_item(C, { item, oculto }) {
    const a = acharItem(C, item); if (!a) return `Não achei “${item}”.`;
    await C.salvar(d => { d.menu = d.menu || C.menu(); d.menu[a.ci].items[a.ii].oculto = !!oculto; });
    return oculto ? `Pronto, ${a.it.n} saiu do site até você avisar que voltou.` : `${a.it.n} voltou para o site.`;
  },
  async mudar_dado(C, { campo, valor }) {
    const c = sem(campo); if (!valor) return "Qual o novo valor?";
    if (/whats|zap|telefone|celular|numero/.test(c)) { const z = String(valor).replace(/\D/g, ""); if (z.length < 10) return "Esse número parece incompleto. Mande com DDD.";
      await C.salvar(d => { d.config = Object.assign(d.config || {}, { whatsapp: z.length <= 11 ? "55" + z : z }); }, { whatsapp_dono: z }); return `WhatsApp trocado para ${valor}. Os novos ${C.neg.tipo === "agenda" ? "agendamentos" : "pedidos"} chegam nele.`; }
    if (/endere/.test(c)) { await C.salvar(d => { d.config = Object.assign(d.config || {}, { endereco: valor }); d.textos = Object.assign(d.textos || {}, { endereco: valor }); }); return `Endereço atualizado: ${valor}.`; }
    if (/^nome|nome do|nome da/.test(c)) { await C.salvar(d => { d.config = Object.assign(d.config || {}, { nome: valor }); }, { nome: valor }); return `O nome agora é ${valor}.`; }
    if (/pix/.test(c)) { await C.salvar(d => { d.config = Object.assign(d.config || {}, { pix: Object.assign({}, C.cfg().pix || {}, { chave: valor, nome: C.neg.nome }) }); }); return `Chave Pix trocada para ${valor}.`; }
    if (/frase|slogan|titulo|chamada/.test(c)) { await C.salvar(d => { d.textos = Object.assign(d.textos || {}, { tagline: valor }); }); return `Frase principal trocada.`; }
    if (/rodape/.test(c)) { await C.salvar(d => { d.textos = Object.assign(d.textos || {}, { foot: valor }); }); return `Rodapé trocado.`; }
    return "Consigo mudar: nome, WhatsApp, endereço, chave Pix, frase principal e rodapé.";
  },
  async mudar_horario(C, { dias, abre, fecha, fechado }) {
    const ds = (Array.isArray(dias) ? dias : [dias]).map(x => typeof x === "number" ? x : DIAS.findIndex(d => sem(x).startsWith(d.slice(0, 3)))).filter(x => x >= 0);
    if (!ds.length) return "Para qual dia? Ex.: “fecha no domingo” ou “sábado abre das 9 às 14”.";
    const hh = h => { if (!h) return null; const m = String(h).match(/(\d{1,2})(?:[:h](\d{2}))?/); return m ? pad(+m[1]) + ":" + pad(+(m[2] || 0)) : null; };
    if (!fechado && (!hh(abre) || !hh(fecha))) return "Qual horário? Ex.: “das 9 às 18”.";
    await C.salvar(d => { const h = Object.assign({}, C.cfg().horario || {}); ds.forEach(x => h[x] = fechado ? null : [hh(abre), hh(fecha)]); d.config = Object.assign(d.config || {}, { horario: h }); });
    const nomes = ds.map(x => ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][x]).join(", ");
    return fechado ? `Combinado: fechado ${nomes}. O site já não oferece esse dia.` : `Horário de ${nomes}: ${hh(abre)} às ${hh(fecha)}.`;
  },
  async bloquear(C, { data, de, ate, profissional, motivo }) {
    if (C.neg.tipo !== "agenda") return "Bloquear horário é para negócios com agenda.";
    const dia = resolverData(data); if (!dia) return "Qual dia? Ex.: “bloqueia amanhã das 12h às 14h”.";
    const hh = h => { const m = String(h || "").match(/(\d{1,2})(?:[:h](\d{2}))?/); return m ? pad(+m[1]) + ":" + pad(+(m[2] || 0)) : null; };
    const a = hh(de) || "00:00", b = hh(ate) || "23:59";
    await C.db.ins("zv_bloqueios", { negocio: C.neg.id, profissional: profissional || "", inicio: dia + "T" + a + ":00-03:00", fim: dia + "T" + b + ":00-03:00", motivo: motivo || null });
    return `Bloqueado ${dia.split("-").reverse().join("/")} das ${a} às ${b}${profissional ? " para " + profissional : ""}. Ninguém consegue marcar nesse intervalo.`;
  },
  async resumo(C, { periodo }) {
    const p = sem(periodo || "hoje"), hoje = hojeSP();
    const ini = /mes/.test(p) ? hoje.slice(0, 8) + "01" : /semana/.test(p) ? new Date(Date.now() - 3 * 3600e3 - 6 * 864e5).toISOString().slice(0, 10) : hoje;
    const lanc = await C.db.sel(`zv_lancamentos?select=tipo,valor&negocio=eq.${C.neg.id}&data=gte.${ini}`);
    const ent = lanc.filter(x => x.tipo === "entrada").reduce((a, x) => a + Number(x.valor), 0), sai = lanc.filter(x => x.tipo === "saida").reduce((a, x) => a + Number(x.valor), 0);
    const iniTs = ini + "T00:00:00-03:00", rot = ini === hoje ? "Hoje" : /mes/.test(p) ? "Este mês" : "Nos últimos 7 dias";
    if (C.neg.tipo !== "pedido") { const ag = await C.db.sel(`zv_agendamentos?select=status,total&negocio=eq.${C.neg.id}&inicio=gte.${encodeURIComponent(iniTs)}`);
      const c = s => ag.filter(x => x.status === s).length;
      if (C.neg.tipo === "reserva") return `${rot}: ${ag.length} ${ag.length === 1 ? "reserva" : "reservas"} começando (${c("confirmado")} confirmadas, ${c("pendente")} esperando confirmação). Entrou ${brl(ent)}${sai ? `, saiu ${brl(sai)}` : ""}.`;
      return `${rot}: ${ag.length} ${ag.length === 1 ? "agendamento" : "agendamentos"} (${c("atendido")} atendidos, ${c("confirmado")} confirmados, ${c("pendente")} esperando confirmação, ${c("faltou")} faltas). Entrou ${brl(ent)}${sai ? `, saiu ${brl(sai)}` : ""}.`; }
    const ped = await C.db.sel(`zv_pedidos?select=etapa,total&negocio=eq.${C.neg.id}&criado_em=gte.${encodeURIComponent(iniTs)}`);
    const val = ped.filter(x => x.etapa !== "cancelado"), ab = ped.filter(x => ["novo", "preparo", "pronto"].includes(x.etapa)).length;
    return `${rot}: ${val.length} ${val.length === 1 ? "pedido" : "pedidos"} somando ${brl(val.reduce((a, x) => a + Number(x.total), 0))}${ab ? `, ${ab} ainda em aberto` : ""}. No caixa entrou ${brl(ent)}${sai ? ` e saiu ${brl(sai)}` : ""}.`;
  },
  async listar_agenda(C, { data }) {
    if (C.neg.tipo === "pedido") return ACOES.listar_pedidos(C, {});
    const dia = resolverData(data || "hoje"); const l = await C.db.sel(`zv_agendamentos?select=nome,inicio,profissional,status,numero&negocio=eq.${C.neg.id}&inicio=gte.${encodeURIComponent(dia + "T00:00:00-03:00")}&inicio=lt.${encodeURIComponent(dia + "T23:59:59-03:00")}&status=neq.cancelado&order=inicio`);
    if (!l.length) return `Nada marcado em ${dia.split("-").reverse().join("/")}.`;
    return `${dia.split("-").reverse().join("/")}:\n` + l.map(x => { const t = new Date(new Date(x.inicio).getTime() - 3 * 3600e3); return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} ${x.nome}${x.profissional ? " (" + x.profissional + ")" : ""} · ${x.status} · nº ${x.numero}`; }).join("\n");
  },
  async listar_pedidos(C, { etapa }) {
    const l = await C.db.sel(`zv_pedidos?select=numero,nome,total,etapa,criado_em&negocio=eq.${C.neg.id}&etapa=in.(${etapa ? etapa : "novo,preparo,pronto"})&order=criado_em.desc&limit=15`);
    if (!l.length) return "Nenhum pedido em aberto agora.";
    return "Pedidos em aberto:\n" + l.map(x => `nº ${x.numero} · ${x.nome} · ${brl(x.total)} · ${x.etapa}`).join("\n");
  },
  async mover_pedido(C, { numero: n, etapa }) {
    const map = { novo: "novo", preparo: "preparo", preparando: "preparo", pronto: "pronto", saiu: "pronto", entregue: "entregue", cancelado: "cancelado", cancela: "cancelado" };
    const e = map[sem(etapa).split(" ")[0]]; if (!e) return "Para qual etapa? novo, preparo, pronto, entregue ou cancelado.";
    const r = await C.db.upd(`zv_pedidos?negocio=eq.${C.neg.id}&numero=eq.${parseInt(n)}`, { etapa: e }); if (!r.length) return `Não achei o pedido nº ${n}.`;
    return `Pedido nº ${n} agora está como ${e}.` + (e === "entregue" ? " O valor entrou no caixa." : "");
  },
  async status_agendamento(C, { numero: n, status }) {
    const map = { confirma: "confirmado", confirmado: "confirmado", atendido: "atendido", faltou: "faltou", cancela: "cancelado", cancelado: "cancelado" };
    const s = map[sem(status).split(" ")[0]]; if (!s) return "Qual situação? confirmado, atendido, faltou ou cancelado.";
    const r = await C.db.upd(`zv_agendamentos?negocio=eq.${C.neg.id}&numero=eq.${parseInt(n)}`, { status: s }); if (!r.length) return `Não achei o agendamento nº ${n}.`;
    return `Agendamento nº ${n}: ${s}.`;
  },
};
function resolverData(t) {
  const s = sem(t || "hoje"), base = agoraSP(); const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const iso = x => x.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(t))) return String(t);
  if (/depois de amanha/.test(s)) { d.setUTCDate(d.getUTCDate() + 2); return iso(d); }
  if (/amanha/.test(s)) { d.setUTCDate(d.getUTCDate() + 1); return iso(d); }
  if (/hoje/.test(s)) return iso(d);
  const m = s.match(/(\d{1,2}) (\d{1,2})(?: (\d{2,4}))?/) || String(t).match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (m) { let y = m[3] ? +m[3] : d.getUTCFullYear(); if (y < 100) y += 2000; const r = new Date(Date.UTC(y, +m[2] - 1, +m[1])); if (!m[3] && r < d) r.setUTCFullYear(y + 1); return iso(r); }
  const wd = DIAS.findIndex(x => s.includes(x.slice(0, 3))); if (wd >= 0) { let k = (wd - d.getUTCDay() + 7) % 7; if (k === 0) k = 7; d.setUTCDate(d.getUTCDate() + k); return iso(d); }
  return null;
}

/* ------------------------------------------------------------ entendedor de frases (sem IA) */
const PRECO = "r?\\$?\\s*(\\d[\\d.]*(?:,\\d{1,2})?)\\s*(?:reais)?";
export async function porFrases(C, texto) {
  const t = texto.trim(), s = sem(t); let m;
  if ((m = t.match(new RegExp("(?:baix[ae]|abaix[ae]|mud[ae]|alter[ae]|troc[ae]|sobe|aument[ae]|reduz[ae]?|deix[ae]|atualiz[ae])\\s+(?:o |a |os |as )?(?:pre[cç]o d[oa]s? |valor d[oa]s? )?(.+?)\\s+(?:pra|para|por|a|em|de)\\s+" + PRECO + "\\s*$", "i"))))
    { const nome = m[1].replace(/\s*\(([^)]+)\)\s*$/, ""), op = (m[1].match(/\(([^)]+)\)/) || [])[1]; return ACOES.mudar_preco(C, { item: nome, preco: m[2], opcao: op }); }
  if ((m = t.match(new RegExp("(?:adicion[ae]|inclu[ia]|cri[ae]|coloc[ae]|bota|cadastr[ae])\\s+(?:o |a |um |uma )?(?:item |produto |servi[cç]o )?(.+?)\\s+(?:por|a|de|custando|no valor de)\\s+" + PRECO + "(?:\\s+(?:em|na categoria|no)\\s+(.+))?\\s*$", "i"))))
    return ACOES.adicionar_item(C, { nome: m[1].replace(/^(o|a) /i, ""), preco: m[2], categoria: m[3] });
  if ((m = t.match(new RegExp("^(?!(?:adicion|inclu|cri|coloc|bota|cadastr))(.+?)\\s+(?:agora |passa a |vai )?(?:custa|custar|sai|por)\\s+" + PRECO + "\\s*$", "i")))) return ACOES.mudar_preco(C, { item: m[1], preco: m[2] });
  if ((m = t.match(/^(?:acabou|esgotou|sem|nao tem mais|não tem mais)\s+(?:o |a |os |as )?(.+)$/i)) || (m = t.match(/^(.+?)\s+(?:acabou|esgotou|em falta)$/i)))
    return ACOES.ocultar_item(C, { item: m[1], oculto: true });
  if ((m = t.match(/^(?:volt(?:a|ou|ar)|chegou|tem de novo|reativa|mostra)\s+(?:o |a |os |as )?(.+?)(?:\s+(?:de novo|pro site|ao site))?$/i)) || (m = t.match(/^(.+?)\s+(?:voltou|chegou|tem de novo)$/i)))
    return ACOES.ocultar_item(C, { item: m[1], oculto: false });
  if ((m = t.match(/^(?:tira|remove|apaga|exclui|deleta)\s+(?:o |a |os |as )?(.+?)(?:\s+do (?:site|cardapio|cardápio|menu))?$/i))) return ACOES.remover_item(C, { item: m[1] });
  if ((m = t.match(/(?:muda|troca|altera|atualiza|novo)\s+(?:o |a |meu |minha )?(whats(?:app)?|zap|telefone|celular|numero|número|endere[cç]o|nome(?: do neg[oó]cio| da loja)?|chave pix|pix|frase(?: principal)?|slogan|rodap[eé])\s*(?:pra|para|:|é|e)?\s+(.+)$/i)))
    return ACOES.mudar_dado(C, { campo: m[1], valor: m[2].trim() });
  if ((m = s.match(/(?:fecha|fechado|nao abre|nao abrimos|nao vamos abrir)\s+(?:no |na |nos |nas |aos |as |de |todo |toda )?((?:domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:s)?(?:(?: e |, ?)(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)s?)*)/)))
    return ACOES.mudar_horario(C, { dias: m[1].split(/ e |, ?/), fechado: true });
  if ((m = s.match(/((?:domingo|segunda|terca|quarta|quinta|sexta|sabado)s?(?:(?: e |, ?)(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)s?)*)\s+(?:abre|abrimos|atende|funciona|vai ser)?\s*(?:das |de )?(\d{1,2}(?: ?h ?\d{0,2})?(?: \d{2})?)\s*(?:as|a|ate)\s*(\d{1,2}(?: ?h ?\d{0,2})?(?: \d{2})?)/)))
    return ACOES.mudar_horario(C, { dias: m[1].split(/ e |, ?/), abre: m[2].replace(/ /g, "h").replace(/hh/, "h"), fecha: m[3].replace(/ /g, "h").replace(/hh/, "h") });
  if ((m = s.match(/bloque(?:ia|ar)\s+(?:a agenda\s+)?(?:de |do |da |no |na )?(hoje|amanha|depois de amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado|\d{1,2} \d{1,2}(?: \d{2,4})?)(?:\s+(?:das|de)\s+(\d{1,2}(?: ?h ?\d{0,2})?)\s+(?:as|a|ate)\s+(\d{1,2}(?: ?h ?\d{0,2})?))?(?:\s+(?:para|pra|do|da)\s+(?:o |a )?(\w+))?/)))
    { const pr = m[4] && (C.cfg().profissionais || []).map(p => typeof p === "string" ? p : p.nome).find(p => sem(p) === m[4]); return ACOES.bloquear(C, { data: m[1], de: m[2] && m[2].replace(/ /g, ""), ate: m[3] && m[3].replace(/ /g, ""), profissional: pr || "" }); }
  if ((m = s.match(/(?:pedido|pedidos?)\s+(?:n |numero |no |nº )?(\d+)\s+(?:esta |ta |pra |para |foi |saiu |como )?(\w+)/)) && C.neg.tipo !== "agenda") return ACOES.mover_pedido(C, { numero: m[1], etapa: m[2] });
  if ((m = s.match(/(confirma|cancela|atendido|faltou)\s+(?:o )?(?:agendamento|horario)?\s*(?:n |numero |nº )?(\d+)/)) && C.neg.tipo !== "pedido") return ACOES.status_agendamento(C, { numero: m[2], status: m[1] });
  if (/agenda|quem (vem|esta marcado)|horarios? (de )?(hoje|amanha)|marcad/.test(s)) return ACOES.listar_agenda(C, { data: /amanha/.test(s) ? "amanha" : (s.match(/(\d{1,2} \d{1,2})/) || [])[1] || "hoje" });
  if (/pedidos? (em )?aberto|quais pedidos|tem pedido/.test(s)) return ACOES.listar_pedidos(C, {});
  if (/vend|fatur|entrou|caixa|resumo|como (foi|esta|ta)|quanto/.test(s)) return ACOES.resumo(C, { periodo: /mes/.test(s) ? "mes" : /semana/.test(s) ? "semana" : "hoje" });
  return null;
}
const AJUDA = tipo => `Posso fazer, por exemplo:
• “${tipo === "agenda" ? "muda o corte pra R$ 45" : "baixa o X-Bacon pra R$ 29,90"}”
• “adiciona ${tipo === "agenda" ? "Hidratação por R$ 60" : "Suco de laranja por R$ 9"}”
• “${tipo === "agenda" ? "pausa a progressiva" : "o pudim acabou"}” / “voltou o …”
• “fecha no domingo” / “sábado das 9 às 14”
• “muda o WhatsApp para (11) 98888-7777”
${tipo === "agenda" ? "• “bloqueia amanhã das 12h às 14h”\n• “como está a agenda de amanhã?”" : "• “pedido 12 saiu pra entrega”\n• “quais pedidos estão em aberto?”"}
• “quanto entrou este mês?”`;

/* ------------------------------------------------------------ IA (opcional) */
const FERRAMENTAS = [
  ["mudar_preco", "Muda o preço de um item do cardápio ou serviço", { item: "string", preco: "number", opcao: "string|tamanho ou variação, se houver" }, ["item", "preco"]],
  ["adicionar_item", "Adiciona um item ou serviço novo", { nome: "string", preco: "number", categoria: "string", descricao: "string", duracao: "number|minutos, só para serviços" }, ["nome", "preco"]],
  ["remover_item", "Apaga um item", { item: "string" }, ["item"]],
  ["ocultar_item", "Esconde (oculto=true, esgotado/pausado) ou mostra de novo (oculto=false) um item", { item: "string", oculto: "boolean" }, ["item", "oculto"]],
  ["mudar_dado", "Muda nome, whatsapp, endereço, pix, frase principal ou rodapé do site", { campo: "string", valor: "string" }, ["campo", "valor"]],
  ["mudar_horario", "Muda o horário de funcionamento. dias: nomes dos dias em português", { dias: "array", abre: "string|HH:MM", fecha: "string|HH:MM", fechado: "boolean" }, ["dias"]],
  ["bloquear", "Bloqueia a agenda num intervalo (data: hoje, amanhã, AAAA-MM-DD)", { data: "string", de: "string|HH:MM", ate: "string|HH:MM", profissional: "string", motivo: "string" }, ["data"]],
  ["resumo", "Resumo de vendas, pedidos, agendamentos e caixa", { periodo: "string|hoje, semana ou mes" }, []],
  ["listar_agenda", "Lista a agenda de um dia", { data: "string" }, []],
  ["listar_pedidos", "Lista pedidos em aberto", { etapa: "string" }, []],
  ["mover_pedido", "Muda a etapa de um pedido pelo número", { numero: "number", etapa: "string|novo, preparo, pronto, entregue ou cancelado" }, ["numero", "etapa"]],
  ["status_agendamento", "Muda a situação de um agendamento pelo número", { numero: "number", status: "string|confirmado, atendido, faltou ou cancelado" }, ["numero", "status"]],
].map(([name, description, props, required]) => ({ type: "function", function: { name, description, parameters: { type: "object", required, properties: Object.fromEntries(Object.entries(props).map(([k, v]) => { const [ty, de] = v.split("|"); return [k, ty === "array" ? { type: "array", items: { type: "string" } } : de ? { type: ty, description: de } : { type: ty }]; })) } } }));
async function porIA(C, texto, ia, historico) {
  const itens = C.menu().flatMap(c => (c.items || []).map(i => `${c.cat} > ${i.n}: ${i.v ? i.v.map(v => v.l + " " + brl(v.p)).join(" / ") : brl(i.p)}${i.oculto ? " (oculto)" : ""}`)).slice(0, 180).join("\n");
  const cfg = C.cfg();
  const sistema = `Você é o assistente da Zivoop que administra o site e o painel de "${C.neg.nome}" (${C.neg.nicho}, ${C.neg.tipo === "agenda" ? "agendamentos" : C.neg.tipo === "reserva" ? "reservas" : "pedidos"}). Hoje é ${hojeSP()}.
Fale português do Brasil, curto e direto, como um funcionário eficiente. Use as ferramentas para qualquer mudança ou consulta; nunca diga que mudou algo sem chamar a ferramenta.
Se o pedido for ambíguo (ex.: item com tamanhos), pergunte. Não invente itens nem números.
Site: ${C.neg.slug} · WhatsApp ${cfg.whatsapp || "não definido"} · Endereço ${cfg.endereco || "—"}
Itens:\n${itens}`;
  const msgs = [{ role: "system", content: sistema }, ...historico, { role: "user", content: texto }];
  for (let volta = 0; volta < 4; volta++) {
    const r = await fetch(ia.base + "/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + ia.chave }, body: JSON.stringify({ model: ia.modelo, messages: msgs, tools: FERRAMENTAS, temperature: 0.2 }) });
    if (!r.ok) throw new Error("IA " + r.status + " " + (await r.text()).slice(0, 200));
    const m = (await r.json()).choices[0].message; msgs.push(m);
    if (!m.tool_calls || !m.tool_calls.length) return m.content || "Feito.";
    for (const tc of m.tool_calls) { let saida; try { const f = ACOES[tc.function.name]; saida = f ? await f(C, JSON.parse(tc.function.arguments || "{}")) : "Ferramenta desconhecida."; } catch (e) { saida = "Erro: " + e.message; }
      msgs.push({ role: "tool", tool_call_id: tc.id, content: String(saida) }); }
  }
  return msgs[msgs.length - 1].content || "Feito.";
}

/* ------------------------------------------------------------ entrada principal */
// admin: banco com a chave de serviço (grava em nome do dono, sempre filtrando pelo negócio dele)
// usuario: banco com o token do dono (só para criar site novo, que exige login)
export async function responder({ texto, negocio, donoId, admin, usuario, siteUrl, ia, canal }) {
  texto = String(texto || "").trim().slice(0, 1500); if (!texto) return { resposta: "Pode escrever o que precisa." };
  const s = sem(texto);
  // criar site novo
  let m = texto.match(/cri(?:a|ar|e)\s+(?:um |o |meu |minha )?(?:novo )?site\s+(?:d[aoe]s?\s+)?(?:minha |meu |nossa |nosso )?(.+?)(?:[,:]\s*(?:a |o |chamad[ao] |que se chama |de nome )?|\s+(?:chamad[ao]|que se chama|de nome)\s+)(.+)$/i)
    || texto.match(/cri(?:a|ar|e)\s+(?:um |o |meu |minha )?(?:novo )?site\s+(?:para|pra)\s+(?:a |o |minha |meu )?(.+?)\s+(.+)$/i);
  if (m || (!negocio && /cri(a|ar|e).*site/.test(s))) {
    const nicho = nichoDe(m ? m[1] : texto), nome = m ? m[2].replace(/[.!]+$/, "").trim() : null;
    if (!nicho) return { resposta: "Qual o tipo do negócio? Ex.: “cria o site da minha hamburgueria, a Brasa 77”." };
    if (!nome) return { resposta: "Qual o nome do negócio?" };
    if (!usuario) return { resposta: `Para criar um site novo, entre em ${siteUrl}/painel e crie a conta. Depois é só me pedir por aqui.` };
    const zap = (texto.match(/(\(?\d{2}\)?\s?9?\d{4}-?\d{4})/) || [])[1] || "";
    const slug = await usuario.rpc("zv_criar_negocio", { p_nicho: nicho, p_nome: nome, p_whatsapp: zap });
    await registrar(admin, null, donoId, texto, canal);
    const r = `Pronto! O site da ${nome} já está no ar: ${siteUrl}/${slug}\nColoquei itens e preços de exemplo. Me diga o que mudar (preços, horários, o que acabou) e eu ajusto na hora.`;
    await registrar(admin, null, donoId, r, canal, "agente"); return { resposta: r, mudou: true, slug };
  }
  const C = await contexto(admin, negocio, donoId, siteUrl);
  if (!C) return { resposta: "Você ainda não tem site. Diga, por exemplo: “cria o site da minha barbearia, a Barbearia do Zé”." };
  await registrar(admin, C.neg.id, donoId, texto, canal);
  let resposta = null;
  if (ia && ia.chave) { try { const hist = (await admin.sel(`zv_mensagens?select=papel,texto&negocio=eq.${C.neg.id}&order=criado_em.desc&limit=8`)).reverse().slice(0, -1).map(x => ({ role: x.papel === "dono" ? "user" : "assistant", content: x.texto }));
    resposta = await porIA(C, texto, ia, hist); } catch (e) { resposta = null; } }
  if (!resposta) resposta = await porFrases(C, texto);
  if (!resposta) resposta = (/^(oi|ola|bom dia|boa tarde|boa noite|ajuda|menu|o que voce faz)/.test(s) ? "Oi! " : "Não entendi bem. ") + AJUDA(C.neg.tipo);
  await registrar(admin, C.neg.id, donoId, resposta, canal, "agente");
  return { resposta, mudou: C.mudou };
}
async function registrar(db, negocio, dono, texto, canal, papel) { try { await db.ins("zv_mensagens", { negocio, dono, papel: papel || "dono", texto: String(texto).slice(0, 2000), canal: canal || "painel" }); } catch (e) {} }
