let currentUser = JSON.parse(localStorage.getItem("goldDiggersUser") || "null");
let authToken = localStorage.getItem("goldDiggersToken");
let currentUserId = currentUser?.id || null;
let authMode = "login";
const savedSiteLayers = new Map();
const savedSiteNames = new Map();
const savedSiteStyle = {
  color: "#2563eb",
  weight: 3,
  fillColor: "#2563eb",
  fillOpacity: 0.24,
};

// base map definations
const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
});

const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17,
  attribution: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)'
});

const baseMaps = {
    "Street Map": osmLayer,
    "Topography": topoLayer
};

const map = L.map("map", { 
    zoomControl: false,
    layers: [osmLayer] 
}).setView([32.3199, -106.7637], 10);

L.control.layers(baseMaps, null, { position: 'topleft' }).addTo(map);

// map object color/style
function getClaimStyle(feature, baseColor) {
    // Grab the raw numeric code
    const rawType = String(feature.properties.CASE_TYPE_TXT || feature.properties.CSE_TYPE_NR || "");

    // 384201 = PLACER (Solid, thick border, darker fill)
    if (rawType === "384201") {
        return {
            color: baseColor,
            weight: 3,               
            fillColor: baseColor,
            fillOpacity: 0.4,        
            dashArray: ""            
        };
    } 
    // 384101 = LODE (Dashed border, lighter fill)
    else if (rawType === "384101") {
        return {
            color: baseColor,
            weight: 2,
            fillColor: baseColor,
            fillOpacity: 0.15,       
            dashArray: "5, 5"        
        };
    }
    // MILL SITES, TUNNEL SITES, or Missing Data (Dotted border, very light fill)
    else {
        return {
            color: baseColor,
            weight: 1,
            fillColor: baseColor,
            fillOpacity: 0.1,
            dashArray: "2, 6"        
        };
    }
}

const openClaims = L.geoJSON(null, {
  style: function(feature) {
      return getClaimStyle(feature, "#16a34a"); 
  },
  onEachFeature: addClaimPopup,
}).addTo(map);

const closedClaims = L.geoJSON(null, {
  style: function(feature) {
      return getClaimStyle(feature, "#dc2626"); 
  },
  onEachFeature: addClaimPopup,
}).addTo(map);

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const savedSites = new L.FeatureGroup();
map.addLayer(savedSites);

const drawControl = new L.Control.Draw({
  draw: {
    polygon: true,
    rectangle: true,
    circle: true,
    marker: false,
    polyline: false,
  },
  edit: {
    featureGroup: drawnItems,
  },
});

map.addControl(drawControl);

const authPanel = document.getElementById("authPanel");
const accountPanel = document.getElementById("accountPanel");
const accountName = document.getElementById("accountName");
const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");
const nameField = document.getElementById("nameField");
const nameInput = document.getElementById("nameInput");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const authSubmit = document.getElementById("authSubmit");
const authError = document.getElementById("authError");
const logoutButton = document.getElementById("logoutButton");
const siteSelect = document.getElementById("siteSelect");
const claimSelect = document.getElementById("claimSelect");

L.DomEvent.disableClickPropagation(authPanel);
L.DomEvent.disableScrollPropagation(authPanel);
L.DomEvent.disableClickPropagation(accountPanel);
L.DomEvent.disableScrollPropagation(accountPanel);
L.DomEvent.disableClickPropagation(siteSelect);
L.DomEvent.disableScrollPropagation(siteSelect);
L.DomEvent.disableClickPropagation(claimSelect);
L.DomEvent.disableScrollPropagation(claimSelect);

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === "signup";

  loginTab.classList.toggle("active", !isSignup);
  signupTab.classList.toggle("active", isSignup);
  nameField.hidden = !isSignup;
  nameInput.required = isSignup;
  passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
  authSubmit.textContent = isSignup ? "Create account" : "Log in";
  authError.textContent = "";
}

function setAuthState(payload) {
  currentUser = payload.user;
  currentUserId = currentUser.id;
  authToken = payload.token;

  localStorage.setItem("goldDiggersUser", JSON.stringify(currentUser));
  localStorage.setItem("goldDiggersToken", authToken);
  localStorage.setItem("goldDiggersTokenExpiresAt", payload.expiresAt || "");

  renderAuthState();
}

function clearAuthState(message = "") {
  currentUser = null;
  currentUserId = null;
  authToken = null;

  localStorage.removeItem("goldDiggersUser");
  localStorage.removeItem("goldDiggersToken");
  localStorage.removeItem("goldDiggersTokenExpiresAt");

  drawnItems.clearLayers();
  savedSites.clearLayers();
  savedSiteLayers.clear();
  savedSiteNames.clear();
  siteSelect.innerHTML = '<option value="">Log in to view sites</option>';
  claimSelect.innerHTML = '<option value="">Log in to view claims</option>';
  authError.textContent = message;
  renderAuthState();
}

