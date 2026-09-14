-- Standalone installation is deliberately disabled: the old baseline is insecure.
-- Fresh local/hosted Supabase: configure DATABASE_URL and run `npm run migrate`.
-- Migrations must ALL be applied in lexical order:
--   20260912000000_initial.sql
--   20260912010000_secure_core.sql
--   20260912020000_core_integration.sql
--   20260913000000_core_guards.sql
-- Existing baseline: take and verify a backup, compare the schema, then use
-- `npm run migrate -- --adopt-existing-baseline`. Only the baseline is skipped;
-- every subsequent migration is required. Do not reset a database containing data.
-- Roles: customer by default, admin only through bootstrap, admin actions require MFA.
-- Methods start disabled. Configure coverage, products, payment instructions and a
-- positive exchange rate published in the last 24 hours. Reference != verified payment.
-- Arrange the authenticated maintenance job for reservations and the email outbox.
DO $$
BEGIN
  RAISE EXCEPTION 'Apply ALL ordered supabase/migrations via npm run migrate; do not execute schema.sql standalone.';
END;
$$;
