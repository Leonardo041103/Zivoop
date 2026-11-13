-- Robô de atendimento no WhatsApp (barbearia primeiro). Roda no banco da barbearia, depois de barbearia.sql.
-- O robô só é chamado pelo servidor (Edge Function zv-robo, com a chave de serviço). O dono lê as conversas pelo painel.

-- canal do WhatsApp de cada negócio (a chave de acesso nunca volta para o navegador)
create table if not exists public.zv_canais (
  negocio uuid primary key references public.zv_negocios on delete cascade,
  tipo text not null default 'meta' check (tipo in ('meta','qr')),
  phone_id text, token text, numero text,
  qualidade text not null default 'GREEN',            -- nota do número na Meta (GREEN, YELLOW, RED)
  pausado boolean not null default false,              -- envios por iniciativa do robô parados (qualidade caiu ou o dono pausou)
  atualizado_em timestamptz not null default now()
);
alter table public.zv_canais enable row level security;   -- sem política: só o servidor lê
create unique index if not exists zv_canais_phone on public.zv_canais (phone_id) where phone_id is not null;

create or replace function public.zv_canal_status(p_neg uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.zv_meu(p_neg) then null else
    (select jsonb_build_object('tipo', tipo, 'numero', numero, 'ligado', phone_id is not null and token is not null, 'qualidade', qualidade, 'pausado', pausado,
       'final', right(coalesce(phone_id,''), 4)) from public.zv_canais where negocio = p_neg) end $$;
create or replace function public.zv_canal_salvar(p_neg uuid, p_phone_id text, p_token text, p_numero text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.zv_meu(p_neg) then raise exception 'sem_permissao'; end if;
  if coalesce(p_phone_id,'') !~ '^[0-9]{6,30}$' then raise exception 'phone_id_invalido'; end if;
  if length(coalesce(p_token,'')) < 20 then raise exception 'token_invalido'; end if;
  insert into public.zv_canais (negocio, tipo, phone_id, token, numero) values (p_neg, 'meta', p_phone_id, p_token, regexp_replace(coalesce(p_numero,''),'\D','','g'))
  on conflict (negocio) do update set tipo = 'meta', phone_id = excluded.phone_id, token = excluded.token, numero = excluded.numero, atualizado_em = now();
end $$;
create or replace function public.zv_canal_pausar(p_neg uuid, p_pausado boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.zv_meu(p_neg) then raise exception 'sem_permissao'; end if;
  update public.zv_canais set pausado = p_pausado, atualizado_em = now() where negocio = p_neg;
end $$;
revoke execute on function public.zv_canal_status(uuid), public.zv_canal_salvar(uuid,text,text,text), public.zv_canal_pausar(uuid,boolean) from public, anon;
grant execute on function public.zv_canal_status(uuid), public.zv_canal_salvar(uuid,text,text,text), public.zv_canal_pausar(uuid,boolean) to authenticated;

-- cada cliente que conversa com o robô
create table if not exists public.zv_bot_contatos (
  negocio uuid not null references public.zv_negocios on delete cascade,
  whatsapp text not null, nome text,
  estado jsonb not null default '{}',                  -- em que parte da conversa ele está
  humano_ate timestamptz,                              -- o dono assumiu: o robô fica quieto até esta hora
  optout boolean not null default false,               -- pediu para não receber mensagens (SAIR)
  ultima_in timestamptz, ultima_out timestamptz,       -- janela de 24h do WhatsApp
  proativas_dia date, proativas int not null default 0, -- no máximo 1 mensagem por iniciativa do robô por dia
  criado_em timestamptz not null default now(),
  primary key (negocio, whatsapp)
);
alter table public.zv_bot_contatos enable row level security;
drop policy if exists dono on public.zv_bot_contatos;
create policy dono on public.zv_bot_contatos for select to authenticated using (public.zv_meu(negocio));
drop policy if exists dono_upd on public.zv_bot_contatos;
create policy dono_upd on public.zv_bot_contatos for update to authenticated using (public.zv_meu(negocio)) with check (public.zv_meu(negocio));
grant select, update on public.zv_bot_contatos to authenticated;

-- histórico das mensagens (o painel mostra as conversas)
create table if not exists public.zv_bot_msgs (
  id bigint generated always as identity primary key,
  negocio uuid not null references public.zv_negocios on delete cascade,
  whatsapp text not null, dir text not null check (dir in ('in','out','dono')), texto text not null,
  wa_id text, criado_em timestamptz not null default now()
);
create unique index if not exists zv_bot_msgs_wa on public.zv_bot_msgs (negocio, wa_id) where wa_id is not null;   -- a Meta às vezes repete a mesma mensagem
create index if not exists zv_bot_msgs_conv on public.zv_bot_msgs (negocio, whatsapp, criado_em desc);
alter table public.zv_bot_msgs enable row level security;
drop policy if exists dono on public.zv_bot_msgs;
create policy dono on public.zv_bot_msgs for select to authenticated using (public.zv_meu(negocio));
grant select on public.zv_bot_msgs to authenticated;

-- fila de mensagens que o robô manda por iniciativa própria (lembrete, vaga que abriu), uma por vez
create table if not exists public.zv_bot_fila (
  id uuid primary key default gen_random_uuid(),
  negocio uuid not null references public.zv_negocios on delete cascade,
  whatsapp text not null, tipo text not null check (tipo in ('lembrete','vaga','voltar','aviso')),
  texto text not null, modelo jsonb,                   -- modelo aprovado pela Meta para quando a janela de 24h está fechada
  ref text, enviar_apos timestamptz not null default now(), expira timestamptz,
  status text not null default 'fila' check (status in ('fila','enviado','pulado','erro')),
  motivo text, criado_em timestamptz not null default now()
);
create unique index if not exists zv_bot_fila_ref on public.zv_bot_fila (negocio, tipo, ref) where ref is not null;
create index if not exists zv_bot_fila_pend on public.zv_bot_fila (status, enviar_apos);
alter table public.zv_bot_fila enable row level security;
drop policy if exists dono on public.zv_bot_fila;
create policy dono on public.zv_bot_fila for select to authenticated using (public.zv_meu(negocio));
grant select on public.zv_bot_fila to authenticated;

-- o cliente quer ser avisado se abrir vaga mais cedo (pergunta feita ao marcar)
alter table public.zv_agendamentos add column if not exists antecipar boolean not null default false;

-- horário desmarcado (pelo site, pelo painel ou pelo robô): o robô oferece a vaga ao próximo da fila
create table if not exists public.zv_bot_vagas (
  id uuid primary key default gen_random_uuid(), negocio uuid not null references public.zv_negocios on delete cascade,
  agendamento uuid, profissional text not null default '', inicio timestamptz not null, fim timestamptz not null,
  status text not null default 'nova' check (status in ('nova','feita')), criado_em timestamptz not null default now()
);
create index if not exists zv_bot_vagas_nova on public.zv_bot_vagas (negocio, status);
alter table public.zv_bot_vagas enable row level security;
create or replace function public.zv_vaga_abriu() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelado' and old.status in ('pendente','confirmado') and new.inicio > now() + interval '45 minutes' then
    insert into public.zv_bot_vagas (negocio, agendamento, profissional, inicio, fim) values (new.negocio, new.id, coalesce(new.profissional,''), new.inicio, new.fim);
  end if;
  return new;
end $$;
drop trigger if exists vaga_abriu on public.zv_agendamentos;
create trigger vaga_abriu after update of status on public.zv_agendamentos for each row execute function public.zv_vaga_abriu();
revoke execute on function public.zv_vaga_abriu() from public, anon, authenticated;

-- etapa da conversa em coluna própria (para achar rápido quem está respondendo uma oferta de vaga)
alter table public.zv_bot_contatos add column if not exists etapa text generated always as (estado->>'etapa') stored;
create index if not exists zv_bot_contatos_etapa on public.zv_bot_contatos (negocio, etapa) where etapa is not null;
