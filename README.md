# Retreat Showdown

Pairwise voting ("which would you rather stay at?") for the retreat shortlist. Static site for GitHub Pages; each vote is appended to the **Votes** tab of the `retreat f26` Google Sheet by a small Apps Script.

## Files

- `index.html`, `styles.css`, `app.js`: the app
- `data.js`: the 24 listings from the **Handpicked** tab (label, city, drive time, highlights, photo paths)
- `config.js`: Apps Script URL and the minimum matchups (36)
- `apps-script.gs`: paste into the sheet's Apps Script editor

## Setup

1. Open the sheet → **Extensions → Apps Script**. Replace the editor contents with `apps-script.gs`, save.
2. **Deploy → New deployment** → type **Web app** → Execute as **Me**, Who has access **Anyone** → Deploy → authorize. Copy the URL ending in `/exec` into `config.js`.
3. Push this folder to a GitHub repo and turn on **Settings → Pages → Deploy from branch → main / root**.

## Data

Votes tab columns: `vote_id, timestamp, voter, left_id, left_label, right_id, right_label, winner_id, winner_label, loser_id, loser_label, matchup_number, device`. Undo deletes the row.

Removing a listing: delete its entry from `data.js` (or ask Claude to regenerate it from the Handpicked tab).
