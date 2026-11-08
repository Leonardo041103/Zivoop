// Robô da Zivoop Ofertas: fica ligado 24h na VPS, conecta os números, sincroniza grupos e posta as ofertas agendadas.
import fs from "node:fs";
import http from "node:http";
import { db } from "./db.js";
import { conectar, temSessao, apagarSessao } from "./whats.js";
import { lerLink } from "./link.js";
import { comissoesShopee, temShopee } from "./shopee.js";

const T = { comandos: +process.env.SEG_COMANDOS || 3, fila: +process.env.SEG_FILA || 15, grupos: +process.env.MIN_GRUPOS || 60, comissoes: +process.env.MIN_COMISSOES || 180 };
const ESCALA_INTERVALO = +process.env.ESCALA_INTERVALO || 1;   // 0.01 nos testes, para não esperar 20 segundos
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);
const espera = ms => new Promise(r => setTimeout(r, ms));
const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

const conexoes = new Map();     // numeroId -> { wa, dono, pronto }
const ocupado = new Set();      // números enviando agora
const contas = new Map();       // cache curto das contas

async function conta(dono) {
  const c = contas.get(dono);
  if (c && Date.now() - c.t < 30000) return c.v;
  const v = await db.um("fl_contas", { dono: "eq." + dono });
  contas.set(dono, { v, t: Date.now() }); return v;
}

// ---------- conexão dos números ----------
async function ligar(numero) {
  if (conexoes.has(numero.id)) return;
  const reg = { dono: numero.dono, pronto: false, qrs: 0, wa: null };
  conexoes.set(numero.id, reg);
  try {
    reg.wa = await conectar(numero.id, {
      qr: async qr => {
        reg.qrs++;
        if (reg.qrs > 6) { log("QR não lido a tempo", numero.id); return desligar(numero.id, true, "Ninguém leu o QR a tempo. Clique em Conectar de novo."); }
        await db.mudar("fl_numeros", { id: "eq." + numero.id }, { status: "aguardando_qr", qr, atualizado: new Date().toISOString() }).catch(e => log(e.message));
      },
      aberto: async tel => {
        reg.pronto = true; reg.qrs = 0; log("conectado", numero.id, tel);
        await db.mudar("fl_numeros", { id: "eq." + numero.id }, { status: "conectado", qr: null, telefone: tel, atualizado: new Date().toISOString() }).catch(e => log(e.message));
        setTimeout(() => sincronizar(numero.id).catch(e => log("sync", e.message)), 1500);
      },
      fechado: async (deslogou, cod) => {
        reg.pronto = false; conexoes.delete(numero.id);
        if (deslogou) {
          log("deslogado pelo celular", numero.id); apagarSessao(numero.id);
          await db.mudar("fl_numeros", { id: "eq." + numero.id }, { status: "desconectado", qr: null, atualizado: new Date().toISOString() }).catch(() => {});
        } else {
          log("caiu, reconectando", numero.id, cod || "");
          const n = await db.um("fl_numeros", { id: "eq." + numero.id }).catch(() => null);
          if (n) setTimeout(() => ligar(n), 3000);
        }
      },
      participantes: p => contarMembros(numero.id, p).catch(e => log("membros", e.message)),
    });
  } catch (e) { conexoes.delete(numero.id); log("erro ao conectar", numero.id, e.message); }
}

async function desligar(id, deslogar, motivo) {
  const reg = conexoes.get(id); conexoes.delete(id);
  if (reg && reg.wa) await reg.wa.sair(deslogar);
  if (deslogar) apagarSessao(id);
  await db.mudar("fl_numeros", { id: "eq." + id }, { status: "desconectado", qr: null, atualizado: new Date().toISOString() }).catch(() => {});
  return motivo;
}

// ---------- grupos e membros ----------
async function sincronizar(numeroId) {
  const reg = conexoes.get(numeroId); if (!reg || !reg.pronto) throw new Error("Número não está conectado.");
  const lista = await reg.wa.grupos(), agora = new Date().toISOString();
  if (!lista.length) return { grupos: 0 };
  const salvos = await db.inserir("fl_grupos", lista.map(g => ({ dono: reg.dono, numero_id: numeroId, jid: g.jid, nome: g.nome, membros: g.membros, admin: g.admin, atualizado: agora })), "numero_id,jid");
  // foto do dia (mantém entradas/saídas já contadas)
  const dia = hoje(), ja = await db.ler("fl_membros_dia", { dia: "eq." + dia, dono: "eq." + reg.dono });
  const porGrupo = Object.fromEntries(ja.map(x => [x.grupo_id, x]));
  await db.inserir("fl_membros_dia", salvos.map(g => ({ grupo_id: g.id, dono: reg.dono, dia, membros: g.membros,
    entradas: (porGrupo[g.id] || {}).entradas || 0, saidas: (porGrupo[g.id] || {}).saidas || 0 })), "grupo_id,dia");
  log("grupos sincronizados", numeroId, salvos.length);
  return { grupos: salvos.length };
}

