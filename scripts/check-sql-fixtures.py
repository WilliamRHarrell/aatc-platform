#!/usr/bin/env python3
"""
Audit: does every verify-script fixture supply the columns its table requires?

Written after verify_054 aborted before a single assertion ran. Its fixture
inserted a profiles row without `email`, which is NOT NULL, and relied on the
on_auth_user_created trigger having created the row so ON CONFLICT would take
the update branch. The trigger did not fire. Migration 054 was fine and
completely untested.

WHY THIS READS MIGRATIONS IN ORDER rather than just `create table`:
a first version derived the schema from create-table statements alone and
reported contest_votes.voter_token as missing from five inserts in verify_053.
It is not missing - migration 053 DROPS that column. An extractor that ignores
later ALTERs produces false positives forever, and each one costs somebody an
investigation to re-discover that it is noise. So this applies add column and
drop column as it walks the migrations in numeric order.

Reports columns that are NOT NULL with no default - the ones an INSERT must
name. Run manually; not wired into prebuild (see docs/HANDOFF.md).

    python3 scripts/check-sql-fixtures.py
"""
import re, glob, sys, os

MIG = 'supabase/migrations'
VER = 'supabase/verify'


def trigger_filled_columns():
    """
    Columns a BEFORE INSERT trigger on the SAME table always assigns.

    An INSERT may legitimately omit these, and the distinction matters:

      BEFORE INSERT on the same table  - runs for every insert, unconditionally.
        contest_votes.vote_date is set this way by set_vote_date(). Omitting it
        is correct; naming it would be wrong, since the trigger overwrites it.

      AFTER INSERT on a DIFFERENT table - a cross-table side effect that may or
        may not fire. profiles.email was left to on_auth_user_created, a trigger
        on auth.users, and when it did not fire the fixture aborted the run.
        That is the case this whole script exists to catch, so it must NOT be
        excused here.
    """
    filled: dict[str, set] = {}
    funcs: dict[str, set] = {}
    for path in sorted(glob.glob(f'{MIG}/*.sql')):
        src = open(path, encoding='utf-8').read()
        for m in re.finditer(r'create (?:or replace )?function (?:public\.)?(\w+)\(\)\s+returns trigger(.*?)\$\$;', src, re.S | re.I):
            fname, body = m.group(1), m.group(2)
            funcs[fname] = set(re.findall(r'new\.(\w+)\s*:=', body, re.I))
        for m in re.finditer(r'create trigger \w+\s+before insert on (?:public\.)?(\w+)(.*?)execute function (?:public\.)?(\w+)\(\)', src, re.S | re.I):
            table, fname = m.group(1), m.group(3)
            filled.setdefault(table, set()).update(funcs.get(fname, set()))
    return filled


def build_schema():
    """table -> set of columns that are NOT NULL and have no default."""
    schema: dict[str, set] = {}
    for path in sorted(glob.glob(f'{MIG}/*.sql'), key=lambda p: os.path.basename(p)):
        src = open(path, encoding='utf-8').read()

        for m in re.finditer(r'create table (?:if not exists )?(?:public\.)?(\w+)\s*\((.*?)\n\);', src, re.S):
            table, body = m.group(1), m.group(2)
            cols = set()
            for line in body.split('\n'):
                line = line.strip().rstrip(',')
                low = line.lower()
                if low.startswith(('constraint', 'unique', 'primary', 'check', 'foreign')):
                    continue
                cm = re.match(r'(\w+)\s+[\w\[\]() ]+', line)
                if cm and 'not null' in low and 'default' not in low:
                    cols.add(cm.group(1))
            schema[table] = cols

        for m in re.finditer(r'alter table (?:public\.)?(\w+)\s+add column (?:if not exists )?(\w+)([^;]*);', src, re.I):
            table, col, rest = m.group(1), m.group(2), m.group(3).lower()
            if table in schema and 'not null' in rest and 'default' not in rest:
                schema[table].add(col)

        for m in re.finditer(r'alter table (?:public\.)?(\w+)\s+drop column (?:if exists )?(\w+)', src, re.I):
            table, col = m.group(1), m.group(2)
            if table in schema:
                schema[table].discard(col)

        # `alter column x set not null` on a column that had no default
        for m in re.finditer(r'alter table (?:public\.)?(\w+)\s+alter column (\w+) set not null', src, re.I):
            table, col = m.group(1), m.group(2)
            if table in schema:
                schema[table].add(col)
    return schema


def main():
    schema = build_schema()
    filled = trigger_filled_columns()
    problems = 0
    for vf in sorted(glob.glob(f'{VER}/*.sql')):
        src = open(vf, encoding='utf-8').read()
        for m in re.finditer(r'insert into (?:public\.|auth\.)?(\w+)\s*\(([^)]*)\)', src):
            table = m.group(1)
            named = {c.strip() for c in m.group(2).split(',')}
            required = schema.get(table)
            if required is None:
                continue  # not a table this repo creates (e.g. auth.users)
            missing = sorted(required - named - filled.get(table, set()))
            if missing:
                line = src[:m.start()].count('\n') + 1
                print(f'  MISSING {os.path.basename(vf)}:{line}  {table}  needs {missing}')
                problems += 1

    if problems:
        print(f'\n[check-sql-fixtures] FAIL - {problems} fixture insert(s) omit a required column.')
        print('A fixture must supply its own NOT NULL columns rather than relying on a')
        print('trigger to fill them in. See docs/HANDOFF.md.')
        return 1
    print('[check-sql-fixtures] OK - every fixture insert names the columns its table requires.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
