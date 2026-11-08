# Zivoop Ofertas

Posta ofertas de afiliado (Shopee, Mercado Livre, Amazon) sozinho nos grupos de WhatsApp do cliente.

- **Painel do cliente:** https://zivoop.vercel.app/ofertas (arquivo `src/ofertas/index.html`)
- **Banco:** tabelas `fl_*` no Supabase (`supabase/ofertas.sql`)
- **Robô:** `ofertas/robo`, roda 24 horas numa VPS com Docker e conecta os números por QR code (Baileys)

## Como funciona

1. O cliente cria a conta no painel e ganha 7 dias de teste.
2. Em **Números**, clica em *Conectar com QR code*. O robô gera o QR, o painel mostra, e o cliente lê com o WhatsApp do celular em *Dispositivos conectados*.
3. O robô busca os grupos. Em **Grupos**, o cliente liga os que vão receber ofertas (limite do plano).
4. Em **Nova oferta**, cola o link. O robô lê nome, preço e foto. Na Shopee, com a API, também gera o link de afiliado. O cliente confere, escolhe *Agora*, *Na fila* ou um horário, e agenda.
5. Na hora marcada, o robô manda foto e texto em cada grupo, com uma espera aleatória entre um grupo e outro, para parecer gente.
6. **Comissões** puxa os pedidos da API de afiliados da Shopee. **Membros** conta quem entra e sai dos grupos.

## Subir o robô na VPS (uma vez)

Use uma VPS com Ubuntu 22.04 ou 24.04, 1 vCPU e 1 a 2 GB de RAM. Hetzner CX22 ou Contabo VPS S servem para dezenas de números.

```bash
# 1. instalar Docker
curl -fsSL https://get.docker.com | sh

# 2. baixar o código
git clone https://github.com/Leonardo041103/zivoop.git
cd zivoop/ofertas/robo

# 3. configurar
cp .env.exemplo .env
nano .env        # cole a chave service_role (Supabase > Project Settings > API Keys > service_role / secret)

# 4. ligar
docker compose up -d --build
docker compose logs -f     # deve aparecer "Zivoop Ofertas: robô ligado"
```

Para atualizar depois de mudanças no código:

```bash
cd zivoop && git pull && cd ofertas/robo && docker compose up -d --build
```

A pasta `ofertas/robo/dados` guarda as sessões do WhatsApp. **Não apague essa pasta.** Sem ela, todos os clientes precisam ler o QR de novo. Faça backup dela de vez em quando.

## Planos e cobrança

Cada conta nasce com `plano = teste`, `ativo_ate = hoje + 7 dias`, 2 números e 10 grupos. Quando o cliente pagar, mude no Supabase (Table Editor > `fl_contas`):

| Campo | O que faz |
| --- | --- |
| `plano` | Nome do plano (`mensal`, `anual`…) |
| `ativo_ate` | Até quando o robô posta. Vencido, as ofertas param e o painel avisa. |
| `limite_numeros` | Quantos WhatsApps a conta pode conectar |
| `limite_grupos` | Quantos grupos podem ficar ligados |
| `limite_dia` | Máximo de mensagens por número por dia (padrão 300) |

O cliente não consegue mudar esses campos pelo painel; o banco bloqueia.

O botão **Assinar** do painel abre o WhatsApp de suporte. Para ligar, defina `window.ZV_OFERTAS_SUPORTE = "55119…"` no topo de `src/ofertas/index.html` ou troque a constante `SUPORTE_WHATS`.

## Riscos e limites

- **Banimento:** a conexão por QR não é oficial e vai contra os termos do WhatsApp. O número pode ser bloqueado, principalmente se for novo, mandar muito ou receber denúncias. O robô reduz o risco com espera variada entre grupos, limite diário e envio só em grupos onde o número participa. Mesmo assim, oriente os clientes a usar um chip só para ofertas.
- **Leitura de links:** Shopee com API funciona melhor. Sem API, e na Amazon, que costuma bloquear robôs, o cliente pode precisar preencher título e preço à mão. O painel avisa quando isso acontece.
- **Comissões:** só a Shopee tem API. Mercado Livre e Amazon não liberam comissões para terceiros.

## Testes

`zvtest/ofertas.js` (fora do repositório) roda o fluxo completo: criar conta, QR, grupos, configurações, link da Shopee pela API, envio, lote na fila, cancelar e postar agora, comissões, membros, isolamento entre clientes e celular. Usa um WhatsApp simulado (`WA_FAKE=1`) e uma Shopee simulada.