async function contarMembros(numeroId, { jid, entraram, sairam }) {
  const g = await db.um("fl_grupos", { numero_id: "eq." + numeroId, jid: "eq." + jid }); if (!g) return;
  const membros = Math.max(0, g.membros + entraram - sairam), dia = hoje();
  await db.mudar("fl_grupos", { id: "eq." + g.id }, { membros, atualizado: new Date().toISOString() });
  const d = await db.um("fl_membros_dia", { grupo_id: "eq." + g.id, dia: "eq." + dia });
  await db.inserir("fl_membros_dia", [{ grupo_id: g.id, dono: g.dono, dia, membros, entradas: ((d && d.entradas) || 0) + entraram, saidas: ((d && d.saidas) || 0) + sairam }], "grupo_id,dia");
}

// ---------- comandos do painel ----------
async function comandos() {
  const lista = await db.ler("fl_comandos", { status: "eq.pendente", order: "criado.asc", limit: 20 });
  for (const c of lista) {
    const [pego] = await db.mudar("fl_comandos", { id: "eq." + c.id, status: "eq.pendente" }, { status: "processando" });
    if (!pego) continue;
    let status = "ok", resposta = {};
    try { resposta = await executar(c) || {}; }
    catch (e) { status = "erro"; resposta = { erro: e.message }; log("comando", c.tipo, e.message); }
    await db.mudar("fl_comandos", { id: "eq." + c.id }, { status, resposta });
  }
}

async function executar(c) {
  const numero = c.numero_id ? await db.um("fl_numeros", { id: "eq." + c.numero_id, dono: "eq." + c.dono }) : null;
  if (["conectar", "desconectar", "sincronizar"].includes(c.tipo) && !numero) throw new Error("Número não encontrado.");
  if (c.tipo === "conectar") {
    const reg = conexoes.get(numero.id);
    if (reg && reg.pronto) return { ja: true };
    if (reg) await desligar(numero.id, false);
    await ligar(numero); return {};
  }
  if (c.tipo === "desconectar") { await desligar(numero.id, true); return {}; }
  if (c.tipo === "sincronizar") return sincronizar(numero.id);
  if (c.tipo === "ler_link") return lerLink(c.dados.link, await conta(c.dono));
  if (c.tipo === "comissoes") return { novas: await puxarComissoes(await conta(c.dono)) };
  throw new Error("Comando desconhecido.");
}

