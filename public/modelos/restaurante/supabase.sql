-- =====================================================================
-- Restaurante Zivoop: reserva de mesa, mesa ocupada na hora, QR da mesa
-- (pedido, chamar garçom, pedir a conta) e painel do salão.
-- Cole no Supabase > SQL Editor > Run. Pode rodar de novo sem perder dados.
-- No fim do arquivo ficam as mesas do seu salão (geradas pelo site).
-- =====================================================================
create extension if not exists pgcrypto;

create table if not exists public.rest_mesas (
  id         text primary key,
  lugares    int  not null check (lugares between 1 and 40),
  reservavel boolean not null default true,         -- false = só para quem chega na hora
  token      text not null default encode(gen_random_bytes(6),'hex')  -- vai no QR da mesa
);
create table if not exists public.rest_estado (
  mesa    text primary key references public.rest_mesas on delete cascade,
  status  text not null default 'livre' check (status in ('livre','ocupada')),
  desde   timestamptz,
  pessoas int
);
create table if not exists public.rest_reservas (
  id        uuid primary key default gen_random_uuid(),
  codigo    text not null unique,
  mesa      text not null references public.rest_mesas on delete cascade,
  data      date not null,
  hora      time not null,
  pessoas   int  not null check (pessoas between 1 and 40),
  nome      text not null,
  whatsapp  text,
  obs       text,
  status    text not null default 'reservado' check (status in ('reservado','chegou','cancelado','nao_veio')),
  criado_em timestamptz not null default now()
);
create index if not exists rest_res_data on public.rest_reservas (data, mesa);
create table if not exists public.rest_chamados (
  id         uuid primary key default gen_random_uuid(),
  mesa       text not null references public.rest_mesas on delete cascade,
  tipo       text not null check (tipo in ('garcom','conta','pedido')),
  itens      jsonb,
  total      numeric(10,2),
  pagamento  text,
  obs        text,
  status     text not null default 'novo' check (status in ('novo','feito')),
  criado_em  timestamptz not null default now()
);
create index if not exists rest_cham_novo on public.rest_chamados (status, criado_em);
create table if not exists public.rest_equipe (user_id uuid primary key references auth.users on delete cascade, nome text);

alter table public.rest_mesas    enable row level security;
alter table public.rest_estado   enable row level security;
alter table public.rest_reservas enable row level security;
alter table public.rest_chamados enable row level security;
alter table public.rest_equipe   enable row level security;

create or replace function public.rest_e_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rest_equipe where user_id = auth.uid()) $$;

do $$ declare t text; begin
  foreach t in array array['rest_mesas','rest_estado','rest_reservas','rest_chamados'] loop
    execute format('drop policy if exists equipe_tudo on public.%I', t);
    execute format('create policy equipe_tudo on public.%I for all to authenticated using (public.rest_e_equipe()) with check (public.rest_e_equipe())', t);
  end loop; end $$;
drop policy if exists equipe_se_ve on public.rest_equipe;
create policy equipe_se_ve on public.rest_equipe for select to authenticated using (user_id = auth.uid());

-- hora local do restaurante
create or replace function public.rest_agora() returns timestamp language sql stable as $$ select now() at time zone 'America/Sao_Paulo' $$;

-- mesas que NÃO podem ser reservadas para esse dia e hora:
-- (1) outra reserva na mesma mesa que se sobrepõe (duração da refeição)
-- (2) hoje: mesa ocupada agora (quem chegou sem reserva ou abriu o QR) que ainda não deve ter liberado
-- (3) mesas que o restaurante deixa só para quem chega na hora
create or replace function public.rest_indisponiveis(p_data date, p_hora time, p_duracao int default 120)
returns setof text language sql stable security definer set search_path = public as $$
  select m.id from public.rest_mesas m
   where not m.reservavel
      or exists (select 1 from public.rest_reservas r
                  where r.mesa = m.id and r.data = p_data and r.status in ('reservado','chegou')
                    and abs(extract(epoch from (r.hora - p_hora))) < p_duracao * 60
                    and not (r.status = 'reservado' and r.data = rest_agora()::date and (r.data + r.hora) + interval '20 minutes' < rest_agora()))
      or exists (select 1 from public.rest_estado e
                  where e.mesa = m.id and e.status = 'ocupada' and p_data = rest_agora()::date
                    and (p_data + p_hora) < (coalesce(e.desde at time zone 'America/Sao_Paulo', rest_agora()) + make_interval(mins => p_duracao)))
$$;

