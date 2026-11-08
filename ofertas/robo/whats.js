// Conexão com o WhatsApp de cada número (QR code, como o WhatsApp Web), usando Baileys.
// WA_FAKE=1 troca por um WhatsApp simulado, para testar sem celular.
import fs from "node:fs";
import path from "node:path";

const PASTA = process.env.PASTA_SESSOES || "./dados/sessoes";
const FAKE = process.env.WA_FAKE === "1";

// ev: { qr(qr), aberto(telefone), fechado(deslogou), participantes({jid, entraram, sairam}) }
export async function conectar(numeroId, ev) {
  return FAKE ? simulado(numeroId, ev) : real(numeroId, ev);
}
export const temSessao = id => fs.existsSync(path.join(PASTA, id, "creds.json"));
export const apagarSessao = id => fs.rmSync(path.join(PASTA, id), { recursive: true, force: true });

async function real(numeroId, ev) {
  const B = await import("@whiskeysockets/baileys");
  const { default: pino } = await import("pino");
  const make = B.makeWASocket || B.default;
  const dir = path.join(PASTA, numeroId); fs.mkdirSync(dir, { recursive: true });
  const { state, saveCreds } = await B.useMultiFileAuthState(dir);
  let version; try { version = (await B.fetchLatestBaileysVersion()).version; } catch (e) {}
  const sock = make({ version, auth: state, logger: pino({ level: "silent" }), browser: B.Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: false, syncFullHistory: false, generateHighQualityLinkPreview: true });
  sock.ev.on("creds.update", saveCreds);
  let fechou = false;
  sock.ev.on("connection.update", u => {
    if (u.qr) ev.qr(u.qr);
    if (u.connection === "open") ev.aberto(B.jidNormalizedUser(sock.user.id).split("@")[0]);
    if (u.connection === "close" && !fechou) {
      fechou = true;
      const cod = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
      ev.fechado(cod === B.DisconnectReason.loggedOut, cod);
    }
  });
  sock.ev.on("group-participants.update", ({ id, participants, action }) => {
    if (action === "add") ev.participantes({ jid: id, entraram: participants.length, sairam: 0 });
    if (action === "remove") ev.participantes({ jid: id, entraram: 0, sairam: participants.length });
  });
  return {
    async grupos() {
      const g = await sock.groupFetchAllParticipating(), eu = B.jidNormalizedUser(sock.user.id), lid = sock.user.lid && B.jidNormalizedUser(sock.user.lid);
      return Object.values(g).map(m => {
        const p = (m.participants || []).find(x => [eu, lid].includes(B.jidNormalizedUser(x.id)) || (x.jid && B.jidNormalizedUser(x.jid) === eu));
        return { jid: m.id, nome: m.subject || "Grupo", membros: (m.participants || []).length, admin: !m.announce || !!(p && p.admin) };
      });
    },
    async enviar(jid, { texto, imagem }) {
      await sock.sendPresenceUpdate("composing", jid).catch(() => {});
      if (imagem) {
        try { return await sock.sendMessage(jid, { image: { url: imagem }, caption: texto }); }
        catch (e) { /* imagem fora do ar: manda só o texto */ }
      }
      return sock.sendMessage(jid, { text: texto });
    },
    async sair(deslogar) { fechou = true; try { if (deslogar) await sock.logout(); else sock.end(undefined); } catch (e) {} },
  };
}

// WhatsApp de mentira para testes: QR, conexão depois de 2s, 8 grupos, guarda o que foi enviado em dados/enviados.jsonl
async function simulado(numeroId, ev) {
  const dir = path.join(PASTA, numeroId); fs.mkdirSync(dir, { recursive: true });
  const nomes = ["Achados da Carla", "Casa & Cozinha VIP", "Mãe e Bebê Ofertas", "Tech Barato", "Moda em Oferta", "Promo Relâmpago", "Pet Achadinhos", "Beleza em Conta"];
  let vivo = true;
  if (!temSessao(numeroId)) {
    ev.qr("2@ZIVOOP-TESTE-" + numeroId.slice(0, 8) + "-" + Date.now());
    setTimeout(() => { if (!vivo) return; fs.writeFileSync(path.join(dir, "creds.json"), "{}"); ev.aberto("5511990001234"); }, 2000);
  } else setTimeout(() => vivo && ev.aberto("5511990001234"), 200);
  // depois de um tempo, gente entra e sai dos grupos (para testar a tela de membros)
  setTimeout(() => { if (!vivo) return; ev.participantes({ jid: "12036301000@g.us", entraram: 12, sairam: 0 }); ev.participantes({ jid: "12036301001@g.us", entraram: 0, sairam: 3 }); }, 8000);
  return {
    async grupos() { return nomes.map((n, i) => ({ jid: "1203630" + (1000 + i) + "@g.us", nome: n, membros: 180 + i * 37, admin: i !== 7 })); },
    async enviar(jid, msg) {
      if (process.env.WA_FAKE_FALHA === jid) throw new Error("grupo não aceita mensagens");
      fs.appendFileSync(path.join(PASTA, "..", "enviados.jsonl"), JSON.stringify({ numeroId, jid, ...msg, em: new Date().toISOString() }) + "\n");
      return { key: { id: "fake" } };
    },
    async sair(deslogar) { vivo = false; if (deslogar) apagarSessao(numeroId); },
    simularEntrada(jid, n) { ev.participantes({ jid, entraram: n, sairam: 0 }); },
  };
}
