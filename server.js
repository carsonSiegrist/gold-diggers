const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname, "frontend")));

const BLM_LAYERS = {
  open:
    "https://gis.blm.gov/nlsdb/rest/services/HUB/BLM_Natl_MLRS_Mining_Claims_Not_Closed/FeatureServer/0/query",
  closed:
    "https://gis.blm.gov/nlsdb/rest/services/HUB/BLM_Natl_MLRS_Mining_Claims_Closed/FeatureServer/0/query",
};

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
      resultRecordCount: "1000",
    });

    const blmResponse = await fetch(`${layerUrl}?${params.toString()}`);
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
