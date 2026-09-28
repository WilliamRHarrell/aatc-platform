-- ============================================================
-- Protect the first real records (Ryan, 2026-09-26). Run after 082.
--   application 13c265d7  Skin Reserve (comped booth for product; owner
--                         ryan@skinreserve.com)
--   application 44c185e8  The Pinback Button Club (comped booth; owner
--                         jeremyharrell79@yahoo.com)
--   sponsorship 3c393126  Skin Reserve, in kind
-- Each row is matched by id AND name AND owner, so a wrong id aborts instead
-- of protecting the wrong record. One DO block; a second run aborts
-- (already protected). To lift protection later: the same UPDATE with false,
-- in the SQL Editor.
-- ============================================================
do $$
declare n int;
begin
  if not exists (select 1 from public.applications a join public.profiles p on p.id = a.user_id
                  where a.id = '13c265d7-04e4-4142-a673-721201ded275' and trim(a.business_name) = 'Skin Reserve'
                    and lower(p.email) = 'ryan@skinreserve.com') then
    raise exception 'ABORT: 13c265d7 is not Skin Reserve owned by ryan@skinreserve.com';
  end if;
  if not exists (select 1 from public.applications a join public.profiles p on p.id = a.user_id
                  where a.id = '44c185e8-b578-4a56-8d4d-a7f1231bed0e' and trim(a.business_name) = 'The Pinback Button Club'
                    and lower(p.email) = 'jeremyharrell79@yahoo.com') then
    raise exception 'ABORT: 44c185e8 is not The Pinback Button Club owned by jeremyharrell79@yahoo.com';
  end if;
  if not exists (select 1 from public.sponsorships
                  where id = '3c393126-8139-49aa-9c7a-f5e4d3770710' and sponsor_name = 'Skin Reserve' and is_in_kind) then
    raise exception 'ABORT: 3c393126 is not the in-kind Skin Reserve sponsorship';
  end if;

  update public.applications set is_protected = true
   where id in ('13c265d7-04e4-4142-a673-721201ded275', '44c185e8-b578-4a56-8d4d-a7f1231bed0e') and not is_protected;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'ABORT: expected 2 applications protected, got % (already protected?)', n; end if;

  update public.sponsorships set is_protected = true
   where id = '3c393126-8139-49aa-9c7a-f5e4d3770710' and not is_protected;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ABORT: expected 1 sponsorship protected, got %', n; end if;

  raise notice 'DONE: Skin Reserve (booth + in-kind sponsorship) and The Pinback Button Club are protected';
end $$;

select 'application' as kind, id, trim(business_name) as name, is_protected from public.applications where is_protected
union all
select 'sponsorship', id, sponsor_name, is_protected from public.sponsorships where is_protected
order by kind, name;
