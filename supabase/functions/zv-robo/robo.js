/* ===== Robô de atendimento da Zivoop Barbearia =====
   O cliente conversa pelo WhatsApp; o robô marca, remarca, cancela, mostra preços, põe na lista de espera
   e oferece vaga mais cedo quando alguém desmarca (um cliente por vez, por ordem de chegada).
   Quem decide horário é o sistema (as mesmas regras do site e do banco). A IA só entende o que o cliente escreveu;
   se ela falhar ou a cota grátis acabar, o robô continua funcionando por menu e palavras-chave.
   Este arquivo não sabe nada de WhatsApp: recebe texto e devolve texto. O transporte fica no index.ts. */

const TZ = -3;   // Brasil sem horário de verão
const agoraSP = (t = Date.now()) => new Date(t + TZ * 3600e3);
const hojeSP = (t) => agoraSP(t).toISOString().slice(0, 10);
const sem = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9:/ ]+/g, " ").replace(/\s+/g, " ").trim();
const toMin = h => { const [a, b] = String(h).split(":").map(Number); return a * 60 + (b || 0); };
const hhmm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const brl = v => "R$ " + Number(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const addDias = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaSemana = iso => new Date(iso + "T12:00:00Z").getUTCDay();
const diaTxt = (iso, t) => { const h = hojeSP(t); if (iso === h) return "hoje"; if (iso === addDias(h, 1)) return "amanhã";
  return DIAS[diaSemana(iso)] + " " + iso.slice(8, 10) + "/" + iso.slice(5, 7); };
const isoDe = (dia, min) => new Date(Date.parse(dia + "T00:00:00Z") + (min - TZ * 60) * 60e3).toISOString();   // horário de SP → UTC
const minDe = iso => { const d = agoraSP(Date.parse(iso)); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const diaDe = iso => agoraSP(Date.parse(iso)).toISOString().slice(0, 10);
const primeiro = n => String(n || "").trim().split(/\s+/)[0] || "";
const OPTOUT = /^(sair|parar|stop|nao quero mais (receber )?mensage(m|ns)|descadastrar|cancelar avisos)$/;

/* ------------------------------------------------------------ negócio */
export async function carregarNegocio(db, negId, siteUrl) {
  const l = await db.sel(`zv_negocios?select=id,slug,nome,nicho,tipo,dados,whatsapp_dono&id=eq.${negId}`);
  const neg = l && l[0]; if (!neg) return null;
  let pad = { config: {}, menu: [] };
  try { const r = await fetch(`${siteUrl}/modelos/${neg.nicho}/padrao.json`); if (r.ok) pad = await r.json(); } catch (e) {}
  const cfg = Object.assign({}, pad.config || {}, (neg.dados || {}).config || {}), menu = (neg.dados || {}).menu || pad.menu || [];
  const servicos = []; menu.forEach(c => (c.items || []).forEach(i => { if (!i.oculto && i.dur) servicos.push({ id: i.id, n: i.n, p: Number(i.p || 0), dur: Number(i.dur), cat: c.cat }); }));
  const profs = (cfg.profissionais || []).map(p => typeof p === "string" ? p : p && p.nome).filter(Boolean);
  const robo = Object.assign({ ativo: true, lembrete: true, horaLembrete: "18:00", antecipar: true, limiteDia: 60, minutosOferta: 20 }, cfg.robo || {});
  return { neg, cfg, servicos, profs, robo, site: `${siteUrl}/${neg.slug}` };
}

/* ------------------------------------------------------------ horários livres e encaixe estratégico */
// ocupados: [{profissional, inicio, fim}] (agendamentos ativos + bloqueios)
export async function ocupados(db, N, de, dias) {
  return await db.rpc("zv_ocupados", { p_slug: N.neg.slug, p_de: de, p_dias: dias }).catch(() => []) || [];
}
export function livres(N, oc, dia, dur, prof, t = Date.now()) {
  const h = (N.cfg.horario || {})[diaSemana(dia)]; if (!h) return [];
  const passo = Number(N.cfg.slotStep) || 30, ini = toMin(h[0]), fim = toMin(h[1]), alm = N.cfg.almoco ? N.cfg.almoco.map(toMin) : null;
  const agora = dia === hojeSP(t) ? (agoraSP(t).getUTCHours() * 60 + agoraSP(t).getUTCMinutes() + 30) : -1;
  if (dia < addDias(hojeSP(t), Number(N.cfg.antecedenciaDias) || 0)) return [];
  const quem = prof ? [prof] : (N.profs.length ? N.profs : [""]);
  const d0 = Date.parse(isoDe(dia, 0));   // bloqueios podem atravessar vários dias: conta em minutos a partir da meia-noite
  const ocDia = oc.map(o => ({ p: o.profissional || "", a: Math.round((Date.parse(o.inicio) - d0) / 60e3), b: Math.round((Date.parse(o.fim) - d0) / 60e3) }))
    .filter(o => o.b > 0 && o.a < 24 * 60).map(o => ({ p: o.p, a: Math.max(0, o.a), b: Math.min(24 * 60, o.b) }));
  const out = [];
  for (let m = ini; m + dur <= fim; m += passo) {
    if (m <= agora) continue; if (alm && m < alm[1] && m + dur > alm[0]) continue;
    for (const p of quem) {
      const bate = ocDia.some(o => (o.p === "" || o.p === p) && o.a < m + dur && o.b > m); if (bate) continue;
      // nota de encaixe: horário colado em outro cliente (sem buraco na agenda) vale mais
      const meus = ocDia.filter(o => o.p === p || o.p === "");
      let nota = 0; if (meus.some(o => o.b === m)) nota += 2; if (meus.some(o => o.a === m + dur)) nota += 2;
      if (m === ini || m + dur === fim) nota += 1;
      const buracoAntes = meus.filter(o => o.b <= m).reduce((x, o) => Math.max(x, o.b), ini), gap = m - buracoAntes;
      if (gap > 0 && gap < Math.min(dur, 30)) nota -= 2;   // deixaria um buraco pequeno que ninguém usa
      out.push({ dia, m, prof: p, nota });
    }
  }
  return out;
}
// escolhe até 3 opções: primeiro os encaixes, depois o mais cedo; respeita a faixa pedida (ex.: depois das 17h)
export function sugerir(lista, faixa, n = 3) {
  let L = lista.slice(); if (faixa && (faixa.de || faixa.ate)) { const a = faixa.de ? toMin(faixa.de) : 0, b = faixa.ate ? toMin(faixa.ate) : 24 * 60; const f = L.filter(x => x.m >= a && x.m <= b); if (f.length) L = f; }
  if (faixa && faixa.exato) { const e = toMin(faixa.exato), ex = L.filter(x => x.m === e); if (ex.length) return ex.slice(0, 1); L.sort((x, y) => Math.abs(x.m - e) - Math.abs(y.m - e)); return uniq(L).slice(0, n); }
  const porHora = {}; L.forEach(x => { const k = x.dia + x.m; if (!porHora[k] || x.nota > porHora[k].nota) porHora[k] = x; });
  L = Object.values(porHora).sort((x, y) => (x.dia + hhmm(x.m)).localeCompare(y.dia + hhmm(y.m)));
  if (L.length <= n) return L;
  const melhores = L.slice().sort((x, y) => y.nota - x.nota || (x.dia + hhmm(x.m)).localeCompare(y.dia + hhmm(y.m)));
  const esc = [L[0]]; for (const x of melhores) { if (esc.length >= n) break; if (!esc.some(e => e.dia === x.dia && Math.abs(e.m - x.m) < 60)) esc.push(x); }
  for (const x of L) { if (esc.length >= n) break; if (!esc.includes(x) && !esc.some(e => e.dia === x.dia && e.m === x.m)) esc.push(x); }
  return esc.sort((x, y) => (x.dia + hhmm(x.m)).localeCompare(y.dia + hhmm(y.m)));
}
const uniq = L => { const s = new Set(); return L.filter(x => { const k = x.dia + x.m; if (s.has(k)) return false; s.add(k); return true; }); };

/* ------------------------------------------------------------ entender a mensagem */
// sem IA: palavras-chave, datas ("amanhã", "sexta", "15/11", "dia 15") e horas ("17h", "depois das 5")
export function entenderSemIA(N, texto, t = Date.now()) {
  const s = sem(texto), r = { intencao: null, servicos: [], profissional: null, dia: null, faixa: null, escolha: null, nome: null };
  if (/^[1-9]$/.test(s)) r.escolha = Number(s);
  if (OPTOUT.test(s)) r.intencao = "sair";
  else if (/\b(atendente|humano|pessoa|falar com (o |a )?(dono|barbeiro|alguem|voce))\b/.test(s)) r.intencao = "humano";
  else if (/\b(remarc|mudar (o )?horario|trocar (o )?horario|adiar|outro horario|passar pra)/.test(s)) r.intencao = "remarcar";
  else if (/\b(cancel|desmarc|nao vou (poder )?(ir|conseguir)|nao posso ir)/.test(s)) r.intencao = "cancelar";
  else if (/\b(meu horario|meus horarios|que horas (e|eh) (o )?meu|quando (e|eh) (o )?meu|tenho horario)/.test(s)) r.intencao = "meus";
  else if (/\b(lista de espera|me avis|quando abrir|se abrir)/.test(s)) r.intencao = "espera";
  else if (/\b(preco|precos|valor|valores|quanto (custa|e|eh|fica|ta)|tabela)\b/.test(s)) r.intencao = "precos";
  else if (/\b(endereco|onde fica|localizacao|como chego|abre|fecha|funciona|horario de funcionamento)\b/.test(s) && !/\b(marcar|agendar)\b/.test(s)) r.intencao = "info";
  else if (/\b(clube|assinatura|plano mensal|mensalidade)\b/.test(s)) r.intencao = "clube";
  else if (/^(sim|s|isso|pode|pode ser|ok|okay|beleza|blz|fechado|confirmo|confirmar|bora|claro|perfeito|show|top|quero sim|sim quero|pode sim)( (sim|pode|obrigad[oa]|valeu))?$/.test(s) || s === "quero") r.intencao = "sim";
  else if (/^(nao|n|nao quero|deixa|esquece|agora nao|nenhum)\b/.test(s)) r.intencao = "nao";
  else if (/\b(marcar|agendar|horario|vaga|corte|cortar|barba|disponivel|tem hora|encaixe)\b/.test(s)) r.intencao = "marcar";
  else if (/^(oi|ola|bom dia|boa tarde|boa noite|eai|e ai|opa|salve|fala)\b/.test(s)) r.intencao = "oi";
  // serviços citados
  const sb = s.replace(/\bbarbearia\b/g, " ");
  N.servicos.forEach(x => { const n = sem(x.n); if (!n) return;
    const raiz = n.split(" ").length === 1 && n.length >= 5 ? n.slice(0, n.length - 1) : null;   // "corte" pega "cortar", "barba" pega "barbinha"
    if (sb.includes(n) || (raiz && new RegExp("\\b" + raiz).test(sb))) r.servicos.push(x.id); });
  if (r.servicos.includes("corte-infantil")) r.servicos = r.servicos.filter(i => i !== "corte");
  if (r.servicos.includes("corte-barba")) r.servicos = r.servicos.filter(i => i !== "corte" && i !== "barba");
  else if (/\bcorte\b.*\bbarba\b|\bbarba\b.*\bcorte\b/.test(s)) { const cb = N.servicos.find(x => /corte.*barba/.test(sem(x.n))); if (cb) r.servicos = [cb.id]; }
  N.profs.forEach(p => { if (new RegExp("\\b" + sem(p) + "\\b").test(s)) r.profissional = p; });
  // dia
  const hoje = hojeSP(t);
  if (/\bhoje\b/.test(s)) r.dia = hoje; else if (/\bdepois de amanha\b/.test(s)) r.dia = addDias(hoje, 2); else if (/\bamanha\b/.test(s)) r.dia = addDias(hoje, 1);
  else { const dm = s.match(/\b(\d{1,2})\/(\d{1,2})\b/) || s.match(/\bdia (\d{1,2})\b/);
    if (dm) { const d = Number(dm[1]), mo = dm[2] ? Number(dm[2]) : Number(hoje.slice(5, 7)); let y = Number(hoje.slice(0, 4)); let iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (iso < hoje) { if (dm[2]) iso = `${y + 1}${iso.slice(4)}`; else { const nx = new Date(Date.UTC(y, mo, d)); iso = nx.toISOString().slice(0, 10); } } if (!isNaN(Date.parse(iso))) r.dia = iso; }
    else { const nomes = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"]; const i = nomes.findIndex(n => new RegExp("\\b" + n).test(s));
      if (i >= 0) { let k = (i - diaSemana(hoje) + 7) % 7; if (k === 0 && !/\bhoje\b/.test(s)) k = 7; if (/\bque vem|proxima\b/.test(s) && k < 7) k += 0; r.dia = addDias(hoje, k); } } }
  // hora
  const ex = s.match(/\b(?:as|às|a)?\s*(\d{1,2})(?:h|:)(\d{2})?\b/) || s.match(/\b(\d{1,2}) ?(?:horas|hrs|hr)\b/);
  const depois = s.match(/\b(depois|apos|a partir) d?as? (\d{1,2})/), antes = s.match(/\b(antes) d?as? (\d{1,2})/);
  const ajusta = h => { h = Number(h); if (h >= 1 && h <= 8) h += 12; return String(h).padStart(2, "0") + ":00"; };   // "depois das 5" = 17h
  if (depois) r.faixa = { de: ajusta(depois[2]) }; else if (antes) r.faixa = { ate: ajusta(antes[2]) };
  else if (/\bmanha\b/.test(s) && !/\bamanha\b/.test(s.replace(/\bde manha\b/, ""))) r.faixa = { ate: "12:00" };
  else if (/\bde manha\b|\bpela manha\b/.test(s)) r.faixa = { ate: "12:00" };
  else if (/\btarde\b/.test(s)) r.faixa = { de: "12:00", ate: "18:00" }; else if (/\bnoite\b/.test(s)) r.faixa = { de: "18:00" };
  else if (ex && !r.escolha) { let h = Number(ex[1]); if (h >= 1 && h <= 8) h += 12; if (h <= 23) r.faixa = { exato: String(h).padStart(2, "0") + ":" + (ex[2] || "00") }; }
  if (!r.intencao && (r.dia || r.faixa || r.servicos.length) ) r.intencao = "marcar";
  return r;
}
// com IA (Gemini grátis por padrão): devolve o mesmo formato; qualquer falha cai no entendimento sem IA
export async function entenderComIA(N, texto, estado, ia, t = Date.now()) {
  const base = entenderSemIA(N, texto, t);
  if (!ia || !ia.chave) return base;
  const hoje = hojeSP(t);
  const prompt = `Você lê mensagens de clientes de uma barbearia no WhatsApp e responde SÓ com JSON.
Hoje é ${DIAS[diaSemana(hoje)]}, ${hoje}. Serviços (id: nome): ${N.servicos.map(x => x.id + ": " + x.n).join("; ")}. Barbeiros: ${N.profs.join(", ") || "nenhum"}.
A conversa estava em: ${estado && estado.etapa ? estado.etapa : "início"}${estado && estado.opcoes ? " (o robô ofereceu " + estado.opcoes.length + " opções numeradas)" : ""}.
Campos: intencao (marcar|remarcar|cancelar|meus|precos|info|clube|espera|humano|sair|sim|nao|oi|outro), servicos (lista de ids), profissional (nome ou null),
dia (AAAA-MM-DD ou null), faixa ({de:"HH:MM",ate:"HH:MM"} ou {exato:"HH:MM"} ou null), escolha (número da opção ou null), nome (nome da pessoa se ela disse, ou null).
"depois das 5" = {de:"17:00"}. "sexta" = a próxima sexta. Não invente: se não sabe, use null.
Mensagem: """${String(texto).slice(0, 500)}"""`;
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ia.modelo || "gemini-3.5-flash-lite"}:generateContent?key=${ia.chave}`, { method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 300 } }) });
    clearTimeout(to); if (!r.ok) return base;
    const j = await r.json(), txt = j.candidates && j.candidates[0] && j.candidates[0].content.parts.map(p => p.text).join("");
    const o = JSON.parse(txt || "{}"), ok = { intencao: base.intencao, servicos: base.servicos, profissional: base.profissional, dia: base.dia, faixa: base.faixa, escolha: base.escolha, nome: null };
    if (typeof o.intencao === "string" && o.intencao !== "outro") ok.intencao = o.intencao;
    if (Array.isArray(o.servicos)) { const v = o.servicos.filter(id => N.servicos.some(x => x.id === id)); if (v.length) ok.servicos = v; }
    if (o.profissional && N.profs.includes(o.profissional)) ok.profissional = o.profissional;
    if (typeof o.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.dia) && o.dia >= hoje && o.dia <= addDias(hoje, 90)) ok.dia = o.dia;
    if (o.faixa && typeof o.faixa === "object") { const f = {}; ["de", "ate", "exato"].forEach(k => { if (/^\d{2}:\d{2}$/.test(o.faixa[k] || "")) f[k] = o.faixa[k]; }); if (Object.keys(f).length) ok.faixa = f; }
    if (Number.isInteger(o.escolha) && o.escolha >= 1 && o.escolha <= 9) ok.escolha = o.escolha;
    if (typeof o.nome === "string" && o.nome.trim().length >= 2 && o.nome.length <= 60) ok.nome = o.nome.trim();
    return ok;
  } catch (e) { return base; }
}

/* ------------------------------------------------------------ conversa */
const MENU = N => `Posso te ajudar com:\n1 - Marcar horário\n2 - Ver ou mudar meu horário\n3 - Preços\n4 - Endereço e horário de funcionamento${N.cfg.clube && N.cfg.clube.ativo ? "\n5 - Clube de assinatura" : ""}\n\nOu escreva do seu jeito, ex.: "corte amanhã depois das 5". Para falar com o barbeiro, escreva "atendente".`;
const listaOpcoes = (ops, t) => ops.map((o, i) => `${i + 1} - ${diaTxt(o.dia, t)} às ${hhmm(o.m)}${o.prof ? " com " + o.prof : ""}`).join("\n");
const nomeServ = (N, ids) => ids.map(id => (N.servicos.find(x => x.id === id) || {}).n).filter(Boolean).join(" + ");
const durServ = (N, ids) => ids.reduce((s, id) => s + ((N.servicos.find(x => x.id === id) || {}).dur || 0), 0);
const precoServ = (N, ids) => ids.reduce((s, id) => s + ((N.servicos.find(x => x.id === id) || {}).p || 0), 0);

async function proximos(db, N, zap) {
  return await db.sel(`zv_agendamentos?select=id,numero,inicio,fim,profissional,servicos,total,status&negocio=eq.${N.neg.id}&whatsapp=eq.${zap}&status=in.(pendente,confirmado)&inicio=gte.${new Date().toISOString()}&order=inicio&limit=5`).catch(() => []) || [];
}
// procura horários: no dia pedido; se não tiver, nos próximos dias
async function buscar(db, N, est, t) {
  const dur = Math.max(durServ(N, est.servicos), 15), hoje = hojeSP(t), de = est.dia || hoje, oc = await ocupados(db, N, de, 15);
  let L = livres(N, oc, de, dur, est.prof, t), dia = de;
  if (!sugerir(L, est.faixa).length || (est.faixa && est.faixa.exato && !L.some(x => x.m === toMin(est.faixa.exato)) && est.dia)) {
    const achou = sugerir(L, est.faixa); if (achou.length && est.dia) return { ops: achou, dia: de, cheio: false, outroDia: false };
    for (let i = 1; i <= 14; i++) { const d = addDias(de, i); const l2 = livres(N, oc, d, dur, est.prof, t); if (sugerir(l2, est.faixa).length) { return { ops: sugerir(l2, est.faixa), dia: d, cheio: !!est.dia, outroDia: true }; } }
    return { ops: [], dia: de, cheio: true, outroDia: false };
  }
  return { ops: sugerir(L, est.faixa), dia, cheio: false, outroDia: false };
}

/* o coração: recebe uma mensagem e devolve as respostas (e já faz as mudanças no banco) */
export async function processar({ db, N, zap, texto, nomePerfil, ia, t = Date.now() }) {
  zap = String(zap).replace(/\D/g, "");
  const cont = ((await db.sel(`zv_bot_contatos?select=*&negocio=eq.${N.neg.id}&whatsapp=eq.${zap}`).catch(() => [])) || [])[0]
    || (await db.ins("zv_bot_contatos", { negocio: N.neg.id, whatsapp: zap, nome: nomePerfil || null }))[0];
  const salvar = async (patch) => { Object.assign(cont, patch); await db.upd(`zv_bot_contatos?negocio=eq.${N.neg.id}&whatsapp=eq.${zap}`, patch); };
  await salvar({ ultima_in: new Date(t).toISOString(), nome: cont.nome || nomePerfil || null });
  const s = sem(texto);
  // proteção: o dono assumiu a conversa → robô fica quieto
  if (cont.humano_ate && Date.parse(cont.humano_ate) > t && !/^(robo|voltar pro robo|menu)$/.test(s)) return { respostas: [], humano: true };
  // proteção: alguém (ou outro robô) mandando mensagem sem parar → passa para o dono e para de responder
  const recentes = await db.sel(`zv_bot_msgs?select=id&negocio=eq.${N.neg.id}&whatsapp=eq.${zap}&dir=eq.in&criado_em=gte.${new Date(t - 10 * 60e3).toISOString()}`).catch(() => []);
  if ((recentes || []).length > 25) { await salvar({ humano_ate: new Date(t + 6 * 3600e3).toISOString() }); return { respostas: [], humano: true, motivo: "excesso" }; }

  const est = Object.assign({}, cont.estado || {}), R = [], fim = async (novo, aviso) => { await salvar({ estado: novo || {} }); return { respostas: R, aviso }; };
  const u = await entenderComIA(N, texto, est, ia, t);
  if (u.nome && !cont.nome) await salvar({ nome: u.nome });
  const nome = cont.nome;

  if (u.intencao === "sair") { await salvar({ optout: true, estado: {} }); R.push("Pronto, você não vai mais receber mensagens automáticas da " + N.neg.nome + ". Se quiser marcar horário, é só mandar mensagem."); return { respostas: R }; }
  if (cont.optout && u.intencao && u.intencao !== "sair") await salvar({ optout: false });   // voltou a conversar
  if (u.intencao === "humano") { await salvar({ humano_ate: new Date(t + 2 * 3600e3).toISOString(), estado: {} }); R.push("Certo! Vou chamar o pessoal da barbearia, já já alguém te responde por aqui."); return { respostas: R, aviso: "humano" }; }

  /* --- respostas a uma oferta de vaga mais cedo --- */
  if (est.etapa === "oferta") {
    const of = est.oferta;
    if (Date.parse(of.expira) < t) { R.push("Essa vaga já passou para o próximo da fila, desculpe. Quer ver outros horários?"); return fim({ etapa: "marcar", servicos: of.servicos || [] }); }
    if (u.intencao === "sim" || u.escolha === 1) {
      const r = await db.rpc("zv_agendar", { p_slug: N.neg.slug, p_inicio: of.inicio, p_minutos: of.dur, p_prof: of.prof || "", p_nome: nome || "Cliente", p_whatsapp: zap,
        p_servicos: of.servicosObj || [{ nome: "Horário", qty: 1 }], p_total: of.total || 0, p_obs: "Marcado pelo robô (vaga que abriu)", p_detalhes: { origem: "robo" } }).catch(e => ({ erro: e.message }));
      if (r && r.erro) { R.push("Poxa, alguém pegou essa vaga agora há pouco. Seu horário de antes continua valendo."); await db.upd(`zv_bot_fila?negocio=eq.${N.neg.id}&ref=eq.${of.ref}&status=eq.enviado`, { motivo: "ocupado" }).catch(() => {}); return fim({}); }
      if (of.agAntigo) await db.upd(`zv_agendamentos?id=eq.${of.agAntigo}`, { status: "cancelado", obs: "Antecipou pelo robô" }).catch(() => {});
      if (of.espera) await db.upd(`zv_espera?id=eq.${of.espera}`, { status: "marcou" }).catch(() => {});
      R.push(`Fechado! Você ficou para ${diaTxt(diaDe(of.inicio), t)} às ${hhmm(minDe(of.inicio))}${of.prof ? " com " + of.prof : ""}. ${of.agAntigo ? "O horário antigo foi liberado. " : ""}Até lá!`);
      return fim({}, "marcou");
    }
    if (u.intencao === "nao") { R.push("Tranquilo! Seu horário continua como estava."); if (of.espera) await db.upd(`zv_espera?id=eq.${of.espera}`, { status: "saiu" }).catch(() => {});
      await ofertarVaga(db, N, { inicio: of.inicio, fim: of.fim, prof: of.prof, pular: [zap] }, t); return fim({}); }
  }

  /* --- resposta ao lembrete (1 confirma, 2 remarca, 3 cancela) --- */
  if (est.etapa === "lembrete" && est.ag) {
    const op = u.escolha || (u.intencao === "sim" ? 1 : u.intencao === "remarcar" ? 2 : u.intencao === "cancelar" ? 3 : null);
    const ag = ((await db.sel(`zv_agendamentos?select=id,inicio,fim,profissional,servicos,status&id=eq.${est.ag}&whatsapp=eq.${zap}`).catch(() => [])) || [])[0];
    if (ag && op === 1) { await db.upd(`zv_agendamentos?id=eq.${ag.id}`, { status: "confirmado" }); R.push(`Confirmado! Te esperamos amanhã às ${hhmm(minDe(ag.inicio))}. 💈`); return fim({}, "confirmou"); }
    if (ag && op === 3) { R.push(`Quer mesmo cancelar amanhã às ${hhmm(minDe(ag.inicio))}? Responda SIM ou NÃO.`); return fim({ etapa: "cancelar", ags: [{ id: ag.id, inicio: ag.inicio, fim: ag.fim, profissional: ag.profissional }] }); }
    if (ag && op === 2) { u.intencao = "remarcar"; Object.assign(est, { etapa: null }); }
  }
  if (est.etapa === "oferta_espera" && u.intencao === "sim") return await entrarEspera(est.dia || hojeSP(t));

  /* --- confirmação de cancelamento --- */
  if (est.etapa === "cancelar" && (u.intencao === "sim" || u.escolha)) {
    const ag = est.ags[(u.escolha || 1) - 1] || est.ags[0];
    if (est.ags.length > 1 && !u.escolha) { R.push("Qual deles você quer cancelar?\n" + est.ags.map((a, i) => `${i + 1} - ${diaTxt(diaDe(a.inicio), t)} às ${hhmm(minDe(a.inicio))}`).join("\n")); return fim(est); }
    await db.upd(`zv_agendamentos?id=eq.${ag.id}&whatsapp=eq.${zap}`, { status: "cancelado", obs: "Cancelado pelo cliente no WhatsApp" });
    R.push(`Cancelado. Seu horário de ${diaTxt(diaDe(ag.inicio), t)} às ${hhmm(minDe(ag.inicio))} foi liberado. Quando quiser marcar de novo, é só chamar!`);
    return fim({}, "cancelou");
  }
  if (est.etapa === "cancelar" && u.intencao === "nao") { R.push("Beleza, seu horário continua marcado."); return fim({}); }

  /* --- escolheu uma das opções oferecidas --- */
  if (est.etapa === "escolher" && est.opcoes && (u.escolha || u.intencao === "sim" || (u.faixa && u.faixa.exato))) {
    let op = u.escolha ? est.opcoes[u.escolha - 1] : u.faixa && u.faixa.exato ? est.opcoes.find(o => hhmm(o.m) === u.faixa.exato) : est.opcoes.length === 1 ? est.opcoes[0] : null;
    if (!op && u.faixa && u.faixa.exato) { est.faixa = u.faixa; est.etapa = "marcar"; }
    else if (!op) { R.push("Me diz o número da opção (1, 2 ou 3) ou outro dia e horário."); return fim(est); }
    else {
      if (!nome) { R.push("Para reservar, qual é o seu nome?"); return fim(Object.assign(est, { etapa: "nome", escolhida: op })); }
      return await reservar(op);
    }
  }
  if (est.etapa === "nome" && est.escolhida) {
    const n = u.nome || (texto.trim().split(/\s+/).length <= 4 && /^[\p{L} '.-]{2,60}$/u.test(texto.trim()) ? texto.trim() : null);
    if (!n) { R.push("Me diz só o seu nome, por favor."); return fim(est); }
    await salvar({ nome: n }); cont.nome = n; return await reservar(est.escolhida, n);
  }
  if (est.etapa === "antecipar") {
    if (u.intencao === "sim" || u.intencao === "nao") { if (est.ag) await db.upd(`zv_agendamentos?id=eq.${est.ag}`, { antecipar: u.intencao === "sim" }).catch(() => {});
      R.push(u.intencao === "sim" ? "Combinado! Se abrir vaga antes, eu te chamo aqui. Até lá!" : "Tudo certo. Até lá!"); return fim({}); }
  }

  /* --- intenções --- */
  const intencao = u.intencao || (est.etapa === "marcar" && (u.dia || u.faixa || u.servicos.length || u.profissional) ? "marcar" : null)
    || ({ 1: "marcar", 2: "meus", 3: "precos", 4: "info", 5: "clube" })[!est.etapa && u.escolha] || null;
  if (intencao === "precos") { R.push("Nossos preços:\n" + N.servicos.map(x => `• ${x.n}: ${brl(x.p)} (${x.dur} min)`).join("\n") + "\n\nQuer marcar? Me diz o serviço e o dia."); return fim({ etapa: "marcar" }); }
  if (intencao === "info") { const H = N.cfg.horario || {}; R.push(`📍 ${N.cfg.endereco || N.neg.nome}\n🕐 ${N.cfg.horarioLabel || Object.keys(H).filter(k => H[k]).map(k => DIAS[k] + " " + H[k][0] + "–" + H[k][1]).join(", ")}\n\nPara marcar, me diz o serviço e o dia. Ou pelo site: ${N.site}`); return fim({}); }
  if (intencao === "clube") { const C = N.cfg.clube || {}; R.push(C.ativo && (C.planos || []).length ? "Clube " + N.neg.nome + ":\n" + C.planos.map(p => `• ${p.nome}: ${brl(p.preco)}/mês (${p.inclui})`).join("\n") + "\n\nQuer assinar? Escreva \"atendente\" que o barbeiro fala com você." : "Ainda não temos clube de assinatura. Quer marcar um horário?"); return fim({}); }
  if (intencao === "meus" || intencao === "remarcar" || intencao === "cancelar") {
    const ags = await proximos(db, N, zap);
    if (!ags.length) { R.push(intencao === "meus" ? "Não achei nenhum horário marcado com este número. Quer marcar um?" : "Não achei horário marcado com este número para " + (intencao === "cancelar" ? "cancelar" : "mudar") + ". Quer marcar um novo?"); return fim({ etapa: "marcar" }); }
    const txt = ags.map((a, i) => `${ags.length > 1 ? i + 1 + " - " : ""}${diaTxt(diaDe(a.inicio), t)} às ${hhmm(minDe(a.inicio))}${a.profissional ? " com " + a.profissional : ""} (${(a.servicos || []).map(x => x.nome).join(" + ")})`).join("\n");
    if (intencao === "meus") { R.push((ags.length > 1 ? "Seus horários:\n" : "Seu horário: ") + txt + "\n\nPara mudar, escreva \"remarcar\". Para cancelar, \"cancelar\"."); return fim({}); }
    if (intencao === "cancelar") { R.push((ags.length > 1 ? "Você tem estes horários:\n" + txt + "\n\nQual quer cancelar? Mande o número." : "Quer mesmo cancelar " + txt + "? Responda SIM ou NÃO.")); return fim({ etapa: "cancelar", ags: ags.map(a => ({ id: a.id, inicio: a.inicio, fim: a.fim, profissional: a.profissional })) }); }
    // remarcar: busca novas opções com o mesmo serviço e barbeiro
    const a = ags[0], ids = N.servicos.filter(x => (a.servicos || []).some(y => y.nome === x.n)).map(x => x.id);
    const novo = { etapa: "marcar", servicos: ids.length ? ids : (u.servicos.length ? u.servicos : []), prof: u.profissional || a.profissional || null, dia: u.dia, faixa: u.faixa, remarcar: a.id };
    if (!u.dia && !u.faixa) { R.push(`Seu horário é ${diaTxt(diaDe(a.inicio), t)} às ${hhmm(minDe(a.inicio))}. Para qual dia e horário quer passar? Ex.: "sexta à tarde".`); return fim(novo); }
    return await oferecer(novo);
  }
  if (intencao === "espera") { const d = u.dia || est.dia; if (!d) { R.push("Para qual dia você quer entrar na lista de espera?"); return fim(Object.assign(est, { etapa: "espera" })); }
    return await entrarEspera(d); }
  if (est.etapa === "espera" && u.dia) return await entrarEspera(u.dia);
  if (intencao === "marcar" || est.etapa === "marcar" || est.etapa === "escolher") {
    const novo = Object.assign({}, est, { etapa: "marcar" });
    if (u.servicos.length) novo.servicos = u.servicos; if (u.profissional) novo.prof = u.profissional; if (u.dia) novo.dia = u.dia; if (u.faixa) novo.faixa = u.faixa;
    if (!(novo.servicos || []).length) { R.push("Qual serviço você quer?\n" + N.servicos.slice(0, 8).map(x => `• ${x.n} (${brl(x.p)})`).join("\n")); return fim(novo); }
    return await oferecer(novo);
  }
  if (est.etapa === "escolher" && u.intencao === "nao") { R.push("Sem problema. Me diz outro dia ou horário que eu procuro."); return fim(Object.assign(est, { etapa: "marcar" })); }
  // não entendeu
  R.push(intencao === "oi" || !est.etapa ? `Oi${nome ? ", " + primeiro(nome) : ""}! Aqui é o atendimento automático da ${N.neg.nome}. 💈\n\n` + MENU(N) : "Não entendi muito bem. " + MENU(N));
  return fim(intencao === "oi" ? {} : est);

  async function oferecer(novo) {
    const b = await buscar(db, N, novo, t);
    if (!b.ops.length) { R.push(`Não achei horário livre${novo.dia ? " para " + diaTxt(novo.dia, t) : " nos próximos dias"}. Quer que eu te coloque na lista de espera? Se alguém desmarcar, você é avisado por ordem de chegada. Responda SIM.`);
      return fim(Object.assign(novo, { etapa: "oferta_espera" })); }
    const sv = nomeServ(N, novo.servicos), pr = precoServ(N, novo.servicos);
    R.push(`${b.cheio ? `${diaTxt(novo.dia, t)} está cheio${novo.faixa ? " nesse horário" : ""}. ` : ""}Para ${sv} (${brl(pr)}), tenho:\n${listaOpcoes(b.ops, t)}\n\nResponda o número. Se quiser outro dia ou horário, é só dizer.${b.cheio ? "\nSe preferir esperar vaga em " + diaTxt(novo.dia, t) + ", escreva \"lista de espera\"." : ""}`);
    return fim(Object.assign(novo, { etapa: "escolher", opcoes: b.ops.map(o => ({ dia: o.dia, m: o.m, prof: o.prof })) }));
  }
  async function reservar(op, n) {
    const novoEst = est.etapa === "nome" ? est : est, ids = novoEst.servicos || [], dur = durServ(N, ids) || 30;
    const r = await db.rpc("zv_agendar", { p_slug: N.neg.slug, p_inicio: isoDe(op.dia, op.m), p_minutos: dur, p_prof: op.prof || "", p_nome: n || nome || "Cliente", p_whatsapp: zap,
      p_servicos: ids.map(id => { const x = N.servicos.find(s => s.id === id); return { id, nome: x.n, preco: x.p, qty: 1 }; }), p_total: precoServ(N, ids), p_obs: "Marcado pelo robô do WhatsApp", p_detalhes: { origem: "robo" } }).catch(e => ({ erro: e.message }));
    if (r && r.erro) { if (globalThis.ZV_DEBUG) console.log("zv_agendar:", r.erro); if (/muitos_pendentes/.test(r.erro)) { R.push("Você já tem 3 horários marcados em aberto. Para marcar mais, fale com a barbearia (escreva \"atendente\")."); return fim({}); }
      R.push("Ops, esse horário acabou de ser pego por outra pessoa. Vou procurar outros pra você."); return await oferecer(Object.assign({}, novoEst, { opcoes: null })); }
    let txt = `Marcado! ✂️\n${nomeServ(N, ids)} ${diaTxt(op.dia, t)} às ${hhmm(op.m)}${r.profissional ? " com " + r.profissional : ""}.\n📍 ${N.cfg.endereco || ""}`;
    if (novoEst.remarcar) { await db.upd(`zv_agendamentos?id=eq.${novoEst.remarcar}&whatsapp=eq.${zap}`, { status: "cancelado", obs: "Remarcado pelo robô" }).catch(() => {});
      txt = txt.replace("Marcado!", "Remarcado!") + "\nO horário antigo foi liberado."; }
    if (N.cfg.sinal) txt += `\n\n${N.cfg.sinal}${N.cfg.pix && N.cfg.pix.chave ? "\nPix: " + N.cfg.pix.chave : ""}`;
    R.push(txt);
    const ag = ((await db.sel(`zv_agendamentos?select=id&negocio=eq.${N.neg.id}&numero=eq.${r.numero}`).catch(() => [])) || [])[0];
    if (N.robo.antecipar && ag && !(op.dia === hojeSP(t))) { R.push("Se abrir uma vaga antes desse horário, quer que eu te avise? Responda SIM ou NÃO."); return fim({ etapa: "antecipar", ag: ag.id }, "marcou"); }
    return fim({}, "marcou");
  }
  async function entrarEspera(dia) {
    const pos = await db.rpc("zv_entrar_espera", { p_slug: N.neg.slug, p_nome: nome || cont.nome || "Cliente", p_whatsapp: zap, p_dia: dia, p_prof: est.prof || "" }).catch(() => null);
    R.push(pos ? `Pronto, você é o ${pos}º da lista de espera para ${diaTxt(dia, t)}. Se alguém desmarcar, eu te chamo aqui, por ordem de chegada.` : "Não consegui te colocar na lista agora. Escreva \"atendente\" que o barbeiro te ajuda.");
    return fim({});
  }
}

/* ------------------------------------------------------------ vaga que abriu → oferecer a um cliente por vez */
// ordem: 1) lista de espera do dia (por ordem de chegada); 2) quem marcou depois, no mesmo dia, e pediu para ser avisado
export async function ofertarVaga(db, N, vaga, t = Date.now()) {
  if (!N.robo.ativo || !N.robo.antecipar) return null;
  const ini = Date.parse(vaga.inicio); if (ini < t + 45 * 60e3) return null;   // em cima da hora não dá tempo
  const dia = diaDe(vaga.inicio), dur = Math.round((Date.parse(vaga.fim) - ini) / 60e3), ref = "vaga:" + vaga.inicio + ":" + (vaga.prof || "");
  const ja = (await db.sel(`zv_bot_fila?select=whatsapp&negocio=eq.${N.neg.id}&tipo=eq.vaga&ref=like.${encodeURIComponent(ref)}*`).catch(() => [])) || [];
  const ocupadosComOferta = ((await db.sel(`zv_bot_contatos?select=whatsapp,estado&negocio=eq.${N.neg.id}&etapa=eq.oferta`).catch(() => [])) || [])
    .filter(c => c.estado.oferta && Date.parse(c.estado.oferta.expira) > t).map(c => c.whatsapp);   // quem já está respondendo outra vaga espera a vez
  const optout = ((await db.sel(`zv_bot_contatos?select=whatsapp&negocio=eq.${N.neg.id}&optout=eq.true`).catch(() => [])) || []).map(c => c.whatsapp);
  const pular = new Set([...(vaga.pular || []), ...ja.map(x => x.whatsapp), ...ocupadosComOferta, ...optout]);
  const ocupado = new Set(ocupadosComOferta); let adiou = false;
  const esp = ((await db.sel(`zv_espera?select=id,nome,whatsapp,profissional&negocio=eq.${N.neg.id}&dia=eq.${dia}&status=eq.esperando&order=criado_em`).catch(() => [])) || [])
    .filter(e => (!e.profissional || !vaga.prof || e.profissional === vaga.prof) && (!ocupado.has(e.whatsapp) || !(adiou = true)) && !pular.has(e.whatsapp));
  let alvo = null;
  if (esp.length) alvo = { zap: esp[0].whatsapp, nome: esp[0].nome, espera: esp[0].id };
  else {
    const fimDia = isoDe(dia, 24 * 60);
    const ags = ((await db.sel(`zv_agendamentos?select=id,nome,whatsapp,inicio,fim,servicos,total,profissional&negocio=eq.${N.neg.id}&antecipar=eq.true&status=in.(pendente,confirmado)&inicio=gt.${vaga.inicio}&inicio=lt.${fimDia}&order=inicio`).catch(() => [])) || [])
      .filter(a => a.whatsapp && (!ocupado.has(a.whatsapp) || !(adiou = true)) && !pular.has(a.whatsapp) && (!vaga.prof || a.profissional === vaga.prof) && Math.round((Date.parse(a.fim) - Date.parse(a.inicio)) / 60e3) <= dur);
    if (ags.length) { const a = ags[0]; alvo = { zap: a.whatsapp, nome: a.nome, agAntigo: a.id, durAg: Math.round((Date.parse(a.fim) - Date.parse(a.inicio)) / 60e3), servicosObj: a.servicos, total: a.total, de: a.inicio }; }
  }
  if (!alvo) return adiou ? "adiada" : null;
  const expira = new Date(Math.max(t, Date.now()) + (N.robo.minutosOferta || 20) * 60e3).toISOString();
  const txt = alvo.agAntigo ? `Oi, ${primeiro(alvo.nome)}! Abriu uma vaga ${diaTxt(dia, t)} às ${hhmm(minDe(vaga.inicio))}${vaga.prof ? " com " + vaga.prof : ""}, antes do seu horário das ${hhmm(minDe(alvo.de))}. Quer adiantar? Responda SIM em até ${N.robo.minutosOferta} minutos.`
    : `Oi, ${primeiro(alvo.nome)}! Abriu uma vaga ${diaTxt(dia, t)} às ${hhmm(minDe(vaga.inicio))}${vaga.prof ? " com " + vaga.prof : ""} na ${N.neg.nome}. Você é o próximo da lista de espera. Quer? Responda SIM em até ${N.robo.minutosOferta} minutos.`;
  const ok = await db.ins("zv_bot_fila", { negocio: N.neg.id, whatsapp: alvo.zap, tipo: "vaga", texto: txt, ref: ref + ":" + alvo.zap, expira,
    modelo: { nome: "vaga_aberta", params: [primeiro(alvo.nome), diaTxt(dia, t), hhmm(minDe(vaga.inicio))] } }).catch(() => null);
  if (!ok) return null;
  // o contato fica esperando a resposta desta oferta
  const of = { inicio: vaga.inicio, fim: new Date(Date.parse(vaga.inicio) + (alvo.durAg || dur) * 60e3).toISOString(), prof: vaga.prof || "", dur: alvo.durAg || dur, expira,
    agAntigo: alvo.agAntigo || null, espera: alvo.espera || null, servicosObj: alvo.servicosObj || null, total: alvo.total || 0, ref: ref + ":" + alvo.zap };
  const c = ((await db.sel(`zv_bot_contatos?select=whatsapp&negocio=eq.${N.neg.id}&whatsapp=eq.${alvo.zap}`).catch(() => [])) || [])[0];
  if (c) await db.upd(`zv_bot_contatos?negocio=eq.${N.neg.id}&whatsapp=eq.${alvo.zap}`, { estado: { etapa: "oferta", oferta: of } });
  else await db.ins("zv_bot_contatos", { negocio: N.neg.id, whatsapp: alvo.zap, nome: alvo.nome, estado: { etapa: "oferta", oferta: of } });
  return alvo;
}

/* ------------------------------------------------------------ rotina (a cada poucos minutos) */
// 1) ofertas de vaga vencidas → passa para o próximo; 2) lembretes de amanhã; 3) envia a fila com os limites anti-bloqueio
export async function rotina({ db, N, canal, enviar, t = Date.now() }) {
  const feito = { enviados: 0, pulados: 0, lembretes: 0, repassadas: 0 };
  // 0) horários que acabaram de ser desmarcados (o banco anota em zv_bot_vagas)
  const novas = (await db.sel(`zv_bot_vagas?select=*&negocio=eq.${N.neg.id}&status=eq.nova&order=criado_em&limit=20`).catch(() => [])) || [];
  for (const v of novas) {
    const ag = ((await db.sel(`zv_agendamentos?select=whatsapp&id=eq.${v.agendamento}`).catch(() => [])) || [])[0];
    const r = await ofertarVaga(db, N, { inicio: v.inicio, fim: v.fim, prof: v.profissional, pular: ag && ag.whatsapp ? [ag.whatsapp] : [] }, t);
    if (r === "adiada") continue;   // o próximo da fila está respondendo outra vaga: tenta de novo na próxima rodada
    await db.upd(`zv_bot_vagas?id=eq.${v.id}`, { status: "feita" }); if (r) feito.repassadas++; }
  // 1) ofertas que ninguém respondeu
  const vencidas = (await db.sel(`zv_bot_contatos?select=whatsapp,estado&negocio=eq.${N.neg.id}&etapa=eq.oferta`).catch(() => [])) || [];
  for (const c of vencidas) { const of = c.estado.oferta; if (!of || Date.parse(of.expira) > t) continue;
    await db.upd(`zv_bot_contatos?negocio=eq.${N.neg.id}&whatsapp=eq.${c.whatsapp}`, { estado: {} });
    if (of.espera) await db.upd(`zv_espera?id=eq.${of.espera}`, { status: "avisado", avisado_em: new Date(t).toISOString() }).catch(() => {});
    const ainda = !(await ocupados(db, N, diaDe(of.inicio), 1)).some(o => (o.profissional === (of.prof || "") || !o.profissional) && Date.parse(o.inicio) < Date.parse(of.fim) && Date.parse(o.fim) > Date.parse(of.inicio));
    if (ainda && await ofertarVaga(db, N, { inicio: of.inicio, fim: of.fim, prof: of.prof, pular: [c.whatsapp] }, t)) feito.repassadas++; }
  // 2) lembretes de amanhã, a partir da hora escolhida
  const agora = agoraSP(t), minAgora = agora.getUTCHours() * 60 + agora.getUTCMinutes();
  if (N.robo.lembrete && minAgora >= toMin(N.robo.horaLembrete || "18:00")) {
    const am = addDias(hojeSP(t), 1);
    const ags = (await db.sel(`zv_agendamentos?select=id,nome,whatsapp,inicio,profissional,servicos&negocio=eq.${N.neg.id}&status=in.(pendente,confirmado)&inicio=gte.${isoDe(am, 0)}&inicio=lt.${isoDe(am, 24 * 60)}`).catch(() => [])) || [];
    for (const a of ags) { if (!a.whatsapp) continue;
      const txt = `Oi, ${primeiro(a.nome)}! Lembrete: amanhã às ${hhmm(minDe(a.inicio))}${a.profissional ? " com " + a.profissional : ""} na ${N.neg.nome}.\nResponda 1 para confirmar, 2 para remarcar ou 3 para cancelar.`;
      const r = await db.ins("zv_bot_fila", { negocio: N.neg.id, whatsapp: a.whatsapp, tipo: "lembrete", texto: txt, ref: "lemb:" + a.id,
        modelo: { nome: "lembrete_horario", params: [primeiro(a.nome), hhmm(minDe(a.inicio)), N.neg.nome] } }).catch(() => null);
      if (r) feito.lembretes++; }
  }
  // 3) envio com limites (anti-bloqueio)
  const hora = agora.getUTCHours();
  if (hora < 8 || hora >= 21) return Object.assign(feito, { motivo: "fora do horário (8h às 21h)" });
  if (canal && (canal.pausado || /RED|YELLOW|FLAGGED/i.test(canal.qualidade || ""))) return Object.assign(feito, { motivo: "envios pausados (qualidade do número)" });
  const hojeIso = hojeSP(t);
  const ja = ((await db.sel(`zv_bot_fila?select=id&negocio=eq.${N.neg.id}&status=eq.enviado&criado_em=gte.${isoDe(hojeIso, 0)}`).catch(() => [])) || []).length;
  let cota = Math.max(0, (N.robo.limiteDia || 60) - ja);
  const fila = (await db.sel(`zv_bot_fila?select=*&negocio=eq.${N.neg.id}&status=eq.fila&enviar_apos=lte.${new Date(Math.max(t, Date.now())).toISOString()}&order=criado_em&limit=8`).catch(() => [])) || [];
  for (const f of fila) {
    const pula = async m => { feito.pulados++; await db.upd(`zv_bot_fila?id=eq.${f.id}`, { status: "pulado", motivo: m }); };
    if (f.expira && Date.parse(f.expira) < t) { await pula("expirou"); continue; }
    if (cota <= 0) break;
    const c = ((await db.sel(`zv_bot_contatos?select=*&negocio=eq.${N.neg.id}&whatsapp=eq.${f.whatsapp}`).catch(() => [])) || [])[0] || {};
    if (c.optout) { await pula("pediu para sair"); continue; }
    if (c.humano_ate && Date.parse(c.humano_ate) > t) { await pula("dono atendendo"); continue; }
    const janela = c.ultima_in && Math.max(t, Date.now()) - Date.parse(c.ultima_in) < 23.5 * 3600e3;   // dentro das 24h: texto livre; fora: modelo aprovado
    // quem não conversou nas últimas 24h recebe no máximo 1 mensagem por dia do robô (vaga que abriu é a exceção: foi o cliente que pediu)
    if (!janela && c.proativas_dia === hojeIso && c.proativas >= 1 && f.tipo !== "vaga") { await pula("já recebeu mensagem hoje"); continue; }
    try { await enviar(f.whatsapp, janela ? { texto: f.texto } : { texto: f.texto, modelo: f.modelo });
      await db.upd(`zv_bot_fila?id=eq.${f.id}`, { status: "enviado" }); feito.enviados++; cota--;
      const conta = f.tipo !== "vaga" ? (c.proativas_dia === hojeIso ? (c.proativas || 0) + 1 : 1) : (c.proativas_dia === hojeIso ? c.proativas || 0 : 0);
      const patch = { ultima_out: new Date(t).toISOString(), proativas_dia: hojeIso, proativas: conta };
      if (f.tipo === "lembrete" && !(c.estado && c.estado.etapa)) patch.estado = { etapa: "lembrete", ag: String(f.ref).replace("lemb:", "") };
      if (c.whatsapp) await db.upd(`zv_bot_contatos?negocio=eq.${N.neg.id}&whatsapp=eq.${f.whatsapp}`, patch).catch(() => {});
      else await db.ins("zv_bot_contatos", Object.assign({ negocio: N.neg.id, whatsapp: f.whatsapp }, patch)).catch(() => {});
      await db.ins("zv_bot_msgs", { negocio: N.neg.id, whatsapp: f.whatsapp, dir: "out", texto: f.texto }).catch(() => {});
    } catch (e) { await db.upd(`zv_bot_fila?id=eq.${f.id}`, { status: "erro", motivo: String(e.message || e).slice(0, 200) }); }
  }
  return feito;
}

/* lembrete respondido com 1/2/3 */
export function mapaLembrete(texto) { const s = sem(texto); return s === "1" ? "confirmar" : s === "2" ? "remarcar" : s === "3" ? "cancelar" : null; }

/* entrada principal: grava a mensagem (ignora repetidas), responde e grava as respostas */
export async function atender({ db, N, zap, texto, waId, nomePerfil, ia, t = Date.now() }) {
  zap = String(zap).replace(/\D/g, "");
  try { await db.ins("zv_bot_msgs", { negocio: N.neg.id, whatsapp: zap, dir: "in", texto: String(texto || "").slice(0, 2000), wa_id: waId || null }); }
  catch (e) { if (/duplicate|unique|23505/i.test(e.message || "")) return { respostas: [], repetida: true }; throw e; }
  if (!N.robo.ativo) return { respostas: [], desligado: true };
  const r = await processar({ db, N, zap, texto: String(texto || ""), nomePerfil, ia, t });
  for (const x of r.respostas) await db.ins("zv_bot_msgs", { negocio: N.neg.id, whatsapp: zap, dir: "out", texto: x }).catch(() => {});
  if (r.respostas.length) await db.upd(`zv_bot_contatos?negocio=eq.${N.neg.id}&whatsapp=eq.${zap}`, { ultima_out: new Date(t).toISOString() }).catch(() => {});
  return r;
}
