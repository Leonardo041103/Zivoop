-- Zivoop Lanchonete: o que só a lanchonete usa (receita de cada lanche, contas a pagar, fidelidade e entregas).
-- Roda no banco da lanchonete (projeto zivoop-pedidos), depois de plataforma.sql.

-- receita (ficha técnica): quanto de cada insumo do estoque vai em cada item do cardápio.
-- Quando o pedido é entregue, o estoque baixa pelos insumos da receita; item sem receita baixa ele mesmo (como antes).
create table if not exists public.zv_fichas (
  negocio uuid not null references public.zv_negocios on delete cascade,
  item text not null, insumo text not null, qtd numeric(12,3) not null check (qtd > 0),
  primary key (negocio, item, insumo)
);
alter table public.zv_fichas enable row level security;
drop policy if exists dono on public.zv_fichas;
create policy dono on public.zv_fichas for all to authenticated using (public.zv_meu(negocio)) with check (public.zv_meu(negocio));

-- unidade de medida dos insumos (un, g, kg, ml, L, fatia…)
alter table public.zv_estoque add column if not exists un text not null default 'un' check (length(un) <= 12);

-- contas a pagar: o que vence e o que já foi pago (ao pagar, vira saída no caixa)
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
create or replace function public.zv_trava_contas() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from zv_contas where negocio = new.negocio and pago_em is null) >= 300 then raise exception 'contas_demais'; end if;
  return new;
end $$;
drop trigger if exists trava on public.zv_contas;
create trigger trava before insert on public.zv_contas for each row execute function public.zv_trava_contas();
revoke execute on function public.zv_trava_contas() from public, anon, authenticated;

-- pagar uma conta: marca paga, lança a saída no caixa e, se for mensal, já cria a do mês seguinte
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

-- fidelidade: quantos prêmios o cliente já usou (os pedidos entregues contam como selos)
alter table public.zv_clientes add column if not exists premios_usados int not null default 0;
alter table public.zv_clientes add column if not exists selos int not null default 0;  -- pedidos entregues

-- baixa do estoque pela receita
create or replace function public.zv_baixa_estoque(p_negocio uuid, p_itens jsonb, p_sinal int) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb; q numeric;
begin
  for it in select * from jsonb_array_elements(p_itens) loop
    q := coalesce((it->>'qty')::numeric, 1) * p_sinal;
    if exists (select 1 from zv_fichas where negocio = p_negocio and item = it->>'id') then
      update zv_estoque e set qtd = e.qtd - f.qtd * q from zv_fichas f
       where f.negocio = p_negocio and f.item = it->>'id' and e.negocio = p_negocio and e.item = f.insumo;
    else
      update zv_estoque set qtd = qtd - q where negocio = p_negocio and item = it->>'id';
    end if;
  end loop;
end $$;
revoke execute on function public.zv_baixa_estoque(uuid, jsonb, int) from public, anon, authenticated;

create or replace function public.zv_pedido_mudou() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.etapa = 'entregue' and old.etapa is distinct from 'entregue' then
    insert into public.zv_lancamentos (negocio, tipo, valor, categoria, descricao, forma, pedido)
    select new.negocio, 'entrada', new.total, 'Vendas', 'Pedido nº ' || new.numero || ' · ' || new.nome, new.pagamento, new.id where new.total > 0
    on conflict (pedido) do nothing;
    perform public.zv_baixa_estoque(new.negocio, new.itens, 1);
    update public.zv_clientes set total_gasto = total_gasto + new.total, selos = selos + 1 where id = new.cliente;
  end if;
  if new.etapa = 'cancelado' and old.etapa = 'entregue' then
    delete from public.zv_lancamentos where pedido = new.id;
    perform public.zv_baixa_estoque(new.negocio, new.itens, -1);
    update public.zv_clientes set total_gasto = greatest(0, total_gasto - new.total), selos = greatest(0, selos - 1) where id = new.cliente;
  end if;
  return new;
end $$;

grant select, insert, update, delete on public.zv_fichas, public.zv_contas to authenticated;
