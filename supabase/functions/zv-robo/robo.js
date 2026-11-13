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
  const robo = Object.assign({ ativo: true, lembrete: true, horaLembrete: "18:00", antecipar: true, limiteDia: 60, minutosOferta: 20, nome: "", tom: "leve", faq: [] }, cfg.robo || {});
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
// apelidos que o cliente usa para cada serviço (barbearia); o dono pode somar os dele em config.robo.apelidos
const APELIDOS = {
  "corte": ["cabelo", "cortar", "corte", "degrade", "social", "americano", "navalhado", "tapa no visual", "aparar", "disfarcado", "maquina"],
  "corte-infantil": ["infantil", "crianca", "filho", "filhinho", "menino", "kids", "sobrinho"],
  "barba": ["barba", "barbear", "barbinha"],
  "corte-barba": ["completo", "combo", "corte e barba", "cabelo e barba", "barba e cabelo", "barba e corte", "cabelo mais barba", "corte mais barba"],
  "platinado": ["platin", "nevou", "nevado", "luzes", "descolor"],
  "hidratacao": ["hidrat", "relaxa"],
  "pezinho": ["pezinho", "acabamento", "contorno"],
  "sobrancelha": ["sobrancelha"],
};
const ABREV = [[/\bhj\b/g, "hoje"], [/\b(amnh|amnha|amn|amh|amanh)\b/g, "amanha"], [/\bdps\b/g, "depois"], [/\b(qro|qr|kero|quero)\b/g, "quero"], [/\bvcs?\b/g, "voces"],
  [/\bvoce\b/g, "voces"], [/\b(obg|obgd|obgda|brigado|brigada)\b/g, "obrigado"], [/\bvlw+\b/g, "valeu"], [/\btb\b/g, "tambem"], [/\bcorta\b/g, "cortar"],
  [/\bsab\b/g, "sabado"], [/\bhrs?\b/g, "h"], [/\bp\/? /g, "pra "], [/\bpara\b/g, "pra"], [/\bmto\b/g, "muito"], [/\bq\b/g, "que"], [/\beh\b/g, "e"], [/\bnum\b/g, "nao"]];
