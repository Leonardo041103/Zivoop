-- =====================================================================
-- Cinema Zivoop: ingressos com QR code, Pix e leitor da porta.
-- Cole tudo no Supabase > SQL Editor > Run. Pode rodar de novo sem perder dados.
-- =====================================================================
create extension if not exists pgcrypto;

create table if not exists public.cine_ingressos (
  id         uuid primary key default gen_random_uuid(),
  pedido     uuid not null,
  codigo     text not null unique,
  sessao     text not null,              -- "filme|AAAA-MM-DD|HH:MM"
  data       date not null,
  filme      text not null,
  titulo     text,
  hora       text not null,
  poltrona   text not null,
  tipo       text not null default 'inteira',
  valor      numeric(10,2) not null check (valor >= 0),
  nome       text,
  whatsapp   text,
  status     text not null default 'reservado' check (status in ('reservado','pago','cancelado')),
  criado_em  timestamptz not null default now(),
  pago_em    timestamptz,
  usado_em   timestamptz
);
-- a mesma poltrona não pode ser vendida duas vezes na mesma sessão
create unique index if not exists cine_lugar_unico on public.cine_ingressos (sessao, poltrona) where status <> 'cancelado';
create index if not exists cine_por_sessao on public.cine_ingressos (sessao);
create index if not exists cine_por_data on public.cine_ingressos (data);

-- quem trabalha na portaria/bilheteria (contas criadas em Authentication > Users)
create table if not exists public.cine_equipe (
  user_id uuid primary key references auth.users on delete cascade,
  nome    text
);

alter table public.cine_ingressos enable row level security;
alter table public.cine_equipe    enable row level security;

create or replace function public.cine_e_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cine_equipe where user_id = auth.uid())
$$;

-- clientes (anon) NÃO leem a tabela: só usam as funções abaixo. A equipe lê e altera.
drop policy if exists cine_equipe_le      on public.cine_ingressos;
drop policy if exists cine_equipe_altera  on public.cine_ingressos;
drop policy if exists cine_equipe_se_ve   on public.cine_equipe;
create policy cine_equipe_le     on public.cine_ingressos for select to authenticated using (public.cine_e_equipe());
create policy cine_equipe_altera on public.cine_ingressos for update to authenticated using (public.cine_e_equipe()) with check (public.cine_e_equipe());
create policy cine_equipe_se_ve  on public.cine_equipe    for select to authenticated using (user_id = auth.uid());

-- Pix não pago em 15 minutos libera a poltrona (mude o intervalo se quiser)
create or replace function public.cine_limpar(p_sessao text) returns void
language sql security definer set search_path = public as $$
  update public.cine_ingressos set status = 'cancelado'
   where sessao = p_sessao and status = 'reservado' and criado_em < now() - interval '15 minutes'
$$;

-- poltronas ocupadas de uma sessão (só o número da poltrona, nada pessoal)
create or replace function public.cine_ocupadas(p_sessao text) returns setof text
language plpgsql security definer set search_path = public as $$
begin
  perform public.cine_limpar(p_sessao);
  return query select i.poltrona from public.cine_ingressos i where i.sessao = p_sessao and i.status <> 'cancelado';
end $$;

-- quantos lugares vendidos em cada sessão (para mostrar "X livres")
create or replace function public.cine_lotacao(p_sessoes text[]) returns table (sessao text, vendidos int)
language sql stable security definer set search_path = public as $$
  select i.sessao, count(*)::int from public.cine_ingressos i
   where i.sessao = any (p_sessoes) and i.status <> 'cancelado'
     and not (i.status = 'reservado' and i.criado_em < now() - interval '15 minutes')
   group by i.sessao
$$;

