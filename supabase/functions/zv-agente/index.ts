// Edge Function zv-agente: o painel manda a frase do dono, o agente muda o site/painel e responde.
import { responder, criarDB } from "./agente.js";
const SB = Deno.env.get("SUPABASE_URL")!, SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE = Deno.env.get("ZV_SITE_URL") || "https://zivoop.vercel.app";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  const auth = req.headers.get("Authorization") || "";
  const u = await fetch(SB + "/auth/v1/user", { headers: { apikey: ANON, Authorization: auth } });
  if (!u.ok) return json({ resposta: "Entre de novo no painel." }, 401);
  const user = await u.json();
  let body: { texto?: string; negocio?: string } = {};
  try { body = await req.json(); } catch (_) { /* vazio */ }
  const admin = criarDB(SB, { apikey: SRV, Authorization: "Bearer " + SRV });
  const usuario = criarDB(SB, { apikey: ANON, Authorization: auth });
  const ia = { chave: Deno.env.get("OPENAI_API_KEY"), base: Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1", modelo: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini" };
  try {
    const r = await responder({ texto: body.texto, negocio: body.negocio || null, donoId: user.id, admin, usuario, siteUrl: SITE, ia, canal: "painel" });
    return json(r);
  } catch (e) { return json({ resposta: "Deu um erro aqui: " + (e as Error).message }, 500); }
});
