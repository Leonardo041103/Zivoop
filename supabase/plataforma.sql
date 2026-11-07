-- =====================================================================
-- Zivoop Plataforma: todos os sites, pedidos, agendamentos, CRM e ERP num banco só.
-- Cada negócio é uma linha em zv_negocios; o dono só enxerga o que é dele (RLS).
-- =====================================================================
create extension if not exists btree_gist with schema extensions;

create table if not exists public.zv_modelos (
  nicho text primary key, tipo text not null check (tipo in ('pedido','agenda','reserva')),
  nome text not null, emoji text, padrao jsonb not null default '{}'
);
create table if not exists public.zv_negocios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  nicho text not null references public.zv_modelos, tipo text not null,
  nome text not null, dono uuid not null references auth.users on delete cascade,
  whatsapp_dono text, dados jsonb not null default '{}',
  status text not null default 'ativo' check (status in ('ativo','pausado')),
  plano text not null default 'teste', criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists zv_neg_dono on public.zv_negocios (dono);
create table if not exists public.zv_clientes (
  id uuid primary key default gen_random_uuid(), negocio uuid not null references public.zv_negocios on delete cascade,
  nome text not null, whatsapp text not null,
  etapa text not null default 'novo' check (etapa in ('novo','contato','cliente','fiel','perdido')),
  notas text, tags text[] not null default '{}', total_gasto numeric(12,2) not null default 0, qtd int not null default 0,
  ultimo_em timestamptz, criado_em timestamptz not null default now(), unique (negocio, whatsapp)
);
create table if not exists public.zv_pedidos (
  id uuid primary key default gen_random_uuid(), negocio uuid not null references public.zv_negocios on delete cascade,
  numero int not null, cliente uuid references public.zv_clientes on delete set null,
  nome text not null, whatsapp text, itens jsonb not null default '[]', total numeric(12,2) not null default 0,
  pagamento text, entrega text, detalhes jsonb not null default '{}',
  etapa text not null default 'novo' check (etapa in ('novo','preparo','pronto','entregue','cancelado')),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), unique (negocio, numero)
);
create table if not exists public.zv_agendamentos (
  id uuid primary key default gen_random_uuid(), negocio uuid not null references public.zv_negocios on delete cascade,
  numero int not null, cliente uuid references public.zv_clientes on delete set null,
  nome text not null, whatsapp text, servicos jsonb not null default '[]', total numeric(12,2) not null default 0,
  profissional text not null default '', inicio timestamptz not null, fim timestamptz not null check (fim > inicio),
  exclusivo boolean not null default true,
  status text not null default 'pendente' check (status in ('pendente','confirmado','atendido','faltou','cancelado')),
  obs text, detalhes jsonb not null default '{}', criado_em timestamptz not null default now(), unique (negocio, numero),
  constraint zv_sem_conflito exclude using gist (negocio with =, profissional with =, tstzrange(inicio, fim) with &&)
    where (exclusivo and status in ('pendente','confirmado'))
);
create index if not exists zv_ag_neg_inicio on public.zv_agendamentos (negocio, inicio);
create table if not exists public.zv_bloqueios (
  id uuid primary key default gen_random_uuid(), negocio uuid not null references public.zv_negocios on delete cascade,
  profissional text not null default '', inicio timestamptz not null, fim timestamptz not null check (fim > inicio), motivo text
);
create table if not exists public.zv_estoque (
  negocio uuid not null references public.zv_negocios on delete cascade, item text not null, nome text not null,
  qtd numeric(12,3) not null default 0, minimo numeric(12,3) not null default 0, custo numeric(12,2), primary key (negocio, item)
);
create table if not exists public.zv_lancamentos (
  id uuid primary key default gen_random_uuid(), negocio uuid not null references public.zv_negocios on delete cascade,
  tipo text not null check (tipo in ('entrada','saida')), valor numeric(12,2) not null check (valor > 0),
  categoria text not null default 'Vendas', descricao text, forma text, data date not null default (now() at time zone 'America/Sao_Paulo')::date,
  pedido uuid unique references public.zv_pedidos on delete cascade, agendamento uuid unique references public.zv_agendamentos on delete cascade,
  criado_em timestamptz not null default now()
);
create table if not exists public.zv_mensagens (
  id uuid primary key default gen_random_uuid(), negocio uuid references public.zv_negocios on delete cascade, dono uuid not null,
  papel text not null check (papel in ('dono','agente')), texto text not null, canal text not null default 'painel', criado_em timestamptz not null default now()
);

