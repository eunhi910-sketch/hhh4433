-- Supabase > SQL Editor 에 통째로 붙여넣고 Run 을 한 번 누르세요. (여러 번 실행해도 안전)

-- 1) 다이어리 · 사진 · 꾸미기 (Netlify 함수가 저장)
create table if not exists public.minihome_content (
  id text primary key,
  content jsonb not null,
  updated_at timestamptz default now()
);
alter table public.minihome_content enable row level security;

-- 2) 사진 저장소 (공개 읽기)
insert into storage.buckets (id, name, public)
values ('minihome-photos', 'minihome-photos', true)
on conflict (id) do nothing;

-- 3) 방명록 (친구들이 로그인 없이 읽고 쓰기)
create table if not exists public.guestbook (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.guestbook enable row level security;
grant select, insert on public.guestbook to anon, authenticated;

drop policy if exists "guestbook read" on public.guestbook;
create policy "guestbook read" on public.guestbook
  for select to anon, authenticated using (true);

drop policy if exists "guestbook insert" on public.guestbook;
create policy "guestbook insert" on public.guestbook
  for insert to anon, authenticated with check (true);
