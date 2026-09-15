# V19 Performance Edition

V19 keeps the V18 visual design and features while reducing unnecessary work.

## What changed

- **Lazy grade loading:** grades are no longer downloaded during initial login. They load only when opening Classes or Grades & GPA, and are cached for the session.
- **Smaller queries:** core queries request only fields used by the application instead of `select("*")` where practical.
- **Indexed lookups:** courses, assignments, assignments-by-date, exams-by-date, and grades-by-course are kept in Maps for O(1)-style lookups.
- **Pre-sorted caches:** assignment and exam ordering is calculated when data changes instead of every render.
- **Faster calendar:** each calendar date reads a prebuilt date bucket instead of scanning every assignment and exam for every day.
- **Faster course/grade pages:** grade and open-assignment counts are accumulated once instead of repeatedly filtering the full arrays for every course.
- **Targeted mutations:** adding, editing, or deleting an item updates the local state and indexes instead of reloading every table from Supabase.
- **Optimistic quick actions:** status, Done, priority, and To-do controls update immediately and only revert if the database write fails.
- **Dashboard updates:** dashboard completion actions update the visible dashboard after the save without a full data reload.

## Recommended Supabase indexes

Run `PERFORMANCE_SQL.sql` once in the Supabase SQL Editor. The indexes are designed around the app's user-scoped date/status/course queries and become increasingly useful as the dataset grows.

## Notes

V19 deliberately does **not** introduce a framework or a build system. It remains a small GitHub Pages app with plain HTML/CSS/JavaScript, so it stays easy to edit and deploy.
