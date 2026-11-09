-- =====================================================================
-- Salão: mesas ao vivo para quem atende no local (pizzaria, churrascaria, hamburgueria).
-- A câmera do teto (pelo programa zivoop-camera, num computador do restaurante) diz se a mesa
-- está livre ou ocupada e se alguém em pé passou nela. Só números chegam aqui: nenhuma imagem
-- é guardada, a não ser a foto de calibração que o dono pede para marcar as mesas.
-- =====================================================================

create table if not exists public.zv_cameras (
  id uuid primary key default gen_random_uuid(),
  negocio uuid not null references public.zv_negocios on delete cascade,
  nome text not null default 'Câmera do salão',
  foto text,                                        -- jpeg pequeno (data URL) para marcar as mesas
  pedir_foto boolean not null default true,
  ultimo_sinal timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists zv_cam_neg on public.zv_cameras (negocio);
-- código do aparelho (sha256), numa tabela que o painel não lê
create table if not exists public.zv_camera_codigos (
  camera uuid primary key references public.zv_cameras on delete cascade,
  token_hash text not null unique
);
alter table public.zv_camera_codigos enable row level security;
revoke all on public.zv_camera_codigos from anon, authenticated;

create table if not exists public.zv_mesas (
  id uuid primary key default gen_random_uuid(),
  negocio uuid not null references public.zv_negocios on delete cascade,
  nome text not null,
  lugares int not null default 4 check (lugares between 1 and 40),
  forma text not null default 'redonda' check (forma in ('redonda','quadrada')),
  x real not null default .1, y real not null default .1,          -- posição na planta (0 a 1)
  camera uuid references public.zv_cameras on delete set null,
  zona jsonb,                                                        -- polígono na imagem da câmera [[x,y],...] (0 a 1)
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists zv_mesas_neg on public.zv_mesas (negocio, ordem);

create table if not exists public.zv_mesa_estado (
  mesa uuid primary key references public.zv_mesas on delete cascade,
  negocio uuid not null references public.zv_negocios on delete cascade,
  status text not null default 'livre' check (status in ('livre','ocupada')),
  pessoas int not null default 0,
  desde timestamptz,                    -- quando sentaram
  atendida_em timestamptz,              -- primeira vez que alguém atendeu
  origem text not null default 'manual' check (origem in ('manual','camera','qr')),
  atualizado timestamptz not null default now()
);

create table if not exists public.zv_fila (
  id uuid primary key default gen_random_uuid(),
  negocio uuid not null references public.zv_negocios on delete cascade,
  nome text not null, pessoas int not null default 2 check (pessoas between 1 and 40),
  whatsapp text,
  status text not null default 'esperando' check (status in ('esperando','sentou','desistiu')),
  mesa uuid references public.zv_mesas on delete set null,
  criado_em timestamptz not null default now(), sentou_em timestamptz
);
create index if not exists zv_fila_neg on public.zv_fila (negocio, status, criado_em);

create table if not exists public.zv_salao_eventos (
  id bigserial primary key,
  negocio uuid not null references public.zv_negocios on delete cascade,
  mesa uuid references public.zv_mesas on delete set null,
  tipo text not null check (tipo in ('sentou','atendida','saiu')),
  pessoas int not null default 0,
  espera_seg int,                        -- em 'atendida': quanto tempo esperaram; em 'saiu': quanto tempo ficaram
  em timestamptz not null default now()
);
create index if not exists zv_salao_ev on public.zv_salao_eventos (negocio, em);

do $$ declare t text; begin
  foreach t in array array['zv_cameras','zv_mesas','zv_mesa_estado','zv_fila','zv_salao_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists dono on public.%I', t);
    execute format('create policy dono on public.%I for all to authenticated using (public.zv_meu(negocio)) with check (public.zv_meu(negocio))', t);
  end loop;
end $$;
grant select, insert, update, delete on public.zv_cameras, public.zv_mesas, public.zv_mesa_estado, public.zv_fila, public.zv_salao_eventos to authenticated;
grant usage, select on sequence public.zv_salao_eventos_id_seq to authenticated;
revoke insert on public.zv_cameras from authenticated;  -- câmera nova só pelo zv_camera_nova

-- muda o estado de uma mesa e registra o evento (usado pelo painel e pela câmera)
create or replace function public.zv_mesa_muda(p_mesa uuid, p_status text, p_pessoas int, p_atendida boolean, p_origem text)
returns void language plpgsql security definer set search_path = public as $$
declare m zv_mesas; e zv_mesa_estado; agora timestamptz := now();
begin
  select * into m from zv_mesas where id = p_mesa; if not found then return; end if;
  insert into zv_mesa_estado (mesa, negocio) values (m.id, m.negocio) on conflict (mesa) do nothing;
  select * into e from zv_mesa_estado where mesa = m.id for update;
  if p_status = 'ocupada' and e.status = 'livre' then
    update zv_mesa_estado set status = 'ocupada', pessoas = greatest(coalesce(p_pessoas, 1), 1), desde = agora, atendida_em = case when p_atendida then agora end,
      origem = p_origem, atualizado = agora where mesa = m.id;
    insert into zv_salao_eventos (negocio, mesa, tipo, pessoas) values (m.negocio, m.id, 'sentou', greatest(coalesce(p_pessoas, 1), 1));
    -- quem estava na fila com esse tamanho de grupo e foi chamado para esta mesa, sentou
    update zv_fila set status = 'sentou', sentou_em = agora where mesa = m.id and status = 'esperando';
  elsif p_status = 'livre' and e.status = 'ocupada' then
    insert into zv_salao_eventos (negocio, mesa, tipo, pessoas, espera_seg) values (m.negocio, m.id, 'saiu', e.pessoas, extract(epoch from agora - e.desde)::int);
    update zv_mesa_estado set status = 'livre', pessoas = 0, desde = null, atendida_em = null, origem = p_origem, atualizado = agora where mesa = m.id;
    update zv_mesa_chamados set status = 'atendido', atendido_em = agora where mesa = m.id and status = 'aberto';
  elsif e.status = 'ocupada' then
    update zv_mesa_estado set pessoas = coalesce(nullif(p_pessoas, 0), pessoas), origem = p_origem, atualizado = agora where mesa = m.id;
  end if;
  if p_atendida and (select status from zv_mesa_estado where mesa = m.id) = 'ocupada' and (select atendida_em from zv_mesa_estado where mesa = m.id) is null then
    update zv_mesa_estado set atendida_em = agora where mesa = m.id;
    insert into zv_salao_eventos (negocio, mesa, tipo, pessoas, espera_seg)
      select m.negocio, m.id, 'atendida', pessoas, extract(epoch from agora - desde)::int from zv_mesa_estado where mesa = m.id;
  end if;
end $$;
revoke execute on function public.zv_mesa_muda(uuid, text, int, boolean, text) from public, anon, authenticated;

-- painel: o dono (ou garçom logado) muda a mesa na mão
create or replace function public.zv_mesa(p_mesa uuid, p_acao text, p_pessoas int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from zv_mesas where id = p_mesa and zv_meu(negocio)) then raise exception 'negado'; end if;
  if p_acao = 'sentou' then perform zv_mesa_muda(p_mesa, 'ocupada', coalesce(p_pessoas, 2), false, 'manual');
  elsif p_acao = 'atendi' then perform zv_mesa_muda(p_mesa, 'ocupada', null, true, 'manual');
  elsif p_acao = 'liberou' then perform zv_mesa_muda(p_mesa, 'livre', 0, false, 'manual');
  else raise exception 'acao_invalida'; end if;
end $$;
revoke execute on function public.zv_mesa(uuid, text, int) from public, anon;
grant execute on function public.zv_mesa(uuid, text, int) to authenticated;

-- painel: cria o código de uma câmera nova (aparece uma vez só)
create or replace function public.zv_camera_nova(p_negocio uuid, p_nome text default 'Câmera do salão')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare cod text := encode(gen_random_bytes(18), 'hex'); c zv_cameras;
begin
  if not zv_meu(p_negocio) then raise exception 'negado'; end if;
  insert into zv_cameras (negocio, nome) values (p_negocio, coalesce(nullif(trim(p_nome), ''), 'Câmera do salão')) returning * into c;
  insert into zv_camera_codigos (camera, token_hash) values (c.id, encode(digest(cod, 'sha256'), 'hex'));
  return jsonb_build_object('id', c.id, 'codigo', cod);
end $$;
revoke execute on function public.zv_camera_nova(uuid, text) from public, anon;
grant execute on function public.zv_camera_nova(uuid, text) to authenticated;

-- programa da câmera: pega a configuração (mesas e zonas desta câmera)
create or replace function public.zv_cam_config(p_codigo text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c zv_cameras;
begin
  select cam.* into c from zv_cameras cam join zv_camera_codigos k on k.camera = cam.id where k.token_hash = encode(digest(p_codigo, 'sha256'), 'hex');
  if not found then raise exception 'codigo_invalido'; end if;
  update zv_cameras set ultimo_sinal = now() where id = c.id;
  return jsonb_build_object('camera', c.id, 'nome', c.nome, 'pedir_foto', c.pedir_foto,
    'negocio', (select nome from zv_negocios where id = c.negocio),
    'mesas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'zona', zona) order by ordem, nome)
                         from zv_mesas where camera = c.id and zona is not null), '[]'));
end $$;

-- programa da câmera: manda o que viu em cada mesa (já com a tolerância aplicada no aparelho)
-- p_mesas = [{"id": "...", "status": "ocupada|livre", "pessoas": 3, "atendida": true}]
create or replace function public.zv_cam_estado(p_codigo text, p_mesas jsonb)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare c zv_cameras; item jsonb; n int := 0;
begin
  select cam.* into c from zv_cameras cam join zv_camera_codigos k on k.camera = cam.id where k.token_hash = encode(digest(p_codigo, 'sha256'), 'hex');
  if not found then raise exception 'codigo_invalido'; end if;
  update zv_cameras set ultimo_sinal = now() where id = c.id;
  for item in select * from jsonb_array_elements(coalesce(p_mesas, '[]')) loop
    if exists (select 1 from zv_mesas where id = (item->>'id')::uuid and camera = c.id) then
      perform zv_mesa_muda((item->>'id')::uuid, case when item->>'status' = 'ocupada' then 'ocupada' else 'livre' end,
        least(greatest(coalesce((item->>'pessoas')::int, 0), 0), 40), coalesce((item->>'atendida')::boolean, false), 'camera');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- programa da câmera: manda a foto de calibração (só quando o dono pede)
create or replace function public.zv_cam_foto(p_codigo text, p_foto text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if length(p_foto) > 400000 or p_foto not like 'data:image/jpeg;base64,%' then raise exception 'foto_invalida'; end if;
  update zv_cameras set foto = p_foto, pedir_foto = false, ultimo_sinal = now() where id = (select camera from zv_camera_codigos where token_hash = encode(digest(p_codigo, 'sha256'), 'hex'));
  if not found then raise exception 'codigo_invalido'; end if;
end $$;
grant execute on function public.zv_cam_config(text), public.zv_cam_estado(text, jsonb), public.zv_cam_foto(text, text) to anon, authenticated;

-- painel: horários de pico (sentadas por hora e dia da semana, horário de São Paulo) e tempos médios
create or replace function public.zv_salao_resumo(p_negocio uuid, p_dias int default 28)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not zv_meu(p_negocio) then raise exception 'negado'; end if;
  return jsonb_build_object(
    'por_hora', coalesce((select jsonb_agg(jsonb_build_object('h', h, 'fds', fds, 'n', n) order by fds, h) from (
       select extract(hour from em at time zone 'America/Sao_Paulo')::int h,
              extract(isodow from em at time zone 'America/Sao_Paulo') >= 6 fds, count(*) n
         from zv_salao_eventos where negocio = p_negocio and tipo = 'sentou' and em > now() - make_interval(days => p_dias) group by 1, 2) x), '[]'),
    'espera_media', (select round(avg(espera_seg)) from zv_salao_eventos where negocio = p_negocio and tipo = 'atendida' and em > now() - make_interval(days => p_dias)),
    'permanencia_media', (select round(avg(espera_seg)) from zv_salao_eventos where negocio = p_negocio and tipo = 'saiu' and em > now() - make_interval(days => p_dias)),
    'mesas_atendidas', (select count(*) from zv_salao_eventos where negocio = p_negocio and tipo = 'sentou' and em > now() - make_interval(days => p_dias)));
end $$;
revoke execute on function public.zv_salao_resumo(uuid, int) from public, anon;
grant execute on function public.zv_salao_resumo(uuid, int) to authenticated;


-- =====================================================================
-- QR code na mesa: o cliente abre o cardápio do site ligado à mesa e pede itens, chama o garçom ou pede a conta.
-- Cada mesa tem um código secreto (qr). Quem tem o código só consegue mexer naquela mesa.
-- =====================================================================
alter table public.zv_mesas add column if not exists qr text unique default encode(extensions.gen_random_bytes(12), 'hex');
update public.zv_mesas set qr = encode(extensions.gen_random_bytes(12), 'hex') where qr is null;
alter table public.zv_mesas drop constraint if exists zv_mesas_qr_tam;
alter table public.zv_mesas add constraint zv_mesas_qr_tam check (qr is null or qr ~ '^[a-f0-9]{16,64}$');
alter table public.zv_mesa_estado drop constraint if exists zv_mesa_estado_origem_check;
alter table public.zv_mesa_estado add constraint zv_mesa_estado_origem_check check (origem in ('manual','camera','qr'));

create table if not exists public.zv_mesa_chamados (
  id uuid primary key default gen_random_uuid(),
  negocio uuid not null references public.zv_negocios on delete cascade,
  mesa uuid not null references public.zv_mesas on delete cascade,
  tipo text not null check (tipo in ('garcom','conta','pedido')),
  pedido uuid references public.zv_pedidos on delete set null,
  detalhe text,
  status text not null default 'aberto' check (status in ('aberto','atendido')),
  criado_em timestamptz not null default now(), atendido_em timestamptz
);
create index if not exists zv_cham_neg on public.zv_mesa_chamados (negocio, status, criado_em);
create index if not exists zv_cham_mesa on public.zv_mesa_chamados (mesa, criado_em);
alter table public.zv_mesa_chamados enable row level security;
drop policy if exists dono on public.zv_mesa_chamados;
create policy dono on public.zv_mesa_chamados for all to authenticated using (public.zv_meu(negocio)) with check (public.zv_meu(negocio));
grant select, update, delete on public.zv_mesa_chamados to authenticated;
revoke all on public.zv_mesa_chamados from anon;

-- o que a mesa enxerga: nome, a conta desde que sentaram e o que já foi pedido ao garçom
create or replace function public.zv_mesa_qr(p_qr text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m zv_mesas; n zv_negocios; e zv_mesa_estado;
begin
  select * into m from zv_mesas where qr = lower(p_qr); if not found then raise exception 'mesa_invalida'; end if;
  select * into n from zv_negocios where id = m.negocio and status = 'ativo'; if not found then raise exception 'negocio_inexistente'; end if;
  select * into e from zv_mesa_estado where mesa = m.id;
  return jsonb_build_object('mesa', m.nome, 'slug', n.slug, 'ocupada', coalesce(e.status = 'ocupada', false),
    'conta', case when e.status = 'ocupada' then coalesce((select jsonb_agg(jsonb_build_object('numero', p.numero, 'itens', p.itens, 'total', p.total, 'etapa', p.etapa, 'em', p.criado_em) order by p.criado_em)
        from zv_pedidos p where p.negocio = m.negocio and p.detalhes->>'mesa' = m.id::text and p.etapa <> 'cancelado' and p.criado_em >= e.desde), '[]') else '[]' end,
    'chamados', coalesce((select jsonb_agg(distinct c.tipo) from zv_mesa_chamados c where c.mesa = m.id and c.status = 'aberto' and c.tipo <> 'pedido'), '[]'));
end $$;

-- pedido feito pela mesa: entra nos Pedidos do painel (com o nome da mesa) e acende a mesa no Salão
create or replace function public.zv_mesa_pedir(p_qr text, p_itens jsonb, p_total numeric, p_nome text default null, p_obs text default null)
returns int language plpgsql security definer set search_path = public as $$
declare m zv_mesas; v_num int; v_id uuid;
begin
  select mm.* into m from zv_mesas mm join zv_negocios n on n.id = mm.negocio and n.status = 'ativo' where mm.qr = lower(p_qr);
  if not found then raise exception 'mesa_invalida'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'sem_itens'; end if;
  if jsonb_array_length(p_itens) > 60 then raise exception 'itens_demais'; end if;
  if (select count(*) from zv_pedidos where negocio = m.negocio and detalhes->>'mesa' = m.id::text and criado_em > now() - interval '10 minutes') >= 6 then raise exception 'muitos_pedidos'; end if;
  perform zv_mesa_muda(m.id, 'ocupada', null, true, 'qr');
  perform pg_advisory_xact_lock(hashtext('zvped' || m.negocio));
  select coalesce(max(numero), 0) + 1 into v_num from zv_pedidos where negocio = m.negocio;
  insert into zv_pedidos (negocio, numero, nome, itens, total, entrega, detalhes)
  values (m.negocio, v_num, left(coalesce(nullif(trim(p_nome), ''), m.nome), 80), p_itens, greatest(coalesce(p_total, 0), 0), left(m.nome, 300),
    jsonb_build_object('mesa', m.id, 'mesa_nome', m.nome, 'origem', 'qr', 'obs', nullif(left(trim(coalesce(p_obs, '')), 300), '')))
  returning id into v_id;
  insert into zv_mesa_chamados (negocio, mesa, tipo, pedido, detalhe) values (m.negocio, m.id, 'pedido', v_id, 'Pedido nº ' || v_num);
  return v_num;
end $$;

-- chamar o garçom ou pedir a conta (repetir enquanto ninguém atendeu não cria outro chamado)
create or replace function public.zv_mesa_chamar(p_qr text, p_tipo text, p_detalhe text default null)
returns text language plpgsql security definer set search_path = public as $$
declare m zv_mesas;
begin
  select mm.* into m from zv_mesas mm join zv_negocios n on n.id = mm.negocio and n.status = 'ativo' where mm.qr = lower(p_qr);
  if not found then raise exception 'mesa_invalida'; end if;
  if p_tipo not in ('garcom', 'conta') then raise exception 'tipo_invalido'; end if;
  if exists (select 1 from zv_mesa_chamados where mesa = m.id and tipo = p_tipo and status = 'aberto') then
    update zv_mesa_chamados set detalhe = coalesce(left(p_detalhe, 60), detalhe) where mesa = m.id and tipo = p_tipo and status = 'aberto';
    return 'ja_chamado';
  end if;
  if (select count(*) from zv_mesa_chamados where mesa = m.id and criado_em > now() - interval '10 minutes') >= 12 then raise exception 'muitos_chamados'; end if;
  perform zv_mesa_muda(m.id, 'ocupada', null, false, 'qr');
  insert into zv_mesa_chamados (negocio, mesa, tipo, detalhe) values (m.negocio, m.id, p_tipo, left(p_detalhe, 60));
  return 'ok';
end $$;
revoke execute on function public.zv_mesa_qr(text), public.zv_mesa_pedir(text, jsonb, numeric, text, text), public.zv_mesa_chamar(text, text, text) from public;
grant execute on function public.zv_mesa_qr(text), public.zv_mesa_pedir(text, jsonb, numeric, text, text), public.zv_mesa_chamar(text, text, text) to anon, authenticated;
