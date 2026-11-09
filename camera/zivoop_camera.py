"""Zivoop Câmera — conta pessoas em cada mesa pela câmera do teto e atualiza o salão no painel.

Roda num computador do restaurante. Lê a câmera IP (RTSP), detecta pessoas com YOLO,
decide se cada mesa está livre ou ocupada (com tolerância, para ninguém "sumir" ao se mexer)
e manda SÓ os números para o Supabase. Nenhum vídeo ou foto é gravado; a única imagem que sai
daqui é a foto de calibração, e só quando o dono pede no painel para marcar as mesas.

uso:
  python zivoop_camera.py                 # usa config.json (pergunta o que faltar na primeira vez)
  python zivoop_camera.py --simular roteiro.json   # testa sem câmera, com pessoas de mentira
"""
import argparse, base64, json, os, sys, time, threading
import urllib.request, urllib.error

AQUI = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(AQUI, "config.json")
SUPABASE_URL = "https://phswqjkytnkukqpbtoqd.supabase.co"
SUPABASE_KEY = "sb_publishable_LUsJVly6aj88WTDxTFeT6A_VB5kqA-8"   # chave pública (a mesma do site); o que protege é o código da câmera

# tolerâncias (segundos)
OCUPA_APOS = 20        # pessoas sentadas na mesa por 20 s seguidos = ocupada
LIBERA_APOS = 90       # mesa vazia por 90 s seguidos = livre (cobre ida ao banheiro, alguém que levanta)
GARCOM_APOS = 3        # alguém em pé dentro da mesa por 3 s = atendimento
GARCOM_SO_DEPOIS = 25  # só conta garçom depois que a mesa está ocupada há 25 s (os clientes chegam em pé)
QUADROS_POR_SEG = 1.0

def log(*a): print(time.strftime("%H:%M:%S"), *a, flush=True)

