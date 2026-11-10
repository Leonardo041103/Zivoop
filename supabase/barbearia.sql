-- Zivoop Barbearia: o que só a barbearia usa (lista de espera, clube de assinatura e contas a pagar).
-- Roda no banco próprio da barbearia, depois de plataforma.sql, protecao.sql e modelos.sql.

-- lista de espera: quem não achou horário num dia pede para ser avisado se abrir vaga (por ordem de chegada)
create table if not exists public.zv_espera (
  id uuid primary key default gen_random_uuid(), negocio uuid not null references public.zv_negocios on delete cascade,
  nome text not null check (length(nome) between 1 and 80), whatsapp text not null check (length(whatsapp) between 8 and 20),
  dia date not null, profissional text not null default '' check (length(profissional) <= 60),
  status text not null default 'esperando' check (status in ('esperando','avisado','marcou','saiu')),
  avisado_em timestamptz, criado_em timestamptz not null default now()
);
create index if not exists zv_espera_neg_dia on public.zv_espera (negocio, dia, criado_em);
alter table public.zv_espera enable row level security;
drop policy if exists dono on public.zv_espera;
create policy dono on public.zv_espera for all to authenticated using (public.zv_meu(negocio)) with check (public.zv_meu(negocio));
grant select, insert, update, delete on public.zv_espera to authenticated;

create or replace function public.zv_entrar_espera(p_slug text, p_nome text, p_whatsapp text, p_dia date, p_prof text default '')
returns int language plpgsql security definer set search_path = public as $$
declare n zv_negocios; z text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'); pos int;
begin
  select * into n from zv_negocios where slug = p_slug and status = 'ativo'; if n.id is null then raise exception 'site_nao_encontrado'; end if;
  if length(z) < 10 or length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'dados_invalidos'; end if;
  if p_dia < (now() at time zone 'America/Sao_Paulo')::date or p_dia > (now() at time zone 'America/Sao_Paulo')::date + 62 then raise exception 'data_invalida'; end if;
  if (select count(*) from zv_espera where negocio = n.id and criado_em > now() - interval '10 minutes') >= 30 then raise exception 'muitos_pedidos'; end if;
  if not exists (select 1 from zv_espera where negocio = n.id and whatsapp = z and dia = p_dia and status = 'esperando') then
    insert into zv_espera (negocio, nome, whatsapp, dia, profissional) values (n.id, left(trim(p_nome), 80), z, p_dia, left(coalesce(p_prof, ''), 60));
  end if;
  select count(*) into pos from zv_espera where negocio = n.id and dia = p_dia and status = 'esperando'
    and criado_em <= (select criado_em from zv_espera where negocio = n.id and whatsapp = z and dia = p_dia and status = 'esperando' limit 1);
  return pos;   -- posição na fila
end $$;
revoke execute on function public.zv_entrar_espera(text, text, text, date, text) from public;
grant execute on function public.zv_entrar_espera(text, text, text, date, text) to anon, authenticated;

-- clube de assinatura: o cliente paga um valor fixo por mês (ex.: 4 cortes); o dono marca quando recebe
create table if not exists public.zv_assinantes (
  id uuid primary key default gen_random_uuid(), negocio uuid not null references public.zv_negocios on delete cascade,
  nome text not null check (length(nome) between 1 and 80), whatsapp text, plano text not null check (length(plano) between 1 and 60),
  valor numeric(12,2) not null check (valor >= 0), vence date not null, ativo boolean not null default true,
  usos int not null default 0, obs text, criado_em timestamptz not null default now()
);
create index if not exists zv_assin_neg on public.zv_assinantes (negocio, ativo, vence);
alter table public.zv_assinantes enable row level security;
drop policy if exists dono on public.zv_assinantes;
create policy dono on public.zv_assinantes for all to authenticated using (public.zv_meu(negocio)) with check (public.zv_meu(negocio));
grant select, insert, update, delete on public.zv_assinantes to authenticated;
create or replace function public.zv_trava_assinantes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from zv_assinantes where negocio = new.negocio) >= 2000 then raise exception 'assinantes_demais'; end if;
  return new;
end $$;
drop trigger if exists trava on public.zv_assinantes;
create trigger trava before insert on public.zv_assinantes for each row execute function public.zv_trava_assinantes();
revoke execute on function public.zv_trava_assinantes() from public, anon, authenticated;

-- recebeu a mensalidade: empurra o vencimento um mês, zera os usos do mês e lança a entrada no caixa
create or replace function public.zv_clube_receber(p_id uuid, p_forma text default 'Pix') returns date
language plpgsql security definer set search_path = public as $$
declare a zv_assinantes; nv date;
begin
  select * into a from zv_assinantes where id = p_id for update;
  if a.id is null or not zv_meu(a.negocio) then raise exception 'sem_permissao'; end if;
  nv := (greatest(a.vence, (now() at time zone 'America/Sao_Paulo')::date - 5) + interval '1 month')::date;
  update zv_assinantes set vence = nv, usos = 0, ativo = true where id = a.id;
  if a.valor > 0 then
    insert into zv_lancamentos (negocio, tipo, valor, categoria, descricao, forma) values (a.negocio, 'entrada', a.valor, 'Clube', 'Clube: ' || a.nome || ' (' || a.plano || ')', p_forma);
  end if;
  return nv;
end $$;
revoke execute on function public.zv_clube_receber(uuid, text) from public, anon;
grant execute on function public.zv_clube_receber(uuid, text) to authenticated;

-- contas a pagar (mesma ideia da lanchonete)
create table if not exists public.zv_contas (
  id uuid primary key default gen_random_uuid(), negocio uuid not null references public.zv_negocios on delete cascade,
  descricao text not null check (length(descricao) between 1 and 120), valor numeric(12,2) not null check (valor > 0),
  categoria text not null default 'Outros', vence date not null, pago_em date, mensal boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists zv_contas_neg_vence on public.zv_contas (negocio, vence);
alter table public.zv_contas enable row level security;
drop policy if exists dono on public.zv_contas;
create policy dono on public.zv_contas for all to authenticated using (public.zv_meu(negocio)) with check (public.zv_meu(negocio));
grant select, insert, update, delete on public.zv_contas to authenticated;
create or replace function public.zv_trava_contas() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from zv_contas where negocio = new.negocio and pago_em is null) >= 300 then raise exception 'contas_demais'; end if;
  return new;
end $$;
drop trigger if exists trava on public.zv_contas;
create trigger trava before insert on public.zv_contas for each row execute function public.zv_trava_contas();
revoke execute on function public.zv_trava_contas() from public, anon, authenticated;
create or replace function public.zv_pagar_conta(p_conta uuid, p_data date default null) returns void
language plpgsql security definer set search_path = public as $$
declare c zv_contas; d date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
begin
  select * into c from zv_contas where id = p_conta for update;
  if c.id is null or not zv_meu(c.negocio) then raise exception 'sem_permissao'; end if;
  if c.pago_em is not null then return; end if;
  update zv_contas set pago_em = d where id = c.id;
  insert into zv_lancamentos (negocio, tipo, valor, categoria, descricao, data) values (c.negocio, 'saida', c.valor, c.categoria, c.descricao, d);
  if c.mensal then
    insert into zv_contas (negocio, descricao, valor, categoria, vence, mensal) values (c.negocio, c.descricao, c.valor, c.categoria, (c.vence + interval '1 month')::date, true);
  end if;
end $$;
revoke execute on function public.zv_pagar_conta(uuid, date) from public, anon;
grant execute on function public.zv_pagar_conta(uuid, date) to authenticated;