const EMOJI = [[/[👍👌✅🤝🙌]/gu, " sim "], [/[👎❌🚫]/gu, " nao "], [/1️⃣/gu, " 1 "], [/2️⃣/gu, " 2 "], [/3️⃣/gu, " 3 "], [/4️⃣/gu, " 4 "], [/5️⃣/gu, " 5 "]];
export function entenderSemIA(N, texto, t = Date.now()) {
  let bruto = String(texto || ""); EMOJI.forEach(([a, b]) => bruto = bruto.replace(a, b));
  let s = sem(bruto); ABREV.forEach(([a, b]) => s = s.replace(a, b)); s = s.replace(/\s+/g, " ").trim();
  const r = { intencao: null, servicos: [], profissional: null, dia: null, faixa: null, escolha: null, nome: null, saudacao: false };
  // saudação no começo ("boa tarde! tem horário amanhã?") não atrapalha o resto
  const sd = s.match(/^(oi+|ola|opa|eae|eai|e ai|salve|fala|bom dia|boa tarde|boa noite|tudo bem|tudo bom|td bem)( (tudo bem|tudo bom|pessoal|galera|mano|amigo))?\b ?/);
  if (sd) { r.saudacao = true; s = s.slice(sd[0].length).trim(); const s2 = s.match(/^(tudo bem|tudo bom|td bem|beleza|blz|como vai|tranquilo)\b ?/); if (s2) s = s.slice(s2[0].length).trim(); }
  if (r.saudacao && !s) { r.intencao = "oi"; return r; }
  // nome ("meu nome é Carlos", "sou o João Pedro")
  const nm = String(texto).match(/(?:meu nome (?:é|e|eh)|me chamo|aqui (?:é|e) (?:o|a)|sou (?:o|a))\s+([A-Za-zÀ-ÿ']+(?:\s+[A-Za-zÀ-ÿ']+){0,2})/i);
  if (nm) r.nome = nm[1].split(/\s+/).filter(w => !/^(e|de|da|do|aqui|quero|queria)$/i.test(w) || nm[1].split(/\s+/).length < 2).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  // escolha de opção ("2", "a 2", "opção 3", "o primeiro", "a segunda opção")
  let m = s.match(/^(?:a|o|opcao|numero|n|quero a|quero o|pode ser a|pode ser o|vou de|fico com a|fico com o)? ?([1-9])$/) || s.match(/\bopcao ([1-9])\b/);
  if (m) r.escolha = Number(m[1]);
  else if (/^(o|a) (primeir[oa])\b|^primeir[oa]\b|\bprimeira opcao\b/.test(s)) r.escolha = 1;
  else if (/\bsegunda opcao\b|^(o )?segundo\b/.test(s)) r.escolha = 2;
  else if (/\bterceira opcao\b|^(o|a) terceir[oa]\b|^terceir[oa]\b/.test(s)) r.escolha = 3;
  // intenção (a ordem importa)
  const tem = re => re.test(s);
  if (tem(/^(sair|parar|stop|pare|descadastrar|cancelar avisos)$|nao quero (mais )?receber/)) r.intencao = "sair";
  else if (tem(/\b(atendente|humano|falar com (o |a |um |uma )?(dono|barbeiro|alguem|pessoa|atendente|gente)|uma pessoa de verdade)\b/)) r.intencao = "humano";
  else if (tem(/\b(e|isso e|voces sao|to falando com (um )?) ?(um )?robo\b|\bbot\b/)) r.intencao = "ehrobo";
  else if (tem(/^(muito )?(obrigad[oa]|valeu|agradeco|tmj|brigadao)\b/)) r.intencao = "obrigado";
  else if (tem(/\b(desmarc|cancel)|\bnao (vou|vai) (poder|conseguir|dar)( ir)?\b|\bnao (consigo|posso|vou) ir\b|\bimprevisto\b/)) r.intencao = "cancelar";
  else if (tem(/\b(remarc|mudar|trocar|adiar|adiantar|antecipar|passar (pra|o horario)|outro horario|vou me atrasar|me atrasar|atrasad)/)) r.intencao = "remarcar";
  else if (tem(/\b(meu horario|meus horarios|tenho horario( marcado)?|(que|qual) (horas|dia|horario) (e|eu) (o )?(meu|marquei)|eu marquei|quando e (o )?meu|ja (to|estou) marcado)\b/)) r.intencao = "meus";
  else if (tem(/\b(lista de espera|me avis|se abrir|quando abrir|fila de espera)/)) r.intencao = "espera";
  else if (tem(/\b(clube|plano mensal|planos|assinatura|assinar|mensalidade)\b/)) r.intencao = "clube";
  else if (tem(/\b(preco|precos|valor|valores|quanto (custa|e|fica|ta|sai|cobra|cobram)|tabela|quanto)\b/) && !tem(/\b(quanto tempo|demora)\b/)) r.intencao = "precos";
  else if (tem(/\b(endereco|onde (fica|e|voces ficam)|localiza|como (eu )?chego|abre|abrem|fecha|fecham|funcionam|horario de funcionamento|ate que horas|que horas (voces )?(abre|fecha|atende)|atendem (no |de )?(domingo|sabado|feriado))\b/)) r.intencao = "info";
  else if (tem(/^(sim|s|ss|isso|isso mesmo|isso ai|exato|pode|pode ser|pode sim|pode marcar|ok|okay|beleza|blz|fechado|confirmo|confirmar|confirmado|bora|claro|perfeito|show|top|quero|quero sim|sim quero|uhum|aham|positivo|certo|combinado|demorou|fechou|sim sim)( (sim|pode|obrigad[oa]|valeu|por favor|pf|mano|irmao))?$/)) r.intencao = "sim";
  else if (tem(/^(nao|n|nn|nao obrigad[oa]|agora nao|deixa|deixa pra la|esquece|nenhum|nenhuma|nenhum desses|nenhuma dessas|nao quero|negativo|prefiro outro( horario| dia)?)\b/)) r.intencao = "nao";
  // serviços citados (apelidos do nicho + nome do serviço + apelidos que o dono cadastrou)
  const ap = Object.assign({}, APELIDOS, (N.robo && N.robo.apelidos) || {}); const sb = " " + s.replace(/\bbarbearia\b/g, " ") + " ";
  N.servicos.forEach(x => { const partes = sem(x.n).split(/ ?[\/+] ?| e /).filter(p => p.length >= 4); const lista = [...(ap[x.id] || []), ...partes];
    if (lista.some(a => new RegExp("\\b" + a.replace(/ /g, "\\s+")).test(sb))) r.servicos.push(x.id); });
  if (r.servicos.includes("corte-barba")) r.servicos = r.servicos.filter(i => i !== "corte" && i !== "barba");
  else if (r.servicos.includes("corte") && r.servicos.includes("barba") && N.servicos.some(x => x.id === "corte-barba")) r.servicos = r.servicos.filter(i => i !== "corte" && i !== "barba").concat("corte-barba");
  if (r.servicos.includes("corte-infantil")) r.servicos = r.servicos.filter(i => i !== "corte");
  N.profs.forEach(p => { if (new RegExp("\\b" + sem(p) + "\\b").test(s)) r.profissional = p; });
  // dia
  const hoje = hojeSP(t), nomes = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  if (/\b(hoje|agora|agorinha|ainda hoje)\b/.test(s)) r.dia = hoje;
  else if (/\bdepois de amanha\b/.test(s)) r.dia = addDias(hoje, 2);
  else if (/\bamanha\b/.test(s)) r.dia = addDias(hoje, 1);
  else if ((m = s.match(/\bdaqui (?:a )?(\d{1,2}) dias?\b/))) r.dia = addDias(hoje, Number(m[1]));
  else if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})\b/) || s.match(/\bdia (\d{1,2})\b/))) {
    const d = Number(m[1]), mo = m[2] ? Number(m[2]) : Number(hoje.slice(5, 7)), y = Number(hoje.slice(0, 4));
    let iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (iso < hoje) iso = m[2] ? `${y + 1}${iso.slice(4)}` : new Date(Date.UTC(y, mo, d)).toISOString().slice(0, 10);
    if (!isNaN(Date.parse(iso)) && d >= 1 && d <= 31) r.dia = iso;
  } else { const i = nomes.findIndex(n => new RegExp("\\b" + n + "\\b").test(s) && !(n === "segunda" && /\bsegunda opcao\b/.test(s)));
    if (i >= 0) { let k = (i - diaSemana(hoje) + 7) % 7; if (k === 0) k = /\b(hoje|agora)\b/.test(s) ? 0 : 7; r.dia = addDias(hoje, k); } }
  // hora
  const hora = (h, per) => { h = Number(h); if (per === "tarde" || per === "noite") { if (h < 12) h += 12; } else if (!per && h >= 1 && h <= 7) h += 12; return h; };
  const fmt = (h, mi) => String(h).padStart(2, "0") + ":" + String(mi || 0).padStart(2, "0");
  if ((m = s.match(/\b(depois|apos|a partir) (?:d[aoe]s? |das |as )?(\d{1,2})(?:h|:)?(\d{2})?\b/))) r.faixa = { de: fmt(hora(m[2]), m[3]) };
  else if ((m = s.match(/\b(antes|ate) (?:d[aoe]s? |das |as )?(\d{1,2})(?:h|:)?(\d{2})?\b/)) && r.intencao !== "info") r.faixa = { ate: fmt(hora(m[2]), m[3]) };
  else if (/\bmeio ?dia\b/.test(s)) r.faixa = { exato: "12:00" };
  else if ((m = s.match(/\b(\d{1,2})(?:h| ?horas?)? ?(?:e )?(meia|\d{2})? (da|de) (manha|tarde|noite)\b/))) r.faixa = { exato: fmt(hora(m[1], m[4]), m[2] === "meia" ? 30 : m[2]) };
  else if ((m = s.match(/\b(\d{1,2})(?:h|:)(\d{2})?\b/) || s.match(/\b(?:as|a|das|pras|pra) (\d{1,2})(?: e (meia))?\b(?!\/)/))) { const mi = m[2] === "meia" ? 30 : m[2]; if (Number(m[1]) <= 23) r.faixa = { exato: fmt(hora(m[1]), mi) }; }
  else if (/\bdepois do almoco\b/.test(s)) r.faixa = { de: "13:00" };
  else if (/\b(fim|final) da tarde\b/.test(s)) r.faixa = { de: "16:00", ate: "19:00" };
  else if (/\b(comeco|inicio) da tarde\b/.test(s)) r.faixa = { de: "12:00", ate: "15:00" };
  else if (/\b(mais cedo|cedinho|logo cedo|cedo)\b/.test(s)) r.faixa = { ate: "12:00" };
  else if (/\b(de manha|pela manha|manha|manhazinha)\b/.test(s.replace(/\b(depois de )?amanha\b/g, ""))) r.faixa = { ate: "12:00" };
  else if (/\b(tarde|tardezinha)\b/.test(s) && !/\b(mais tarde)\b/.test(s)) r.faixa = { de: "12:00", ate: "18:00" };
  else if (/\b(noite|noitinha)\b/.test(s)) r.faixa = { de: "18:00" };
  if (/\b(agora|agorinha|ja)\b/.test(s) && r.dia === hoje && !r.faixa) { const a = agoraSP(t); r.faixa = { de: fmt(a.getUTCHours(), a.getUTCMinutes()) }; }
  // pergunta solta (não é marcar nem outra intenção): responder com os dados do negócio ou passar para o dono
  const querMarcar = /\b(marcar|agendar|agenda|horario|vaga|encaixe|encaixar|cortar|disponivel|tem hora|qualquer barbeiro|atendimento)\b/.test(s);
  if (!r.intencao && /\?|^(aceita|aceitam|tem|voces (tem|fazem|aceitam|atendem|vendem)|faz|fazem|pode|da pra (levar|ir|pagar)|precisa)\b/.test(String(texto).toLowerCase().trim() + (s.match(/^(aceita|aceitam|voces|faz|fazem|precisa)\b/) ? "?" : ""))
      && !querMarcar && !r.dia && !r.faixa && !r.escolha) r.intencao = "pergunta";
  if (!r.intencao && (querMarcar || r.dia || r.faixa || r.servicos.length || r.profissional || /\b(quero|queria|gostaria|preciso|bora|marca)\b/.test(s)) && !r.escolha && !r.nome) r.intencao = "marcar";
  if (!r.intencao && r.saudacao && !s) r.intencao = "oi";
  if (!r.intencao && r.saudacao) r.intencao = "oi";
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
Campos: intencao (marcar|remarcar|cancelar|meus|precos|info|clube|espera|humano|ehrobo|obrigado|pergunta|sair|sim|nao|oi|outro; pergunta = dúvida sobre a barbearia que não é marcar), servicos (lista de ids), profissional (nome ou null),
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
const MENU_OPS = N => ["Marcar horário", "Ver ou mudar meu horário", "Preços", "Endereço e horário", ...(N.cfg.clube && N.cfg.clube.ativo ? ["Clube de assinatura"] : [])];
const MENU = N => `Posso te ajudar com:\n${MENU_OPS(N).map((o, i) => `${i + 1} - ${o}`).join("\n")}\n\nOu escreva do seu jeito, ex.: "corte amanhã depois das 5". Para falar com o barbeiro, escreva "atendente".`;
// uma resposta pode levar opções para tocar (no WhatsApp viram botões ou lista); quem não tem botão responde o número
const comOpcoes = (texto, opcoes) => ({ texto, opcoes });
const SIMNAO = ["Sim", "Não"];
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

