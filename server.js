const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const CLUBS_PATH = path.join(__dirname, 'data', 'clubs.json');
const EVENTS_PATH = path.join(__dirname, 'data', 'events.json');

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/clubs', async (req, res, next) => {
  try {
    const clubs = await readJson(CLUBS_PATH);
    const { category } = req.query;
    const filtered = category
      ? clubs.filter((c) => c.category.toLowerCase() === category.toLowerCase())
      : clubs;
    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

app.get('/api/clubs/:id', async (req, res, next) => {
  try {
    const clubs = await readJson(CLUBS_PATH);
    const club = clubs.find((c) => c.id === req.params.id);
    if (!club) return res.status(404).json({ error: 'Club not found' });
    res.json(club);
  } catch (err) {
    next(err);
  }
});

app.get('/api/events', async (req, res, next) => {
  try {
    const events = await readJson(EVENTS_PATH);
    const { clubId, category, month } = req.query;
    let filtered = events;
    if (clubId) filtered = filtered.filter((e) => e.clubId === clubId);
    if (category) filtered = filtered.filter((e) => e.category.toLowerCase() === category.toLowerCase());
    if (month) filtered = filtered.filter((e) => e.date.startsWith(month));
    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

app.get('/api/events/:id', async (req, res, next) => {
  try {
    const events = await readJson(EVENTS_PATH);
    const event = events.find((e) => e.id === req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`College Club Events server running at http://localhost:${PORT}`);
});
