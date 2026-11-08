-- Zivoop Ofertas: posta ofertas de afiliado (Shopee, Mercado Livre, Amazon) nos grupos de WhatsApp do cliente.
-- O painel escreve com o login do cliente (RLS). O robô (VPS) usa a service_role.

create table if not exists fl_contas (
  dono uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  nome text not null default '',
  plano text not null default 'teste',               -- teste | mensal | anual (editável por você no Supabase)
  ativo_ate timestamptz not null default now() + interval '7 days',
  limite_numeros int not null default 2,
  limite_grupos int not null default 10,
  limite_dia int not null default 300,                -- mensagens por número por dia (protege contra banimento)
  modelo text not null default E'🔥 *{titulo}*\n\n{de}💰 *Por {por}*\n{cupom}\n🛒 {link}',
  intervalo_min int not null default 20,              -- segundos entre um grupo e outro
  intervalo_max int not null default 60,
  espaco_fila int not null default 30,                -- minutos entre ofertas da fila
  janela_ini int not null default 8,                  -- fila só posta entre 8h e 22h
  janela_fim int not null default 22,
  shopee_app_id text not null default '',
  shopee_segredo text not null default '',
  amazon_tag text not null default '',
  criado timestamptz not null default now(),
  constraint fl_intervalo check (intervalo_min >= 5 and intervalo_max >= intervalo_min),
  constraint fl_janela check (janela_ini between 0 and 23 and janela_fim between 1 and 24 and janela_fim > janela_ini)
);

create table if not exists fl_numeros (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null references auth.users(id) on delete cascade default auth.uid(),
  nome text not null default 'Meu número',
  status text not null default 'desconectado',        -- desconectado | aguardando_qr | conectado
  qr text,
  telefone text,
  atualizado timestamptz not null default now(),
  criado timestamptz not null default now()
);
alter table fl_numeros add column if not exists criado timestamptz not null default now();

create table if not exists fl_grupos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null references auth.users(id) on delete cascade,
  numero_id uuid not null references fl_numeros(id) on delete cascade,
  jid text not null,
  nome text not null default '',
  membros int not null default 0,
  admin boolean not null default true,
  ativo boolean not null default false,
  atualizado timestamptz not null default now(),
  unique (numero_id, jid)
);

create table if not exists fl_membros_dia (
  grupo_id uuid not null references fl_grupos(id) on delete cascade,
  dono uuid not null references auth.users(id) on delete cascade,
  dia date not null default current_date,
  membros int not null default 0,
  entradas int not null default 0,
  saidas int not null default 0,
  primary key (grupo_id, dia)
);

create table if not exists fl_ofertas (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null references auth.users(id) on delete cascade default auth.uid(),
  loja text not null default 'outra',                  -- shopee | mercadolivre | amazon | outra
  link text not null,
  link_afiliado text,
  titulo text not null default '',
  preco_de numeric(12,2),
  preco_por numeric(12,2),
  imagem text,
  cupom text not null default '',
  texto text,                                          -- se preenchido, substitui o modelo
  criado timestamptz not null default now()
);

create table if not exists fl_agendamentos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null references auth.users(id) on delete cascade default auth.uid(),
  oferta_id uuid not null references fl_ofertas(id) on delete cascade,
  quando timestamptz not null default now(),
  grupos uuid[],                                       -- null = todos os grupos ativos
  status text not null default 'pendente',             -- pendente | enviando | enviado | erro | cancelado
  enviados int not null default 0,
  total int not null default 0,
  erro text,
  criado timestamptz not null default now()
);
create index if not exists fl_ag_fila on fl_agendamentos (status, quando);

create table if not exists fl_envios (
  id bigserial primary key,
  dono uuid not null references auth.users(id) on delete cascade,
  agendamento_id uuid references fl_agendamentos(id) on delete set null,
  grupo_id uuid references fl_grupos(id) on delete set null,
  numero_id uuid references fl_numeros(id) on delete set null,
  ok boolean not null default true,
  erro text,
  em timestamptz not null default now()
);
create index if not exists fl_envios_dono on fl_envios (dono, em);

