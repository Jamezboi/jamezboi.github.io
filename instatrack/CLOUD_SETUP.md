# InstaTrack Cloud Setup

1. Sign in to the InstaTrack site and open Settings.
2. Generate or reuse a real Instaloader session file. Instaloader documents that session files contain reusable session cookies so the password does not need to be supplied on each run. See the Instaloader CLI `--sessionfile` documentation.
3. Upload the session file in Settings. The browser stores it in the private `instatrack-sessions` Supabase bucket under your user ID.
4. Add these GitHub repository Actions secrets:

- `INSTATrack_SUPABASE_URL` = your Supabase project URL
- `INSTATrack_SUPABASE_SERVICE_ROLE_KEY` = your Supabase service-role key
- `INSTATrack_GMAIL_USER` = sender Gmail address (optional)
- `INSTATrack_GMAIL_APP_PASSWORD` = Gmail app password (optional)
- `INSTATrack_REPORT_TO` = report recipient address (optional)

The worker never puts the service-role key or Gmail app password into the GitHub Pages frontend.

The workflow polls every 5 minutes for queued scans and runs the working Instaloader flow: load session file, fetch followers, compare with the previous cloud snapshot, save the new snapshot, and optionally email the report.

The 48-hour guard is enforced before a scan, matching the original bi-daily script.

## Browser-only Instagram login

The site no longer asks users to upload a `.session` file. The Settings form accepts the Instagram username/password in the browser, encrypts the login with the public key embedded in `session.js`, and stores only the ciphertext in `ig_login_credentials`. The GitHub Actions worker uses the matching private key secret (`INSTATrack_SESSION_PRIVATE_KEY`) to decrypt it once, runs `Instaloader.login()`, writes the generated session to the private `instatrack-sessions` bucket, marks the account ready, and deletes the one-time login payload.

### Required Actions secrets

`INSTATrack_SUPABASE_URL`
`INSTATrack_SUPABASE_SERVICE_ROLE_KEY`
`INSTATrack_SESSION_PRIVATE_KEY`

Optional email secrets remain:
`INSTATrack_GMAIL_USER`
`INSTATrack_GMAIL_APP_PASSWORD`
`INSTATrack_REPORT_TO`

The private key must be the PEM private key paired with the public key in `instatrack/session.js`. Do not commit the private key to GitHub.
