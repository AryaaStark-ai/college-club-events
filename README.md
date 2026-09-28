# College Club Hub

A website listing all college clubs and their events on a shared calendar — themed after DPGU School of Technology and Research's own maroon/gold branding, with a glassmorphism nav, dark mode, and animated cards.

> Designed & built by **Aayush Dhole**. See [LICENSE.md](LICENSE.md) — all rights reserved.

## Stack

- **Backend**: Node.js + Express, serving a small JSON REST API
- **Data**: plain JSON files (`data/clubs.json`, `data/events.json`) — edit these by hand to add or update clubs and events, no login required
- **Frontend**: plain HTML/CSS/JS, no build step, calendar rendered with [FullCalendar](https://fullcalendar.io/), light/dark theme toggle (saved per-browser)
- **Categories are color-coded** everywhere (club badges, event tiles, calendar) — Technical maroon, Cultural gold, Sports green, Arts teal, and inter-college events always purple, regardless of category
- **Event submissions**: a `/submit.html` form on the site itself lets any club lead submit an event with no login — see [Letting club leads submit events](#letting-club-leads-submit-events)

## Run it

```bash
npm install
cp .env.example .env   # then edit .env — set ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET at minimum
npm start
```

Then open http://localhost:3000

For auto-restart on file changes during development:

```bash
npm run dev
```

## Adding a club

Open `data/clubs.json` and add an object to the array:

```json
{
  "id": "unique-slug",
  "name": "Club Name",
  "category": "Technical",
  "tagline": "Short one-liner",
  "description": "A few sentences about the club.",
  "logo": "img/clubs/your-logo.png",
  "contactEmail": "club@college.edu",
  "instagram": "https://instagram.com/yourclub",
  "meetingTime": "Weekdays, 6 PM, Room X"
}
```

`category` should be one of: `Technical`, `Cultural`, `Sports`, `Arts` (or add a new one — also add it to `CATEGORY_LIST` in `public/js/app.js` so it shows up in the filters).

## Adding an event

Open `data/events.json` and add an object to the array:

```json
{
  "id": "unique-id",
  "clubId": "unique-slug-of-the-club",
  "title": "Event Title",
  "description": "What's happening.",
  "date": "2026-11-01",
  "dateConfirmed": true,
  "startTime": "18:00",
  "endTime": "20:00",
  "location": "Where it's happening",
  "category": "Technical",
  "scope": "campus"
}
```

The event shows up automatically on the home page (if upcoming), the club's own page, and the calendar.

Field notes:
- `dateConfirmed` — set to `false` if the date is approximate/not locked in yet. It shows a "Date tentative" badge and a dashed marker instead of hiding the event.
- `scope` — `"campus"` for your own clubs' events, or `"inter-college"` for events organized by a club at another college (invites, joint fests, etc.). Inter-college events get their own "From other colleges" section on the home page, a distinct badge, and a calendar filter. When `scope` is `"inter-college"`, also set `clubId: null` and add a `hostCollege` field naming the organizing college.

## Letting club leads submit events

**Where club leads go:** the "Submit Event" button in the nav (and footer, and the home page hero) on every page links to `/submit.html` — a real form, live on the site, no Google account or login needed. It asks for the club (or host college, if the event is from another college), the event details, and the submitter's name/email, then sends it straight into the review queue. Nothing they submit goes live until you approve it.

**Where you review it:** `/admin.html` — not linked anywhere on the public site, so bookmark the URL yourself. It's a real login (not a shared link-based key): set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `SESSION_SECRET` in `.env` (see [Run it](#run-it)), then log in with that username/password. The password is checked server-side only and a signed, `httpOnly` session cookie keeps you logged in for 8 hours — it never touches the browser's localStorage, and login attempts are rate-limited (8 per 15 minutes per IP) to slow down guessing. New submissions from `/submit.html` are already sitting there waiting — no extra step needed. Each one shows an "Assign to club" dropdown (auto-matched by name when possible) — click **Approve & publish** to add it to the live calendar, or **Reject** to discard it. Rejected and approved submissions are remembered, so they never come back.

**Optional: also accept a Google Form.** If you'd rather (or additionally) collect submissions through a Google Form — e.g. to share a link outside the site — this project also supports a Google Form → Sheet → same review queue pipeline:

1. Create a Google Form with these questions (wording can vary — the site matches by keyword):
   - Club Name, Event Title, Description, Event Date, Is the date confirmed? (Yes/No), Start Time, End Time, Location, Category, Is this event organized by a club from another college? (Yes/No), Host College Name (if inter-college), Your Name, Your Email
2. In the Form's **Responses** tab, click the Sheets icon to create a linked spreadsheet.
3. In that Sheet: **File → Share → Publish to web** → select the responses sheet → format **Comma-separated values (.csv)** → Publish. Copy the link.
4. Paste that link into `.env` as `SHEET_CSV_URL`, or into the "Google Sheet CSV URL" field on `/admin.html`.
5. On `/admin.html`, click **Sync from Google Sheet** whenever you want to pull in new responses — they land in the same review queue as `/submit.html` submissions.

## API

- `GET /api/clubs` — all clubs (`?category=Technical` to filter)
- `GET /api/clubs/:id` — one club
- `GET /api/events` — all events (`?clubId=`, `?category=`, `?month=YYYY-MM`, `?scope=campus|inter-college` to filter)
- `GET /api/events/:id` — one event
- `POST /api/submit-event` — public, no login needed; what `/submit.html` calls. Adds a submission to the review queue (rate-limited to 5 per IP per hour)
- `POST /api/admin/login` — `{ "username": "...", "password": "..." }`, sets the session cookie on success (rate-limited to 8 attempts per 15 minutes per IP)
- `POST /api/admin/logout` — clears the session
- `GET /api/admin/session` — `{ "authenticated": true|false }`, what the admin page checks on load
- `GET /api/admin/pending` — pending submissions (requires an active admin session)
- `POST /api/admin/sync` — pull new responses from the Google Sheet CSV (requires an admin session; body `{ "url": "..." }` optional if `SHEET_CSV_URL` is set)
- `POST /api/admin/pending/:id/approve` — publish a pending submission (requires an admin session; body `{ "clubId": "..." }` optional)
- `DELETE /api/admin/pending/:id` — reject a pending submission (requires an admin session)

## Deploying (Render)

This repo includes a `render.yaml` blueprint, so deploying takes a few clicks:

1. Push this repo to your own GitHub account (already done if you're reading this on GitHub).
2. Go to [render.com](https://render.com), sign up (free, no card required for the free web service tier), and click **New → Blueprint**.
3. Connect your GitHub account and pick this repo. Render reads `render.yaml` and sets up the web service automatically.
4. Before the first deploy finishes, fill in the environment variables it asks for: `ADMIN_USERNAME` and `ADMIN_PASSWORD` (your choice — this is what you'll log into `/admin.html` with) and optionally `SHEET_CSV_URL`. `SESSION_SECRET` is generated for you automatically.
5. Once deployed, your site is live at `https://<your-service-name>.onrender.com`.

**Storage caveat:** this app stores clubs/events/pending-submissions as JSON files on disk (no database). Render's **free** tier doesn't guarantee that disk survives a redeploy or a spin-down after 15 minutes of inactivity — so admin-approved events could reset unexpectedly. That's fine for a portfolio link or a demo. For something club leads actually rely on long-term, either add a Render **persistent disk** (paid, a few dollars/month) or migrate `data/*.json` to a real database later.

Any other Node host works too (Railway, Fly.io, a college server) — just run `npm install && npm start`, and set the same environment variables from `.env.example` on that host.

## Credits

Designed and built by **Aayush Dhole**.

This project is shared publicly for portfolio purposes. It is **not** open source — see [LICENSE.md](LICENSE.md) for terms before reusing any part of it.

The DPGU / School of Technology and Research logo (`public/img/dpu-logo.png`) is the university's own mark, used here to identify the college this site is built for — it is not covered by the LICENSE.md notice above and remains the property of Dnyaan Prasad Global University.
