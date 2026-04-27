// Initialize map
const map = L.map('map').setView([32.3199, -106.7637], 13); // Las Cruces

// Tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
}).addTo(map);

// Feature group to store drawn items
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Draw control
const drawControl = new L.Control.Draw({
  draw: {
    polygon: true,
    rectangle: true,
    circle: false,
    marker: false,
    polyline: false,
  },
  edit: {
    featureGroup: drawnItems,
  }
});

map.addControl(drawControl);

// When user draws something
map.on(L.Draw.Event.CREATED, function (event) {
  const layer = event.layer;

  // Apply blue styling
  layer.setStyle({
    color: '#3b82f6',     // Tailwind blue-500
    fillColor: '#3b82f6',
    fillOpacity: 0.3,
  });

  drawnItems.addLayer(layer);
});

fetch('areas.geojson')
  .then(res => res.json())
  .then(data => {
    const geoLayer = L.geoJSON(data, {
      style: (feature) => {
        const color = feature.properties?.color || '#eab308'; // fallback

        return {
          color: color,        // outline
          weight: 3,
          fillColor: color,    // fill
          fillOpacity: 0.15
        };
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties?.name) {
          layer.bindPopup(`<b>${feature.properties.name}</b>`);
        }
      }
    }).addTo(map);

    map.fitBounds(geoLayer.getBounds());
  });