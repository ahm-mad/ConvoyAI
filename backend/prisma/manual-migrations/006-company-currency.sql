-- D-0158 (owner decision on frontend `04` §15 ask 2): a company-level default currency. Fleet screens show amounts in it,
-- and new customers / contracts / rate cards default to it. Existing rows in those tables keep their own currency.
--
-- Also declared in `schema.prisma` (a database created by `prisma db push` already has the column), so the statement is
-- guarded to be a no-op in that case — same idempotency rule as the other files here (D-0094). Every existing company
-- gets 'USD' (the schema default used everywhere else); the owner sets the real value per company through the API.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT 'USD';
