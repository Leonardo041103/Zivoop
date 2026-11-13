-- Fotos dos produtos e serviços (pasta de cada negócio). Só o dono do negócio envia, troca ou apaga; qualquer um vê.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('zv-fotos', 'zv-fotos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "zv fotos dono envia" on storage.objects;
create policy "zv fotos dono envia" on storage.objects for insert to authenticated with check (
  bucket_id = 'zv-fotos' and exists (select 1 from public.zv_negocios n where n.id::text = (storage.foldername(name))[1] and n.dono = auth.uid()));
drop policy if exists "zv fotos dono troca" on storage.objects;
create policy "zv fotos dono troca" on storage.objects for update to authenticated using (
  bucket_id = 'zv-fotos' and exists (select 1 from public.zv_negocios n where n.id::text = (storage.foldername(name))[1] and n.dono = auth.uid()));
drop policy if exists "zv fotos dono apaga" on storage.objects;
create policy "zv fotos dono apaga" on storage.objects for delete to authenticated using (
  bucket_id = 'zv-fotos' and exists (select 1 from public.zv_negocios n where n.id::text = (storage.foldername(name))[1] and n.dono = auth.uid()));
