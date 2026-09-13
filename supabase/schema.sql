-- Выполнить один раз в Supabase: панель проекта -> SQL Editor -> New query -> вставить и Run

create table if not exists public.parkings (
  id bigint generated always as identity primary key,
  address text not null,
  lat double precision,
  lng double precision,
  source_url text,
  telegram_post_id bigint unique,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists parkings_published_idx on public.parkings (is_published, created_at desc);

-- Row Level Security: сайт читает только опубликованные записи анонимным ключом,
-- а запись/изменение доступны только через service_role ключ (используется в серверной функции)
alter table public.parkings enable row level security;

create policy "Публичное чтение опубликованных парковок"
  on public.parkings for select
  using (is_published = true);

-- Вставка и обновление строк для анонимного ключа запрещены (нет соответствующей policy) —
-- это осознанно: писать в таблицу может только серверная функция с SUPABASE_SERVICE_ROLE_KEY,
-- который обходит RLS. Так с сайта никто посторонний не сможет добавить фейковую парковку.