create table if not exists fl_comandos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null references auth.users(id) on delete cascade default auth.uid(),
  numero_id uuid references fl_numeros(id) on delete cascade,
  tipo text not null,                                  -- conectar | desconectar | sincronizar | ler_link | comissoes
  dados jsonb not null default '{}',
  status text not null default 'pendente',             -- pendente | ok | erro
  resposta jsonb,
  criado timestamptz not null default now(),
  constraint fl_tipo check (tipo in ('conectar','desconectar','sincronizar','ler_link','comissoes'))
);
create index if not exists fl_cmd_fila on fl_comandos (status, criado);

create table if not exists fl_comissoes (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null references auth.users(id) on delete cascade,
  loja text not null default 'shopee',
  pedido text not null,
  item text not null default '',
  produto text not null default '',
  valor numeric(12,2) not null default 0,
  comissao numeric(12,2) not null default 0,
  status text not null default 'pendente',             -- concluido | pendente | cancelado | nao_pago
  data timestamptz not null default now(),
  unique (dono, loja, pedido, item)
);

-- RLS: cada cliente só vê o que é dele
do $$ declare t text; begin
  foreach t in array array['fl_contas','fl_numeros','fl_grupos','fl_membros_dia','fl_ofertas','fl_agendamentos','fl_envios','fl_comandos','fl_comissoes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists dono_le on %I', t);
    execute format('create policy dono_le on %I for select to authenticated using (dono = auth.uid())', t);
  end loop;
end $$;
-- o que o cliente pode mudar pelo painel
drop policy if exists dono_cria on fl_contas;   create policy dono_cria on fl_contas for insert to authenticated with check (dono = auth.uid());
drop policy if exists dono_muda on fl_contas;   create policy dono_muda on fl_contas for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());
do $$ declare t text; begin
  foreach t in array array['fl_numeros','fl_ofertas','fl_agendamentos'] loop
    execute format('drop policy if exists dono_cria on %I', t);
    execute format('create policy dono_cria on %I for insert to authenticated with check (dono = auth.uid())', t);
    execute format('drop policy if exists dono_muda on %I', t);
    execute format('create policy dono_muda on %I for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid())', t);
    execute format('drop policy if exists dono_apaga on %I', t);
    execute format('create policy dono_apaga on %I for delete to authenticated using (dono = auth.uid())', t);
  end loop;
end $$;
drop policy if exists dono_muda on fl_grupos;   create policy dono_muda on fl_grupos for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());
drop policy if exists dono_cria on fl_comandos; create policy dono_cria on fl_comandos for insert to authenticated with check (dono = auth.uid() and status = 'pendente');

-- O cliente não muda o próprio plano, nem status de número/agendamento que é do robô
create or replace function fl_protege_conta() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    new.plano := old.plano; new.ativo_ate := old.ativo_ate; new.limite_numeros := old.limite_numeros;
    new.limite_grupos := old.limite_grupos; new.limite_dia := old.limite_dia;
  end if; return new; end $$;
drop trigger if exists fl_protege_conta on fl_contas;
create trigger fl_protege_conta before update on fl_contas for each row execute function fl_protege_conta();

create or replace function fl_protege_numero() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.status := 'desconectado'; new.qr := null; new.telefone := null;
      if (select count(*) from fl_numeros where dono = new.dono) >= coalesce((select limite_numeros from fl_contas where dono = new.dono), 2) then
        raise exception 'limite_numeros' using errcode = 'P0001'; end if;
    else new.status := old.status; new.qr := old.qr; new.telefone := old.telefone; end if;
  end if; new.atualizado := now(); return new; end $$;
drop trigger if exists fl_protege_numero on fl_numeros;
create trigger fl_protege_numero before insert or update on fl_numeros for each row execute function fl_protege_numero();

