// Lê o link do produto e devolve título, preços, imagem e o link de afiliado. Tudo pode ser corrigido no painel depois.
import { idsShopee, produtoShopee, linkCurtoShopee, temShopee } from "./shopee.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export function lojaDe(url) {
  const h = (() => { try { return new URL(url).hostname; } catch (e) { return ""; } })();
  if (/shopee|shp\.ee/.test(h)) return "shopee";
  if (/mercadoli[bv]re|meli\.la|mlstatic|mercadolivre/.test(h)) return "mercadolivre";
  if (/amazon\.|amzn\./.test(h)) return "amazon";
  return "outra";
}

const meta = (html, nome) => {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${nome}["'][^>]*>`, "i"), m = html.match(re);
  if (!m) return null; const c = m[0].match(/content=["']([^"']*)["']/i); return c ? dec(c[1]) : null;
};
const dec = s => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const num = v => { if (v == null) return null; let s = String(v).replace(/[^\d.,]/g, ""); if (!s) return null;
  if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, ""); const n = parseFloat(s); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };

function jsonLd(html) {
  const out = []; const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) { try { const j = JSON.parse(m[1]); (Array.isArray(j) ? j : [j]).forEach(x => out.push(x)); } catch (e) {} }
  const prod = out.flatMap(x => x["@graph"] || [x]).find(x => /Product/i.test(String(x["@type"])));
  if (!prod) return {};
  const of = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers || {};
  return { titulo: prod.name, imagem: Array.isArray(prod.image) ? prod.image[0] : (prod.image && prod.image.url) || prod.image,
    preco_por: num(of.price || of.lowPrice), preco_de: num(of.highPrice) };
}

async function baixar(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" } });
    return { final: r.url || url, html: (await r.text()).slice(0, 1_500_000) };
  } finally { clearTimeout(t); }
}

function comTag(url, tag) {
  if (!tag) return url;
  try { const u = new URL(url); u.searchParams.set("tag", tag); return u.toString(); } catch (e) { return url; }
}

export async function lerLink(link, conta) {
  link = String(link || "").trim();
  if (!/^https?:\/\//i.test(link)) throw new Error("Cole um link que comece com http.");
  let final = link, html = "";
  try { const b = await baixar(link); final = b.final; html = b.html; } catch (e) { /* segue só com o link */ }
  const loja = lojaDe(final) !== "outra" ? lojaDe(final) : lojaDe(link);
  const r = { loja, link: final, link_afiliado: link, titulo: "", preco_de: null, preco_por: null, imagem: null, avisos: [] };

  if (loja === "shopee") {
    const ids = idsShopee(final) || idsShopee(link);
    if (temShopee(conta) && ids) {
      try { const p = await produtoShopee(conta, ids); if (p) Object.assign(r, { titulo: p.titulo, imagem: p.imagem, preco_por: p.preco_por, preco_de: p.preco_de, link_afiliado: p.link_afiliado || r.link_afiliado }); }
      catch (e) { r.avisos.push(e.message); }
      if (!/s\.shopee|shp\.ee/.test(r.link_afiliado)) {
        try { r.link_afiliado = await linkCurtoShopee(conta, final) || r.link_afiliado; } catch (e) { r.avisos.push(e.message); }
      }
    } else if (!temShopee(conta)) r.avisos.push("Cadastre o App ID da Shopee em Configurações para puxar preço e gerar o link de afiliado sozinho.");
  }
  if (loja === "mercadolivre" && !r.titulo) {
    const id = (final.match(/MLB-?(\d{6,})/i) || [])[1];
    if (id) try {
      const x = await fetch("https://api.mercadolibre.com/items/MLB" + id, { headers: { "User-Agent": UA } });
      if (x.ok) { const j = await x.json(); Object.assign(r, { titulo: j.title, preco_por: num(j.price), preco_de: num(j.original_price), imagem: (j.pictures && j.pictures[0] && j.pictures[0].secure_url) || j.thumbnail }); }
    } catch (e) {}
  }
  if (loja === "amazon") r.link_afiliado = comTag(r.link_afiliado, conta && conta.amazon_tag);

  if (html) {
    const ld = jsonLd(html);
    r.titulo = r.titulo || ld.titulo || meta(html, "og:title") || meta(html, "twitter:title") || dec((html.match(/<title[^>]*>([^<]*)/i) || [])[1] || "");
    r.imagem = r.imagem || ld.imagem || meta(html, "og:image") || meta(html, "twitter:image");
    r.preco_por = r.preco_por || ld.preco_por || num(meta(html, "product:price:amount") || meta(html, "og:price:amount") || meta(html, "price"));
    r.preco_de = r.preco_de || ld.preco_de || num(meta(html, "product:original_price:amount"));
  }
  r.titulo = (r.titulo || "").replace(/\s*[|\-–]\s*(Shopee|Mercado Livre|Amazon\.com\.br).*$/i, "").slice(0, 200);
  if (r.preco_de && r.preco_por && r.preco_de <= r.preco_por) r.preco_de = null;
  if (!r.titulo || !r.preco_por) r.avisos.push("Não deu para ler tudo do site da loja. Confira título, preço e foto antes de agendar.");
  return r;
}
