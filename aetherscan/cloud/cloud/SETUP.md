# AetherScan cloud backend — 10-minute setup

Places a real license + account server on **Cloudflare Workers + D1** (free tier,
no card). It issues your keys, enforces one-time redemption in the database, lists
every key in the cloud, verifies Google sign-in server-side, and handles
email/password accounts with email verification.

The desktop engine, the web console, and the admin/checkout pages all talk to the
same endpoint, so one backend covers everything.

## What you do (create the account — I can't do this for you)

1. **Cloudflare account** — go to https://dash.cloudflare.com/sign-up (free, no card).
2. Install the CLI and log in:
   ```
   npm install -g wrangler
   wrangler login
   ```
3. Copy `wrangler.toml.example` → `wrangler.toml`, put your `account_id` in it
   (found in the Cloudflare dashboard right sidebar), and set `ADMIN_EMAIL` to
   the Google address you'll use to issue keys.
4. Create the database and schema:
   ```
   wrangler d1 create aetherscan                       # copy the database_id into wrangler.toml
   wrangler d1 execute aetherscan --file=./schema.sql
   ```
5. Set the three secrets:
   ```
   npx wrangler secret put APP_SECRET      # any long random string (session tokens)
   npx wrangler secret put ADMIN_SECRET    # a secret only you know (override for issuing)
   npx wrangler secret put RESEND_API_KEY  # OPTIONAL — only needed for email verification email delivery
   ```
6. Deploy:
   ```
   wrangler deploy
   ```
   Take note of the printed URL: `https://aetherscan.<your-subdomain>.workers.dev`.

## Then (one edit in the site)

Paste that URL into `site/js/config.js`:
```
licenseServer: "https://aetherscan.<your-subdomain>.workers.dev",
```
…and deploy the site (already wired below). Done.

## How each piece uses it

| Piece | What it does |
|---|---|
| `worker.js` | Google + email auth, key issue/redeem/list/check, one-time enforcement |
| Web console | activates a key → calls `POST /keys/redeem` (one-time, atomic) |
| `.bat` engine | on activation calls the same `POST /keys/redeem` with a `machine_id` |
| `admin.html` | issues keys through `POST /keys/issue` (admin-gated) |
| `checkout.html` | sandbox "purchase" → claims an available key via redeem |

## Email verification (email/password accounts)

`/auth/register` creates the account, stores a 6-digit code, and — only if you set
`RESEND_API_KEY` (free tier at resend.com, ~100 emails/day) — emails the code.
Without a Resend key, Google sign-in still works (Google emails are already
verified by Google), and the code lives in the DB for you to look up manually.

## One-time use — how it's actually guaranteed

Redeeming is one SQL statement:

```sql
UPDATE licenses SET status='redeemed', redeemed_at=datetime('now'), redeemed_by=?
WHERE key=? AND redeemed_at IS NULL
```

D1 is SQLite; this conditional update is **atomic**. Two machines redeeming the same
key at the same instant → exactly one `UPDATE` reports a changed row, so only one
succeeds. The offline checksum only proves "this key is real"; the database is the
authority on "has it been used".

## Security notes

- `APP_SECRET` signs session tokens; `ADMIN_SECRET` gates key issuance.
- Keep both out of the repo — they live in Cloudflare's encrypted secret store.
- Real payments still need a payment processor (Stripe) + webhook before you hand
  keys to strangers automatically. Until then, `admin.html` is the trustworthy
  issuer: only the admin reaches `/keys/issue`.