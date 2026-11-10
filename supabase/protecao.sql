-- Proteção contra abuso: robôs não conseguem inundar um negócio de pedidos/agendamentos falsos
-- nem encher o banco grátis. Limites altos o bastante para nenhum negócio de verdade chegar perto.

-- pedidos: no máximo 40 por negócio a cada 10 minutos (vale para site, QR da mesa e painel)
create or replace function public.zv_trava_pedidos() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from zv_pedidos where negocio = new.negocio and criado_em > now() - interval '10 minutes') >= 40 then
    raise exception 'muitos_pedidos' using hint = 'Muitos pedidos em pouco tempo. Tente de novo em alguns minutos.';
  end if;
  if jsonb_typeof(new.itens) = 'array' and jsonb_array_length(new.itens) > 80 then raise exception 'itens_demais'; end if;
  if length(new.itens::text) > 60000 or length(coalesce(new.detalhes, '{}')::text) > 20000 then raise exception 'pedido_grande_demais'; end if;
  return new;
end $$;
drop trigger if exists trava on public.zv_pedidos;
create trigger trava before insert on public.zv_pedidos for each row execute function public.zv_trava_pedidos();

-- agendamentos e reservas: no máximo 30 por negócio a cada 10 minutos
create or replace function public.zv_trava_agenda() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from zv_agendamentos where negocio = new.negocio and criado_em > now() - interval '10 minutes') >= 30 then
    raise exception 'muitos_agendamentos' using hint = 'Muitos agendamentos em pouco tempo. Tente de novo em alguns minutos.';
  end if;
  return new;
end $$;
drop trigger if exists trava on public.zv_agendamentos;
create trigger trava before insert on public.zv_agendamentos for each row execute function public.zv_trava_agenda();
create index if not exists zv_ag_neg_criado on public.zv_agendamentos (negocio, criado_em desc);

-- cada conta cria no máximo 5 negócios (evita contas falsas criando sites em massa)
create or replace function public.zv_trava_negocios() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from zv_negocios where dono = new.dono) >= 5 then
    raise exception 'limite_negocios' using hint = 'Limite de 5 negócios por conta. Fale com a Zivoop para liberar mais.';
  end if;
  if (select count(*) from zv_negocios where criado_em > now() - interval '1 hour') >= 60 then raise exception 'tente_mais_tarde'; end if;
  -- endereços que são páginas da Zivoop não podem virar site de cliente
  if new.slug in ('ofertas','privacidade','termos','painel','modelos','api','admin','zivoop') then new.slug := new.slug || '-loja'; end if;
  return new;
end $$;
drop trigger if exists trava on public.zv_negocios;
create trigger trava before insert on public.zv_negocios for each row execute function public.zv_trava_negocios();

-- contatos do zivoop.com: no máximo 300 por dia no total
do $$ begin
  if to_regclass('public.zivoop_leads') is not null then
    execute $f$
      create or replace function public.zivoop_trava_leads() returns trigger language plpgsql security definer set search_path = public as $g$
      begin
        if (select count(*) from zivoop_leads where criado_em > now() - interval '1 day') >= 300 then raise exception 'muitos_contatos'; end if;
        return new;
      end $g$;
      drop trigger if exists trava on public.zivoop_leads;
      create trigger trava before insert on public.zivoop_leads for each row execute function public.zivoop_trava_leads();
    $f$;
  end if;
end $$;

-- funções de trava não são chamáveis de fora
revoke execute on function public.zv_trava_pedidos(), public.zv_trava_agenda(), public.zv_trava_negocios() from public, anon, authenticated;
do $$ begin if to_regprocedure('public.zivoop_trava_leads()') is not null then
  revoke execute on function public.zivoop_trava_leads() from public, anon, authenticated; end if; end $$;
