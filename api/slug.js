// Endereço livre para um site novo: cada software tem o próprio banco, então o mesmo endereço poderia
// ser criado na barbearia e na lanchonete ao mesmo tempo (e o site abriria o errado).
// O painel pergunta aqui antes de criar: o endereço volta livre nos dois bancos.
// GET /api/slug?nome=Route 66  →  { slug: "route-66" }  (ou "route-66-2", "route-66-3"… se já existir)
const BANCOS = [
  { url: process.env.ZV_SB_URL || "https://phswqjkytnkukqpbtoqd.supabase.co", key: process.env.ZV_SB_KEY || "sb_publishable_LUsJVly6aj88WTDxTFeT6A_VB5kqA-8" },
  { url: process.env.ZV_BARB_SB_URL || "https://yqpaqwwdfeyesxvbbcwy.supabase.co", key: process.env.ZV_BARB_SB_KEY || "sb_publishable_yFqNbiwT-PEvOI1RVDXhIw_vNgMjB-H" }
];
// endereços que são páginas da Zivoop
const RESERVADOS = new Set(["painel", "modelos", "api", "admin", "assets", "login", "entrar", "zivoop", "ofertas", "privacidade", "termos",
  "lanchonete", "barbearia", "ia", "camera", "demo", "site", "favicon", "robots", "sitemap"]);

// mesma regra do banco (zv_slug): sem acento, minúsculo, só letras, números e hífen
function paraSlug(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36).replace(/-+$/, "");
}
// true = alguém já usa; lança erro se um banco não respondeu (aí o painel segue do jeito antigo)
async function ocupado(slug) {
  const r = await Promise.all(BANCOS.map(b => fetch(`${b.url}/rest/v1/rpc/zv_site`, {
    method: "POST", headers: { apikey: b.key, Authorization: "Bearer " + b.key, "Content-Type": "application/json" }, body: JSON.stringify({ p_slug: slug })
  }).then(x => { if (!x.ok) throw new Error("banco"); return x.json(); })));
  return r.some(Boolean);
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store");
  let base = paraSlug((req.query && (req.query.nome || req.query.slug)) || "");
  const nicho = paraSlug((req.query && req.query.nicho) || "");
  if (base.length < 3) base = paraSlug((base ? base + "-" : "") + (nicho || "loja"));
  try {
    for (let k = 1; k <= 30; k++) {
      const s = k === 1 ? base : `${base}-${k}`;
      if (RESERVADOS.has(s) || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(s)) continue;
      if (!(await ocupado(s))) { res.statusCode = 200; return res.end(JSON.stringify({ slug: s })); }
    }
    res.statusCode = 200; return res.end(JSON.stringify({ slug: `${base}-${Date.now().toString(36).slice(-4)}` }));
  } catch (e) {
    res.statusCode = 503; return res.end(JSON.stringify({ erro: "indisponivel" }));
  }
};