# ---------- Supabase ----------
class Nuvem:
    def __init__(s, url, key, codigo):
        s.url, s.key, s.codigo = url.rstrip("/"), key, codigo
    def rpc(s, nome, corpo):
        req = urllib.request.Request(f"{s.url}/rest/v1/rpc/{nome}", data=json.dumps(corpo).encode(), method="POST",
            headers={"apikey": s.key, "Authorization": "Bearer " + s.key, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            t = r.read().decode(); return json.loads(t) if t else None
    def config(s): return s.rpc("zv_cam_config", {"p_codigo": s.codigo})
    def estado(s, mesas): return s.rpc("zv_cam_estado", {"p_codigo": s.codigo, "p_mesas": mesas})
    def foto(s, data_url): return s.rpc("zv_cam_foto", {"p_codigo": s.codigo, "p_foto": data_url})

# ---------- geometria ----------
def dentro(pt, poli):
    """ponto dentro do polígono (ray casting), tudo em 0..1"""
    x, y = pt; ok = False; n = len(poli)
    for i in range(n):
        x1, y1 = poli[i]; x2, y2 = poli[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-9) + x1: ok = not ok
    return ok

def classificar(caixas):
    """caixas de pessoas [x1,y1,x2,y2] em 0..1 -> lista de (ponto_do_pé, em_pé)"""
    out = []
    for x1, y1, x2, y2 in caixas:
        w, h = max(x2 - x1, 1e-6), max(y2 - y1, 1e-6)
        em_pe = h / w >= 1.9 and h >= 0.14      # alto e estreito: está em pé
        out.append((((x1 + x2) / 2, y2 - h * 0.08), em_pe))
    return out

# ---------- regra de cada mesa ----------
class Mesa:
    def __init__(s, info):
        s.id, s.nome, s.zona = info["id"], info["nome"], info["zona"]
        s.status, s.pessoas, s.atendida = "livre", 0, False
        s.desde_cheia = None; s.desde_vazia = None; s.desde_ocupou = None; s.desde_garcom = None
    def ver(s, sentados, em_pe, agora):
        """aplica a tolerância; devolve True se o estado mudou e precisa ir para a nuvem"""
        mudou = False
        presentes = sentados + em_pe
        if s.status == "livre":
            if sentados > 0:
                s.desde_cheia = s.desde_cheia or agora
                if agora - s.desde_cheia >= OCUPA_APOS:
                    s.status, s.pessoas, s.atendida, s.desde_ocupou = "ocupada", sentados, False, agora; mudou = True
            else: s.desde_cheia = None
        else:
            if presentes == 0:
                s.desde_vazia = s.desde_vazia or agora
                if agora - s.desde_vazia >= LIBERA_APOS:
                    s.status, s.pessoas, s.atendida = "livre", 0, False; s.desde_cheia = None; mudou = True
            else:
                s.desde_vazia = None
                if sentados and sentados != s.pessoas and sentados > s.pessoas: s.pessoas = sentados; mudou = True
                if not s.atendida and em_pe > 0 and agora - s.desde_ocupou >= GARCOM_SO_DEPOIS:
                    s.desde_garcom = s.desde_garcom or agora
                    if agora - s.desde_garcom >= GARCOM_APOS: s.atendida = True; mudou = True
                else: s.desde_garcom = None
        return mudou
    def json(s): return {"id": s.id, "status": s.status, "pessoas": s.pessoas, "atendida": s.atendida}

# ---------- detectores ----------
class DetectorYolo:
    def __init__(s):
        from ultralytics import YOLO
        s.m = YOLO(os.path.join(AQUI, "yolov8n.pt") if os.path.exists(os.path.join(AQUI, "yolov8n.pt")) else "yolov8n.pt")
    def pessoas(s, frame):
        h, w = frame.shape[:2]
        r = s.m.predict(frame, classes=[0], conf=0.35, imgsz=960, verbose=False)[0]
        return [[float(a) / w, float(b) / h, float(c) / w, float(d) / h] for a, b, c, d in r.boxes.xyxy.tolist()]

class Camera:
    """lê sempre o quadro mais novo (a câmera manda 15-30 por segundo; processamos 1)"""
    def __init__(s, rtsp):
        import cv2
        s.cv2, s.rtsp, s.quadro, s.ok = cv2, rtsp, None, False
        threading.Thread(target=s._ler, daemon=True).start()
    def _ler(s):
        while True:
            cap = s.cv2.VideoCapture(s.rtsp)
            if not cap.isOpened(): log("não abriu a câmera; tento de novo em 10 s"); s.ok = False; time.sleep(10); continue
            s.ok = True
            while True:
                ok, f = cap.read()
                if not ok: log("a câmera parou de mandar imagem; reconectando"); s.ok = False; break
                s.quadro = f
            cap.release(); time.sleep(3)
    def foto(s):
        f = s.quadro
        if f is None: return None
        h, w = f.shape[:2]; k = 960 / w
        f = s.cv2.resize(f, (960, int(h * k)))
        ok, buf = s.cv2.imencode(".jpg", f, [s.cv2.IMWRITE_JPEG_QUALITY, 70])
        return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode() if ok else None

class Simulada:
    """roteiro: {"foto": "arquivo.jpg"?, "passos": [{"t": 0, "caixas": [[x1,y1,x2,y2], ...]}, ...]} — t em segundos"""
    def __init__(s, arq, velocidade):
        s.r = json.load(open(arq, encoding="utf-8")); s.t0 = time.time(); s.vel = velocidade; s.ok = True
    def agora(s): return (time.time() - s.t0) * s.vel
    def pessoas(s, _=None):
        t, cx = s.agora(), []
        for p in s.r["passos"]:
            if p["t"] <= t: cx = p["caixas"]
        return cx
    def foto(s):
        arq = s.r.get("foto")
        if not arq: return None
        return "data:image/jpeg;base64," + base64.b64encode(open(arq, "rb").read()).decode()

# ---------- programa ----------
def ler_config(interativo=True):
    c = json.load(open(CONFIG, encoding="utf-8")) if os.path.exists(CONFIG) else {}
    if interativo and not c.get("codigo"):
        print("Cole o código da câmera que aparece no painel (Salão > Conectar câmera):"); c["codigo"] = input("> ").strip()
    if interativo and not c.get("rtsp") and not c.get("simular"):
        print("Endereço RTSP da câmera (ex.: rtsp://admin:senha@192.168.0.20:554/cam/realmonitor?channel=1&subtype=0):"); c["rtsp"] = input("> ").strip()
    c.setdefault("supabase_url", SUPABASE_URL); c.setdefault("supabase_key", SUPABASE_KEY); c.setdefault("garcom_pela_camera", True)
    json.dump(c, open(CONFIG, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    return c

def rodar(c, fonte, detector, uma_vez_ate=None):
    nuvem = Nuvem(c["supabase_url"], c["supabase_key"], c["codigo"])
    mesas, ult_cfg, ult_envio = {}, 0, 0
    while True:
        agora = fonte.agora() if isinstance(fonte, Simulada) else time.time()
        if uma_vez_ate is not None and agora > uma_vez_ate: return mesas
        if time.time() - ult_cfg > (5 if isinstance(fonte, Simulada) else 60):
            try:
                cfg = nuvem.config(); ult_cfg = time.time()
                novas = {m["id"]: m for m in cfg["mesas"]}
                for i in list(mesas):
                    if i not in novas: del mesas[i]
                for i, m in novas.items():
                    if i in mesas: mesas[i].zona, mesas[i].nome = m["zona"], m["nome"]
                    else: mesas[i] = Mesa(m)
                if cfg.get("pedir_foto"):
                    f = fonte.foto()
                    if f: nuvem.foto(f); log("foto de calibração enviada")
                if not mesas: log(f"{cfg['negocio']}: nenhuma mesa marcada nesta câmera ainda. Marque no painel (Salão > Marcar mesas).")
            except urllib.error.HTTPError as e:
                corpo = e.read().decode()[:200]
                if "codigo_invalido" in corpo: log("código da câmera inválido: confira no painel ou gere outro."); sys.exit(2)
                log("erro na nuvem:", e.code, corpo)
            except Exception as e: log("sem internet agora:", e)
        if not getattr(fonte, "ok", True): time.sleep(1); continue
        if isinstance(detector, Simulada): caixas = detector.pessoas()
        else:
            if fonte.quadro is None: time.sleep(1); continue
            caixas = detector.pessoas(fonte.quadro)
        pts = classificar(caixas)
        mudaram = []
        for m in mesas.values():
            sent = sum(1 for p, pe in pts if not pe and dentro(p, m.zona))
            pe = sum(1 for p, pe_ in pts if pe_ and dentro(p, m.zona)) if c.get("garcom_pela_camera", True) else 0
            if m.ver(sent, pe, agora): mudaram.append(m)
        if mudaram or time.time() - ult_envio > 120:
            try:
                nuvem.estado([m.json() for m in (mudaram or mesas.values())]); ult_envio = time.time()
                for m in mudaram: log(f"{m.nome}: {m.status}{' · ' + str(m.pessoas) + ' pessoas' if m.status == 'ocupada' else ''}{' · atendida' if m.atendida else ''}")
            except Exception as e: log("não consegui enviar, tento de novo:", e)
        time.sleep(1 / QUADROS_POR_SEG / (getattr(fonte, "vel", 1)))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--simular"); ap.add_argument("--velocidade", type=float, default=1); ap.add_argument("--ate", type=float)
    a = ap.parse_args()
    c = ler_config(interativo=not a.simular)
    if a.simular:
        sim = Simulada(a.simular, a.velocidade); log("modo simulado")
        rodar(c, sim, sim, a.ate)
    else:
        log("Zivoop Câmera ligada. Carregando o detector de pessoas…")
        det = DetectorYolo(); cam = Camera(c["rtsp"]); log("pronto. Deixe esta janela aberta.")
        rodar(c, cam, det)
