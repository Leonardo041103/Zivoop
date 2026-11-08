// Acesso ao Supabase pela API REST, com a chave service_role (só no servidor, nunca no painel).
const URL_SB = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const CHAVE = process.env.SUPABASE_SERVICE_KEY || "";
if (!URL_SB || !CHAVE) { console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_KEY no .env"); process.exit(1); }

const H = (extra = {}) => Object.assign({ apikey: CHAVE, Authorization: "Bearer " + CHAVE, "Content-Type": "application/json" }, extra);
const qs = o => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");

async function pedir(caminho, op = {}) {
  const r = await fetch(URL_SB + "/rest/v1/" + caminho, op);
  const t = await r.text();
  if (!r.ok) throw new Error(`banco ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

export const db = {
  ler: (tab, filtro = {}) => pedir(tab + "?" + qs(Object.assign({ select: "*" }, filtro)), { headers: H() }),
  um: async (tab, filtro) => (await db.ler(tab, Object.assign({ limit: 1 }, filtro)))[0] || null,
  inserir: (tab, linhas, conflito) => pedir(tab + (conflito ? "?on_conflict=" + conflito : ""), {
    method: "POST", body: JSON.stringify(linhas),
    headers: H({ Prefer: "return=representation" + (conflito ? ",resolution=merge-duplicates" : "") }) }),
  mudar: (tab, filtro, valores) => pedir(tab + "?" + qs(filtro), { method: "PATCH", body: JSON.stringify(valores), headers: H({ Prefer: "return=representation" }) }),
  apagar: (tab, filtro) => pedir(tab + "?" + qs(filtro), { method: "DELETE", headers: H() }),
};
