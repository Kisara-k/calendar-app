# Supabase setup

This app uses one Supabase project for authentication, Postgres persistence, and private Realtime messages. It uses email + password login. A unique username is stored as the account identity, but users sign in with email because Supabase Auth does not natively authenticate a username and password.

## What is already implemented

- Email/password sign up and sign in
- Confirm-email redirects
- Forgot-password email and password update flow
- Unique lowercase usernames
- Normalized, user-owned calendar tables with RLS
- Local-first caching, queued writes, idempotent retries, and private Realtime refreshes
- A database-enforced 5 MiB logical calendar-data limit per account
- Email-specific quota overrides managed only by an administrator

No Google provider or Google Calendar integration is used. No Supabase Storage bucket is needed because this app stores structured calendar rows, not uploaded files.

## 1. Create the Supabase project

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and select **New project**.
2. Choose the organization, project name, database password, and a nearby region.
3. Wait for the project to finish provisioning.
4. Open **Project Settings → Data API** (older dashboard versions label this **API**).
5. Copy the **Project URL** and the **Publishable key**. Do not use the secret/service-role key in this app.
6. In the project root, copy `.env.example` to `.env.local` and fill in:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

7. Restart `npm run dev` after changing environment variables.

The same two public values may be added to the production hosting provider, so localhost and production use the same database. This is convenient for an early-stage app, but local testing then changes production data for the account used during testing.

## 2. Install the database schema

### Dashboard method

1. Open **SQL Editor** in Supabase.
2. Select **New query**.
3. Copy the complete contents of `supabase/migrations/20260714000000_database.sql` into the editor and select **Run**.
4. Create another new query.
5. Copy the complete contents of `supabase/migrations/20260714010000_password_auth_and_quotas.sql` and select **Run**.
6. Create a third new query.
7. Copy the complete contents of `supabase/migrations/20260714020000_concurrency_safety.sql` and select **Run**.
8. Create a fourth new query.
9. Copy the complete contents of `supabase/migrations/20260714030000_consistent_snapshot_reads.sql` and select **Run**.
10. Create a fifth new query.
11. Copy the complete contents of `supabase/migrations/20260714040000_revision_broadcasts.sql` and select **Run**.
12. All five queries should finish with `Success. No rows returned`.

The second migration creates account profiles and quota entitlements, replaces the write RPC with the quota-enforcing version, and removes direct client write privileges. The third adds expected-revision writes and a private mutation ledger so concurrent browsers cannot silently overwrite one another and ambiguous retries remain idempotent. The fourth loads every normalized table and its revision in one consistent database snapshot. The fifth replaces per-row Realtime events with one minimal revision invalidation per committed patch. Do not expose `account_entitlements` or `applied_mutations` through a custom API.

### CLI method

If the Supabase CLI is installed and authenticated:

```powershell
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

## 3. Configure email/password authentication

1. Open **Authentication → Providers**.
2. Open **Email**.
3. Turn **Enable Email provider** on.
4. Turn **Confirm email** on. This prevents unverified addresses from receiving an authenticated session.
5. Save.
6. Open the **Google** provider and turn it off if it was previously enabled.
7. Open **Authentication → Sign In / Providers → Password security** (the exact label can vary by dashboard version).
8. Set the minimum password length to at least 8; 10–12 is preferable. Enable stronger character requirements if they suit the intended users. Leaked-password protection is available on eligible paid plans.

Supabase hashes passwords with bcrypt. Passwords never pass through or persist in this app’s calendar tables.

## 4. Configure localhost and production URLs

Both deployments can use the same Supabase project.

1. Open **Authentication → URL Configuration**.
2. Set **Site URL** to the exact production origin, for example `https://calendar.example.com`. If production is not deployed yet, temporarily use `http://localhost:3000` and change it after deployment.
3. Under **Redirect URLs**, add these as separate entries:
   - `http://localhost:3000`
   - Your exact production origin, for example `https://calendar.example.com`
4. Add preview-deployment URLs only if confirmation and reset links must return to previews. Prefer the narrowest supported pattern instead of a broad wildcard.
5. Save.

The app sends `window.location.origin` for confirmation and password-reset redirects. That means a flow started on localhost returns to localhost, while one started in production returns to production, provided both origins are allow-listed.

## 5. Configure outgoing email before production

Supabase’s default SMTP service is for testing, has strict delivery restrictions, and is currently limited to two messages per hour. For real users:

1. Create an account with an SMTP provider such as Resend, Postmark, Amazon SES, SendGrid, Brevo, or another provider you trust.
2. Verify a sending domain with that provider.
3. In Supabase, open **Project Settings → Authentication → SMTP Settings**.
4. Enable custom SMTP and enter the host, port, username, password, sender email, and sender name supplied by the provider.
5. Save, then test both a new-account confirmation and a forgot-password email.

Before a public launch, also consider Supabase’s Cloudflare Turnstile or hCaptcha support. CAPTCHA must be wired into the app form before enabling it in the dashboard; enabling it alone would make the current auth requests fail.

## 6. Give one email more database allowance

The default limit is 5 MiB of logical calendar payload. Run this in **SQL Editor** as the project administrator to give one email 50 MiB:

```sql
insert into public.account_entitlements (email, storage_limit_bytes, note)
values (lower('person@example.com'), 50 * 1024 * 1024, 'Expanded account')
on conflict (email) do update
set storage_limit_bytes = excluded.storage_limit_bytes,
    note = excluded.note,
    updated_at = now();
```

This works whether the grant is added before or after signup. The database trigger immediately synchronizes an existing profile with the new limit.

To restore the default limit:

```sql
delete from public.account_entitlements
where email = lower('person@example.com');
```

To inspect account usage and limits:

```sql
select
  profiles.username,
  profiles.email,
  pg_size_pretty(coalesce(accounts.storage_used_bytes, 0)) as logical_usage,
  pg_size_pretty(profiles.storage_limit_bytes) as logical_limit
from public.profiles
left join public.accounts on accounts.user_id = profiles.user_id
order by profiles.email;
```

The quota is checked after applying a patch but before committing the transaction. If the patch is too large, the entire database operation rolls back. The browser keeps its pending copy in the short-lived delivery outbox, shows **Storage limit reached**, and can sync it after data is reduced or the email entitlement is increased. The outbox protects interrupted delivery; it is not a general offline-storage feature.

## 7. Verify the full flow

1. Start the app with `npm run dev` and open `http://localhost:3000`.
2. Select **Create an account** and enter a username, email, and password.
3. Open the confirmation email and follow its link.
4. Sign in with the email and password.
5. Create or rename an event and confirm the sidebar changes from **Saving…** to **Synced**.
6. Open a private/incognito window, sign in with the same account, and confirm the same calendar loads.
7. Select **Forgot password?**, use the emailed link, and set a new password.
8. In Supabase **Table Editor**, verify that each row is scoped to the authenticated `user_id` and that `accounts.storage_used_bytes` is populated.

## What can be automated

The repository-side work is automated: auth code, schema migrations, RLS, quota enforcement, retry behavior, and setup documentation are included. With a logged-in Supabase CLI session and a project reference, the migrations can also be pushed automatically.

These steps normally remain manual because they require account ownership or third-party secrets: creating the Supabase project, choosing billing/region, configuring production URLs, entering SMTP credentials, changing dashboard password policies, and setting up CAPTCHA. No service-role key is required by the application.