function renderAuthState() {
  const isLoggedIn = Boolean(currentUser && authToken);

  authPanel.hidden = isLoggedIn;
  accountPanel.hidden = !isLoggedIn;

  if (isLoggedIn) {
    accountName.textContent = currentUser.name;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

async function authFetch(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${authToken}`,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAuthState("Please log in again.");
  }

  return response;
}

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

async function loadSavedSites() {
  if (!currentUserId || !authToken) {
    clearAuthState();
    return;
  }

  const response = await authFetch(`/api/users/${currentUserId}/sites`);

  if (!response.ok) {
    console.error("Could not load saved prospecting sites");
    return;
  }

  const sites = await response.json();

  drawnItems.clearLayers();
  savedSites.clearLayers();
  savedSiteLayers.clear();
  savedSiteNames.clear();

  const prospectingSites = sites.filter((site) => !isMiningClaim(site));
  const miningClaims = sites.filter(isMiningClaim);

  if (!prospectingSites.length) {
    siteSelect.innerHTML = '<option value="">No saved sites</option>';
  } else {
    siteSelect.innerHTML = [
      '<option value="">Jump to saved site...</option>',
      ...prospectingSites.map((site) => `<option value="${site.id}">${escapeHtml(site.name)}</option>`),
    ].join("");
  }

  if (!miningClaims.length) {
    claimSelect.innerHTML = '<option value="">No saved claims</option>';
  } else {
    claimSelect.innerHTML = [
      '<option value="">Jump to saved claim...</option>',
      ...miningClaims.map((site) => `<option value="${site.id}">${escapeHtml(site.name)}</option>`),
    ].join("");
  }

  sites.forEach((site) => {
    const siteLayerGroup = L.featureGroup();
    savedSiteNames.set(String(site.id), site.name);

    createSiteLayers(site).forEach((layer) => {
      layer.savedSiteId = site.id;
      bindSitePopup(layer, site);
      layer.addTo(drawnItems);
      layer.addTo(siteLayerGroup);
    });

    savedSiteLayers.set(String(site.id), siteLayerGroup);
  });
}

function isMiningClaim(site) {
  const props = site.geometry?.properties || {};

  return Boolean(props.CSE_NR || props.CSE_NAME || props.CSE_DISP);
}

function bindSitePopup(layer, site) {
  layer.bindPopup(`
    <b>${escapeHtml(site.name)}</b>
    ${site.notes ? `<br>${escapeHtml(site.notes)}` : ""}
  `);
}

function createSiteLayers(site) {
  if (site.geometry?.type === "Circle") {
    return [
      L.circle(site.geometry.center, {
        ...savedSiteStyle,
        radius: site.geometry.radius,
      }),
    ];
  }

  const layers = [];

  L.geoJSON(site.geometry, {
    style: savedSiteStyle,
  }).eachLayer((layer) => {
    layers.push(layer);
  });

  return layers;
}

function serializeLayer(layer) {
  if (layer instanceof L.Circle) {
    const center = layer.getLatLng();

    return {
      type: "Circle",
      center: [center.lat, center.lng],
      radius: layer.getRadius(),
    };
  }

  return layer.toGeoJSON();
}

function focusSavedSite(siteId) {
  const layer = savedSiteLayers.get(String(siteId));

  if (!layer) {
    return;
  }

  const bounds = layer.getBounds();

  if (bounds.isValid()) {
    map.fitBounds(bounds, {
      maxZoom: 15,
      padding: [32, 32],
    });
  }

  layer.eachLayer((childLayer) => {
    if (childLayer.getPopup()) {
      childLayer.openPopup();
    }
  });
}

async function saveMiningClaim(feature) {
  if (!currentUserId) {
    alert("Log in before saving a mining claim.");
    return;
  }

  const props = feature.properties || {};
  const name = props.CSE_NAME || "Mining claim";
  const notes = [
    `Case: ${props.CSE_NR || "N/A"}`,
    `Status: ${props.CSE_DISP || "N/A"}`,
    `Acres: ${props.RCRD_ACRS || "N/A"}`,
    `Type: ${props.CSE_TYPE_NR || "N/A"}`,
  ].join("\n");

  const response = await authFetch(`/api/users/${currentUserId}/sites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      notes,
      geometry: feature,
    }),
  });

  if (!response.ok) {
    alert("Could not save this mining claim.");
    return;
  }

  await loadSavedSites();
  alert("Mining claim saved.");
}

function createClaimPopupContent(feature) {
  const props = feature.properties || {};
  const container = document.createElement("div");
  const saveButton = document.createElement("button");

  const claimTypeCodes = {
      "384101": "LODE CLAIM",
      "384201": "PLACER CLAIM",
      "384301": "TUNNEL SITE",
      "384401": "MILL SITE"
  };

  const rawType = String(props.CASE_TYPE_TXT || props.CSE_TYPE_NR || "Unknown");

  const claimType = claimTypeCodes[rawType] || `Unknown Code: ${rawType}`;

  container.innerHTML = `
    <div style="font-family: sans-serif; min-width: 150px;">
        <h4 style="margin: 0 0 8px 0; border-bottom: 1px solid #ccc; padding-bottom: 4px;">Claim Details</h4>
        <b>Type:</b> <span style="color: #0369a1; font-weight: bold;">${claimType}</span><br>
        <b>Name:</b> ${props.CSE_NAME || "Mining claim"}<br>
        <b>Case:</b> ${props.CSE_NR || "N/A"}<br>
        <b>Status:</b> ${props.CSE_DISP || "N/A"}<br>
        <b>Acres:</b> ${props.RCRD_ACRS || "N/A"}<br><br>
    </div>
  `;

  saveButton.type = "button";
  saveButton.textContent = "Save claim";
  saveButton.addEventListener("click", () => {
    saveMiningClaim(feature);
  });

  container.appendChild(saveButton);

  return container;
}