// ---------- fila de envio ----------
const preco = v => v == null || v === "" ? "" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LOJA = { shopee: "Shopee", mercadolivre: "Mercado Livre", amazon: "Amazon", outra: "" };
export function montar(c, o) {
  const temDe = o.preco_de && o.preco_por && +o.preco_de > +o.preco_por;
  const pct = temDe ? Math.round((1 - o.preco_por / o.preco_de) * 100) : 0;
  const v = { titulo: o.titulo || "", por: preco(o.preco_por), de: temDe ? `~De ${preco(o.preco_de)}~\n` : "", desconto: pct ? pct + "% OFF" : "",
    cupom: o.cupom ? `🎟️ Cupom: *${o.cupom}*` : "", link: o.link_afiliado || o.link, loja: LOJA[o.loja] || "" };
  const base = (o.texto && o.texto.trim()) || c.modelo;
  return base.replace(/\{(\w+)\}/g, (m, k) => k in v ? v[k] : m).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function fila() {
  const agora = new Date().toISOString();
  const devidos = await db.ler("fl_agendamentos", { status: "eq.pendente", quando: "lte." + agora, order: "quando.asc", limit: 30 });
  for (const a of devidos) postar(a).catch(e => log("postar", a.id, e.message));
}

async function postar(a) {
  const c = await conta(a.dono);
  const falhar = erro => db.mudar("fl_agendamentos", { id: "eq." + a.id, status: "in.(pendente,enviando)" }, { status: "erro", erro });
  if (!c) return falhar("Conta não encontrada.");
  if (new Date(c.ativo_ate) < new Date()) return falhar("Assinatura vencida. Renove para voltar a postar.");
  let grupos = await db.ler("fl_grupos", { dono: "eq." + a.dono, ativo: "is.true", order: "nome.asc" });
  if (a.grupos && a.grupos.length) grupos = grupos.filter(g => a.grupos.includes(g.id));
  grupos = grupos.filter(g => conexoes.get(g.numero_id) && conexoes.get(g.numero_id).pronto);
  if (!grupos.length) {
    // espera o número voltar por até 30 minutos antes de desistir
    if (Date.now() - new Date(a.quando) > 30 * 60000) return falhar("Nenhum número conectado com grupos ligados.");
    return;
  }
  const numeros = [...new Set(grupos.map(g => g.numero_id))];
  if (numeros.some(n => ocupado.has(n))) return;     // tenta de novo na próxima volta
  const [pego] = await db.mudar("fl_agendamentos", { id: "eq." + a.id, status: "eq.pendente" }, { status: "enviando", total: grupos.length });
  if (!pego) return;
  numeros.forEach(n => ocupado.add(n));
  try {
    const o = await db.um("fl_ofertas", { id: "eq." + a.oferta_id });
    if (!o) return falhar("A oferta foi apagada.");
    const texto = montar(c, o); let ok = 0, erros = [];
    const inicioDia = new Date(hoje() + "T00:00:00-03:00").toISOString();
    for (let i = 0; i < grupos.length; i++) {
      const g = grupos[i], reg = conexoes.get(g.numero_id);
      if (!reg || !reg.pronto) { erros.push(g.nome + ": número desconectou"); continue; }
      const feitos = await db.ler("fl_envios", { numero_id: "eq." + g.numero_id, em: "gte." + inicioDia, ok: "is.true", select: "id" });
      if (feitos.length >= c.limite_dia) { erros.push(g.nome + ": limite diário do número"); continue; }
      try {
        await reg.wa.enviar(g.jid, { texto, imagem: o.imagem });
        ok++; await db.inserir("fl_envios", [{ dono: a.dono, agendamento_id: a.id, grupo_id: g.id, numero_id: g.numero_id, ok: true }]);
      } catch (e) {
        erros.push(g.nome + ": " + e.message);
        await db.inserir("fl_envios", [{ dono: a.dono, agendamento_id: a.id, grupo_id: g.id, numero_id: g.numero_id, ok: false, erro: e.message.slice(0, 300) }]);
      }
      await db.mudar("fl_agendamentos", { id: "eq." + a.id }, { enviados: ok });
      if (i < grupos.length - 1) {
        const s = c.intervalo_min + Math.random() * (c.intervalo_max - c.intervalo_min);
        await espera(s * 1000 * ESCALA_INTERVALO);
      }
    }
    await db.mudar("fl_agendamentos", { id: "eq." + a.id }, ok ? { status: "enviado", enviados: ok, erro: erros.length ? erros.join("; ").slice(0, 500) : null }
      : { status: "erro", erro: erros.join("; ").slice(0, 500) || "Nada foi enviado." });
    log("oferta postada", a.id, ok + "/" + grupos.length);
  } finally { numeros.forEach(n => ocupado.delete(n)); }
}

// ---------- comissões ----------
async function puxarComissoes(c) {
  if (!temShopee(c)) throw new Error("Cadastre o App ID e a senha da API da Shopee em Configurações.");
  const linhas = await comissoesShopee(c, 90);
  if (!linhas.length) return 0;
  for (let i = 0; i < linhas.length; i += 200)
    await db.inserir("fl_comissoes", linhas.slice(i, i + 200).map(l => Object.assign({ dono: c.dono, loja: "shopee" }, l)), "dono,loja,pedido,item");
  return linhas.length;
}

async function rodadaLonga(tipo) {
  if (tipo === "grupos") for (const [id, reg] of conexoes) if (reg.pronto) await sincronizar(id).catch(e => log("sync", e.message));
  if (tipo === "comissoes") {
    const cs = await db.ler("fl_contas", { shopee_app_id: "neq.", ativo_ate: "gte." + new Date().toISOString() });
    for (const c of cs) await puxarComissoes(c).catch(e => log("comissões", c.dono, e.message));
  }
}

// ---------- partida ----------
let vivoEm = Date.now();
function laço(nome, seg, f) {
  const volta = async () => { try { await f(); vivoEm = Date.now(); } catch (e) { log("falha em", nome, e.message); } setTimeout(volta, seg * 1000); };
  setTimeout(volta, 500);
}

async function iniciar() {
  log("Zivoop Ofertas: robô ligado", process.env.WA_FAKE === "1" ? "(WhatsApp simulado)" : "");
  fs.mkdirSync(process.env.PASTA_SESSOES || "./dados/sessoes", { recursive: true });
  // volta a ligar quem tinha sessão salva; quem estava esperando QR volta para desconectado
  const nums = await db.ler("fl_numeros", { status: "neq.desconectado" });
  for (const n of nums) {
    if (temSessao(n.id)) await ligar(n);
    else await db.mudar("fl_numeros", { id: "eq." + n.id }, { status: "desconectado", qr: null });
  }
  // agendamentos que ficaram no meio (robô reiniciou) voltam para a fila
  await db.mudar("fl_agendamentos", { status: "eq.enviando" }, { status: "pendente" }).catch(() => {});
  await db.mudar("fl_comandos", { status: "eq.processando" }, { status: "pendente" }).catch(() => {});
  laço("comandos", T.comandos, comandos);
  laço("fila", T.fila, fila);
  laço("grupos", T.grupos * 60, () => rodadaLonga("grupos"));
  laço("comissões", T.comissoes * 60, () => rodadaLonga("comissoes"));
  // saúde para o Docker: GET /saude
  http.createServer((q, r) => { const ok = Date.now() - vivoEm < 120000; r.writeHead(ok ? 200 : 500, { "Content-Type": "application/json" });
    r.end(JSON.stringify({ ok, numeros: conexoes.size, conectados: [...conexoes.values()].filter(x => x.pronto).length })); }).listen(+process.env.PORTA || 3010);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) iniciar();
export { conexoes };