-- ------------------------------------------------------------- segurança
create or replace function public.zv_meu(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.zv_negocios where id = p and dono = auth.uid()) $$;
alter table public.zv_modelos enable row level security;
alter table public.zv_negocios enable row level security;
do $$ declare t text; begin
  foreach t in array array['zv_clientes','zv_pedidos','zv_agendamentos','zv_bloqueios','zv_estoque','zv_lancamentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists dono on public.%I', t);
    execute format('create policy dono on public.%I for all to authenticated using (public.zv_meu(negocio)) with check (public.zv_meu(negocio))', t);
  end loop; end $$;
alter table public.zv_mensagens enable row level security;
drop policy if exists dono on public.zv_mensagens; create policy dono on public.zv_mensagens for select to authenticated using (dono = auth.uid());
drop policy if exists le on public.zv_modelos; create policy le on public.zv_modelos for select to anon, authenticated using (true);
drop policy if exists dono_ve on public.zv_negocios; create policy dono_ve on public.zv_negocios for select to authenticated using (dono = auth.uid());
drop policy if exists dono_muda on public.zv_negocios; create policy dono_muda on public.zv_negocios for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());
-- o dono não troca slug, dono nem plano direto: isso passa pelas funções
revoke insert, update, delete on public.zv_negocios from anon, authenticated;
revoke insert, update, delete on public.zv_modelos from anon, authenticated;
revoke all on public.zv_mensagens from anon;
revoke insert, update, delete on public.zv_mensagens from authenticated;
grant update (nome, whatsapp_dono, dados, status) on public.zv_negocios to authenticated;

create or replace function public.zv_toca() returns trigger language plpgsql as $$ begin new.atualizado_em = now(); return new; end $$;
drop trigger if exists toca on public.zv_negocios; create trigger toca before update on public.zv_negocios for each row execute function public.zv_toca();
drop trigger if exists toca on public.zv_pedidos; create trigger toca before update on public.zv_pedidos for each row execute function public.zv_toca();