-- Grupo: o cliente só liga/desliga; limite de grupos ativos do plano
create or replace function fl_protege_grupo() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    new.jid := old.jid; new.nome := old.nome; new.membros := old.membros; new.admin := old.admin; new.numero_id := old.numero_id;
  end if;
  if new.ativo and not old.ativo and
     (select count(*) from fl_grupos where dono = new.dono and ativo and id <> new.id) >= coalesce((select limite_grupos from fl_contas where dono = new.dono), 10) then
    raise exception 'limite_grupos' using errcode = 'P0001'; end if;
  return new; end $$;
drop trigger if exists fl_protege_grupo on fl_grupos;
create trigger fl_protege_grupo before update on fl_grupos for each row execute function fl_protege_grupo();

create or replace function fl_protege_agendamento() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then new.status := 'pendente'; new.enviados := 0; new.total := 0; new.erro := null;
    else
      -- o cliente só pode cancelar, remarcar ou trocar grupos enquanto está pendente
      if old.status <> 'pendente' and new.status <> old.status then raise exception 'ja_enviado' using errcode = 'P0001'; end if;
      if new.status not in ('pendente','cancelado') then new.status := old.status; end if;
      new.enviados := old.enviados; new.total := old.total; new.erro := old.erro;
    end if;
  end if; return new; end $$;
drop trigger if exists fl_protege_agendamento on fl_agendamentos;
create trigger fl_protege_agendamento before insert or update on fl_agendamentos for each row execute function fl_protege_agendamento();

-- Próximo horário livre da fila (respeita o espaço entre ofertas e a janela do dia), no fuso de São Paulo
create or replace function fl_proximo_horario(p_dono uuid default auth.uid()) returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare c fl_contas; t timestamptz; ult timestamptz; h int;
begin
  if auth.uid() is not null and p_dono <> auth.uid() then raise exception 'negado'; end if;
  select * into c from fl_contas where dono = p_dono; if not found then return now(); end if;
  select max(quando) into ult from fl_agendamentos where dono = p_dono and status in ('pendente','enviando','enviado');
  t := greatest(now(), coalesce(ult + make_interval(mins => c.espaco_fila), now()));
  h := extract(hour from t at time zone 'America/Sao_Paulo');
  if h < c.janela_ini then
    t := (date_trunc('day', t at time zone 'America/Sao_Paulo') + make_interval(hours => c.janela_ini)) at time zone 'America/Sao_Paulo';
  elsif h >= c.janela_fim then
    t := (date_trunc('day', t at time zone 'America/Sao_Paulo') + interval '1 day' + make_interval(hours => c.janela_ini)) at time zone 'America/Sao_Paulo';
  end if;
  return t; end $$;

-- Números do painel: envios por dia no período
create or replace function fl_resumo(p_de timestamptz, p_ate timestamptz) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'enviadas', (select count(*) from fl_envios where dono = auth.uid() and ok and em between p_de and p_ate),
    'falhas', (select count(*) from fl_envios where dono = auth.uid() and not ok and em between p_de and p_ate),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', d, 'n', n) order by d) from (
        select (em at time zone 'America/Sao_Paulo')::date d, count(*) n from fl_envios
        where dono = auth.uid() and ok and em between p_de and p_ate group by 1) x), '[]'),
    'pendentes', (select count(*) from fl_agendamentos where dono = auth.uid() and status = 'pendente'))
$$;

-- Cria a conta no primeiro login
create or replace function fl_minha_conta() returns fl_contas language plpgsql security definer set search_path = public as $$
declare c fl_contas;
begin
  if auth.uid() is null then raise exception 'sem_login'; end if;
  insert into fl_contas (dono) values (auth.uid()) on conflict (dono) do nothing;
  select * into c from fl_contas where dono = auth.uid(); return c; end $$;

grant select, insert, update, delete on fl_contas, fl_numeros, fl_grupos, fl_membros_dia, fl_ofertas, fl_agendamentos, fl_envios, fl_comandos, fl_comissoes to authenticated;
grant usage, select on sequence fl_envios_id_seq to authenticated;
grant execute on function fl_proximo_horario(uuid), fl_resumo(timestamptz, timestamptz), fl_minha_conta() to authenticated;
revoke execute on function fl_proximo_horario(uuid), fl_resumo(timestamptz, timestamptz), fl_minha_conta() from public, anon;
