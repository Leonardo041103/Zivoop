# Arena: ingressos com o estádio em 3D

## O que o site faz
- O cliente escolhe o evento (jogo, show ou rodeio), toca num setor no estádio em 3D ou na lista e vê o campo **do lugar dele** ("Do meu lugar").
- **Setor com lugar marcado** (cadeiras, camarote): escolhe fila e número no mapa ou no 3D. Tem o botão "escolher os melhores lugares juntos".
- **Setor geral** (arquibancada, pista): escolhe só a quantidade; o site para de vender quando chega na capacidade.
- Inteira ou meia em cada ingresso. A cota de meia-entrada (padrão 40%) é controlada sozinha; quando acaba, o site avisa para trocar para inteira.
- Pix com QR e copia e cola. Os lugares ficam guardados por 15 minutos; se o Pix não for confirmado, voltam à venda sozinhos.
- Cada ingresso tem um QR único com o portão de entrada.

## Portaria (`seusite.com.br/#portaria`)
- Escolha o evento e o portão. A câmera fica aberta e lê um QR atrás do outro: entrada liberada, já usado, portão errado, Pix não confirmado ou outro evento.
- Também lê foto do QR ou o código digitado.
- Lista de **Pix a confirmar**: confira no banco e toque em "Pix recebido". Os ingressos do cliente aparecem na tela dele na hora.

## Colocar no ar com banco de dados (Supabase, plano grátis)
1. Crie um projeto em supabase.com.
2. SQL Editor > cole o `supabase.sql` > Run.
3. Authentication > Users > Add user: crie o e-mail e a senha de quem trabalha na portaria.
4. No SQL Editor rode (com o e-mail que criou):
   `insert into public.arena_equipe (user_id, nome) select id, 'Portaria' from auth.users where email = 'portaria@suaarena.com.br';`
5. Project Settings > API: copie a URL e a anon key para `config.supabase` no `dados.js`. Preencha também `config.pix`.
6. Abra `#portaria` e entre. Os eventos, setores e preços do `dados.js` são salvos no banco nesse momento.
   **Sempre que mudar preço ou criar evento, entre na portaria uma vez** para o banco receber a mudança.

O preço cobrado sai do banco, não do navegador: ninguém consegue pagar menos mexendo na página.
Sem o Supabase o site funciona em **modo demonstração** (tudo fica no próprio aparelho).
