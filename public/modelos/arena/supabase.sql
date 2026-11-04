-- =====================================================================
-- Arena Zivoop: venda de ingressos por setor (lugar marcado ou geral),
-- Pix com reserva de 15 minutos, cota de meia-entrada e portaria com QR.
-- Cole no Supabase > SQL Editor > Run. Pode rodar de novo sem perder dados.
-- Os eventos e setores do dados.js são salvos aqui quando a equipe entra na portaria.
-- =====================================================================
create extension if not exists pgcrypto;

create table if not exists public.arena_eventos (
  id text primary key, titulo text not null, data date not null, hora time not null,
  cota_meia numeric not null default 0.4 check (cota_meia between 0 and 1)
);
create table if not exists public.arena_setores (
  evento text not null references public.arena_eventos on delete cascade,
  setor text not null, nome text not null, marcado boolean not null default false,
  capacidade int not null check (capacidade > 0), filas int, por_fila int, portao text,
  preco_inteira numeric(10,2) not null, preco_meia numeric(10,2) not null,
  primary key (evento, setor)
);
create table if not exists public.arena_ingressos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, pedido text not null,
  evento text not null, setor text not null, lugar text,
  tipo text not null check (tipo in ('inteira','meia')), preco numeric(10,2) not null,
  nome text not null, whatsapp text,
  status text not null default 'pendente' check (status in ('pendente','pago','usado','cancelado')),
  criado_em timestamptz not null default now(), expira_em timestamptz not null default now() + interval '15 minutes',
  usado_em timestamptz, portao_uso text,
  foreign key (evento, setor) references public.arena_setores (evento, setor) on delete cascade
);
create unique index if not exists arena_lugar_unico on public.arena_ingressos (evento, setor, lugar) where lugar is not null and status <> 'cancelado';
create index if not exists arena_ing_evento on public.arena_ingressos (evento, setor, status);
create index if not exists arena_ing_pedido on public.arena_ingressos (pedido);
create table if not exists public.arena_equipe (user_id uuid primary key references auth.users on delete cascade, nome text);

alter table public.arena_eventos   enable row level security;
alter table public.arena_setores   enable row level security;
alter table public.arena_ingressos enable row level security;
alter table public.arena_equipe    enable row level security;

create or replace function public.arena_e_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.arena_equipe where user_id = auth.uid()) $$;

do $$ declare t text; begin
  foreach t in array array['arena_eventos','arena_setores','arena_ingressos'] loop
    execute format('drop policy if exists equipe_tudo on public.%I', t);
    execute format('create policy equipe_tudo on public.%I for all to authenticated using (public.arena_e_equipe()) with check (public.arena_e_equipe())', t);
  end loop; end $$;
drop policy if exists equipe_se_ve on public.arena_equipe;
create policy equipe_se_ve on public.arena_equipe for select to authenticated using (user_id = auth.uid());

-- Pix não pago em 15 minutos: o lugar volta a ficar livre
create or replace function public.arena_limpar() returns void language sql security definer set search_path = public as $$
  update public.arena_ingressos set status = 'cancelado' where status = 'pendente' and expira_em < now() $$;

-- o que já foi vendido: lugares marcados um a um, setores gerais só a contagem
create or replace function public.arena_ocupacao(p_evento text) returns table (setor text, lugar text, n int)
language plpgsql security definer set search_path = public as $$
begin
  perform public.arena_limpar();
  return query select i.setor, i.lugar, count(*)::int from public.arena_ingressos i
    where i.evento = p_evento and i.status in ('pendente','pago','usado') group by i.setor, i.lugar;
end $$;

-- compra: p_itens = [{"setor":"central","lugar":"C12","tipo":"meia"}, {"setor":"leste","tipo":"inteira"}]
-- o preço sai da tabela de setores, nunca do navegador
create or replace function public.arena_comprar(p_evento text, p_itens jsonb, p_nome text, p_whatsapp text, p_minutos int default 15)
returns text language plpgsql security definer set search_path = public as $$
declare v_ev public.arena_eventos; v_set public.arena_setores; it jsonb; v_ped text; v_cod text; v_lug text; v_tipo text;
        v_cap_total int; v_meia int; v_novos_meia int; v_fila int; v_num int;
