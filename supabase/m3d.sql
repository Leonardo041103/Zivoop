-- Modelos 3D dos produtos (botão "Ver em 3D / Ver na sua mesa" nos sites).
-- Armazenamento separado das fotos: só arquivos .glb de até 15 MB, até 60 por negócio, cada dono só mexe na pasta do próprio negócio.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('zv-3d', 'zv-3d', true, 15728640, array['model/gltf-binary', 'application/octet-stream'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "zv 3d dono envia" on storage.objects;
create policy "zv 3d dono envia" on storage.objects for insert to authenticated with check (
  bucket_id = 'zv-3d'
  and exists (select 1 from public.zv_negocios n where n.id::text = (storage.foldername(name))[1] and n.dono = auth.uid())
  and lower(name) like '%.glb'
  and (select count(*) from storage.objects o where o.bucket_id = 'zv-3d' and (storage.foldername(o.name))[1] = (storage.foldername(name))[1]) < 60);
drop policy if exists "zv 3d dono troca" on storage.objects;
create policy "zv 3d dono troca" on storage.objects for update to authenticated using (
  bucket_id = 'zv-3d' and exists (select 1 from public.zv_negocios n where n.id::text = (storage.foldername(name))[1] and n.dono = auth.uid()));
drop policy if exists "zv 3d dono apaga" on storage.objects;
create policy "zv 3d dono apaga" on storage.objects for delete to authenticated using (
  bucket_id = 'zv-3d' and exists (select 1 from public.zv_negocios n where n.id::text = (storage.foldername(name))[1] and n.dono = auth.uid()));
