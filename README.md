# Gold Diggers

Gold Diggers is a webapp for easily viewing mining claim data on an interactive map and saving prospecting sites. The backend is an Express server with a local SQLite database, and the frontend uses Leaflet to display map layers, draw areas, and manage saved sites.

## Requirements

- Node.js
- npm

## How to Run

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

Open the app in your browser:

```text
http://localhost:5000
```

The app creates `gold-diggers.db` automatically on first run and seeds a demo user. The server also caches BLM mining claim API responses for 24 hours.
