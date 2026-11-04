# Restaurante: reserva com salão em 3D, QR na mesa e painel do salão

## O que o site faz
- **Reserva**: o cliente escolhe dia, horário e quantas pessoas. O salão em 3D e a planta mostram na hora quais mesas estão livres. Mesa com gente sentada = ocupada nesse horário.
- **Mesa livre de verdade**: uma mesa não pode ser reservada se
  1. já tem reserva que se sobrepõe ao horário (dura `reservas.duracaoMin`, padrão 120 min);
  2. hoje, alguém está sentado nela agora (a equipe marcou "Ocupar agora" no painel, ou o cliente abriu o QR da mesa) e ainda não deu o tempo médio;
  3. ela é só para quem chega na hora (`reservavel: false`, como a varanda do exemplo).
  Quem não aparece até `toleranciaMin` depois do horário perde a mesa, e ela volta a ficar livre sozinha.
- **QR na mesa**: abre o cardápio da mesa. O cliente faz o pedido (vai para o painel), chama o garçom ou pede a conta escolhendo a forma de pagamento e em quantos vai dividir.
- **Painel do salão** (`seusite.com.br/#salao`): chamados ao vivo com som, mesas livres e ocupadas, aviso de "reservada às 20:00" antes de sentar alguém, reservas do dia (Chegou, Não veio, Cancelar) e os QR codes para imprimir.

## Colocar no ar com banco de dados (Supabase, plano grátis)
1. Crie um projeto em supabase.com.
2. SQL Editor > cole o `supabase.sql` > Run.
3. Authentication > Users > Add user: crie o e-mail e a senha da equipe.
4. No SQL Editor rode (com o e-mail que criou):
   `insert into public.rest_equipe (user_id, nome) select id, 'Salão' from auth.users where email = 'salao@seurestaurante.com.br';`
5. Project Settings > API: copie a URL e a anon key para `config.supabase` no `dados.js`.
6. Abra `#salao`, entre com a conta da equipe. As mesas do `dados.js` são salvas no banco sozinhas e cada uma ganha um QR único. Vá em **QR das mesas > Imprimir**.

Sem o Supabase o site funciona em **modo demonstração** (tudo fica no próprio aparelho): bom para mostrar ao cliente.
Na demonstração, abra o painel numa aba e o QR de uma mesa em outra para ver o chamado chegar.

## Mudar o salão
No `dados.js`, em `mesas`: `x` vai da esquerda (negativo) para a direita, `z` do fundo (negativo) para a entrada (positivo), em metros.
O salão do exemplo tem 15 m por 10 m (`config.salao`). A planta e o 3D mudam juntos.
