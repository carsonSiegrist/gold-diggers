// Initialize map centered on Las Cruces
const map = L.map('map').setView([32.3199, -106.7637], 13);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
}).addTo(map);

// Feature group to store drawn items
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Draw control for polygons and rectangles
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

// Event listener for when user creates a drawing
map.on(L.Draw.Event.CREATED, function (event) {
  const layer = event.layer;

  // Apply blue styling to the drawn layer
  layer.setStyle({
    color: '#3b82f6',     // Tailwind blue-500
    fillColor: '#3b82f6',
    fillOpacity: 0.3,
  });

  drawnItems.addLayer(layer);
});

// Fetch GeoJSON data from API
fetch('http://localhost:5000/api/claims?limit=1000')
  .then(res => res.json())
  .then(data => {
    console.log("phew")
    // Create GeoJSON layer with custom styling and popups
    const geoLayer = L.geoJSON(data, {
      style: (feature) => {
        // Set color based on CSE_DISP property: green for Active, red otherwise
        const color = feature.properties?.CSE_DISP == 'Active' ? '#181' : '#b11';

        return {
          color: color,        // outline
          weight: 3,
          fillColor: color,    // fill
          fillOpacity: 0.15
        };
      },
      onEachFeature: (feature, layer) => {
        // Bind popup with CSE_NAME and CSE_NR if available
        if (feature.properties?.CSE_NAME) {
          layer.bindPopup(`<b>
            ${feature.properties.CSE_NAME}
            <br />
            ${feature.properties.CSE_NR}
            </b>`);
        }
      }
    }).addTo(map);

    // Fit map bounds to the GeoJSON layer
    map.fitBounds(geoLayer.getBounds());
  });