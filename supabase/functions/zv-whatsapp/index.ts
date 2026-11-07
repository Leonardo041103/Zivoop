// Edge Function zv-whatsapp: webhook da API oficial do WhatsApp (Meta Cloud API).
// O dono manda mensagem para o número da Zivoop; o número dele identifica o negócio; o agente responde pelo WhatsApp.
// Segredos: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET (e opcionais OPENAI_API_KEY, OPENAI_MODEL, ZV_SITE_URL).
import { responder, criarDB } from "./agente.js";
const SB = Deno.env.get("SUPABASE_URL")!, SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = Deno.env.get("ZV_SITE_URL") || "https://zivoop.vercel.app";
const TOKEN = Deno.env.get("WHATSAPP_TOKEN") || "", PHONE = Deno.env.get("WHATSAPP_PHONE_ID") || "", VERIFY = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
async function enviar(para: string, texto: string) {
  await fetch(`https://graph.facebook.com/v20.0/${PHONE}/messages`, { method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto.slice(0, 4000) } }) });
}
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {   // verificação do webhook na Meta
    if (url.searchParams.get("hub.mode") === "subscribe" && VERIFY && url.searchParams.get("hub.verify_token") === VERIFY) return new Response(url.searchParams.get("hub.challenge") || "");
    return new Response("forbidden", { status: 403 });
  }
  const bruto = await req.text();
  const SEGREDO = Deno.env.get("WHATSAPP_APP_SECRET") || "";
  if (SEGREDO) {   // confere a assinatura da Meta: ninguém mais consegue mandar ordens se passando pelo dono
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SEGREDO), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(bruto)))).map(b => b.toString(16).padStart(2, "0")).join("");
    if ((req.headers.get("x-hub-signature-256") || "") !== "sha256=" + sig) return new Response("assinatura inválida", { status: 401 });
  }
  let corpo: any = {}; try { corpo = JSON.parse(bruto); } catch (_) { return new Response("ok"); }
  const admin = criarDB(SB, { apikey: SRV, Authorization: "Bearer " + SRV });
  const ia = { chave: Deno.env.get("OPENAI_API_KEY"), base: Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1", modelo: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini" };
  const msgs = (corpo.entry || []).flatMap((e: any) => (e.changes || []).flatMap((c: any) => c.value?.messages || []));
  for (const m of msgs) {
    if (m.type !== "text") { await enviar(m.from, "Por enquanto eu entendo só mensagens de texto."); continue; }
    const de = String(m.from).replace(/\D/g, ""), fim = de.slice(-8);
    const negs = await admin.sel(`zv_negocios?select=id,dono,whatsapp_dono,nome&whatsapp_dono=like.*${fim}&order=atualizado_em.desc&limit=5`).catch(() => []);
    const neg = (negs || []).find((n: any) => String(n.whatsapp_dono).replace(/\D/g, "").endsWith(de.slice(-10))) || (negs || [])[0];
    if (!neg) { await enviar(m.from, `Oi! Este é o assistente da Zivoop. Não achei um site ligado a este número. Crie o seu em ${SITE}/painel e cadastre este WhatsApp em “Meu site”.`); continue; }
    try { const r = await responder({ texto: m.text?.body, negocio: neg.id, donoId: neg.dono, admin, usuario: null, siteUrl: SITE, ia, canal: "whatsapp" }); await enviar(m.from, r.resposta); }
    catch (e) { await enviar(m.from, "Deu um erro aqui. Tente de novo em instantes."); }
  }
  return new Response("ok");
});
