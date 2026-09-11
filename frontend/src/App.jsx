import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

/* eslint-disable react-hooks/set-state-in-effect */

const API_URL = "http://127.0.0.1:8000";
const PUNE_CENTER = [18.5204, 73.8567];

const HAZARD_TYPES = [
  { value: "OPEN_MANHOLE", label: "Open Manhole", icon: "🕳️" },
  { value: "ROAD_EXCAVATION", label: "Road Excavation / Deep Pit", icon: "🚧" },
  { value: "WATERLOGGING", label: "Waterlogging", icon: "🌊" },
  { value: "FALLEN_TREE", label: "Fallen Tree / Obstruction", icon: "🌳" },
];

const TEAMS = [
  "Road Safety Team",
  "Drainage Team",
  "Tree Removal Team",
  "Emergency Response Team",
];

const exposurePoints = [
  [18.5238, 73.8552, "Central School Zone", "School"],
  [18.5314, 73.8477, "Shivajinagar Bus Hub", "Bus Stop"],
  [18.5135, 73.8560, "City Hospital Zone", "Hospital"],
  [18.5198, 73.8580, "Main Road Corridor", "Busy Road"],
  [18.5209, 73.8554, "Market Pedestrian Zone", "High Footfall"],
];

const hazardIcon = L.divIcon({
  className: "custom-hazard-marker",
  html: `<div class="hazard-marker-dot"></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

function MapInteraction({ onDestinationClick }) {
  useMapEvents({
    click: (event) => onDestinationClick?.(event.latlng.lat, event.latlng.lng),
  });
  return null;
}

function MapViewport({ currentLocation, destination }) {
  const map = useMap();
  useEffect(() => {
    if (currentLocation) {
      map.setView([currentLocation.latitude, currentLocation.longitude], Math.max(map.getZoom(), 14), { animate: true });
    }
  }, [currentLocation, map]);
  useEffect(() => {
    if (destination) map.flyTo(destination, Math.max(map.getZoom(), 14), { animate: true, duration: 0.8 });
  }, [destination, map]);
  return null;
}

function App() {
  const [view, setView] = useState("role-select");
  const [hazards, setHazards] = useState([]);
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState("");
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [demoWeather, setDemoWeather] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [proofLoading, setProofLoading] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState({});
  const [photo, setPhoto] = useState(null);
  const [proofFiles, setProofFiles] = useState({});
  const [proofResults, setProofResults] = useState({});
  const [saferRoute, setSaferRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeForm, setRouteForm] = useState({ startLat: "18.5204", startLng: "73.8567", endLat: "18.5314", endLng: "73.8477" });
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destinationResults, setDestinationResults] = useState([]);
  const [destinationSearching, setDestinationSearching] = useState(false);
  const [destinationName, setDestinationName] = useState("");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationTracking, setLocationTracking] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [verification, setVerification] = useState(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [toast, setToast] = useState("");
  const [sessionRole, setSessionRole] = useState(
    localStorage.getItem("hazardpulse-role") || "Authority"
  );

  const [form, setForm] = useState({
    type: "OPEN_MANHOLE",
    latitude: "18.5204",
    longitude: "73.8567",
    description: "",
  });

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  async function fetchHazards() {
    try {
      const response = await fetch(`${API_URL}/hazards`);
      if (!response.ok) throw new Error("Failed to fetch hazards");
      setHazards(await response.json());
    } catch (error) {
      console.error("Fetch hazards error:", error);
    }
  }

  async function fetchWeather() {
    setWeatherLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/weather?latitude=${PUNE_CENTER[0]}&longitude=${PUNE_CENTER[1]}`
      );
      if (!response.ok) throw new Error("Weather unavailable");
      const data = await response.json();
      setWeather(data);
      setDemoWeather(Boolean(data.demo_mode));
      setWeatherError("");
    } catch (error) {
      console.error("Weather fetch error:", error);
      setWeatherError("Live weather unavailable");
    } finally {
      setWeatherLoading(false);
    }
  }

  async function fetchAlerts() {
    try {
      const response = await fetch(`${API_URL}/alerts`);
      if (!response.ok) return;
      setAlerts(await response.json());
    } catch (error) {
      console.error("Alert fetch error:", error);
    }
  }

  useEffect(() => {
    fetchHazards();
    fetchWeather();
    fetchAlerts();

    const hazardInterval = window.setInterval(() => {
      fetchHazards();
      fetchAlerts();
    }, 10000);
    const weatherInterval = window.setInterval(fetchWeather, 300000);

    return () => {
      window.clearInterval(hazardInterval);
      window.clearInterval(weatherInterval);
    };
  }, []);

  useEffect(() => {
    if (alerts.length > 0 && "Notification" in window && Notification.permission === "granted") {
      new Notification("HazardPulse safety alert", {
        body: alerts[0].message,
      });
    }
  }, [alerts.length]);

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      showToast("Browser notifications are not supported here.");
      return;
    }
    const result = await Notification.requestPermission();
    showToast(result === "granted" ? "Safety alerts enabled." : "Notification permission not granted.");
  };

  const getWeatherRiskBonus = () => {
    if (!weather) return 0;
    const rain = Number(weather.rain || 0);
    const precipitation = Number(weather.precipitation || 0);
    const code = Number(weather.weather_code || 0);
    if (rain >= 5 || precipitation >= 5 || code >= 95) return 20;
    if (rain >= 2 || precipitation >= 2 || code >= 80) return 15;
    if (rain > 0 || precipitation > 0 || code >= 51) return 10;
    return 0;
  };

  const getEffectiveRiskScore = (hazard) => {
    const serverScore = Number(hazard.risk_score || 0);
    // Backend already applies demo weather; this fallback keeps the UI responsive with live weather.
    return Math.min(100, Math.max(serverScore, Number(hazard.base_risk_score || serverScore) + getWeatherRiskBonus()));
  };

  const getEffectiveRiskLevel = (hazard) => {
    const score = getEffectiveRiskScore(hazard);
    if (score >= 85) return "CRITICAL";
    if (score >= 70) return "HIGH";
    if (score >= 40) return "MEDIUM";
    return "LOW";
  };

  const activeHazards = useMemo(
    () => hazards.filter((hazard) => hazard.status !== "RESOLVED"),
    [hazards]
  );

  const criticalCount = activeHazards.filter((hazard) => getEffectiveRiskLevel(hazard) === "CRITICAL").length;
  const highCount = activeHazards.filter((hazard) => getEffectiveRiskLevel(hazard) === "HIGH").length;
  const mediumCount = activeHazards.filter((hazard) => getEffectiveRiskLevel(hazard) === "MEDIUM").length;
  const resolvedCount = hazards.filter((hazard) => hazard.status === "RESOLVED").length;
  const assignedCount = hazards.filter((hazard) => hazard.status === "ASSIGNED").length;
  const inProgressCount = hazards.filter((hazard) => hazard.status === "IN_PROGRESS").length;

  const typeLabel = (type) =>
    HAZARD_TYPES.find((item) => item.value === type)?.label || type;

  const typeIcon = (type) =>
    HAZARD_TYPES.find((item) => item.value === type)?.icon || "⚠️";

  const statusLabel = (status) =>
    ({ REPORTED: "Reported", ASSIGNED: "Assigned", IN_PROGRESS: "In Progress", RESOLVED: "Resolved" }[status] || status);

  const riskClass = (level) => String(level || "LOW").toLowerCase();

  const sortedActive = useMemo(
    () => activeHazards.slice().sort((a, b) => getEffectiveRiskScore(b) - getEffectiveRiskScore(a)),
    [activeHazards, weather]
  );

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocationError("Live location is not supported by this browser.");
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
        };
        setCurrentLocation(next);
        setLocationTracking(true);
        setLocationError("");
      },
      (error) => {
        setLocationTracking(false);
        setLocationError(error.code === 1 ? "Location permission denied." : "Live location unavailable.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!currentLocation) return;
    setRouteForm((current) => ({
      ...current,
      startLat: currentLocation.latitude.toFixed(6),
      startLng: currentLocation.longitude.toFixed(6),
    }));
  }, [currentLocation]);

  const searchDestination = async () => {
    const query = destinationQuery.trim();
    if (query.length < 2) {
      setDestinationResults([]);
      showToast("Type a destination first.");
      return;
    }
    setDestinationSearching(true);
    try {
      const response = await fetch(`${API_URL}/geocode?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("Destination search unavailable");
      const data = await response.json();
      setDestinationResults(data.results || []);
      if (!data.results?.length) showToast("No destination found. Try a landmark or area name.");
    } catch (error) {
      console.error(error);
      showToast("Destination search is unavailable.");
    } finally {
      setDestinationSearching(false);
    }
  };

  const selectDestination = (result) => {
    setDestinationName(result.name);
    setDestinationQuery(result.name.split(",")[0]);
    setDestinationResults([]);
    setRouteForm((current) => ({
      ...current,
      endLat: String(result.latitude),
      endLng: String(result.longitude),
    }));
    showToast("Destination set on map.");
  };

  const useLiveLocation = () => {
    if (!currentLocation) {
      showToast("Waiting for your live location. Check browser location permission.");
      return;
    }
    setRouteForm((current) => ({
      ...current,
      startLat: currentLocation.latitude.toFixed(6),
      startLng: currentLocation.longitude.toFixed(6),
    }));
    showToast(`Live location set · ±${Math.round(currentLocation.accuracy)} m`);
  };

  const setMapDestination = (lat, lng) => {
    setRouteForm((current) => ({ ...current, endLat: lat.toFixed(6), endLng: lng.toFixed(6) }));
    setDestinationName("Map-selected destination");
    setDestinationQuery(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    showToast("Destination pinned on map.");
  };

  const setRole = (role) => {
    setSessionRole(role);
    localStorage.setItem("hazardpulse-role", role);
    if (role === "Authority") {
      setView("authority");
      setDashboardTab("overview");
    } else if (role === "Citizen") {
      setView("citizen");
      setDashboardTab("home");
    } else {
      setView("operations");
      setDashboardTab("tasks");
    }
  };

  const [dashboardTab, setDashboardTab] = useState("overview");

  const openRolePicker = () => {
    setView("role-select");
    setDashboardTab("overview");
  };

  const jumpTo = (sectionId) => {
    window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const navigateDashboard = (target, sectionId, tab) => {
    setDashboardTab(tab || "overview");
    if (target) setView(target);
    if (sectionId) window.setTimeout(() => jumpTo(sectionId), 40);
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage("Geolocation is not supported. Enter coordinates manually.");
      return;
    }
    setLocationMessage("Requesting GPS location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setLocationMessage(`GPS captured ±${Math.round(position.coords.accuracy)} m`);
      },
      () => setLocationMessage("GPS unavailable. You can enter coordinates manually."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  async function verifySelectedPhoto(file) {
    setPhoto(file || null);
    setVerification(null);
    if (!file) return;

    const data = new FormData();
    data.append("hazard_type", form.type);
    data.append("image", file);
    try {
      const response = await fetch(`${API_URL}/hazards/verify-image`, {
        method: "POST",
        body: data,
      });
      if (!response.ok) throw new Error("Verification failed");
      const result = await response.json();
      setVerification(result);
      showToast(`Vision verification: ${result.confidence}% confidence`);
    } catch (error) {
      console.error(error);
      showToast("Image verification could not run.");
    }
  }

  async function createHazard(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/hazards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          description: form.description,
          image_filename: photo?.name || null,
          verification_confidence: verification?.confidence || 90,
        }),
      });
      if (!response.ok) throw new Error("Failed to create hazard");
      const result = await response.json();
      setForm({ type: "OPEN_MANHOLE", latitude: "18.5204", longitude: "73.8567", description: "" });
      setPhoto(null);
      setVerification(null);
      await fetchHazards();
      await fetchAlerts();
      showToast(result.duplicate_observation ? `Correlated with hazard #${result.id}. Observation added.` : `Hazard #${result.id} reported successfully.`);
    } catch (error) {
      console.error(error);
      showToast("Could not report hazard.");
    } finally {
      setLoading(false);
    }
  }

  async function assignTeam(hazardId, team) {
    if (!team) {
      showToast("Select a response team first.");
      return;
    }
    try {
      const response = await fetch(`${API_URL}/hazards/${hazardId}/assign`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team }),
      });
      if (!response.ok) throw new Error("Assignment failed");
      await fetchHazards();
      showToast(`Hazard #${hazardId} assigned to ${team}.`);
    } catch (error) {
      console.error(error);
      showToast("Could not assign team.");
    }
  }

  async function verifyProofFile(hazardId, file) {
    if (!file) {
      setProofFiles({ ...proofFiles, [hazardId]: null });
      setProofResults({ ...proofResults, [hazardId]: null });
      return;
    }
    setProofFiles({ ...proofFiles, [hazardId]: file });
    setProofLoading(true);
    try {
      const data = new FormData();
      data.append("image", file);
      const response = await fetch(`${API_URL}/resolution-proof`, { method: "POST", body: data });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || "Proof verification failed");
      }
      const result = await response.json();
      setProofResults({ ...proofResults, [hazardId]: result });
      showToast(`Field proof verified: ${result.verification_confidence}%`);
    } catch (error) {
      console.error(error);
      setProofResults({ ...proofResults, [hazardId]: null });
      showToast(error.message || "Proof verification failed.");
    } finally {
      setProofLoading(false);
    }
  }

  async function calculateSaferRoute() {
    setRouteLoading(true);
    try {
      const params = new URLSearchParams({
        start_lat: routeForm.startLat,
        start_lng: routeForm.startLng,
        end_lat: routeForm.endLat,
        end_lng: routeForm.endLng,
      });
      const response = await fetch(`${API_URL}/safer-route?${params}`);
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || "Safer route unavailable");
      }
      const result = await response.json();
      setSaferRoute(result);
      showToast(`Safer route selected · ${result.distance_km} km`);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Safer route unavailable.");
    } finally {
      setRouteLoading(false);
    }
  }

  async function updateHazardStatus(hazardId, status) {
    let proofName = null;
    if (status === "RESOLVED") {
      const proof = proofResults[hazardId];
      if (!proof || proof.status !== "PROOF_VERIFIED") {
        showToast("Upload and verify field proof before resolving.");
        return;
      }
      proofName = proof.filename;
    }

    try {
      const response = await fetch(`${API_URL}/hazards/${hazardId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          resolution_note: status === "RESOLVED" ? "Mitigation completed and field evidence submitted." : null,
          resolution_proof: proofName,
        }),
      });
      if (!response.ok) throw new Error("Status update failed");
      await fetchHazards();
      await fetchAlerts();
      showToast(status === "RESOLVED" ? `Hazard #${hazardId} resolved and removed from active alerts.` : `Hazard #${hazardId} moved to ${statusLabel(status)}.`);
    } catch (error) {
      console.error(error);
      showToast("Could not update hazard status.");
    }
  }

  async function toggleDemoWeather() {
    try {
      const response = await fetch(`${API_URL}/demo/weather`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !demoWeather, rain: 8 }),
      });
      if (!response.ok) throw new Error("Demo weather failed");
      await fetchWeather();
      await fetchHazards();
      await fetchAlerts();
      showToast(!demoWeather ? "Heavy rain simulation enabled — risk recalculated." : "Real weather mode restored.");
    } catch (error) {
      console.error(error);
      showToast("Demo weather could not be changed.");
    }
  }

  const renderMap = (className = "") => (
    <div className={`map-wrapper ${className}`}>
      <MapContainer center={PUNE_CENTER} zoom={12} style={{ width: "100%", height: "100%" }}>
        <MapInteraction onDestinationClick={setMapDestination} />
        <MapViewport currentLocation={currentLocation} destination={saferRoute ? [Number(routeForm.endLat), Number(routeForm.endLng)] : null} />
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {currentLocation && (
          <>
            <Circle center={[currentLocation.latitude, currentLocation.longitude]} radius={Math.max(10, currentLocation.accuracy || 20)} pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.08, weight: 1 }} />
            <CircleMarker center={[currentLocation.latitude, currentLocation.longitude]} radius={9} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }}>
              <Popup><strong>📍 You are here</strong><br />Accuracy: ±{Math.round(currentLocation.accuracy || 0)} m<br />{locationTracking ? "Live location tracking active" : "Location fixed"}</Popup>
            </CircleMarker>
          </>
        )}
        {routeForm.endLat && routeForm.endLng && destinationName && (
          <Marker position={[Number(routeForm.endLat), Number(routeForm.endLng)]}>
            <Popup><strong>🏁 Destination</strong><br />{destinationName}</Popup>
          </Marker>
        )}
        {exposurePoints.map(([lat, lng, name, kind]) => (
          <CircleMarker key={name} center={[lat, lng]} radius={6} pathOptions={{ color: "#5b8def", fillColor: "#5b8def", fillOpacity: 0.7 }}>
            <Popup><strong>{name}</strong><br />Exposure layer: {kind}</Popup>
          </CircleMarker>
        ))}
        {activeHazards.map((hazard) => (
          <Fragment key={`circle-${hazard.id}`}>
            <Circle center={[hazard.latitude, hazard.longitude]} radius={Math.max(60, (Number(hazard.exposure_score || 0) + 1) * 4)} pathOptions={{ color: getEffectiveRiskLevel(hazard) === "CRITICAL" ? "#ef4444" : "#f59e0b", fillOpacity: 0.08 }} />
            <Marker position={[hazard.latitude, hazard.longitude]} icon={hazardIcon}>
              <Popup>
                <strong>{typeIcon(hazard.type)} {typeLabel(hazard.type)}</strong><br />
                Risk: <b>{getEffectiveRiskLevel(hazard)} ({getEffectiveRiskScore(hazard)})</b><br />
                Exposure: {hazard.exposure_label || "LOW"}<br />
                Confidence: {Math.round(hazard.verification_confidence || hazard.confidence || 0)}%<br />
                Observations: {hazard.observation_count || 1}<br />
                {hazard.work_order_id ? <>Work order: {hazard.work_order_id}<br /></> : null}
                Status: {statusLabel(hazard.status)}
              </Popup>
            </Marker>
          </Fragment>
        ))}
        {saferRoute?.geometry?.coordinates?.length > 1 && (
          <Polyline
            positions={saferRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng])}
            pathOptions={{ color: "#22c55e", weight: 5, opacity: 0.9, dashArray: "8 6" }}
          />
        )}
      </MapContainer>
    </div>
  );

  const stats = [
    ["CRITICAL", criticalCount, "Immediate action"],
    ["HIGH RISK", highCount, "Priority response"],
    ["MEDIUM RISK", mediumCount, "Monitor closely"],
    ["RESOLVED", resolvedCount, "Completed incidents"],
  ];

  if (view === "role-select") {
    return (
      <div className="role-gate">
        <div className="role-gate-noise"></div>
        <header className="gate-header">
          <button className="gate-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <span className="brand-mark">H</span>
            <span><b>HazardPulse</b><small>PUBLIC SAFETY INTELLIGENCE</small></span>
          </button>
          <span className="gate-version">PROTOTYPE · v2.1</span>
        </header>

        <main className="role-gate-main">
          <div className="gate-copy">
            <span className="gate-kicker">ONE PLATFORM · THREE EXPERIENCES</span>
            <h1>How will you use<br /><em>HazardPulse?</em></h1>
            <p>Choose your role to enter a focused workspace. Each experience shows only the information and actions that matter to you.</p>
          </div>

          <div className="role-cards">
            <button className="role-card" onClick={() => setRole("Authority")}>
              <div className="role-card-top"><span className="role-index">01</span><span className="role-arrow">↗</span></div>
              <div className="role-symbol">⌘</div>
              <h2>Authority</h2>
              <p>See the city as a live safety control room. Prioritize risk, inspect incidents and understand what needs attention now.</p>
              <div className="role-features"><span>Live GIS</span><span>Risk intelligence</span><span>Analytics</span></div>
              <div className="role-cta">Enter Authority Dashboard <span>→</span></div>
            </button>

            <button className="role-card" onClick={() => setRole("Citizen")}>
              <div className="role-card-top"><span className="role-index">02</span><span className="role-arrow">↗</span></div>
              <div className="role-symbol">◎</div>
              <h2>Citizen</h2>
              <p>Report a hazard, check warnings around you and find a safer way to reach your destination.</p>
              <div className="role-features"><span>Report</span><span>Nearby alerts</span><span>Safer route</span></div>
              <div className="role-cta">Enter Citizen Portal <span>→</span></div>
            </button>

            <button className="role-card" onClick={() => setRole("Field Officer")}>
              <div className="role-card-top"><span className="role-index">03</span><span className="role-arrow">↗</span></div>
              <div className="role-symbol">+</div>
              <h2>Field Officer</h2>
              <p>Work the response queue, accept assignments, upload field evidence and close hazards with accountability.</p>
              <div className="role-features"><span>Dispatch</span><span>Field proof</span><span>Resolution</span></div>
              <div className="role-cta">Enter Operations <span>→</span></div>
            </button>
          </div>

          <div className="gate-footer"><span>Detect. Verify. Assess. Warn.</span><span>Real-time intelligence for temporary public safety hazards.</span></div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">H</div>
          <div><div className="brand-name">HazardPulse</div><div className="brand-subtitle">SAFETY INTELLIGENCE</div></div>
        </div>

        <div className="active-role-card">
          <span className="role-avatar">{sessionRole === "Authority" ? "⌘" : sessionRole === "Citizen" ? "◎" : "+"}</span>
          <div><small>YOU ARE</small><b>{sessionRole}</b></div>
          <button onClick={openRolePicker} title="Switch role">↗</button>
        </div>

        <nav className="sidebar-nav">
          {sessionRole === "Authority" && <>
            <button className={`nav-item ${dashboardTab === "overview" ? "active" : ""}`} onClick={() => navigateDashboard("authority", "authority-overview", "overview")}><span className="nav-glyph">⌂</span><span>Overview</span></button>
            <button className={`nav-item ${dashboardTab === "map" ? "active" : ""}`} onClick={() => navigateDashboard("authority", "authority-map", "map")}><span className="nav-glyph">⌖</span><span>Live Map</span></button>
            <button className={`nav-item ${dashboardTab === "priority" ? "active" : ""}`} onClick={() => navigateDashboard("authority", "authority-priority", "priority")}><span className="nav-glyph">↗</span><span>Priority Queue</span><b className="nav-count">{activeHazards.length}</b></button>
            <button className={`nav-item ${view === "analytics" ? "active" : ""}`} onClick={() => navigateDashboard("analytics", null, "analytics")}><span className="nav-glyph">◫</span><span>Analytics</span></button>
            <button className={`nav-item ${view === "alerts" ? "active" : ""}`} onClick={() => navigateDashboard("alerts", null, "alerts")}><span className="nav-glyph">!</span><span>Safety Alerts</span><b className="nav-count">{alerts.length}</b></button>
          </>}
          {sessionRole === "Citizen" && <>
            <button className={`nav-item ${dashboardTab === "home" ? "active" : ""}`} onClick={() => navigateDashboard("citizen", "citizen-top", "home")}><span className="nav-glyph">⌂</span><span>Safety Home</span></button>
            <button className={`nav-item ${dashboardTab === "report" ? "active" : ""}`} onClick={() => navigateDashboard("citizen", "citizen-report", "report")}><span className="nav-glyph">+</span><span>Report Hazard</span></button>
            <button className={`nav-item ${dashboardTab === "map" ? "active" : ""}`} onClick={() => navigateDashboard("citizen", "citizen-map-panel", "map")}><span className="nav-glyph">⌖</span><span>Nearby Safety</span></button>
            <button className={`nav-item ${dashboardTab === "route" ? "active" : ""}`} onClick={() => navigateDashboard("citizen", "safer-route-panel", "route")}><span className="nav-glyph">↝</span><span>Safer Route</span></button>
          </>}
          {sessionRole === "Field Officer" && <>
            <button className={`nav-item ${dashboardTab === "tasks" ? "active" : ""}`} onClick={() => navigateDashboard("operations", "operations-top", "tasks")}><span className="nav-glyph">⌂</span><span>My Tasks</span></button>
            <button className={`nav-item ${dashboardTab === "queue" ? "active" : ""}`} onClick={() => navigateDashboard("operations", "operations-queue", "queue")}><span className="nav-glyph">↗</span><span>Response Queue</span><b className="nav-count">{activeHazards.length}</b></button>
            <button className={`nav-item ${dashboardTab === "proof" ? "active" : ""}`} onClick={() => navigateDashboard("operations", "operations-queue", "proof")}><span className="nav-glyph">✓</span><span>Proof & Resolve</span></button>
          </>}
        </nav>

        <div className="sidebar-footer">
          <div className="system-status"><span className="status-dot"></span>All systems operational</div>
          <div className="footer-text">HazardPulse · Prototype v2.4</div>
        </div>
      </aside>

      <main className="main-content">
        <div className="mobile-dashboard-head"><button onClick={openRolePicker}>← Roles</button><span>{sessionRole}</span></div>
        <div className="global-demo-bar">
          <div className="context-line"><span className="context-pulse"></span><b>{sessionRole}</b><span>Focused workspace</span></div>
          <div className="demo-actions">
            <span className="environment-state">{demoWeather ? "Heavy rain simulation" : "Live environmental context"}</span>
            {sessionRole === "Authority" && <button className={`mini-button ${demoWeather ? "danger" : ""}`} onClick={toggleDemoWeather}>{demoWeather ? "Restore Weather" : "Simulate Heavy Rain"}</button>}
            {sessionRole !== "Citizen" && <button className="mini-button" onClick={requestNotifications}>Enable Alerts</button>}
          </div>
        </div>

        {view === "authority" && (
          <>
            <div id="authority-overview" className="page-header"><div><div className="eyebrow">MUNICIPAL SAFETY CONTROL</div><h1>Authority Dashboard</h1><p>Real-time monitoring of public safety hazards</p></div><div className="header-actions"><button className="refresh-button" onClick={() => { fetchHazards(); fetchWeather(); }}>↻ Refresh</button><span className="live-indicator"><span className="status-dot"></span>LIVE</span></div></div>

            <div className="stats-grid">{stats.map(([label, number, desc]) => <div className="stat-card" key={label}><div className="stat-label">{label}</div><div className="stat-number">{number}</div><div className="stat-description">{desc}</div></div>)}</div>

            <div className="dashboard-grid">
              <section id="authority-map" className="panel map-panel"><div className="panel-header"><div><h2>Live Hazard Map</h2><span>OSM + GIS exposure intelligence</span></div><span className="panel-badge">{activeHazards.length} ACTIVE</span></div>{renderMap()}</section>
              <section id="authority-priority" className="panel priority-panel"><div className="panel-header"><div><h2>Priority Incidents</h2><span>Risk + exposure + weather + observations</span></div><span className="panel-badge">{sortedActive.length}</span></div><div className="priority-list">{sortedActive.length === 0 ? <div className="empty-state">✓ No active hazards</div> : sortedActive.map((hazard) => <div className="priority-item" key={hazard.id}><div><strong>#{hazard.id} {typeIcon(hazard.type)} {typeLabel(hazard.type)}</strong><div>{hazard.description || "No description"}</div><small>{hazard.exposure_label} exposure · {hazard.observation_count || 1} observation(s)</small></div><span className={`risk-badge ${riskClass(getEffectiveRiskLevel(hazard))}`}>{getEffectiveRiskLevel(hazard)} · {getEffectiveRiskScore(hazard)}</span></div>)}</div></section>
            </div>

            <div className="intelligence-grid">
              <div className="feature-card"><span className="feature-icon">🧠</span><div><strong>AI Verification</strong><span>Photo verification adapter returns confidence before a report enters the intelligence layer.</span></div></div>
              <div className="feature-card"><span className="feature-icon">📍</span><div><strong>Exposure Intelligence</strong><span>Nearby schools, bus hubs, hospitals, busy roads and footfall influence priority.</span></div></div>
              <div className="feature-card"><span className="feature-icon">🔗</span><div><strong>Correlation Engine</strong><span>Nearby same-type reports merge into one incident with supporting observations.</span></div></div>
              <div className="feature-card"><span className="feature-icon">🌧️</span><div><strong>Environmental Context</strong><span>{weatherLoading && !weather ? "Loading..." : weatherError ? weatherError : `${weather?.condition || "Weather"} · ${weather?.temperature ?? "—"}°C · Rain ${weather?.rain ?? "—"} mm · Risk +${getWeatherRiskBonus()}`}</span></div></div>
            </div>
          </>
        )}

        {view === "citizen" && (
          <>
            <div id="citizen-top" className="page-header"><div><div className="eyebrow">PUBLIC SAFETY REPORTING</div><h1>Citizen Portal</h1><p>Report a temporary public safety hazard and see warnings near you</p></div></div>
            <div className="citizen-layout">
              <section id="citizen-report" className="panel citizen-form-panel"><div className="panel-header"><div><h2>Report Hazard</h2><span>Detect · Verify · Assess</span></div></div>
                <form className="hazard-form" onSubmit={createHazard}>
                  <label>Hazard Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{HAZARD_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <div className="form-row"><label>Latitude<input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></label><label>Longitude<input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></label></div>
                  <button type="button" className="location-button" onClick={captureLocation}>◎ Capture GPS Location</button>{locationMessage && <div className="helper-text">{locationMessage}</div>}
                  <label>Description<textarea rows="4" placeholder="Describe what you observed..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
                  <label>Photo<input type="file" accept="image/*" onChange={(e) => verifySelectedPhoto(e.target.files?.[0])} /></label>
                  {verification && <div className={`verification-card ${verification.match === false ? "review" : ""}`}><div><b>{verification.match === false ? "⚠ AI Review Required" : "✓ AI Verification"}</b><span>{verification.engine}</span><small>Predicted: {verification.hazard_type?.replaceAll("_", " ")} · Selected: {verification.selected_hazard_type?.replaceAll("_", " ")}</small><small>{verification.risk_signal}</small></div><strong>{verification.confidence}%</strong></div>}
                  <button className="submit-button" type="submit" disabled={loading || (photo && verification && verification.confidence < 60)}>{loading ? "Processing intelligence..." : verification?.match === false ? "Submit for Human Review" : "Submit Hazard Report"}</button>
                </form>
              </section>
              <section id="citizen-map-panel" className="panel citizen-map-panel"><div className="panel-header"><div><h2>Nearby Hazards & Warnings</h2><span>Active hazards are visible before you travel</span></div><span className="panel-badge">{alerts.length} ALERTS</span></div>{renderMap("citizen-map")}</section>
            </div>
            <section id="safer-route-panel" className="panel safer-route-panel">
              <div className="panel-header"><div><h2>🛣️ Safer Movement</h2><span>Plan around active HazardPulse risks before you travel</span></div><span className="panel-badge">ROUTE SAFETY</span></div>
              <div className="route-planner">
                <div className="route-search-row">
                  <div className="destination-search">
                    <span className="search-icon">⌕</span>
                    <input value={destinationQuery} onChange={(e) => setDestinationQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") searchDestination(); }} placeholder="Search destination (e.g. Pune Railway Station)" />
                    <button className="mini-button" type="button" onClick={searchDestination} disabled={destinationSearching}>{destinationSearching ? "Searching…" : "Search"}</button>
                  </div>
                  <button className="location-button" type="button" onClick={useLiveLocation}>◎ Use my live location</button>
                </div>
                {destinationResults.length > 0 && (
                  <div className="destination-results">
                    {destinationResults.map((result, index) => (
                      <button type="button" key={`${result.latitude}-${result.longitude}-${index}`} onClick={() => selectDestination(result)}>
                        <strong>📍 {result.name.split(",")[0]}</strong><span>{result.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="route-help">Search a place, choose a result, or <b>click anywhere on the map to pin your destination.</b></div>
                <div className="route-status-row">
                  <span className={`tracking-pill ${locationTracking ? "on" : ""}`}>{locationTracking ? "● LIVE LOCATION" : "○ LOCATION OFF"}</span>
                  {currentLocation && <span>±{Math.round(currentLocation.accuracy || 0)} m GPS accuracy</span>}
                  {locationError && <span className="helper-error">{locationError}</span>}
                </div>
                <div className="route-coordinates">
                  <div><label>From</label><span>{Number(routeForm.startLat).toFixed(5)}, {Number(routeForm.startLng).toFixed(5)}</span></div>
                  <div><label>To</label><span>{destinationName || "Select a destination"}</span></div>
                  <button className="operation-button primary" type="button" onClick={calculateSaferRoute} disabled={routeLoading || !destinationName}>{routeLoading ? "Finding safer route…" : "🚗 Find Safer Route"}</button>
                </div>
              </div>
              {saferRoute ? <div className="route-result route-result-rich"><div><b>✓ Safer route selected</b><span>{saferRoute.distance_km} km · {saferRoute.duration_min} min</span></div><div><strong>{saferRoute.hazards_near_route?.length || 0}</strong><span>hazards near route</span></div><small>{saferRoute.engine}</small></div> : <div className="route-empty">Your route will be drawn directly on the map. HazardPulse chooses the route with the lowest safety penalty, not simply the shortest distance.</div>}
            </section>
            <div className="alert-strip"><span>⚠️</span><div><b>{alerts.length ? `${alerts.length} active safety warning${alerts.length > 1 ? "s" : ""}` : "No high-risk warnings nearby"}</b><span>HazardPulse warnings are based on current risk intelligence and are advisory.</span></div><button className="mini-button" onClick={requestNotifications}>Enable browser alerts</button></div>
          </>
        )}

        {view === "operations" && (
          <>
            <div id="operations-top" className="page-header"><div><div className="eyebrow">FIELD RESPONSE OPERATIONS</div><h1>Field Response</h1><p>Execute assigned work, verify evidence and close hazards</p></div><div className="header-actions"><button className="refresh-button" onClick={fetchHazards}>↻ Refresh</button><span className="live-indicator"><span className="status-dot"></span>LIVE</span></div></div>
            <div className="stats-grid">{[["ACTIVE", activeHazards.length, "Open incidents"],["ASSIGNED", assignedCount,"Team assigned"],["IN PROGRESS",inProgressCount,"Field response"],["RESOLVED",resolvedCount,"Verified completions"]].map(([label,number,desc]) => <div className="stat-card" key={label}><div className="stat-label">{label}</div><div className="stat-number">{number}</div><div className="stat-description">{desc}</div></div>)}</div>
            <section id="operations-queue" className="panel operations-panel"><div className="panel-header"><div><h2>Response Queue</h2><span>Highest dynamic risk appears first</span></div><span className="panel-badge">{activeHazards.length} ACTIVE</span></div><div className="operations-list">{sortedActive.length === 0 ? <div className="empty-state">✓ No active response required</div> : sortedActive.map((hazard) => <div className="operation-card" key={hazard.id}><div className="operation-title"><div><strong>#{hazard.id} {typeIcon(hazard.type)} {typeLabel(hazard.type)}</strong><p>{hazard.description || "No description provided"}</p></div><span className={`risk-badge ${riskClass(getEffectiveRiskLevel(hazard))}`}>{getEffectiveRiskLevel(hazard)} · {getEffectiveRiskScore(hazard)}</span></div><div className="operation-meta"><span>📍 {Number(hazard.latitude).toFixed(4)}, {Number(hazard.longitude).toFixed(4)}</span><span>Status: <strong>{statusLabel(hazard.status)}</strong></span><span>Exposure: <strong>{hazard.exposure_label}</strong></span><span>Observations: <strong>{hazard.observation_count || 1}</strong></span>{hazard.work_order_id && <span>Work order: <strong>{hazard.work_order_id}</strong></span>}</div><div className="operation-actions"><select value={selectedTeams[hazard.id] || hazard.assigned_team || ""} onChange={(e) => setSelectedTeams({ ...selectedTeams, [hazard.id]: e.target.value })}><option value="">Select Team</option>{TEAMS.map((team) => <option key={team}>{team}</option>)}</select><button className="operation-button" onClick={() => assignTeam(hazard.id, selectedTeams[hazard.id] || hazard.assigned_team)}>Assign Team</button>{(hazard.status === "ASSIGNED" || hazard.status === "REPORTED") && <button className="operation-button primary" onClick={() => updateHazardStatus(hazard.id, "IN_PROGRESS")}>▶ Start Response</button>}{hazard.status === "IN_PROGRESS" && <><label className="proof-input">Field Proof<input type="file" accept="image/*" onChange={(e) => verifyProofFile(hazard.id, e.target.files?.[0] || null)} /></label>{proofResults[hazard.id] && <span className="proof-verified">✓ Proof verified {proofResults[hazard.id].verification_confidence}%</span>}<button className="operation-button success" disabled={proofLoading || !proofResults[hazard.id] || proofResults[hazard.id].status !== "PROOF_VERIFIED"} onClick={() => updateHazardStatus(hazard.id, "RESOLVED")}>✓ Mark Resolved</button></>}</div></div>)}</div></section>
            <div className="workflow-strip"><div><b>1 · Prioritize</b><span>Dynamic risk combines severity, exposure, confidence, observations and weather.</span></div><div><b>2 · Dispatch</b><span>Match the incident to a municipal response team and work order.</span></div><div><b>3 · Verify</b><span>Field evidence closes the loop and removes the hazard from active warnings.</span></div></div>
          </>
        )}

        {view === "analytics" && (
          <>
            <div className="page-header"><div><div className="eyebrow">SAFETY INTELLIGENCE</div><h1>Analytics</h1><p>Operational picture across the current prototype dataset</p></div></div>
            <div className="analytics-top"><div className="analytics-highlight"><span>Total reports</span><b>{hazards.length}</b><small>{hazards.length ? `${resolvedCount} resolved · ${activeHazards.length} active` : "No reports yet"}</small></div><div className="analytics-highlight"><span>Verification confidence</span><b>{hazards.length ? Math.round(hazards.reduce((sum,h) => sum + Number(h.verification_confidence || h.confidence || 0),0)/hazards.length) : 0}%</b><small>Average report confidence</small></div><div className="analytics-highlight"><span>Exposure pressure</span><b>{activeHazards.length ? Math.round(activeHazards.reduce((sum,h)=>sum+Number(h.exposure_score||0),0)/activeHazards.length) : 0}</b><small>Average active exposure score</small></div><div className="analytics-highlight"><span>Weather uplift</span><b>+{getWeatherRiskBonus()}</b><small>{demoWeather ? "Simulation" : "Current context"}</small></div></div>
            <div className="analytics-grid"><section className="panel"><div className="panel-header"><div><h2>Hazards by Type</h2><span>Current and historical reports</span></div></div><div className="bar-list">{HAZARD_TYPES.map((item) => { const count = hazards.filter((h)=>h.type===item.value).length; const width = hazards.length ? Math.max(4, (count/hazards.length)*100) : 4; return <div className="bar-row" key={item.value}><span>{item.icon} {item.label}</span><div><i style={{width:`${width}%`}}></i></div><b>{count}</b></div>; })}</div></section><section className="panel"><div className="panel-header"><div><h2>Risk Distribution</h2><span>Dynamic risk levels</span></div></div><div className="risk-donut"><div><b>{activeHazards.length}</b><span>active</span></div></div><div className="legend-list"><span><i className="legend-dot critical"></i>Critical <b>{criticalCount}</b></span><span><i className="legend-dot high"></i>High <b>{highCount}</b></span><span><i className="legend-dot medium"></i>Medium <b>{mediumCount}</b></span><span><i className="legend-dot low"></i>Low <b>{activeHazards.filter(h=>getEffectiveRiskLevel(h)==="LOW").length}</b></span></div></section></div>
            <section className="panel timeline-panel"><div className="panel-header"><div><h2>Intelligence Signals</h2><span>Why the system changes priority</span></div></div><div className="signal-grid"><div>🧠 <b>AI / verification</b><span>Photo confidence strengthens evidence.</span></div><div>📍 <b>GIS / exposure</b><span>Nearby vulnerable places increase urgency.</span></div><div>🔗 <b>Correlation</b><span>Repeated nearby observations support one incident.</span></div><div>🌧️ <b>Weather</b><span>Heavy rain can push a high-risk hazard to critical.</span></div></div></section>
          </>
        )}

        {view === "alerts" && (
          <>
            <div className="page-header"><div><div className="eyebrow">PUBLIC SAFETY NOTIFICATIONS</div><h1>Safety Alerts</h1><p>Location-aware warnings generated from the live hazard state</p></div><button className="refresh-button" onClick={requestNotifications}>🔔 Enable Browser Alerts</button></div>
            <section className="panel alerts-panel"><div className="panel-header"><div><h2>Active Warnings</h2><span>High and critical incidents only</span></div><span className="panel-badge">{alerts.length}</span></div><div className="alert-list">{alerts.length === 0 ? <div className="empty-state">✓ No high-risk alerts right now</div> : alerts.map((alert) => <div className="alert-card" key={alert.id}><div className={`alert-icon ${riskClass(alert.risk_level)}`}>⚠</div><div><strong>{alert.title}</strong><p>{alert.message}</p><small>Exposure: {alert.exposure} · Hazard #{alert.id}</small></div><button className="mini-button" onClick={() => navigateDashboard("authority", "authority-map", "map")}>View map</button></div>)}</div></section>
            <div className="safe-route-card"><div><b>Safer movement</b><span>OSRM calculates a drivable route, then HazardPulse scores available alternatives against active hazard proximity.</span></div><div className="route-controls"><input aria-label="Start latitude" value={routeForm.startLat} onChange={(e) => setRouteForm({ ...routeForm, startLat: e.target.value })} placeholder="Start lat" /><input aria-label="Start longitude" value={routeForm.startLng} onChange={(e) => setRouteForm({ ...routeForm, startLng: e.target.value })} placeholder="Start lng" /><input aria-label="Destination latitude" value={routeForm.endLat} onChange={(e) => setRouteForm({ ...routeForm, endLat: e.target.value })} placeholder="Destination lat" /><input aria-label="Destination longitude" value={routeForm.endLng} onChange={(e) => setRouteForm({ ...routeForm, endLng: e.target.value })} placeholder="Destination lng" /><button className="operation-button primary" onClick={calculateSaferRoute} disabled={routeLoading}>{routeLoading ? "Calculating..." : "Calculate Safer Route"}</button></div>{saferRoute && <div className="route-result">✓ {saferRoute.distance_km} km · {saferRoute.duration_min} min · {saferRoute.hazards_near_route.length ? `${saferRoute.hazards_near_route.length} hazard(s) near route` : "No active hazards near selected route"}</div>}<button className="operation-button" onClick={() => setView("citizen")}>Open Safety Map</button></div>
          </>
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
