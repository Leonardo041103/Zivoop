# Zivoop Câmera

Programa que deixa o **Salão** do painel no automático: a câmera do teto diz quando a mesa ocupou, se alguém foi atender e quando liberou.

## O que precisa

- A câmera IP que já fica no teto do salão, com endereço **RTSP** (Intelbras, Hikvision, Yoosee, Tapo e a maioria das câmeras de segurança têm). Ela precisa enxergar as mesas de cima ou de lado.
- Um computador com Windows ligado no restaurante, na mesma rede da câmera. Serve um computador simples (processador de 4 núcleos, 8 GB de memória).
- Internet.

## Instalar (uma vez)

1. Instale o Python 3.11 em python.org. Na instalação, marque **Add python.exe to PATH**.
2. Copie esta pasta para o computador (por exemplo, `C:\ZivoopCamera`).
3. No painel, abra **Salão → Conectar câmera** e copie o código que aparece.
4. Dê dois cliques em `iniciar.bat`. Na primeira vez ele instala o que precisa (alguns minutos) e pede:
   - o código da câmera;
   - o endereço RTSP da câmera. Exemplos:
     - Intelbras/Dahua: `rtsp://admin:SENHA@192.168.0.20:554/cam/realmonitor?channel=1&subtype=0`
     - Hikvision: `rtsp://admin:SENHA@192.168.0.20:554/Streaming/Channels/101`
5. Volte ao painel, toque em **Marcar mesas** e contorne cada mesa (com as cadeiras) na foto da câmera.

Para ligar sozinho quando o computador ligar: aperte `Win + R`, digite `shell:startup` e coloque ali um atalho do `iniciar.bat`.

## Como ele decide

- **Ocupada**: pessoas sentadas na área da mesa por 20 segundos seguidos.
- **Livre**: ninguém na área por 90 segundos seguidos (quem vai ao banheiro não libera a mesa).
- **Atendida**: alguém em pé na mesa por 3 segundos, depois que os clientes já sentaram. É uma estimativa: se o garçom atender sem a câmera ver, ele toca em **Atendi** no painel. Para desligar essa parte, ponha `"garcom_pela_camera": false` no `config.json`.

## Privacidade (LGPD)

O programa só conta pessoas. Ele não reconhece rostos e não grava vídeo. A única imagem que sai do computador é a foto de calibração, quando o dono pede no painel para marcar as mesas. Mesmo assim, deixe um aviso visível no salão de que o ambiente tem câmera.

## Testar sem câmera

`python zivoop_camera.py --simular roteiro.json --velocidade 10`, com um roteiro de pessoas de mentira (veja o teste em `zvtest/salao.js`).
