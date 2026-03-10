-- Allow admin-created applications (in-person signups) without a user account
alter table applications alter column user_id drop not null;
