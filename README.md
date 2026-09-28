# College Club Hub

A website listing all college clubs and their events on a shared calendar.

## Stack

- **Backend**: Node.js + Express, serving a small JSON REST API
- **Data**: plain JSON files (`data/clubs.json`, `data/events.json`) — edit these by hand to add or update clubs and events, no login required
- **Frontend**: plain HTML/CSS/JS, no build step, calendar rendered with [FullCalendar](https://fullcalendar.io/)

## Run it

```bash
npm install
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
  "startTime": "18:00",
  "endTime": "20:00",
  "location": "Where it's happening",
  "category": "Technical"
}
```

The event shows up automatically on the home page (if upcoming), the club's own page, and the calendar.

## API

- `GET /api/clubs` — all clubs (`?category=Technical` to filter)
- `GET /api/clubs/:id` — one club
- `GET /api/events` — all events (`?clubId=`, `?category=`, `?month=YYYY-MM` to filter)
- `GET /api/events/:id` — one event

## Deploying

Any Node host works (Render, Railway, Fly.io, a college server, etc.) — just run `npm install && npm start`. No database needed.
