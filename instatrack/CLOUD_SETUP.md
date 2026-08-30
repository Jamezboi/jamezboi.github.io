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