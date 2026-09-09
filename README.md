# Assignment Tracker

Minimal black-and-white assignment tracker with restrained status colors.

## GitHub Pages
Upload/commit these files to the repository root:
- index.html
- styles.css
- app.js
- config.js
- config.example.js
- .gitignore
- .nojekyll
- README.md
- supabase/schema.sql

In GitHub: Settings → Pages → Deploy from branch → main → `/ (root)`.

`config.js` is intentionally included because the browser needs the Supabase project URL and publishable key. Never put a service_role/secret key in it.

If you already ran the original database schema, run the V4 hierarchy migration at the bottom of `supabase/schema.sql`.


## One-click status
On the Masterlist, click the status pill to cycle:
**Not Started → In Progress → Complete → Not Started**.

The check-circle button immediately marks an assignment Complete; clicking it again reopens it as In Progress. Changes are written directly to Supabase.
