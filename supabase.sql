create extension if not exists pgcrypto;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_slug text not null check (room_slug = 'class-3-1-passion-on'),
  author_id text not null,
  author_name text not null check (char_length(author_name) between 1 and 20),
  body text not null check (char_length(body) between 1 and 400),
  created_at timestamptz not null default now()
);

create index if not exists messages_room_slug_created_at_idx
  on public.messages (room_slug, created_at);

alter table public.messages enable row level security;

drop policy if exists "class_room_read" on public.messages;
drop policy if exists "class_room_insert" on public.messages;

create policy "class_room_read"
on public.messages
for select
to anon, authenticated
using (room_slug = 'class-3-1-passion-on');

create policy "class_room_insert"
on public.messages
for insert
to anon, authenticated
with check (
  room_slug = 'class-3-1-passion-on'
  and char_length(author_name) between 1 and 20
  and char_length(body) between 1 and 400
);
