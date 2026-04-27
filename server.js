const express = require("express");

const app = express();
const PORT = 5000;

app.use(express.static(__dirname));

const BLM_LAYERS = {
  active:
    "https://gis.blm.gov/nlsdb/rest/services/HUB/BLM_Natl_MLRS_Mining_Claims_Not_Closed/FeatureServer/0/query",
  closed:
    "https://gis.blm.gov/nlsdb/rest/services/HUB/BLM_Natl_MLRS_Mining_Claims_Closed/FeatureServer/0/query",
};

function clean(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/'/g, "''")
    .replace(/[^A-Z0-9 _-]/g, "")
    .trim();
}

app.get("/api/claims", async (req, res) => {
  try {
    const status = String(req.query.status || "active").toLowerCase();
    const q = req.query.q ? clean(req.query.q) : "";
    const limit = Math.min(Number(req.query.limit) || 10, 2000);

    const layerUrl = BLM_LAYERS[status];

    if (!layerUrl) {
      return res.status(400).json({ error: "Use status=active or status=closed" });
    }

    let where = "1=1";

    if (q) {
      where = `(UPPER(CSE_NAME) LIKE '%${q}%' OR UPPER(CSE_META) LIKE '%${q}%')`;
    }

    const params = new URLSearchParams({
      f: "geojson",
      where,
      outFields:
        "OBJECTID,CSE_NAME,CSE_NR,LEG_CSE_NR,CSE_DISP,CSE_TYPE_NR,RCRD_ACRS,CSE_META,QLTY",
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: String(limit),
    });

    const blmUrl = `${layerUrl}?${params.toString()}`;

    console.log("BLM query:", blmUrl);

    const blmResponse = await fetch(blmUrl);
    const geojson = await blmResponse.json();

    res.json(geojson);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});