-- reserva várias poltronas de uma vez: ou todas, ou nenhuma
create or replace function public.cine_reservar(
  p_sessao text, p_data date, p_filme text, p_titulo text, p_hora text,
  p_itens jsonb, p_nome text, p_whatsapp text
) returns table (poltrona text, codigo text, valor numeric, pedido uuid)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_pedido uuid := gen_random_uuid();
  v_it jsonb; v_cod text; v_ocup text;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) not between 1 and 8 then
    raise exception 'quantidade_invalida';
  end if;
  if p_data < current_date then raise exception 'sessao_passada'; end if;
  if coalesce(trim(p_nome),'') = '' then raise exception 'nome_obrigatorio'; end if;
  perform pg_advisory_xact_lock(hashtext(p_sessao));
  perform public.cine_limpar(p_sessao);
  select string_agg(i.poltrona, ',') into v_ocup
    from public.cine_ingressos i join jsonb_array_elements(p_itens) e on i.poltrona = e->>'poltrona'
   where i.sessao = p_sessao and i.status <> 'cancelado';
  if v_ocup is not null then raise exception 'ocupada:%', v_ocup; end if;
  for v_it in select * from jsonb_array_elements(p_itens) loop
    v_cod := substr(translate(upper(encode(gen_random_bytes(12), 'base64')), '+/=0O1IL', ''), 1, 6);
    insert into public.cine_ingressos (pedido, codigo, sessao, data, filme, titulo, hora, poltrona, tipo, valor, nome, whatsapp)
    values (v_pedido, v_cod, p_sessao, p_data, p_filme, left(p_titulo, 120), p_hora, v_it->>'poltrona',
            coalesce(v_it->>'tipo', 'inteira'), (v_it->>'valor')::numeric, left(trim(p_nome), 80), left(p_whatsapp, 20));
    poltrona := v_it->>'poltrona'; codigo := v_cod; valor := (v_it->>'valor')::numeric; pedido := v_pedido;
    return next;
  end loop;
end $$;

-- o cliente consulta só os ingressos dos códigos que ele tem
create or replace function public.cine_status(p_codigos text[]) returns table (codigo text, status text, usado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select i.codigo, case when i.status = 'reservado' and i.criado_em < now() - interval '15 minutes' then 'cancelado' else i.status end, i.usado_em
    from public.cine_ingressos i where i.codigo = any (p_codigos)
$$;

-- portaria: valida e marca a entrada numa única operação (duas portas não liberam o mesmo ingresso)
create or replace function public.cine_validar(p_codigo text, p_sessao text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.cine_ingressos; u timestamptz;
begin
  if not public.cine_e_equipe() then raise exception 'sem_permissao'; end if;
  select * into r from public.cine_ingressos where codigo = upper(trim(p_codigo));
  if not found then return jsonb_build_object('r','nao_encontrado'); end if;
  if r.status = 'cancelado' then return jsonb_build_object('r','cancelado','poltrona',r.poltrona); end if;
  if r.sessao <> p_sessao then return jsonb_build_object('r','outra_sessao','poltrona',r.poltrona,'sessao',r.sessao,'titulo',r.titulo,'hora',r.hora,'data',r.data); end if;
  if r.status = 'reservado' then return jsonb_build_object('r','nao_pago','poltrona',r.poltrona,'valor',r.valor,'pedido',r.pedido); end if;
  update public.cine_ingressos set usado_em = now() where id = r.id and usado_em is null returning usado_em into u;
  if u is null then return jsonb_build_object('r','usado','poltrona',r.poltrona,'usado_em',r.usado_em); end if;
  return jsonb_build_object('r','ok','poltrona',r.poltrona,'tipo',r.tipo,'titulo',r.titulo,'hora',r.hora,'nome',r.nome);
end $$;

revoke all on function public.cine_limpar(text)        from public, anon, authenticated;
revoke all on function public.cine_validar(text, text) from public, anon;
grant execute on function public.cine_validar(text, text) to authenticated;
grant execute on function public.cine_ocupadas(text), public.cine_lotacao(text[]), public.cine_status(text[]),
  public.cine_reservar(text, date, text, text, text, jsonb, text, text) to anon, authenticated;

-- =====================================================================
-- Depois de criar a conta da portaria em Authentication > Users, rode
-- (troque o e-mail):
--   insert into public.cine_equipe (user_id, nome)
--   select id, 'Portaria' from auth.users where email = 'portaria@seucinema.com.br'
--   on conflict do nothing;
-- =====================================================================
