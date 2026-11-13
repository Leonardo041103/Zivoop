// Edge Function zv-robo: o robô de atendimento da barbearia no WhatsApp oficial (Meta Cloud API).
// Rotas:
//   GET  ?hub.mode=subscribe…           verificação do webhook pela Meta
//   POST (webhook da Meta)              mensagens dos clientes e avisos de qualidade do número (assinatura conferida)
//   POST ?acao=simular                  painel: "Testar o robô" (dono logado; nada vai para o WhatsApp)
//   POST ?acao=enviar                   painel: o dono responde um cliente pela conversa
//   POST ?acao=rotina                   agendado a cada 5 min (pg_cron): vagas, lembretes e fila com os limites anti-bloqueio
// Segredos: WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, CRON_SECRET, GEMINI_API_KEY (opcional, IA grátis), GEMINI_MODEL, ZV_SITE_URL.
import { carregarNegocio, atender, rotina } from "./robo.js";

const SB = Deno.env.get("SUPABASE_URL")!, SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE = Deno.env.get("ZV_SITE_URL") || "https://zivoop.vercel.app";
const VERIFY = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "", SEGREDO = Deno.env.get("WHATSAPP_APP_SECRET") || "", CRON = Deno.env.get("CRON_SECRET") || "";
const ia = { chave: Deno.env.get("GEMINI_API_KEY") || "", modelo: Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite" };
function criarDB(url: string, headers: Record<string, string>) {   // acesso ao banco pela API REST (com a chave de serviço)
  const h = Object.assign({ "Content-Type": "application/json" }, headers);
  const req = async (method: string, path: string, body?: unknown, extra?: Record<string, string>) => {
    const r = await fetch(url + "/rest/v1/" + path, { method, headers: Object.assign({}, h, extra || {}), body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch (_) { j = t; }
    if (!r.ok) throw new Error((j && j.message) || t || ("HTTP " + r.status)); return j; };
  return { sel: (p: string) => req("GET", p), ins: (t: string, b: unknown) => req("POST", t, b, { Prefer: "return=representation" }),
    upd: (p: string, b: unknown) => req("PATCH", p, b, { Prefer: "return=representation" }), del: (p: string) => req("DELETE", p), rpc: (f: string, b: unknown) => req("POST", "rpc/" + f, b) };
}
const admin = criarDB(SB, { apikey: SRV, Authorization: "Bearer " + SRV });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// envia pelo WhatsApp do próprio negócio; fora da janela de 24h usa o modelo aprovado na Meta
// opções viram botões (até 3) ou lista (até 10); o id volta como a resposta do cliente ("1", "2"… ou "sim"/"nao")
const idsDe = (ops: string[]) => ops.length === 2 && /^sim$/i.test(ops[0]) ? ["sim", "nao"] : ops.map((_, i) => String(i + 1));
function interativo(texto: string, ops: string[]) {
  const ids = idsDe(ops), corpo = texto.slice(0, 1024);
  if (ops.length <= 3 && ops.every(o => o.length <= 20)) return { type: "button", body: { text: corpo }, action: { buttons: ops.map((o, i) => ({ type: "reply", reply: { id: ids[i], title: o.slice(0, 20) } })) } };
  return { type: "list", body: { text: corpo }, action: { button: "Escolher", sections: [{ title: "Opções", rows: ops.slice(0, 10).map((o, i) => ({ id: ids[i], title: o.slice(0, 24) })) }] } };
}
async function enviarMeta(canal: any, para: string, m: { texto: string; opcoes?: string[]; link?: { url: string; botao: string }; modelo?: { nome: string; params: string[] } }) {
  const corpo = m.link && !m.modelo ? { messaging_product: "whatsapp", to: para, type: "interactive", interactive: { type: "cta_url", body: { text: m.texto.slice(0, 1024) }, action: { name: "cta_url", parameters: { display_text: m.link.botao.slice(0, 20), url: m.link.url } } } }
    : m.opcoes && m.opcoes.length && !m.modelo ? { messaging_product: "whatsapp", to: para, type: "interactive", interactive: interativo(m.texto, m.opcoes) } : m.modelo
    ? { messaging_product: "whatsapp", to: para, type: "template", template: { name: m.modelo.nome, language: { code: "pt_BR" }, components: [{ type: "body", parameters: m.modelo.params.map(t => ({ type: "text", text: String(t).slice(0, 60) })) }] } }
    : { messaging_product: "whatsapp", to: para, type: "text", text: { body: m.texto.slice(0, 4000) } };
  const r = await fetch(`https://graph.facebook.com/v21.0/${canal.phone_id}/messages`, { method: "POST", headers: { Authorization: "Bearer " + canal.token, "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  if (!r.ok) { const e = await r.text(); throw new Error("Meta " + r.status + ": " + e.slice(0, 200)); }
}
// áudio do cliente: baixa da Meta e pede a transcrição para a IA (Gemini, grátis); sem chave, pede para escrever
async function transcrever(canal: any, mediaId: string) {
  if (!ia.chave) return null;
  const meta = await (await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, { headers: { Authorization: "Bearer " + canal.token } })).json();
  if (!meta.url || (meta.file_size && meta.file_size > 8e6)) return null;
  const bin = new Uint8Array(await (await fetch(meta.url, { headers: { Authorization: "Bearer " + canal.token } })).arrayBuffer());
  let b64 = ""; for (let i = 0; i < bin.length; i += 0x8000) b64 += String.fromCharCode(...bin.subarray(i, i + 0x8000)); b64 = btoa(b64);
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ia.modelo}:generateContent?key=${ia.chave}`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Transcreva este áudio de WhatsApp em português do Brasil, exatamente como foi dito, sem comentários." }, { inline_data: { mime_type: (meta.mime_type || "audio/ogg").split(";")[0], data: b64 } }] }], generationConfig: { temperature: 0 } }) });
  if (!r.ok) return null; const j = await r.json();
  const txt = (j.candidates && j.candidates[0] && j.candidates[0].content.parts.map((p: any) => p.text).join("") || "").trim();
  return txt ? txt.slice(0, 1000) : null;
}
async function dono(req: Request, negocio: string) {   // confere que quem chamou é o dono do negócio
  const r = await fetch(SB + "/auth/v1/user", { headers: { apikey: ANON, Authorization: req.headers.get("authorization") || "" } });
  if (!r.ok) return null; const u = await r.json();
  const l = await admin.sel(`zv_negocios?select=id&id=eq.${negocio}&dono=eq.${u.id}`).catch(() => []); return l && l[0] ? u : null;
}
async function assinaturaOk(bruto: string, sig: string) {
  if (!SEGREDO) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SEGREDO), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const h = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(bruto)))).map(b => b.toString(16).padStart(2, "0")).join("");
  return sig === "sha256=" + h;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url), acao = url.searchParams.get("acao");
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" && VERIFY && url.searchParams.get("hub.verify_token") === VERIFY) return new Response(url.searchParams.get("hub.challenge") || "");
    return new Response("forbidden", { status: 403 });
  }

  if (acao === "simular" || acao === "enviar") {
    const b = await req.json().catch(() => ({}));
    if (!b.negocio || !(await dono(req, b.negocio))) return json({ erro: "sem_permissao" }, 401);
    const N = await carregarNegocio(admin, b.negocio, SITE); if (!N) return json({ erro: "negocio" }, 404);
    if (acao === "simular") {   // conversa de teste: número fictício, marca de verdade na agenda com o nome "Teste do robô"
      const zap = "550000" + String(b.negocio).replace(/\D/g, "").slice(0, 7);
      if (b.recomecar) { await admin.upd(`zv_agendamentos?negocio=eq.${b.negocio}&whatsapp=eq.${zap}&status=in.(pendente,confirmado)`, { status: "cancelado", obs: "Teste do robô" }).catch(() => {});
        await admin.del(`zv_bot_contatos?negocio=eq.${b.negocio}&whatsapp=eq.${zap}`).catch(() => {}); await admin.del(`zv_bot_msgs?negocio=eq.${b.negocio}&whatsapp=eq.${zap}`).catch(() => {}); return json({ ok: true }); }
      N.robo.ativo = true;
      const r = await atender({ db: admin, N, zap, texto: String(b.texto || "").slice(0, 1000), nomePerfil: null, ia });
      return json({ respostas: r.respostas, humano: !!r.humano });
    }
    // o dono responde um cliente (só dentro da janela de 24h do WhatsApp)
    const canal = ((await admin.sel(`zv_canais?select=*&negocio=eq.${b.negocio}`).catch(() => [])) || [])[0];
    if (!canal || !canal.token) return json({ erro: "WhatsApp não conectado" }, 400);
    const zap = String(b.whatsapp || "").replace(/\D/g, ""), texto = String(b.texto || "").trim().slice(0, 4000); if (!zap || !texto) return json({ erro: "vazio" }, 400);
    const c = ((await admin.sel(`zv_bot_contatos?select=ultima_in&negocio=eq.${b.negocio}&whatsapp=eq.${zap}`).catch(() => [])) || [])[0];
    if (!c || !c.ultima_in || Date.now() - Date.parse(c.ultima_in) > 23.5 * 3600e3) return json({ erro: "Faz mais de 24h que o cliente não escreve. O WhatsApp só deixa responder quando ele mandar mensagem de novo." }, 400);
    try { await enviarMeta(canal, zap, { texto }); } catch (e) { return json({ erro: String((e as Error).message) }, 502); }
    await admin.ins("zv_bot_msgs", { negocio: b.negocio, whatsapp: zap, dir: "dono", texto });
    await admin.upd(`zv_bot_contatos?negocio=eq.${b.negocio}&whatsapp=eq.${zap}`, { humano_ate: new Date(Date.now() + 2 * 3600e3).toISOString(), ultima_out: new Date().toISOString() });
    return json({ ok: true });
  }

  if (acao === "rotina") {
    if (!CRON || req.headers.get("x-cron-secret") !== CRON) return json({ erro: "sem_permissao" }, 401);
    const canais = (await admin.sel(`zv_canais?select=*&phone_id=not.is.null`).catch(() => [])) || [];
    const res: Record<string, unknown> = {};
    for (const canal of canais) {
      const N = await carregarNegocio(admin, canal.negocio, SITE); if (!N || !N.robo.ativo) continue;
      try { res[N.neg.slug] = await rotina({ db: admin, N, canal, enviar: (zap: string, m: any) => enviarMeta(canal, zap, m) }); } catch (e) { res[N.neg.slug] = { erro: String((e as Error).message) }; }
    }
    return json(res);
  }

  // webhook da Meta
  const bruto = await req.text();
  if (!(await assinaturaOk(bruto, req.headers.get("x-hub-signature-256") || ""))) return new Response("assinatura inválida", { status: 401 });
  let corpo: any = {}; try { corpo = JSON.parse(bruto); } catch (_) { return new Response("ok"); }
  for (const e of corpo.entry || []) for (const ch of e.changes || []) {
    const v = ch.value || {};
    if (ch.field === "phone_number_quality_update") {   // a Meta avisou que o número está sendo denunciado/bloqueado: para os envios por iniciativa
      const q = String(v.event || v.current_limit || "").toUpperCase();
      const ruim = /FLAGGED|DOWNGRADE|RED|YELLOW/.test(q);
      await admin.upd(`zv_canais?numero=like.*${String(v.display_phone_number || "").replace(/\D/g, "").slice(-8)}`, { qualidade: ruim ? "YELLOW" : "GREEN", pausado: ruim }).catch(() => {});
      continue;
    }
    const pid = v.metadata && v.metadata.phone_number_id; if (!pid || !v.messages) continue;
    const canal = ((await admin.sel(`zv_canais?select=*&phone_id=eq.${pid}`).catch(() => [])) || [])[0]; if (!canal) continue;
    const N = await carregarNegocio(admin, canal.negocio, SITE); if (!N) continue;
    const perfis: Record<string, string> = {}; (v.contacts || []).forEach((c: any) => perfis[c.wa_id] = c.profile && c.profile.name);
    for (const m of v.messages) {
      let texto = m.type === "text" ? m.text.body : m.type === "button" ? m.button.text : m.type === "interactive" ? (m.interactive.button_reply || m.interactive.list_reply || {}).id : null;
      if (m.type === "audio" && m.audio && m.audio.id) texto = await transcrever(canal, m.audio.id).catch(() => null);   // mensagem de voz → texto
      if (!texto && m.type === "audio") { await enviarMeta(canal, m.from, { texto: "Não consegui ouvir seu áudio agora 😕. Pode escrever, por favor?" }).catch(() => {}); continue; }
      if (!texto) { await enviarMeta(canal, m.from, { texto: "Por enquanto eu entendo só mensagens de texto. Escreva o que você precisa 🙂" }).catch(() => {}); continue; }
      try {
        const r = await atender({ db: admin, N, zap: m.from, texto, waId: m.id, nomePerfil: perfis[m.from], ia });
        for (const x of r.respostas) await enviarMeta(canal, m.from, typeof x === "string" ? { texto: x } : x);
      } catch (_) { await enviarMeta(canal, m.from, { texto: "Tive um problema aqui. Escreva \"atendente\" que o pessoal da barbearia te responde." }).catch(() => {}); }
    }
  }
  return new Response("ok");
});
