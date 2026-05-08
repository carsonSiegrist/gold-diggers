const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;
const CACHE_TTL_HOURS = 24;
const CLAIM_RESULT_LIMIT = 1000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));

const BLM_LAYERS = {
  open:
    "https://gis.blm.gov/nlsdb/rest/services/HUB/BLM_Natl_MLRS_Mining_Claims_Not_Closed/FeatureServer/0/query",
  closed:
    "https://gis.blm.gov/nlsdb/rest/services/HUB/BLM_Natl_MLRS_Mining_Claims_Closed/FeatureServer/0/query",
};

function isCacheFresh(fetchedAt) {
  const fetchedTime = new Date(fetchedAt).getTime();
  const maxAge = CACHE_TTL_HOURS * 60 * 60 * 1000;

  return Date.now() - fetchedTime < maxAge;
}

function serializeSite(site) {
  return {
    ...site,
    geometry: JSON.parse(site.geometry_json),
    geometry_json: undefined,
  };
}

app.get("/api/claims", async (req, res) => {
  try {
    const status = String(req.query.status || "open").toLowerCase();
    const layerUrl = BLM_LAYERS[status];
    const bbox = String(req.query.bbox || "").split(",").map(Number);

    if (!layerUrl) {
      return res.status(400).json({ error: "Use status=open or status=closed" });
    }

    if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) {
      return res.status(400).json({ error: "bbox is required: west,south,east,north" });
    }

    const cacheKey = JSON.stringify({status, bbox, limit: CLAIM_RESULT_LIMIT});
    const cached = db
      .prepare("SELECT geojson, fetched_at FROM claim_cache WHERE cache_key = ?")
      .get(cacheKey);

    if (cached && isCacheFresh(cached.fetched_at)) {
      return res.json(JSON.parse(cached.geojson));
    }

    const params = new URLSearchParams({
      f: "geojson",
      where: "1=1",
      outFields:
        "OBJECTID,CSE_NAME,CSE_NR,LEG_CSE_NR,CSE_DISP,CSE_TYPE_NR,RCRD_ACRS,CSE_META,QLTY",
      returnGeometry: "true",
      outSR: "4326",
      geometry: JSON.stringify({
        xmin: bbox[0],
        ymin: bbox[1],
        xmax: bbox[2],
        ymax: bbox[3],
        spatialReference: { wkid: 4326 },
      }),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      resultRecordCount: String(CLAIM_RESULT_LIMIT),
    });

    const blmResponse = await fetch(`${layerUrl}?${params.toString()}`);

    if (!blmResponse.ok) {
      throw new Error(`BLM request failed with status ${blmResponse.status}`);
    }

    const geojson = await blmResponse.json();

    db.prepare(`
      INSERT INTO claim_cache (cache_key, status, query, limit_count, geojson, fetched_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(cache_key) DO UPDATE SET
        geojson = excluded.geojson,
        fetched_at = CURRENT_TIMESTAMP
    `).run(cacheKey, status, null, CLAIM_RESULT_LIMIT, JSON.stringify(geojson));

    res.json(geojson);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/users", (req, res) => {
  const users = db
    .prepare("SELECT id, email, name, created_at FROM users ORDER BY created_at DESC")
    .all();

  res.json(users);
});

app.post("/api/users", (req, res) => {
  const { email, name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  const result = db
    .prepare("INSERT INTO users (email, name) VALUES (?, ?)")
    .run(email || null, name);

  const user = db
    .prepare("SELECT id, email, name, created_at FROM users WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json(user);
});

app.get("/api/users/:userId/sites", (req, res) => {
  const sites = db
    .prepare(`
      SELECT id, user_id, name, notes, geometry_json, created_at, updated_at
      FROM prospecting_sites
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .all(req.params.userId)
    .map(serializeSite);

  res.json(sites);
});

app.post("/api/users/:userId/sites", (req, res) => {
  const { name, notes, geometry } = req.body;

  if (!name || !geometry) {
    return res.status(400).json({ error: "Name and geometry are required" });
  }

  const result = db
    .prepare(`
      INSERT INTO prospecting_sites (user_id, name, notes, geometry_json)
      VALUES (?, ?, ?, ?)
    `)
    .run(req.params.userId, name, notes || null, JSON.stringify(geometry));

  const site = db
    .prepare(`
      SELECT id, user_id, name, notes, geometry_json, created_at, updated_at
      FROM prospecting_sites
      WHERE id = ?
    `)
    .get(result.lastInsertRowid);

  res.status(201).json(serializeSite(site));
});

app.put("/api/sites/:siteId", (req, res) => {
  const { name, notes, geometry } = req.body;

  const result = db.prepare(`
    UPDATE prospecting_sites
    SET
      name = COALESCE(?, name),
      notes = COALESCE(?, notes),
      geometry_json = COALESCE(?, geometry_json),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name || null,
    notes || null,
    geometry ? JSON.stringify(geometry) : null,
    req.params.siteId
  );

  if (result.changes === 0) {
    return res.status(404).json({ error: "Site not found" });
  }

  const site = db
    .prepare(`
      SELECT id, user_id, name, notes, geometry_json, created_at, updated_at
      FROM prospecting_sites
      WHERE id = ?
    `)
    .get(req.params.siteId);

  res.json(serializeSite(site));
});

app.delete("/api/sites/:siteId", (req, res) => {
  const result = db
    .prepare("DELETE FROM prospecting_sites WHERE id = ?")
    .run(req.params.siteId);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Site not found" });
  }

  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
