
-- AI Company - Phase 3 / Step 1
-- ສ້າງຕາຕະລາງ ແລະ ກົດ RLS ສຳລັບ class_ai


-- ຕາຕະລາງຮຽນປະຈຳອາທິດ (day_of_week: 1 = ຈັນ ... 7 = ອາທິດ)
create table if not exists public.class_schedule (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  subject     text not null,
  location    text,
  start_time  time not null,
  end_time    time,
  created_at  timestamptz not null default now(),
  check (end_time is null or end_time > start_time)
);

-- ໝາຍເຫດຈາກການແຊັດ ເຊັ່ນ ຢຸດຮຽນ, ການບ້ານ
-- kind: cancel = ຢຸດຮຽນ, homework = ການບ້ານ, note = ໝາຍເຫດທົ່ວໄປ
create table if not exists public.class_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  note_date  date not null default ((now() at time zone 'Asia/Vientiane')::date),
  kind       text not null default 'note'
             check (kind in ('cancel', 'homework', 'note')),
  content    text,
  created_at timestamptz not null default now()
);

-- ດັດຊະນີ ເພື່ອໃຫ້ຄົ້ນຫາຕາມວັນໄວ
create index if not exists class_schedule_day_idx
  on public.class_schedule (user_id, day_of_week, start_time);
create index if not exists class_notes_date_idx
  on public.class_notes (user_id, note_date);

-- ເປີດ RLS: ບໍ່ມີ policy = ບໍ່ມີໃຜເຂົ້າເຖິງໄດ້
alter table public.class_schedule enable row level security;
alter table public.class_notes    enable row level security;

-- ສະເພາະຜູ້ທີ່ login ແລ້ວ ແລະ ເປັນເຈົ້າຂອງແຖວເທົ່ານັ້ນ ຈຶ່ງອ່ານ/ແກ້ໄດ້
create policy "ເຈົ້າຂອງຈັດການຕາຕະລາງຮຽນຂອງຕົນເອງ"
  on public.class_schedule
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "ເຈົ້າຂອງຈັດການໝາຍເຫດຂອງຕົນເອງ"
  on public.class_notes
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================
-- ໃຫ້ສິດເຂົ້າເຖິງຜ່ານ Data API
-- (ເພາະປິດ "Automatically expose new tables" ໄວ້)
-- ສະເພາະ role authenticated ເທົ່ານັ້ນ, anon ບໍ່ມີສິດ
-- ============================================
grant select, insert, update, delete
  on public.class_schedule to authenticated;
grant select, insert, update, delete
  on public.class_notes to authenticated;

grant select on public.class_schedule to service_role;
grant select, insert, update, delete on public.class_notes to service_role;