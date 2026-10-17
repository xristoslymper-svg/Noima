// Minimal Supabase-owned storage schema for disposable PostgreSQL tests.
// Application migrations install the actual bucket and RLS policies unchanged.
// No permissive fixture policy or service-role shortcut is introduced here.
export const storageSchemaSql = `
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null,
    metadata jsonb,
    owner_id text,
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select, insert on storage.objects to authenticated;
`;