create or replace function public.rest_reservar(p_mesa text, p_data date, p_hora time, p_pessoas int, p_nome text, p_whatsapp text, p_obs text, p_duracao int default 120)
returns text language plpgsql security definer set search_path = public as $$
declare v_cod text; v_lug int;
begin
  if coalesce(trim(p_nome),'') = '' then raise exception 'nome_obrigatorio'; end if;
  if (p_data + p_hora) < rest_agora() then raise exception 'horario_passado'; end if;
  select lugares into v_lug from public.rest_mesas where id = p_mesa;
  if v_lug is null then raise exception 'mesa_inexistente'; end if;
  if not (select reservavel from public.rest_mesas where id = p_mesa) then raise exception 'so_chegada'; end if;
  if p_pessoas > v_lug then raise exception 'mesa_pequena'; end if;
  if coalesce(p_whatsapp,'') <> '' and (select count(*) from public.rest_reservas where whatsapp = left(p_whatsapp,20) and data = p_data and status = 'reservado') >= 2 then raise exception 'limite_reservas'; end if;
  perform pg_advisory_xact_lock(hashtext(p_mesa || p_data::text));
  if p_mesa in (select public.rest_indisponiveis(p_data, p_hora, p_duracao)) then raise exception 'mesa_ocupada'; end if;
  v_cod := substr(translate(upper(encode(gen_random_bytes(12),'base64')),'+/=0O1IL',''),1,6);
  insert into public.rest_reservas (codigo, mesa, data, hora, pessoas, nome, whatsapp, obs)
  values (v_cod, p_mesa, p_data, p_hora, p_pessoas, left(trim(p_nome),80), left(p_whatsapp,20), left(p_obs,300));
  return v_cod;
end $$;

-- o cliente abriu o QR da mesa: a mesa passa a contar como ocupada
create or replace function public.rest_abrir_mesa(p_mesa text, p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.rest_mesas where id = p_mesa and token = p_token) then raise exception 'qr_invalido'; end if;
  insert into public.rest_estado (mesa, status, desde) values (p_mesa, 'ocupada', now())
  on conflict (mesa) do update set status = 'ocupada', desde = coalesce(case when rest_estado.status = 'ocupada' then rest_estado.desde end, now());
  return true;
end $$;

-- pedido, chamar garçom ou pedir a conta, pelo QR da mesa
create or replace function public.rest_chamar(p_mesa text, p_token text, p_tipo text, p_itens jsonb, p_total numeric, p_pagamento text, p_obs text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.rest_mesas where id = p_mesa and token = p_token) then raise exception 'qr_invalido'; end if;
  if p_tipo not in ('garcom','conta','pedido') then raise exception 'tipo_invalido'; end if;
  if exists (select 1 from public.rest_chamados where mesa = p_mesa and tipo = p_tipo and criado_em > now() - interval '15 seconds') then return true; end if;
  perform public.rest_abrir_mesa(p_mesa, p_token);
  insert into public.rest_chamados (mesa, tipo, itens, total, pagamento, obs)
  values (p_mesa, p_tipo, case when p_tipo = 'pedido' then p_itens end, p_total, left(p_pagamento,30), left(p_obs,300));
  return true;
end $$;

-- o cliente acompanha a própria reserva pelo código
create or replace function public.rest_minha_reserva(p_codigo text) returns table (mesa text, data date, hora time, pessoas int, status text)
language sql stable security definer set search_path = public as $$
  select r.mesa, r.data, r.hora, r.pessoas, r.status from public.rest_reservas r where r.codigo = upper(trim(p_codigo)) $$;

-- o cliente cancela pelo código (a mesa volta a ficar livre na hora)
create or replace function public.rest_cancelar(p_codigo text) returns boolean
language sql security definer set search_path = public as $$
  update public.rest_reservas set status = 'cancelado' where codigo = upper(trim(p_codigo)) and status = 'reservado' returning true $$;

revoke all on function public.rest_agora() from public;
grant execute on function public.rest_agora() to anon, authenticated;
grant execute on function public.rest_indisponiveis(date,time,int), public.rest_reservar(text,date,time,int,text,text,text,int),
  public.rest_abrir_mesa(text,text), public.rest_chamar(text,text,text,jsonb,numeric,text,text), public.rest_minha_reserva(text), public.rest_cancelar(text) to anon, authenticated;

-- =====================================================================
-- Conta da equipe: crie em Authentication > Users e rode (troque o e-mail):
--   insert into public.rest_equipe (user_id, nome) select id, 'Salão' from auth.users where email = 'salao@seurestaurante.com.br' on conflict do nothing;
-- =====================================================================