function removeSitesFromDropdown(siteIds) {
  const deletedIds = new Set(Array.from(siteIds).map(String));

  [siteSelect, claimSelect].forEach((select) => {
    Array.from(select.options).forEach((option) => {
      if (deletedIds.has(option.value)) {
        option.remove();
      }
    });

    select.value = "";
  });

  if (siteSelect.options.length === 1) {
    siteSelect.innerHTML = '<option value="">No saved sites</option>';
  }

  if (claimSelect.options.length === 1) {
    claimSelect.innerHTML = '<option value="">No saved claims</option>';
  }
}

async function loadUsers() {
  if (!authToken) {
    clearAuthState();
    return;
  }

  const response = await authFetch("/api/auth/me");

  if (!response.ok) {
    clearAuthState("Please log in again.");
    return;
  }

  const payload = await response.json();
  currentUser = payload.user;
  currentUserId = currentUser.id;
  localStorage.setItem("goldDiggersUser", JSON.stringify(currentUser));
  renderAuthState();

  await loadSavedSites();
}

function addClaimPopup(feature, layer) {
  layer.bindPopup(createClaimPopupContent(feature));
}

map.on(L.Draw.Event.CREATED, async function (event) {
  if (!currentUserId) {
    alert("Log in before saving a prospecting site.");
    return;
  }

  const layer = event.layer;
  const name = prompt("Name this prospecting site:");

  if (!name) {
    return;
  }

  layer.setStyle({
    ...savedSiteStyle,
  });

  drawnItems.addLayer(layer);

  const response = await authFetch(`/api/users/${currentUserId}/sites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      notes: "",
      geometry: serializeLayer(layer),
    }),
  });

  if (!response.ok) {
    alert("Could not save this prospecting site.");
    return;
  }

  drawnItems.removeLayer(layer);
  await loadSavedSites();
});

loginTab.addEventListener("click", () => setAuthMode("login"));
signupTab.addEventListener("click", () => setAuthMode("signup"));

authPanel.addEventListener("submit", async function (event) {
  event.preventDefault();
  authError.textContent = "";
  authSubmit.disabled = true;

  const endpoint = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
  const payload = {
    email: emailInput.value,
    password: passwordInput.value,
  };

  if (authMode === "signup") {
    payload.name = nameInput.value;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      authError.textContent = data.error || "Authentication failed";
      return;
    }

    setAuthState(data);
    passwordInput.value = "";
    await loadSavedSites();
  } catch (error) {
    authError.textContent = "Could not reach the server.";
  } finally {
    authSubmit.disabled = false;
  }
});

logoutButton.addEventListener("click", async function () {
  if (authToken) {
    await authFetch("/api/auth/logout", { method: "POST" });
  }

  clearAuthState();
});

siteSelect.addEventListener("change", function () {
  if (siteSelect.value) {
    claimSelect.value = "";
    focusSavedSite(siteSelect.value);
  }
});

claimSelect.addEventListener("change", function () {
  if (claimSelect.value) {
    siteSelect.value = "";
    focusSavedSite(claimSelect.value);
  }
});

map.on(L.Draw.Event.DELETED, async function (event) {
  const siteIds = new Set();

  event.layers.eachLayer((layer) => {
    if (layer.savedSiteId) {
      siteIds.add(layer.savedSiteId);
    }
  });

  if (!siteIds.size) {
    return;
  }

  const results = await Promise.all(
    Array.from(siteIds).map((siteId) =>
      authFetch(`/api/sites/${siteId}`, {
        method: "DELETE",
      })
    )
  );

  if (results.some((response) => !response.ok)) {
    alert("One or more prospecting sites could not be deleted.");
  }

  const deletedSiteIds = Array.from(siteIds).filter((siteId, index) => results[index].ok);
  removeSitesFromDropdown(deletedSiteIds);

  await loadSavedSites();
});

map.on(L.Draw.Event.EDITED, async function (event) {
  const updates = [];

  event.layers.eachLayer((layer) => {
    if (!layer.savedSiteId) {
      return;
    }

    updates.push(
      authFetch(`/api/sites/${layer.savedSiteId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: savedSiteNames.get(String(layer.savedSiteId)),
          geometry: serializeLayer(layer),
        }),
      })
    );
  });

  if (!updates.length) {
    return;
  }

  const results = await Promise.all(updates);

  if (results.some((response) => !response.ok)) {
    alert("One or more prospecting sites could not be updated.");
  }

  await loadSavedSites();
});

map.on("moveend", loadClaims);
loadClaims();
loadUsers();
