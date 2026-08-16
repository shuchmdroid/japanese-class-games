-- 日本語クラス・ゲーム / データ同期用スキーマ
-- Supabase ダッシュボード → SQL Editor に貼り付けて Run してください。
-- 何度実行しても安全です（既にある場合は作り直しません）。

-- 先生の作った内容（アニメ・単語・文法など）を、ブラウザのキーごとに1行で保存する。
-- 例: key='anime.data.v1', value={...}
create table if not exists public.user_data (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  key        text        not null,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 🔒 行レベルセキュリティ：自分のデータ以外は読むことも書くこともできない
alter table public.user_data enable row level security;

drop policy if exists "user_data は本人のみ" on public.user_data;
create policy "user_data は本人のみ"
  on public.user_data
  for all
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 更新時刻を自動で入れる
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch
  before update on public.user_data
  for each row execute function public.touch_updated_at();

-- 一覧取得を速くする
create index if not exists user_data_user_idx on public.user_data (user_id);
