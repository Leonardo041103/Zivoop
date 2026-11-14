-- Outros canais do robô: Instagram Direct, Messenger e Telegram. Roda no banco da barbearia, depois de robo.sql.
-- A chave de cada canal fica só no servidor (sem política de leitura); o painel vê só o nome e se está ligado.

create table if not exists public.zv_canais_ext (
  negocio uuid not null references public.zv_negocios on delete cascade,
  tipo text not null check (tipo in ('instagram', 'messenger', 'telegram')),
  ext_id text not null,                 -- conta do Instagram, página do Facebook ou id do robô do Telegram
  pagina text,                          -- página do Facebook (o Instagram responde por ela)
  nome text,                            -- @do Instagram, nome da página ou @ do robô
  token text not null, segredo text,    -- segredo: senha que o Telegram manda em cada aviso
  ativo boolean not null default true, atualizado_em timestamptz not null default now(),
  primary key (negocio, tipo)
);
alter table public.zv_canais_ext enable row level security;
create unique index if not exists zv_canais_ext_conta on public.zv_canais_ext (tipo, ext_id);

create or replace function public.zv_canais_ext_status(p_neg uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.zv_meu(p_neg) then null else
    coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'nome', nome, 'ativo', ativo) order by tipo) from public.zv_canais_ext where negocio = p_neg), '[]'::jsonb) end $$;
revoke execute on function public.zv_canais_ext_status(uuid) from public, anon;
grant execute on function public.zv_canais_ext_status(uuid) to authenticated;

-- quem conversa por outro canal: a conversa é guardada como "ig:123" / "fb:123" / "tg:123", com o WhatsApp do cliente ao lado
alter table public.zv_bot_contatos add column if not exists canal text not null default 'whatsapp';
alter table public.zv_bot_contatos add column if not exists ext_id text;
alter table public.zv_bot_contatos add column if not exists telefone text;
alter table public.zv_bot_contatos add column if not exists fone_ok boolean not null default false;   -- número veio do próprio canal (confirmado)
alter table public.zv_bot_contatos add column if not exists pendente text;                            -- o que pediu antes de mandar o número
alter table public.zv_bot_msgs add column if not exists canal text not null default 'whatsapp';