-- ------------------------------------------------------------- site público
create or replace function public.zv_site(p_slug text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', n.id, 'slug', n.slug, 'nicho', n.nicho, 'tipo', n.tipo, 'nome', n.nome, 'dados', n.dados, 'status', n.status)
  from public.zv_negocios n where n.slug = lower(p_slug) $$;

-- horários já tomados (sem dados pessoais) para o site esconder
create or replace function public.zv_ocupados(p_slug text, p_de date, p_dias int default 31)
returns table (profissional text, inicio timestamptz, fim timestamptz) language sql stable security definer set search_path = public as $$
  with n as (select id from public.zv_negocios where slug = lower(p_slug)),
  j as (select (p_de::timestamp at time zone 'America/Sao_Paulo') a, ((p_de + least(greatest(p_dias,1),62))::timestamp at time zone 'America/Sao_Paulo') b)
  select a.profissional, a.inicio, a.fim from public.zv_agendamentos a, n, j
   where a.negocio = n.id and a.status in ('pendente','confirmado') and a.inicio < j.b and a.fim > j.a
  union all
  select b.profissional, b.inicio, b.fim from public.zv_bloqueios b, n, j where b.negocio = n.id and b.inicio < j.b and b.fim > j.a $$;

create or replace function public.zv_cliente(p_neg uuid, p_nome text, p_zap text, p_valor numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; z text := regexp_replace(coalesce(p_zap,''),'\D','','g');
begin
  if z = '' then return null; end if;
  insert into public.zv_clientes (negocio, nome, whatsapp, qtd, ultimo_em) values (p_neg, left(trim(p_nome),80), z, 1, now())
  on conflict (negocio, whatsapp) do update set nome = excluded.nome, qtd = zv_clientes.qtd + 1, ultimo_em = now(),
     etapa = case when zv_clientes.etapa = 'novo' and zv_clientes.qtd >= 1 then 'cliente' when zv_clientes.etapa = 'cliente' and zv_clientes.qtd >= 4 then 'fiel' else zv_clientes.etapa end
  returning id into v; return v;
end $$;

create or replace function public.zv_novo_pedido(p_slug text, p_nome text, p_whatsapp text, p_itens jsonb, p_total numeric, p_pagamento text, p_entrega text, p_detalhes jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n public.zv_negocios; v_num int; z text := regexp_replace(coalesce(p_whatsapp,''),'\D','','g');
begin
  select * into n from public.zv_negocios where slug = lower(p_slug) and status = 'ativo';
  if n.id is null then raise exception 'negocio_inexistente'; end if;
  if coalesce(trim(p_nome),'') = '' then raise exception 'nome_obrigatorio'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'sem_itens'; end if;
  if z <> '' and (select count(*) from public.zv_pedidos where negocio = n.id and whatsapp = z and criado_em > now() - interval '1 hour') >= 8 then raise exception 'muitos_pedidos'; end if;
  perform pg_advisory_xact_lock(hashtext('zvped' || n.id));
  select coalesce(max(numero),0) + 1 into v_num from public.zv_pedidos where negocio = n.id;
  insert into public.zv_pedidos (negocio, numero, cliente, nome, whatsapp, itens, total, pagamento, entrega, detalhes)
  values (n.id, v_num, public.zv_cliente(n.id, p_nome, z, p_total), left(trim(p_nome),80), nullif(z,''), p_itens, greatest(coalesce(p_total,0),0), left(p_pagamento,60), left(p_entrega,300), coalesce(p_detalhes,'{}'));
  return v_num;
end $$;

-- agendamento com garantia: dois clientes nunca ficam no mesmo horário do mesmo profissional
create or replace function public.zv_agendar(p_slug text, p_inicio timestamptz, p_minutos int, p_prof text, p_nome text, p_whatsapp text, p_servicos jsonb, p_total numeric, p_obs text, p_detalhes jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n public.zv_negocios; v_num int; v_fim timestamptz; profs text[]; tenta text[]; p text; v_cli uuid; cap int; z text := regexp_replace(coalesce(p_whatsapp,''),'\D','','g');
begin
  select * into n from public.zv_negocios where slug = lower(p_slug) and status = 'ativo';
  if n.id is null then raise exception 'negocio_inexistente'; end if;
  if coalesce(trim(p_nome),'') = '' then raise exception 'nome_obrigatorio'; end if;
  if p_inicio < now() then raise exception 'horario_passado'; end if;
  if p_minutos not between 5 and 720 then raise exception 'duracao_invalida'; end if;
  if z <> '' and (select count(*) from public.zv_agendamentos where negocio = n.id and whatsapp = z and status = 'pendente' and inicio > now()) >= 3 then raise exception 'muitos_pendentes'; end if;
  v_fim := p_inicio + make_interval(mins => p_minutos);
  select coalesce(array_agg(coalesce(x->>'nome', x #>> '{}')), '{}') into profs from jsonb_array_elements(coalesce(n.dados #> '{config,profissionais}','[]')) x;
  cap := coalesce((n.dados #>> '{config,capacidade}')::int, 1);
  tenta := case when coalesce(trim(p_prof),'') <> '' then array[trim(p_prof)] when cardinality(profs) > 0 then profs else array[''] end;
  perform pg_advisory_xact_lock(hashtext('zvag' || n.id));
  v_cli := public.zv_cliente(n.id, p_nome, z, p_total);
  select coalesce(max(numero),0) + 1 into v_num from public.zv_agendamentos where negocio = n.id;
  foreach p in array tenta loop
    if exists (select 1 from public.zv_bloqueios b where b.negocio = n.id and (b.profissional = '' or b.profissional = p) and b.inicio < v_fim and b.fim > p_inicio) then continue; end if;
    if cap > 1 and (select count(*) from public.zv_agendamentos a where a.negocio = n.id and a.profissional = p and a.status in ('pendente','confirmado') and a.inicio < v_fim and a.fim > p_inicio) >= cap then continue; end if;
    begin
      insert into public.zv_agendamentos (negocio, numero, cliente, nome, whatsapp, servicos, total, profissional, inicio, fim, exclusivo, obs, detalhes)
      values (n.id, v_num, v_cli, left(trim(p_nome),80), nullif(z,''), coalesce(p_servicos,'[]'), greatest(coalesce(p_total,0),0), p, p_inicio, v_fim, cap <= 1, left(p_obs,300), coalesce(p_detalhes,'{}'));
      return jsonb_build_object('numero', v_num, 'profissional', p);
    exception when exclusion_violation then null;
    end;
  end loop;
  raise exception 'horario_ocupado';
end $$;

-- ------------------------------------------------------------- automações do ERP
create or replace function public.zv_pedido_mudou() returns trigger language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if new.etapa = 'entregue' and old.etapa is distinct from 'entregue' then
    insert into public.zv_lancamentos (negocio, tipo, valor, categoria, descricao, forma, pedido)
    select new.negocio, 'entrada', new.total, 'Vendas', 'Pedido nº ' || new.numero || ' · ' || new.nome, new.pagamento, new.id where new.total > 0
    on conflict (pedido) do nothing;
    for it in select * from jsonb_array_elements(new.itens) loop
      update public.zv_estoque set qtd = qtd - coalesce((it->>'qty')::numeric, 1) where negocio = new.negocio and item = it->>'id';
    end loop;
    update public.zv_clientes set total_gasto = total_gasto + new.total where id = new.cliente;
  end if;
  if new.etapa = 'cancelado' and old.etapa = 'entregue' then
    delete from public.zv_lancamentos where pedido = new.id;
    for it in select * from jsonb_array_elements(new.itens) loop
      update public.zv_estoque set qtd = qtd + coalesce((it->>'qty')::numeric, 1) where negocio = new.negocio and item = it->>'id';
    end loop;
    update public.zv_clientes set total_gasto = greatest(0, total_gasto - new.total) where id = new.cliente;
  end if;
  return new;
end $$;
drop trigger if exists erp on public.zv_pedidos; create trigger erp after update of etapa on public.zv_pedidos for each row execute function public.zv_pedido_mudou();

create or replace function public.zv_agenda_mudou() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'atendido' and old.status is distinct from 'atendido' then
    insert into public.zv_lancamentos (negocio, tipo, valor, categoria, descricao, agendamento)
    select new.negocio, 'entrada', new.total, 'Serviços', 'Atendimento nº ' || new.numero || ' · ' || new.nome, new.id where new.total > 0
    on conflict (agendamento) do nothing;
    update public.zv_clientes set total_gasto = total_gasto + new.total where id = new.cliente;
  end if;
  if old.status = 'atendido' and new.status <> 'atendido' then
    delete from public.zv_lancamentos where agendamento = new.id;
    update public.zv_clientes set total_gasto = greatest(0, total_gasto - new.total) where id = new.cliente;
  end if;
  return new;
end $$;
drop trigger if exists erp on public.zv_agendamentos; create trigger erp after update of status on public.zv_agendamentos for each row execute function public.zv_agenda_mudou();

-- ------------------------------------------------------------- criar o site (painel e agente)
create or replace function public.zv_slug(p text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(translate(p,'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),'[^a-z0-9]+','-','g')) $$;
create or replace function public.zv_criar_negocio(p_nicho text, p_nome text, p_whatsapp text, p_slug text default null) returns text
language plpgsql security definer set search_path = public as $$
declare m public.zv_modelos; s text; base text; k int := 1; z text := regexp_replace(coalesce(p_whatsapp,''),'\D','','g'); d jsonb;
begin
  if auth.uid() is null then raise exception 'sem_login'; end if;
  if (select count(*) from public.zv_negocios where dono = auth.uid()) >= 5 then raise exception 'limite_negocios'; end if;
  select * into m from public.zv_modelos where nicho = p_nicho; if m.nicho is null then raise exception 'modelo_inexistente'; end if;
  if coalesce(trim(p_nome),'') = '' then raise exception 'nome_obrigatorio'; end if;
  base := left(public.zv_slug(coalesce(nullif(p_slug,''), p_nome)), 36); if length(base) < 3 then base := base || '-' || m.nicho; end if; s := base;
  while exists (select 1 from public.zv_negocios where slug = s) or s in ('painel','modelos','api','admin','assets','login','entrar','zivoop') loop k := k + 1; s := base || '-' || k; end loop;
  d := m.padrao;
  d := jsonb_set(d, '{config}', coalesce(d->'config','{}') || jsonb_build_object('nome', trim(p_nome)) || case when z <> '' then jsonb_build_object('whatsapp', case when length(z) <= 11 then '55' || z else z end) else '{}'::jsonb end);
  insert into public.zv_negocios (slug, nicho, tipo, nome, dono, whatsapp_dono, dados) values (s, m.nicho, m.tipo, trim(p_nome), auth.uid(), nullif(z,''), d);
  return s;
end $$;

-- ------------------------------------------------------------- permissões das funções
revoke all on function public.zv_cliente(uuid,text,text,numeric) from public, anon, authenticated;
grant execute on function public.zv_site(text), public.zv_ocupados(text,date,int), public.zv_novo_pedido(text,text,text,jsonb,numeric,text,text,jsonb),
  public.zv_agendar(text,timestamptz,int,text,text,text,jsonb,numeric,text,jsonb) to anon, authenticated;
grant execute on function public.zv_criar_negocio(text,text,text,text) to authenticated;
revoke execute on function public.zv_criar_negocio(text,text,text,text) from anon;
revoke all on function public.zv_pedido_mudou(), public.zv_agenda_mudou(), public.zv_toca() from public, anon, authenticated;
revoke all on function public.zv_meu(uuid) from public, anon;
grant execute on function public.zv_meu(uuid) to authenticated;
