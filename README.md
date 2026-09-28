# College Club Hub

A website listing all college clubs and their events on a shared calendar — built with a bold maroon/pink gradient theme, glassmorphism nav, dark mode, and animated cards.

> Designed & built by **Aayush Dhole**. See [LICENSE.md](LICENSE.md) — all rights reserved.

## Stack

- **Backend**: Node.js + Express, serving a small JSON REST API
- **Data**: plain JSON files (`data/clubs.json`, `data/events.json`) — edit these by hand to add or update clubs and events, no login required
- **Frontend**: plain HTML/CSS/JS, no build step, calendar rendered with [FullCalendar](https://fullcalendar.io/), light/dark theme toggle (saved per-browser)
- **Event submissions**: club leads fill a Google Form; a moderated `/admin.html` page syncs new responses and publishes the ones you approve — see [Letting club leads submit events](#letting-club-leads-submit-events)

## Run it

```bash
npm install
cp .env.example .env   # then edit .env — set ADMIN_KEY at minimum
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

Right now, editing `data/events.json` yourself is the only built-in way to publish an event. To let club leads submit their own without giving them repo/server access, this project supports a **Google Form → Sheet → review queue** pipeline:

1. **Create a Google Form** with these questions, in any order (question wording can vary slightly — the site matches by keyword — but keep these ideas):
   - Club Name (short answer)
   - Event Title (short answer)
   - Description (paragraph)
   - Event Date (date question)
   - Is the date confirmed? (Yes/No)
   - Start Time (time question)
   - End Time (time question, optional)
   - Location (short answer)
   - Category (dropdown: Technical / Cultural / Sports / Arts)
   - Is this event organized by a club from another college? (Yes/No)
   - Host College Name (if inter-college) (short answer, optional)
   - Your Name (short answer)
   - Your Email (short answer)
2. In the Form's **Responses** tab, click the Sheets icon to create a linked spreadsheet.
3. In that Sheet: **File → Share → Publish to web** → select the responses sheet → format **Comma-separated values (.csv)** → Publish. Copy the link it gives you.
4. Paste that link into `.env` as `SHEET_CSV_URL`, or paste it directly into the "Google Sheet CSV URL" field on `/admin.html` each time.
5. Share the Google Form link with club leads. Put it in `public/js/app.js` as `SUBMIT_FORM_URL` so the "Submit an event" buttons on the site link straight to it.

**Reviewing submissions:** open `/admin.html`, enter your `ADMIN_KEY` (from `.env`), and click "Sync from Google Sheet" to pull in new form responses. Each submission shows all its details with an "Assign to club" dropdown (auto-matched by name when possible) — click **Approve & publish** to add it to the live calendar, or **Reject** to discard it. Rejected and approved submissions are remembered, so re-syncing never re-adds something you already handled. `/admin.html` is not linked from anywhere on the public site — bookmark it yourself.

If you'd rather skip the review step and go straight to a native in-site submission form (with a shared passcode or per-club logins), that's a bigger build — ask if you want that upgraded later.

## API

- `GET /api/clubs` — all clubs (`?category=Technical` to filter)
- `GET /api/clubs/:id` — one club
- `GET /api/events` — all events (`?clubId=`, `?category=`, `?month=YYYY-MM`, `?scope=campus|inter-college` to filter)
- `GET /api/events/:id` — one event
- `GET /api/admin/pending` — pending submissions (requires `x-admin-key` header)
- `POST /api/admin/sync` — pull new responses from the Google Sheet CSV (requires admin key; body `{ "url": "..." }` optional if `SHEET_CSV_URL` is set)
- `POST /api/admin/pending/:id/approve` — publish a pending submission (requires admin key; body `{ "clubId": "..." }` optional)
- `DELETE /api/admin/pending/:id` — reject a pending submission (requires admin key)

## Deploying

Any Node host works (Render, Railway, Fly.io, a college server, etc.) — just run `npm install && npm start`, and set `ADMIN_KEY` (and optionally `SHEET_CSV_URL`) as environment variables on the host. No database needed.

## Credits

Designed and built by **Aayush Dhole**.

This project is shared publicly for portfolio purposes. It is **not** open source — see [LICENSE.md](LICENSE.md) for terms before reusing any part of it.

The DPGU / School of Technology and Research logo (`public/img/dpu-logo.png`) is the university's own mark, used here to identify the college this site is built for — it is not covered by the LICENSE.md notice above and remains the property of Dnyaan Prasad Global University.
