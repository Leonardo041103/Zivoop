-- Banco próprio do site de vendas (zivoop.com): só os contatos do formulário "Fale com a gente".
-- Ninguém de fora lê a tabela; o site grava só pela função zivoop_novo_lead, que valida os dados.
create table if not exists public.zivoop_leads (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  nome text not null check (char_length(nome) between 2 and 80),
  whatsapp text not null check (whatsapp ~ '^[0-9]{10,13}$'),
  negocio text check (char_length(negocio) <= 80),
  nicho text check (char_length(nicho) <= 40),
  cidade text check (char_length(cidade) <= 60),
  plano text check (char_length(plano) <= 30),
  mensagem text check (char_length(mensagem) <= 500),
  origem text check (char_length(origem) <= 120),
  status text not null default 'novo' check (status in ('novo','em_contato','fechado','perdido')),
  anotacoes text
);
create index if not exists zivoop_leads_criado on public.zivoop_leads (criado_em desc);
create index if not exists zivoop_leads_whats on public.zivoop_leads (whatsapp, criado_em desc);
alter table public.zivoop_leads enable row level security;
revoke all on public.zivoop_leads from anon, authenticated;

create or replace function public.zivoop_novo_lead(p_nome text, p_whatsapp text, p_negocio text, p_nicho text, p_cidade text, p_plano text, p_mensagem text, p_origem text)
returns boolean language plpgsql security definer set search_path = public as $$
declare w text := regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g');
begin
  if char_length(trim(coalesce(p_nome,''))) < 2 then raise exception 'nome_invalido'; end if;
  if w !~ '^[0-9]{10,13}$' then raise exception 'whatsapp_invalido'; end if;
  if (select count(*) from public.zivoop_leads where whatsapp = w and criado_em > now() - interval '1 day') >= 3 then
    return true; -- já recebemos; não duplica
  end if;
  if (select count(*) from public.zivoop_leads where criado_em > now() - interval '1 day') >= 300 then raise exception 'muitos_contatos'; end if;
  insert into public.zivoop_leads (nome, whatsapp, negocio, nicho, cidade, plano, mensagem, origem)
  values (left(trim(p_nome),80), w, left(trim(coalesce(p_negocio,'')),80), left(coalesce(p_nicho,''),40), left(trim(coalesce(p_cidade,'')),60), left(coalesce(p_plano,''),30), left(trim(coalesce(p_mensagem,'')),500), left(coalesce(p_origem,''),120));
  return true;
end $$;
revoke execute on function public.zivoop_novo_lead(text,text,text,text,text,text,text,text) from public;
grant execute on function public.zivoop_novo_lead(text,text,text,text,text,text,text,text) to anon, authenticated;
