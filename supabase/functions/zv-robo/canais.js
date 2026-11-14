// Tradutor dos canais além do WhatsApp: Instagram Direct, Messenger (Meta) e Telegram.
// Só traduz: o que chega de cada canal vira { ext, texto, msgId, nome, fone } para o robô,
// e o que o robô responde (texto, opções, link, pedido de número) vira a mensagem no formato de cada canal.
// Não fala com a rede: devolve { url, corpo } e quem chama faz o envio (assim dá para testar sem internet).

export const GRAPH = "https://graph.facebook.com/v21.0";
// o id que volta quando o cliente toca numa opção: "1", "2"… ou "sim"/"nao" (igual ao WhatsApp)
export const idsDe = ops => ops.length === 2 && /^sim$/i.test(ops[0]) ? ["sim", "nao"] : ops.map((_, i) => String(i + 1));

/* ---------- Meta: Instagram Direct e Messenger (o mesmo formato de webhook) ---------- */
// corpo.object: "instagram" ou "page"; entry.id é a conta (Instagram profissional) ou a página (Messenger)
export function lerMeta(corpo) {
  const canal = corpo && corpo.object === "instagram" ? "instagram" : corpo && corpo.object === "page" ? "messenger" : null;
  if (!canal) return [];
  const out = [];
  for (const e of corpo.entry || []) for (const m of e.messaging || []) {
    if (!m.sender || !m.sender.id || m.sender.id === e.id) continue;          // mensagem que a própria página mandou
    if (m.message && m.message.is_echo) continue;
    let texto = null, fone = null, msgId = (m.message && m.message.mid) || (m.postback && m.postback.mid) || null;
    if (m.message) {
      const qr = m.message.quick_reply && m.message.quick_reply.payload;
      if (qr && /^\+?\d[\d\s()-]{8,}$/.test(qr)) fone = qr;                     // botão "compartilhar meu número" do Messenger
      else if (qr) texto = qr;
      else if (m.message.text) texto = m.message.text;
      else if ((m.message.attachments || []).length) texto = "";               // foto, áudio, figurinha
    } else if (m.postback) texto = m.postback.payload || m.postback.title || "";
    else continue;
    out.push({ canal, conta: String(e.id), ext: String(m.sender.id), texto, fone, msgId, anexo: !!(m.message && !m.message.text && !m.message.quick_reply) });
  }
  return out;
}
// uma resposta do robô no formato da Meta (respostas rápidas aparecem como botões embaixo da mensagem)
export function corpoMeta(canal, para, r) {
  const m = typeof r === "string" ? { texto: r } : r;
  let texto = String(m.texto || "");
  const msg = {};
  if (m.opcoes && m.opcoes.length) {
    const ops = m.opcoes.slice(0, 13), ids = idsDe(ops), curto = ops.every(o => o.length <= 20);
    if (!curto) texto += "\n\n" + ops.map((o, i) => `${i + 1}. ${o}`).join("\n");   // o título do botão tem no máximo 20 letras
    msg.quick_replies = ops.map((o, i) => ({ content_type: "text", title: curto ? o : (ids[i] === "sim" ? "Sim" : ids[i] === "nao" ? "Não" : String(i + 1) + ". " + o).slice(0, 20), payload: ids[i] }));
  } else if (m.pedirFone && canal === "messenger") msg.quick_replies = [{ content_type: "user_phone_number" }];
  if (m.link && m.link.url) texto += "\n" + m.link.url;
  msg.text = texto.slice(0, 1000);
  return { recipient: { id: para }, messaging_type: "RESPONSE", message: msg };
}
export const urlMeta = (conta) => `${GRAPH}/${conta.pagina || "me"}/messages`;

/* ---------- Telegram ---------- */
export function lerTelegram(u) {
  if (u.callback_query) {   // tocou num botão de opção
    const q = u.callback_query, chat = q.message && q.message.chat;
    return { canal: "telegram", ext: String(chat ? chat.id : q.from.id), texto: String(q.data || ""), msgId: "u" + u.update_id, nome: q.from && q.from.first_name, callback: q.id };
  }
  const m = u.message; if (!m || !m.chat || m.chat.type !== "private") return null;   // grupo: o robô não responde
  // número compartilhado pelo botão vale como confirmado só se for o da própria pessoa
  const fone = m.contact && m.contact.user_id === (m.from && m.from.id) ? m.contact.phone_number : null;
  return { canal: "telegram", ext: String(m.chat.id), texto: fone ? "" : (m.text || m.caption || (m.contact ? m.contact.phone_number : "")), msgId: "u" + u.update_id,
    nome: m.from && [m.from.first_name, m.from.last_name].filter(Boolean).join(" "), fone, anexo: !m.text && !m.contact };
}
export function corpoTelegram(chatId, r) {
  const m = typeof r === "string" ? { texto: r } : r;
  const c = { chat_id: chatId, text: String(m.texto || "").slice(0, 4000), disable_web_page_preview: true };
  if (m.opcoes && m.opcoes.length) { const ids = idsDe(m.opcoes); c.reply_markup = { inline_keyboard: m.opcoes.slice(0, 20).map((o, i) => [{ text: o.slice(0, 60), callback_data: ids[i] }]) }; }
  else if (m.link && m.link.url) c.reply_markup = { inline_keyboard: [[{ text: String(m.link.botao || "Abrir").slice(0, 40), url: m.link.url }]] };
  else if (m.pedirFone) c.reply_markup = { keyboard: [[{ text: "📱 Mandar meu número", request_contact: true }]], one_time_keyboard: true, resize_keyboard: true };
  else c.reply_markup = { remove_keyboard: true };
  return c;
}
export const urlTelegram = (token, metodo) => `https://api.telegram.org/bot${token}/${metodo}`;
