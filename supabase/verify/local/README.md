# Local-only verify files

Run with the replay harness, never pasted into production. Each pair tests a
data mapping against copies of the real rows as they were before the
migration:

    npm run verify:local -- --before 089 supabase/verify/local/089_mapping_pre.sql \
      supabase/migrations/089_comp_split.sql supabase/verify/local/089_mapping_post.sql
