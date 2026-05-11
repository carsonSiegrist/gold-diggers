const express = require("express");
const crypto = require("crypto");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;
const CACHE_TTL_HOURS = 24;
const CLAIM_RESULT_LIMIT = 1000;
const SESSION_DAYS = 7;
const PASSWORD_KEY_LENGTH = 64;

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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    created_at: user.created_at,
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto
    .pbkdf2Sync(password, salt, 120000, PASSWORD_KEY_LENGTH, "sha512")
    .toString("hex");

  return { hash, salt };
}

function verifyPassword(password, user) {
  if (!user.password_hash || !user.password_salt) {
    return false;
  }

  const { hash } = hashPassword(password, user.password_salt);
  const storedHash = Buffer.from(user.password_hash, "hex");
  const suppliedHash = Buffer.from(hash, "hex");

  return storedHash.length === suppliedHash.length && crypto.timingSafeEqual(storedHash, suppliedHash);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO user_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, tokenHash, expiresAt);

  return { token, expiresAt };
}

function requireAuth(req, res, next) {
  const [scheme, token] = String(req.headers.authorization || "").split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Please log in first" });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const session = db.prepare(`
    SELECT
      user_sessions.id,
      user_sessions.expires_at,
      users.id AS user_id,
      users.email,
      users.name,
      users.created_at
    FROM user_sessions
    JOIN users ON users.id = user_sessions.user_id
    WHERE user_sessions.token_hash = ?
  `).get(tokenHash);

  if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
    if (session) {
      db.prepare("DELETE FROM user_sessions WHERE id = ?").run(session.id);
    }

    return res.status(401).json({ error: "Session expired. Please log in again." });
  }

  req.user = {
    id: session.user_id,
    email: session.email,
    name: session.name,
    created_at: session.created_at,
  };

  next();
}

function requireMatchingUser(req, res, next) {
  if (Number(req.params.userId) !== req.user.id) {
    return res.status(403).json({ error: "You can only access your own saved sites" });
  }

  next();
}

app.post("/api/auth/signup", (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required" });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(email);

  if (existingUser) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const { hash, salt } = hashPassword(password);
  const result = db.prepare(`
    INSERT INTO users (email, name, password_hash, password_salt)
    VALUES (?, ?, ?, ?)
  `).run(email, name, hash, salt);

  const user = db
    .prepare("SELECT id, email, name, created_at FROM users WHERE id = ?")
    .get(result.lastInsertRowid);
  const session = createSession(user.id);

  res.status(201).json({ user: publicUser(user), ...session });
});

app.post("/api/auth/login", (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || !verifyPassword(password, user)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const session = createSession(user.id);

  res.json({ user: publicUser(user), ...session });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const token = String(req.headers.authorization || "").split(" ")[1];
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  db.prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(tokenHash);
  res.status(204).end();
});

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

app.get("/api/users", requireAuth, (req, res) => {
  res.json([publicUser(req.user)]);
});

app.post("/api/users", (req, res) => {
  res.status(410).json({ error: "Use /api/auth/signup to create an account" });
});

app.get("/api/users/:userId/sites", requireAuth, requireMatchingUser, (req, res) => {
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

app.post("/api/users/:userId/sites", requireAuth, requireMatchingUser, (req, res) => {
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

app.put("/api/sites/:siteId", requireAuth, (req, res) => {
  const { name, notes, geometry } = req.body;

  const result = db.prepare(`
    UPDATE prospecting_sites
    SET
      name = COALESCE(?, name),
      notes = COALESCE(?, notes),
      geometry_json = COALESCE(?, geometry_json),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(
    name || null,
    notes || null,
    geometry ? JSON.stringify(geometry) : null,
    req.params.siteId,
    req.user.id
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

app.delete("/api/sites/:siteId", requireAuth, (req, res) => {
  const result = db
    .prepare("DELETE FROM prospecting_sites WHERE id = ? AND user_id = ?")
    .run(req.params.siteId, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Site not found" });
  }

  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
