// API de afiliados da Shopee (open-api.affiliate.shopee.com.br). Cada cliente cadastra o próprio App ID e a senha no painel.
import { createHash } from "node:crypto";
const URL_API = process.env.SHOPEE_API_URL || "https://open-api.affiliate.shopee.com.br/graphql";

async function gql(conta, query) {
  const corpo = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const ass = createHash("sha256").update(conta.shopee_app_id + ts + corpo + conta.shopee_segredo).digest("hex");
  const r = await fetch(URL_API, { method: "POST", body: corpo, headers: {
    "Content-Type": "application/json", Authorization: `SHA256 Credential=${conta.shopee_app_id}, Timestamp=${ts}, Signature=${ass}` } });
  const j = await r.json().catch(() => ({}));
  if (j.errors && j.errors.length) throw new Error("Shopee: " + (j.errors[0].message || "erro"));
  if (!r.ok || !j.data) throw new Error("Shopee respondeu " + r.status);
  return j.data;
}

export const temShopee = c => !!(c && c.shopee_app_id && c.shopee_segredo);

// Ids do produto a partir do link: /produto-i.SHOP.ITEM ou /product/SHOP/ITEM
export function idsShopee(url) {
  let m = url.match(/-i\.(\d+)\.(\d+)/) || url.match(/\/product\/(\d+)\/(\d+)/) || url.match(/\/(\d{5,})\/(\d{6,})(?:[/?]|$)/);
  return m ? { shopId: m[1], itemId: m[2] } : null;
}

export async function produtoShopee(conta, ids) {
  const d = await gql(conta, `{ productOfferV2(shopId: ${+ids.shopId}, itemId: ${+ids.itemId}, limit: 1) {
    nodes { productName imageUrl priceMin priceMax priceDiscountRate commissionRate productLink offerLink } } }`);
  const n = d.productOfferV2 && d.productOfferV2.nodes && d.productOfferV2.nodes[0];
  if (!n) return null;
  const por = +n.priceMin || null, desc = +n.priceDiscountRate || 0;
  return { titulo: n.productName, imagem: n.imageUrl, preco_por: por,
    preco_de: por && desc > 0 && desc < 100 ? Math.round(por / (1 - desc / 100) * 100) / 100 : null,
    comissao: n.commissionRate, link_produto: n.productLink, link_afiliado: n.offerLink };
}

export async function linkCurtoShopee(conta, url, sub) {
  const d = await gql(conta, `mutation { generateShortLink(input: { originUrl: ${JSON.stringify(url)}, subIds: [${JSON.stringify(sub || "zivoop")}] }) { shortLink } }`);
  return d.generateShortLink && d.generateShortLink.shortLink;
}

const STATUS = { COMPLETED: "concluido", PENDING: "pendente", CANCELLED: "cancelado", UNPAID: "nao_pago" };

// Pedidos dos últimos `dias` (a Shopee guarda 3 meses). Devolve linhas para fl_comissoes.
export async function comissoesShopee(conta, dias = 30) {
  const fim = Math.floor(Date.now() / 1000), ini = fim - dias * 86400, linhas = [];
  let scroll = null, detalhe = true;
  for (let pagina = 0; pagina < 50; pagina++) {
    const campos = detalhe
      ? "purchaseTime conversionId totalCommission orders { orderId orderStatus items { itemId itemName itemPrice qty itemTotalCommission } }"
      : "purchaseTime conversionId totalCommission orders { orderId orderStatus }";
    let d;
    try {
      d = await gql(conta, `{ conversionReport(purchaseTimeStart: ${ini}, purchaseTimeEnd: ${fim}, limit: 500${scroll ? `, scrollId: "${scroll}"` : ""}) {
        nodes { ${campos} } pageInfo { hasNextPage scrollId } } }`);
    } catch (e) { if (detalhe && /field|Cannot query/i.test(e.message)) { detalhe = false; pagina--; continue; } throw e; }
    const rel = d.conversionReport || {};
    for (const n of rel.nodes || []) {
      const data = new Date((+n.purchaseTime || fim) * 1000).toISOString(), pedidos = n.orders || [];
      if (!detalhe || pedidos.every(o => !o.items || !o.items.length)) {
        const parte = pedidos.length ? (+n.totalCommission || 0) / pedidos.length : +n.totalCommission || 0;
        for (const o of pedidos.length ? pedidos : [{ orderId: n.conversionId, orderStatus: "PENDING" }])
          linhas.push({ pedido: String(o.orderId), item: "", produto: "", valor: 0, comissao: parte, status: STATUS[o.orderStatus] || "pendente", data });
        continue;
      }
      for (const o of pedidos) for (const it of o.items || [])
        linhas.push({ pedido: String(o.orderId), item: String(it.itemId), produto: it.itemName || "",
          valor: (+it.itemPrice || 0) * (+it.qty || 1), comissao: +it.itemTotalCommission || 0, status: STATUS[o.orderStatus] || "pendente", data });
    }
    const pi = rel.pageInfo || {};
    if (!pi.hasNextPage || !pi.scrollId) break;
    scroll = pi.scrollId;
  }
  return linhas;
}
