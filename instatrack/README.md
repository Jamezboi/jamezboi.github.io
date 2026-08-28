# InstaTrack Pro Web

Live frontend path: `/instatrack/`

The frontend is GitHub Pages compatible. Supabase Auth/Postgres provide per-user cloud storage. The Instagram scanner requires a separately hosted HTTPS Python worker because GitHub Pages is static hosting and cannot execute FastAPI/Instaloader server code.

Configure `config.js` with the Supabase project URL/publishable key and worker URL. Never put a Supabase service-role key or Instagram credentials in frontend code.

Run `sql/schema.sql` in Supabase before enabling cloud storage.