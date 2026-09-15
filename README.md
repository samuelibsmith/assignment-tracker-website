# Assignment Tracker — V19 Performance Edition

V19 keeps the V18 iPhone/Aero visual design and functionality while reducing unnecessary browser and Supabase work.

## Performance improvements

- Lazy-loads grade data only when Classes or Grades & GPA is opened.
- Requests only the fields the app actually needs from Supabase where practical.
- Builds O(1)-style Maps for courses, assignments, assignments by calendar date, exams by calendar date, and grades by course.
- Keeps pre-sorted assignment/exam lists in memory instead of sorting on every render.
- Makes calendar rendering date-indexed instead of scanning every assignment for every calendar day.
- Uses cached `Intl.DateTimeFormat` instances rather than creating locale formatters for every displayed date.
- Updates add/edit/delete operations locally after successful Supabase writes instead of reloading the entire application dataset.
- Keeps quick status, Done, priority, and To-do actions optimistic: the UI updates immediately and only reverts if the database write fails.
- Avoids duplicate signed-in initialization when Supabase emits a session event after the initial session check.
- Preserves the existing V18 dashboard completion controls and one-month calendar navigation.

## Supabase indexes

`PERFORMANCE_SQL.sql` contains optional indexes recommended for larger datasets. Run it once in the Supabase SQL Editor.

## Deployment

Upload/commit the site files to the root of the GitHub Pages repository. Keep your normal `config.js` with the Supabase URL and publishable key.

Never put a Supabase service_role/secret key in client-side files.
