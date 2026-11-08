-- =====================================================================
-- Vender mais: o que sai junto. Cada pedido ou agendamento é uma "cesta" de itens.
-- A partir das cestas, o banco calcula:
--   * no mesmo pedido: quem pede X também pede Y (para o "Leve junto" do site)
--   * o mesmo cliente: quem compra X, em algum momento, também compra Y (para oferecer a cada cliente)
-- Confiança = de quem levou X, quantos % levaram Y. Lift > 1 = sai junto mais do que o acaso.
-- =====================================================================

-- itens de cada pedido/agendamento (uso interno)
create or replace function public.zv_cestas(p_negocio uuid, p_dias int default 365)
returns table (cesta uuid, cliente uuid, quando timestamptz, item text, nome text)
language sql stable security definer set search_path = public as $$
  select p.id, p.cliente, p.criado_em, x->>'id', coalesce(nullif(x->>'nome', ''), x->>'id')
    from public.zv_pedidos p, jsonb_array_elements(case when jsonb_typeof(p.itens) = 'array' then p.itens else '[]'::jsonb end) x
   where p.negocio = p_negocio and p.etapa <> 'cancelado' and p.criado_em > now() - make_interval(days => p_dias) and coalesce(x->>'id', '') <> ''
  union all
  select a.id, a.cliente, a.inicio, x->>'id', coalesce(nullif(x->>'nome', ''), x->>'id')
    from public.zv_agendamentos a,
         jsonb_array_elements(case when jsonb_typeof(a.servicos) = 'array' and jsonb_array_length(a.servicos) > 0 then a.servicos
                                   when jsonb_typeof(a.detalhes->'servicos') = 'array' then a.detalhes->'servicos' else '[]'::jsonb end) x
   where a.negocio = p_negocio and a.status not in ('cancelado', 'faltou') and a.criado_em > now() - make_interval(days => p_dias) and coalesce(x->>'id', '') <> ''
$$;
revoke execute on function public.zv_cestas(uuid, int) from public, anon, authenticated;

-- pares de itens (uso interno; quem chama confere o dono)
create or replace function public.zv_pares(p_negocio uuid, p_modo text, p_dias int)
returns table (a text, a_nome text, b text, b_nome text, juntos int, base int, confianca numeric, lift numeric)
language sql stable security definer set search_path = public as $$
  with c0 as (select * from public.zv_cestas(p_negocio, p_dias)),
  nomes as (select item, (array_agg(nome order by quando desc))[1] nome from c0 group by item),
  c as (select distinct case when p_modo = 'cliente' then c0.cliente else c0.cesta end g, c0.item from c0 where p_modo <> 'cliente' or c0.cliente is not null),
  tot as (select greatest(count(distinct g), 1)::numeric n from c),
  f as (select item, count(distinct g)::int n from c group by item),
  par as (select x.item a, y.item b, count(*)::int j from c x join c y on x.g = y.g and x.item <> y.item group by 1, 2)
  select par.a, na.nome, par.b, nb.nome, par.j, fa.n,
         round(par.j * 100.0 / fa.n, 1), round((par.j::numeric / fa.n) / (fb.n / tot.n), 2)
    from par join f fa on fa.item = par.a join f fb on fb.item = par.b
         join nomes na on na.item = par.a join nomes nb on nb.item = par.b, tot
   where par.j >= 2
$$;
revoke execute on function public.zv_pares(uuid, text, int) from public, anon, authenticated;

-- painel do dono: as combinações mais fortes
create or replace function public.zv_combinacoes(p_negocio uuid, p_modo text default 'pedido', p_dias int default 365)
returns table (a text, a_nome text, b text, b_nome text, juntos int, base int, confianca numeric, lift numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  -- o dono logado só vê o próprio negócio; sem login só a service_role chega aqui (anon não tem permissão)
  if auth.uid() is not null and not exists (select 1 from public.zv_negocios where id = p_negocio and dono = auth.uid()) then raise exception 'negado'; end if;
  return query select * from public.zv_pares(p_negocio, case when p_modo = 'cliente' then 'cliente' else 'pedido' end, greatest(least(p_dias, 1095), 7)) x
    order by x.juntos desc, x.confianca desc limit 300;
end $$;

-- painel do dono: o que oferecer a cada cliente (o item mais provável que ele ainda não comprou)
create or replace function public.zv_ofertas_clientes(p_negocio uuid, p_min numeric default 20)
returns table (cliente uuid, nome text, whatsapp text, ultimo_em timestamptz, qtd int, item text, item_nome text, porque text, porque_nome text, confianca numeric, juntos int, base int)
language plpgsql stable security definer set search_path = public as $$
begin
  -- o dono logado só vê o próprio negócio; sem login só a service_role chega aqui (anon não tem permissão)
  if auth.uid() is not null and not exists (select 1 from public.zv_negocios where id = p_negocio and dono = auth.uid()) then raise exception 'negado'; end if;
  return query
  with pr as (select * from public.zv_pares(p_negocio, 'cliente', 365)),
  hist as (select distinct c.cliente, c.item from public.zv_cestas(p_negocio, 730) c where c.cliente is not null),
  cand as (select h.cliente, pr.b, pr.b_nome, pr.a, pr.a_nome, pr.confianca, pr.juntos, pr.base,
                  row_number() over (partition by h.cliente order by pr.confianca desc, pr.juntos desc, pr.lift desc) r
             from hist h join pr on pr.a = h.item
            where pr.confianca >= p_min and pr.base >= 3
              and not exists (select 1 from hist h2 where h2.cliente = h.cliente and h2.item = pr.b))
  select cl.id, cl.nome, cl.whatsapp, cl.ultimo_em, cl.qtd, cand.b, cand.b_nome, cand.a, cand.a_nome, cand.confianca, cand.juntos, cand.base
    from cand join public.zv_clientes cl on cl.id = cand.cliente and cl.negocio = p_negocio
   where cand.r = 1 and cl.etapa <> 'perdido'
   order by cand.confianca desc, cl.ultimo_em desc nulls last limit 300;
end $$;

-- site público: para cada item, o que mais sai junto no mesmo pedido (só ids e %; nada de cliente)
create or replace function public.zv_combos_site(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  with n as (select id from public.zv_negocios where slug = p_slug and status = 'ativo'),
  pr as (select x.* from n, public.zv_pares(n.id, 'pedido', 365) x where x.confianca >= 15 and x.base >= 3),
  r as (select a, b, confianca, row_number() over (partition by a order by confianca desc, juntos desc) k from pr)
  select coalesce(jsonb_object_agg(a, l), '{}'::jsonb) from (
    select a, jsonb_agg(jsonb_build_array(b, round(confianca)) order by k) l from r where k <= 4 group by a) t
$$;

grant execute on function public.zv_combinacoes(uuid, text, int), public.zv_ofertas_clientes(uuid, numeric) to authenticated;
revoke execute on function public.zv_combinacoes(uuid, text, int), public.zv_ofertas_clientes(uuid, numeric) from public, anon;
grant execute on function public.zv_combos_site(text) to anon, authenticated;
