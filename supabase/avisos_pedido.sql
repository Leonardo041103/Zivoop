-- Avisos automáticos do pedido no WhatsApp (lanchonete). Roda no banco da lanchonete, depois de robo.sql.
-- Cada vez que o pedido muda de etapa (recebido, em preparo, pronto, saiu para entrega, entregue, cancelado),
-- a mensagem entra na fila do robô; o painel pede o envio na hora e a rotina pega o que sobrar.
-- Só funciona com o WhatsApp oficial conectado; sem ele, o painel continua com o botão "Avisar cliente".
-- O dono liga, desliga e muda o texto de cada aviso no painel (config.avisos.<etapa> = {ativo, texto}).

create or replace function public.zv_pedido_aviso() returns trigger language plpgsql security definer set search_path = public as $$
declare chave text; cfg jsonb; tx text; z text; nm text; mb text; frase text; entrega boolean;
begin
  if new.whatsapp is null or new.negocio is null then return new; end if;
  if not exists (select 1 from zv_canais c where c.negocio = new.negocio and c.phone_id is not null and c.token is not null) then return new; end if;
  entrega := coalesce(new.detalhes->>'tipo', '') = 'entrega' or coalesce(new.entrega, '') ilike '%entreg%' or coalesce(new.detalhes->'end'->>'rua', '') <> '';
  if TG_OP = 'INSERT' then chave := 'recebido';
  elsif new.etapa is distinct from old.etapa then
    chave := case when new.etapa = 'pronto' and coalesce(new.detalhes->>'saiu_em', '') <> '' then 'saiu' when new.etapa = 'novo' then 'recebido' else new.etapa end;
  elsif coalesce(new.detalhes->>'saiu_em', '') <> '' and coalesce(old.detalhes->>'saiu_em', '') = '' then chave := 'saiu';
  else return new; end if;
  if chave = 'pronto' and entrega then return new; end if;   -- no pedido de entrega o aviso que interessa é o "saiu"
  select n.dados->'config'->'avisos' into cfg from zv_negocios n where n.id = new.negocio;
  if coalesce((cfg->chave->>'ativo')::boolean, true) = false then return new; end if;
  tx := coalesce(nullif(trim(cfg->chave->>'texto'), ''), case chave
    when 'recebido' then 'Olá, {nome}! Recebemos seu pedido nº {numero}. Vou te avisando por aqui a cada passo.'
    when 'preparo' then 'Seu pedido nº {numero} já está sendo preparado. 👨‍🍳'
    when 'pronto' then 'Seu pedido nº {numero} está pronto! Pode vir buscar. 😋'
    when 'saiu' then 'Seu pedido nº {numero} saiu para entrega{motoboy}. Chega já já! 🛵'
    when 'entregue' then 'Pedido nº {numero} entregue. Obrigado, {nome}! Bom apetite e volte sempre.'
    when 'cancelado' then 'Seu pedido nº {numero} foi cancelado. Se tiver alguma dúvida, é só responder aqui.' end);
  if tx is null then return new; end if;
  nm := split_part(trim(coalesce(new.nome, '')), ' ', 1); mb := nullif(trim(coalesce(new.detalhes->>'motoboy', '')), '');
  tx := replace(replace(replace(tx, '{nome}', nm), '{numero}', new.numero::text), '{motoboy}', case when mb is null then '' else ' com o ' || mb end);
  frase := case chave when 'recebido' then 'recebido' when 'preparo' then 'em preparo' when 'pronto' then 'pronto para retirar'
    when 'saiu' then 'saiu para entrega' when 'entregue' then 'entregue' else 'cancelado' end;
  z := regexp_replace(new.whatsapp, '\D', '', 'g'); if length(z) in (10, 11) then z := '55' || z; end if;
  if length(z) < 12 then return new; end if;
  -- o mesmo aviso nunca sai duas vezes (índice único negocio + tipo + ref)
  insert into zv_bot_fila (negocio, whatsapp, tipo, texto, ref, expira, modelo)
  values (new.negocio, z, 'aviso', left(tx, 1000), 'ped:' || new.id || ':' || chave, now() + interval '6 hours',
          jsonb_build_object('nome', 'status_pedido', 'params', jsonb_build_array(coalesce(nullif(nm, ''), 'cliente'), new.numero::text, frase)))
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists aviso on public.zv_pedidos;
create trigger aviso after insert or update of etapa, detalhes on public.zv_pedidos for each row execute function public.zv_pedido_aviso();
revoke execute on function public.zv_pedido_aviso() from public, anon, authenticated;
