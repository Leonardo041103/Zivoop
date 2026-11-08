// Monta o site de um negócio da plataforma: modelo do nicho + dados do dono (banco) + ganchos que gravam pedidos e agendamentos.
// zivoop.com/<slug>  →  /api/site?slug=<slug>
const fs = require("fs"), path = require("path");
const SB = process.env.ZV_SB_URL || "https://phswqjkytnkukqpbtoqd.supabase.co";
const KEY = process.env.ZV_SB_KEY || "sb_publishable_LUsJVly6aj88WTDxTFeT6A_VB5kqA-8";
const RAIZ = path.join(process.cwd(), "public", "modelos");
const cache = {};
const ler = (nicho, f) => { const k = nicho + "/" + f; if (!cache[k]) cache[k] = fs.readFileSync(path.join(RAIZ, nicho, f), "utf8"); return cache[k]; };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const rpc = (fn, body) => fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then(r => r.ok ? r.json() : null);
const hojeSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
function pagina(res, cod, tit, txt) {
  res.statusCode = cod; res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", "public, s-maxage=30");
  res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(tit)}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#0f1115;color:#eef0f4;text-align:center;padding:24px">
<div><h1 style="font-size:28px;margin:0 0 8px">${esc(tit)}</h1><p style="color:#9aa1ad;margin:0 0 20px">${esc(txt)}</p><a href="/" style="color:#7aa7ff">Conheça a Zivoop</a></div></body></html>`);
}
// troca os textos do modelo pelos do dono, onde quer que apareçam (título, cabeçalho, rodapé, SEO)
function trocarTextos(html, pad, meus) {
  const pares = [];
  for (const k of ["title", "desc", "ogdesc", "tagline", "foot", "endereco", "cidade", "nome"]) {
    const a = pad[k], b = meus[k];
    if (typeof a === "string" && typeof b === "string" && a && b && a !== b) pares.push([a, b]);
  }
  (pad.sobre || []).forEach((a, i) => { const b = (meus.sobre || [])[i]; if (a && typeof b === "string" && a !== b) pares.push([a, b]); });
  pares.sort((x, y) => y[0].length - x[0].length);
  for (const [a, b] of pares) { html = html.split(esc(a)).join(esc(b)); if (esc(a) !== a) html = html.split(a).join(esc(b)); }
  return html;
}
module.exports = async (req, res) => {
  const slug = String((req.query && req.query.slug) || "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return pagina(res, 404, "Página não encontrada", "Confira o endereço.");
  let site; try { site = await rpc("zv_site", { p_slug: slug }); } catch (e) { site = undefined; }
  if (site === undefined) return pagina(res, 503, "Voltamos já", "Não deu para abrir o site agora. Tente de novo em instantes.");
  if (!site) return pagina(res, 404, "Site não encontrado", "Esse endereço ainda não tem um site na Zivoop.");
  if (site.status !== "ativo") return pagina(res, 200, site.nome, "Este site está pausado no momento.");
  let html, pad;
  try { html = ler(site.nicho, "index.html"); pad = JSON.parse(ler(site.nicho, "padrao.json")); }
  catch (e) { return pagina(res, 500, "Modelo indisponível", "O modelo deste site não foi encontrado."); }
  const dados = JSON.parse(JSON.stringify(site.dados || {}));
  if (Array.isArray(dados.menu)) dados.menu = dados.menu.map(c => Object.assign({}, c, { items: (c.items || []).filter(i => !i.oculto) })).filter(c => c.items.length);
  const textos = Object.assign({}, pad.textos, dados.textos || {}, { nome: site.nome });
  let ocupados = [];
  if (site.tipo === "agenda") ocupados = (await rpc("zv_ocupados", { p_slug: slug, p_de: hojeSP(), p_dias: 62 }).catch(() => null)) || [];
  let ocupReserva = [];
  if (site.tipo === "reserva") ocupReserva = ((await rpc("zv_reservas_ocupadas", { p_slug: slug }).catch(() => null)) || []).map(x => (x && x.zv_reservas_ocupadas) || x).filter(Boolean);
  // o que mais sai junto em cada item, aprendido com os pedidos deste negócio (vazio até ter vendas suficientes)
  let combos = {};
  if (site.tipo !== "reserva") { const c = await rpc("zv_combos_site", { p_slug: slug }).catch(() => null); combos = (c && (c.zv_combos_site || c)) || {}; if (typeof combos !== "object" || Array.isArray(combos)) combos = {}; }
  const zv = { slug, id: site.id, tipo: site.tipo, nicho: site.nicho, api: SB, key: KEY, ocupados, ocupReserva, combos };
  const seguro = o => JSON.stringify(o).replace(/</g, "\\u003c");
  html = trocarTextos(html, pad.textos || {}, textos)
    .replace(/<script src="\/demo\.js"><\/script>\s*/g, "")
    .replace(/<head>/i, `<head>\n<base href="/modelos/${site.nicho}/">`)
    .replace('<script src="dados.js"></script>', `<script>window.DADOS=${seguro(dados)};window.ZV=${seguro(zv)};</script>\n<script src="/zv-site.js"></script>`)
    .split(`https://zivoop.com/modelos/${site.nicho}/`).join(`https://zivoop.com/${slug}`);
  res.statusCode = 200; res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
  res.end(html);
};