// jeito de falar escolhido pelo dono: "leve" (padrão, com emoji) ou "formal" (sem emoji, mais polido)
function tom(N, x) { if (N.robo.tom !== "formal") return x; const f = s => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?/gu, "").replace(/\bOi\b/g, "Olá").replace(/\bTranquilo!/g, "Sem problemas.").replace(/\bBeleza,/g, "Certo,").replace(/ +\n/g, "\n").replace(/^ +/gm, "").replace(/ {2,}/g, " ").trim();
  return typeof x === "string" ? f(x) : Object.assign({}, x, { texto: f(x.texto) }); }
const quem = N => N.robo.nome ? `Aqui é ${/a$/i.test(N.robo.nome) ? "a" : "o"} ${N.robo.nome}, do atendimento da ${N.neg.nome}` : `Aqui é o atendimento automático da ${N.neg.nome}`;

/* perguntas soltas: responde só com o que o dono cadastrou (perguntas frequentes) ou com os dados do site; sem inventar */
const palavras = s => sem(s).split(" ").filter(w => w.length >= 4 && !/^(voces|voce|quero|queria|gostaria|aqui|isso|esse|essa|para|pra|tem|como|qual|quais|onde|quando|porque|sobre|fazer|fazem|aceita|aceitam)$/.test(w)).map(w => w.slice(0, 6));
export async function responderPergunta(N, texto, u, ia) {
  const s = sem(texto);
  if (u.servicos && u.servicos.length) { const x = N.servicos.find(y => y.id === u.servicos[0]); return `Fazemos sim! ${x.n}: ${brl(x.p)} (${x.dur} min). Quer marcar? Me diz o dia.`; }
  const faq = (N.robo.faq || []).filter(f => f && f.p && f.r);
  const q = palavras(texto); let best = null, nota = 0;
  faq.forEach(f => { const w = palavras(f.p); const n = q.filter(x => w.includes(x)).length / Math.max(1, Math.min(q.length, w.length)); if (n > nota) { nota = n; best = f; } });
  if (best && nota >= 0.5) return best.r;
  if (/(pix)/.test(s) && N.cfg.pix && N.cfg.pix.chave) return "Aceitamos Pix sim! A chave é " + N.cfg.pix.chave + ".";
  if (ia && ia.chave) {   // IA responde só com os fatos abaixo; se não estiver ali, diz que não sabe
    const fatos = [`Nome: ${N.neg.nome}`, N.cfg.endereco && `Endereço: ${N.cfg.endereco}`, N.cfg.horarioLabel && `Horário: ${N.cfg.horarioLabel}`,
      `Serviços: ${N.servicos.map(x => x.n + " " + brl(x.p)).join("; ")}`, N.profs.length && `Barbeiros: ${N.profs.join(", ")}`, N.cfg.sinal && `Sinal: ${N.cfg.sinal}`,
      ...faq.map(f => `P: ${f.p} R: ${f.r}`), ...((N.cfg.sobre || []).map(x => String(x).replace(/<[^>]+>/g, "")))].filter(Boolean).join("\n");
    try { const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ia.modelo || "gemini-3.5-flash-lite"}:generateContent?key=${ia.chave}`, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `Você é o atendente de WhatsApp de uma barbearia. Responda em português do Brasil, curto e simpático, USANDO SÓ os fatos abaixo. Se a resposta não estiver nos fatos, responda exatamente NAO_SEI. Nunca invente preço, horário ou serviço.\nFATOS:\n${fatos}\n\nPergunta do cliente: """${String(texto).slice(0, 400)}"""` }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 200 } }) });
      clearTimeout(to); if (r.ok) { const j = await r.json(), x = (j.candidates && j.candidates[0] && j.candidates[0].content.parts.map(p => p.text).join("") || "").trim();
        if (x && !/NAO_SEI/.test(x) && x.length < 600) return x; } } catch (e) {}
  }
  return null;   // não sabe: passa para o dono
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

  const est = Object.assign({}, cont.estado || {}), R = [], fim = async (novo, aviso) => { await salvar({ estado: novo || {} }); return { respostas: R.map(x => tom(N, x)), aviso }; };
  const u = await entenderComIA(N, texto, est, ia, t);
  if (u.nome && !cont.nome) await salvar({ nome: u.nome });
  const nome = cont.nome;

  if (u.intencao === "sair") { await salvar({ optout: true, estado: {} }); R.push("Pronto, você não vai mais receber mensagens automáticas da " + N.neg.nome + ". Se quiser marcar horário, é só mandar mensagem."); return { respostas: R }; }
  if (cont.optout && u.intencao && u.intencao !== "sair") await salvar({ optout: false });   // voltou a conversar
  if (u.intencao === "ehrobo") { R.push(`Sou o atendente automático da ${N.neg.nome} 🤖. Consigo marcar, remarcar e cancelar horários, mostrar preços e te colocar na lista de espera. Se preferir falar com uma pessoa, é só escrever *atendente*.`); return fim(est); }
  if (u.intencao === "obrigado" && !["escolher", "cancelar", "nome", "oferta"].includes(est.etapa)) { R.push("Por nada! Qualquer coisa é só chamar. 💈"); return fim({}); }
  if (u.intencao === "pergunta" && !["escolher", "cancelar", "nome", "oferta", "lembrete"].includes(est.etapa)) {
    const resp = await responderPergunta(N, texto, u, ia);
    if (resp) { R.push(resp); return fim(u.servicos.length ? { etapa: "marcar", servicos: u.servicos } : est); }
    await salvar({ humano_ate: new Date(t + 2 * 3600e3).toISOString() });
    R.push("Boa pergunta! Vou confirmar com o pessoal da barbearia e já te respondem por aqui."); return fim({}, "humano");
  }
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
    if (ag && op === 3) { R.push(comOpcoes(`Quer mesmo cancelar amanhã às ${hhmm(minDe(ag.inicio))}? Responda SIM ou NÃO.`, SIMNAO)); return fim({ etapa: "cancelar", ags: [{ id: ag.id, inicio: ag.inicio, fim: ag.fim, profissional: ag.profissional }] }); }
    if (ag && op === 2) { u.intencao = "remarcar"; Object.assign(est, { etapa: null }); }
  }
  if (est.etapa === "oferta_espera" && u.intencao === "sim") return await entrarEspera(est.dia || hojeSP(t));

  /* --- confirmação de cancelamento --- */
  if (est.etapa === "cancelar" && (u.intencao === "sim" || u.escolha)) {
    const ag = est.ags[(u.escolha || 1) - 1] || est.ags[0];
    if (est.ags.length > 1 && !u.escolha) { const ops = est.ags.map(a => `${diaTxt(diaDe(a.inicio), t)} às ${hhmm(minDe(a.inicio))}`); R.push(comOpcoes("Qual deles você quer cancelar?\n" + ops.map((o, i) => `${i + 1} - ${o}`).join("\n"), ops)); return fim(est); }
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
  if (intencao === "precos" && u.servicos.length) { const L = u.servicos.map(id => N.servicos.find(x => x.id === id));
    R.push(L.map(x => `${x.n}: ${brl(x.p)} (${x.dur} min)`).join("\n") + "\n\nQuer marcar? Me diz o dia."); return fim({ etapa: "marcar", servicos: u.servicos }); }
  if (intencao === "precos") { R.push("Nossos preços:\n" + N.servicos.map(x => `• ${x.n}: ${brl(x.p)} (${x.dur} min)`).join("\n") + "\n\nQuer marcar? Me diz o serviço e o dia."); return fim({ etapa: "marcar" }); }
  if (intencao === "info") { const H = N.cfg.horario || {}; R.push(`📍 ${N.cfg.endereco || N.neg.nome}\n🕐 ${N.cfg.horarioLabel || Object.keys(H).filter(k => H[k]).map(k => DIAS[k] + " " + H[k][0] + "–" + H[k][1]).join(", ")}\n\nPara marcar, me diz o serviço e o dia. Ou pelo site: ${N.site}`); return fim({}); }
  if (intencao === "clube") { const C = N.cfg.clube || {}; R.push(C.ativo && (C.planos || []).length ? "Clube " + N.neg.nome + ":\n" + C.planos.map(p => `• ${p.nome}: ${brl(p.preco)}/mês (${p.inclui})`).join("\n") + "\n\nQuer assinar? Escreva \"atendente\" que o barbeiro fala com você." : "Ainda não temos clube de assinatura. Quer marcar um horário?"); return fim({}); }
  if (intencao === "meus" || intencao === "remarcar" || intencao === "cancelar") {
    const ags = await proximos(db, N, zap);
    if (!ags.length) { R.push(intencao === "meus" ? "Não achei nenhum horário marcado com este número. Quer marcar um?" : "Não achei horário marcado com este número para " + (intencao === "cancelar" ? "cancelar" : "mudar") + ". Quer marcar um novo?"); return fim({ etapa: "marcar" }); }
    const txt = ags.map((a, i) => `${ags.length > 1 ? i + 1 + " - " : ""}${diaTxt(diaDe(a.inicio), t)} às ${hhmm(minDe(a.inicio))}${a.profissional ? " com " + a.profissional : ""} (${(a.servicos || []).map(x => x.nome).join(" + ")})`).join("\n");
    if (intencao === "meus") { R.push((ags.length > 1 ? "Seus horários:\n" : "Seu horário: ") + txt + "\n\nPara mudar, escreva \"remarcar\". Para cancelar, \"cancelar\"."); return fim({}); }
    if (intencao === "cancelar") { R.push(ags.length > 1 ? comOpcoes("Você tem estes horários:\n" + txt + "\n\nQual quer cancelar? Mande o número.", ags.map(a => `${diaTxt(diaDe(a.inicio), t)} ${hhmm(minDe(a.inicio))}`)) : comOpcoes("Quer mesmo cancelar " + txt + "? Responda SIM ou NÃO.", SIMNAO)); return fim({ etapa: "cancelar", ags: ags.map(a => ({ id: a.id, inicio: a.inicio, fim: a.fim, profissional: a.profissional })) }); }
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
  R.push(comOpcoes(intencao === "oi" || !est.etapa ? `Oi${nome ? ", " + primeiro(nome) : ""}! ${quem(N)}. 💈\n\n` + MENU(N) : "Não entendi muito bem. " + MENU(N), MENU_OPS(N)));
  return fim(intencao === "oi" ? {} : est);

  async function oferecer(novo) {
    const b = await buscar(db, N, novo, t);
    if (!b.ops.length) { R.push(`Não achei horário livre${novo.dia ? " para " + diaTxt(novo.dia, t) : " nos próximos dias"}. Quer que eu te coloque na lista de espera? Se alguém desmarcar, você é avisado por ordem de chegada. Responda SIM.`); R[R.length - 1] = comOpcoes(R[R.length - 1], SIMNAO);
      return fim(Object.assign(novo, { etapa: "oferta_espera" })); }
    const sv = nomeServ(N, novo.servicos), pr = precoServ(N, novo.servicos);
    const fechado = novo.dia && !(N.cfg.horario || {})[diaSemana(novo.dia)];
    R.push(comOpcoes(`${b.cheio ? (fechado ? `Não abrimos ${DIAS[diaSemana(novo.dia)]}. ` : `${diaTxt(novo.dia, t)} está cheio${novo.faixa ? " nesse horário" : ""}. `) : ""}Para ${sv} (${brl(pr)}), tenho:\n${listaOpcoes(b.ops, t)}\n\nResponda o número. Se quiser outro dia ou horário, é só dizer.${b.cheio && !fechado ? "\nSe preferir esperar vaga em " + diaTxt(novo.dia, t) + ", escreva \"lista de espera\"." : ""}`, b.ops.map(o => `${diaTxt(o.dia, t)} ${hhmm(o.m)}${o.prof ? " · " + o.prof : ""}`)));
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
    if (N.robo.antecipar && ag && !(op.dia === hojeSP(t))) { R.push(comOpcoes("Se abrir uma vaga antes desse horário, quer que eu te avise? Responda SIM ou NÃO.", SIMNAO)); return fim({ etapa: "antecipar", ag: ag.id }, "marcou"); }
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
  for (const x of r.respostas) await db.ins("zv_bot_msgs", { negocio: N.neg.id, whatsapp: zap, dir: "out", texto: typeof x === "string" ? x : x.texto }).catch(() => {});
  if (r.respostas.length) await db.upd(`zv_bot_contatos?negocio=eq.${N.neg.id}&whatsapp=eq.${zap}`, { ultima_out: new Date(t).toISOString() }).catch(() => {});
  return r;
}
