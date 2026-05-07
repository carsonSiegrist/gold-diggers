const map = L.map("map", { zoomControl: false }).setView([32.3199, -106.7637], 10);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);

const openClaims = L.geoJSON(null, {
  style: {
    color: "#16a34a",
    weight: 2,
    fillColor: "#16a34a",
    fillOpacity: 0.2,
  },
  onEachFeature: addClaimPopup,
}).addTo(map);

const closedClaims = L.geoJSON(null, {
  style: {
    color: "#dc2626",
    weight: 2,
    fillColor: "#dc2626",
    fillOpacity: 0.12,
  },
  onEachFeature: addClaimPopup,
}).addTo(map);

async function loadClaims() {
  const bounds = map.getBounds();
  const bbox = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ].join(",");

  const [openData, closedData] = await Promise.all([
    fetch(`/api/claims?status=open&bbox=${bbox}`).then((res) => res.json()),
    fetch(`/api/claims?status=closed&bbox=${bbox}`).then((res) => res.json()),
  ]);

  openClaims.clearLayers().addData(openData);
  closedClaims.clearLayers().addData(closedData);
}

function addClaimPopup(feature, layer) {
  const props = feature.properties || {};

  layer.bindPopup(`
    <b>${props.CSE_NAME || "Mining claim"}</b><br>
    Case: ${props.CSE_NR || "N/A"}<br>
    Status: ${props.CSE_DISP || "N/A"}<br>
    Acres: ${props.RCRD_ACRS || "N/A"}
  `);
}

map.on("moveend", loadClaims);
loadClaims();