begin
  if coalesce(trim(p_nome),'') = '' then raise exception 'nome_obrigatorio'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) not between 1 and 8 then raise exception 'quantidade_invalida'; end if;
  select * into v_ev from public.arena_eventos where id = p_evento;
  if v_ev.id is null then raise exception 'evento_inexistente'; end if;
  if (v_ev.data + v_ev.hora) < (now() at time zone 'America/Sao_Paulo') then raise exception 'evento_passou'; end if;
  perform pg_advisory_xact_lock(hashtext('arena|' || p_evento));
  perform public.arena_limpar();
  if coalesce(p_whatsapp,'') <> '' and (select count(distinct pedido) from public.arena_ingressos where evento = p_evento and whatsapp = left(p_whatsapp,20) and status = 'pendente') >= 2 then raise exception 'muitos_pendentes'; end if;
  -- cota de meia-entrada sobre a capacidade à venda
  select coalesce(sum(capacidade),0) into v_cap_total from public.arena_setores where evento = p_evento;
  select count(*) into v_meia from public.arena_ingressos where evento = p_evento and tipo = 'meia' and status in ('pendente','pago','usado');
  select count(*) into v_novos_meia from jsonb_array_elements(p_itens) x where x->>'tipo' = 'meia';
  if v_meia + v_novos_meia > floor(v_cap_total * v_ev.cota_meia) then raise exception 'meia_esgotada'; end if;
  v_ped := substr(translate(upper(encode(gen_random_bytes(12),'base64')),'+/=0O1IL',''),1,8);
  for it in select * from jsonb_array_elements(p_itens) loop
    select * into v_set from public.arena_setores where evento = p_evento and setor = it->>'setor';
    if v_set.setor is null then raise exception 'setor_inexistente'; end if;
    v_tipo := coalesce(it->>'tipo','inteira'); if v_tipo not in ('inteira','meia') then raise exception 'tipo_invalido'; end if;
    v_lug := nullif(upper(trim(it->>'lugar')),'');
    if v_set.marcado then
      if v_lug is null or v_lug !~ '^[A-Z][0-9]{1,3}$' then raise exception 'lugar_invalido'; end if;
      v_fila := ascii(left(v_lug,1)) - 64; v_num := substr(v_lug,2)::int;
      if v_fila > v_set.filas or v_num < 1 or v_num > v_set.por_fila then raise exception 'lugar_invalido'; end if;
    else
      v_lug := null;
      if (select count(*) from public.arena_ingressos where evento = p_evento and setor = v_set.setor and status in ('pendente','pago','usado')) >= v_set.capacidade then raise exception 'setor_esgotado'; end if;
    end if;
    v_cod := substr(translate(upper(encode(gen_random_bytes(12),'base64')),'+/=0O1IL',''),1,6);
    begin
      insert into public.arena_ingressos (codigo, pedido, evento, setor, lugar, tipo, preco, nome, whatsapp, expira_em)
      values (v_cod, v_ped, p_evento, v_set.setor, v_lug, v_tipo, case when v_tipo = 'meia' then v_set.preco_meia else v_set.preco_inteira end,
              left(trim(p_nome),80), left(p_whatsapp,20), now() + make_interval(mins => least(greatest(p_minutos,5),60)));
    exception when unique_violation then raise exception 'lugar_ocupado:%', v_lug;
    end;
  end loop;
  return v_ped;
end $$;

-- o comprador acompanha o próprio pedido (Pix confirmado, ingressos liberados)
create or replace function public.arena_pedido(p_pedido text) returns table (codigo text, evento text, setor text, lugar text, tipo text, preco numeric, status text, expira_em timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public.arena_limpar();
  return query select i.codigo, i.evento, i.setor, i.lugar, i.tipo, i.preco, i.status, i.expira_em from public.arena_ingressos i where i.pedido = upper(trim(p_pedido)) order by i.setor, i.lugar;
end $$;

-- portaria: confere o QR e marca a entrada (só a equipe)
create or replace function public.arena_validar(p_codigo text, p_evento text, p_portao text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.arena_ingressos; v_port text;
begin
  if not public.arena_e_equipe() then raise exception 'sem_permissao'; end if;
  select * into v from public.arena_ingressos where codigo = upper(trim(p_codigo)) for update;
  if v.id is null then return jsonb_build_object('r','nao_existe'); end if;
  select portao into v_port from public.arena_setores where evento = v.evento and setor = v.setor;
  if v.evento <> p_evento then return jsonb_build_object('r','outro_evento','evento',v.evento); end if;
  if v.status = 'cancelado' then return jsonb_build_object('r','cancelado','setor',v.setor,'lugar',v.lugar); end if;
  if v.status = 'pendente' then return jsonb_build_object('r','nao_pago','setor',v.setor,'lugar',v.lugar,'preco',v.preco,'pedido',v.pedido); end if;
  if v.status = 'usado' then return jsonb_build_object('r','usado','setor',v.setor,'lugar',v.lugar,'usado_em',v.usado_em,'portao',v.portao_uso); end if;
  if coalesce(p_portao,'') <> '' and coalesce(v_port,'') <> '' and v_port <> p_portao then return jsonb_build_object('r','portao_errado','setor',v.setor,'lugar',v.lugar,'portao',v_port); end if;
  update public.arena_ingressos set status = 'usado', usado_em = now(), portao_uso = nullif(p_portao,'') where id = v.id;
  return jsonb_build_object('r','ok','setor',v.setor,'lugar',v.lugar,'tipo',v.tipo,'nome',v.nome);
end $$;

revoke all on function public.arena_limpar() from public, anon, authenticated;
grant execute on function public.arena_ocupacao(text), public.arena_comprar(text,jsonb,text,text,int), public.arena_pedido(text) to anon, authenticated;
grant execute on function public.arena_validar(text,text,text), public.arena_e_equipe() to authenticated;

-- =====================================================================
-- Conta da equipe da portaria: crie em Authentication > Users e rode (troque o e-mail):
--   insert into public.arena_equipe (user_id, nome) select id, 'Portaria' from auth.users where email = 'portaria@suaarena.com.br' on conflict do nothing;
-- =====================================================================
