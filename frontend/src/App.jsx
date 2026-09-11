import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
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

function App() {
  const [view, setView] = useState("authority");
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

  const setRole = (role) => {
    setSessionRole(role);
    localStorage.setItem("hazardpulse-role", role);
    showToast(`Demo role switched to ${role}.`);
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

  async function updateHazardStatus(hazardId, status) {
    let proofName = null;
    if (status === "RESOLVED") {
      const file = proofFiles[hazardId];
      if (file) {
        setProofLoading(true);
        try {
          const data = new FormData();
          data.append("image", file);
          const response = await fetch(`${API_URL}/resolution-proof`, { method: "POST", body: data });
          if (!response.ok) throw new Error("Proof upload failed");
          const proof = await response.json();
          proofName = proof.filename;
        } catch (error) {
          console.error(error);
          showToast("Proof upload failed; response not closed.");
          setProofLoading(false);
          return;
        }
        setProofLoading(false);
      }
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
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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
      </MapContainer>
    </div>
  );

  const stats = [
    ["CRITICAL", criticalCount, "Immediate action"],
    ["HIGH RISK", highCount, "Priority response"],
    ["MEDIUM RISK", mediumCount, "Monitor closely"],
    ["RESOLVED", resolvedCount, "Completed incidents"],
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">⚡</div>
          <div><div className="brand-name">HazardPulse</div><div className="brand-subtitle">SAFETY INTELLIGENCE</div></div>
        </div>

        <div className="demo-role-card">
          <span>DEMO ACCESS</span>
          <select value={sessionRole} onChange={(e) => setRole(e.target.value)}>
            <option>Authority</option><option>Citizen</option><option>Field Officer</option>
          </select>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${view === "authority" ? "active" : ""}`} onClick={() => setView("authority")}>▦ <span>Authority Dashboard</span></button>
          <button className={`nav-item ${view === "citizen" ? "active" : ""}`} onClick={() => setView("citizen")}>♟ <span>Citizen Portal</span></button>
          <button className={`nav-item ${view === "operations" ? "active" : ""}`} onClick={() => setView("operations")}>⚙ <span>Municipal Operations</span></button>
          <button className={`nav-item ${view === "analytics" ? "active" : ""}`} onClick={() => setView("analytics")}>▥ <span>Analytics</span></button>
          <button className={`nav-item ${view === "alerts" ? "active" : ""}`} onClick={() => setView("alerts")}>⚠ <span>Safety Alerts <b className="nav-count">{alerts.length}</b></span></button>
        </nav>

        <div className="sidebar-footer">
          <div className="system-status"><span className="status-dot"></span>System Operational</div>
          <div className="footer-text">HazardPulse Platform · Prototype</div>
        </div>
      </aside>

      <main className="main-content">
        <div className="global-demo-bar">
          <div><b>DEMO MODE</b><span>{demoWeather ? "Heavy rain simulation active" : "Live environmental context"}</span></div>
          <div className="demo-actions">
            <button className={`mini-button ${demoWeather ? "danger" : ""}`} onClick={toggleDemoWeather}>{demoWeather ? "☀ Restore Weather" : "🌧 Simulate Heavy Rain"}</button>
            <button className="mini-button" onClick={requestNotifications}>🔔 Enable Alerts</button>
          </div>
        </div>

        {view === "authority" && (
          <>
            <div className="page-header"><div><div className="eyebrow">MUNICIPAL SAFETY CONTROL</div><h1>Authority Dashboard</h1><p>Real-time monitoring of public safety hazards</p></div><div className="header-actions"><button className="refresh-button" onClick={() => { fetchHazards(); fetchWeather(); }}>↻ Refresh</button><span className="live-indicator"><span className="status-dot"></span>LIVE</span></div></div>

            <div className="stats-grid">{stats.map(([label, number, desc]) => <div className="stat-card" key={label}><div className="stat-label">{label}</div><div className="stat-number">{number}</div><div className="stat-description">{desc}</div></div>)}</div>

            <div className="dashboard-grid">
              <section className="panel map-panel"><div className="panel-header"><div><h2>Live Hazard Map</h2><span>OSM + GIS exposure intelligence</span></div><span className="panel-badge">{activeHazards.length} ACTIVE</span></div>{renderMap()}</section>
              <section className="panel priority-panel"><div className="panel-header"><div><h2>Priority Incidents</h2><span>Risk + exposure + weather + observations</span></div><span className="panel-badge">{sortedActive.length}</span></div><div className="priority-list">{sortedActive.length === 0 ? <div className="empty-state">✓ No active hazards</div> : sortedActive.map((hazard) => <div className="priority-item" key={hazard.id}><div><strong>#{hazard.id} {typeIcon(hazard.type)} {typeLabel(hazard.type)}</strong><div>{hazard.description || "No description"}</div><small>{hazard.exposure_label} exposure · {hazard.observation_count || 1} observation(s)</small></div><span className={`risk-badge ${riskClass(getEffectiveRiskLevel(hazard))}`}>{getEffectiveRiskLevel(hazard)} · {getEffectiveRiskScore(hazard)}</span></div>)}</div></section>
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
            <div className="page-header"><div><div className="eyebrow">PUBLIC SAFETY REPORTING</div><h1>Citizen Portal</h1><p>Report a temporary public safety hazard and see warnings near you</p></div></div>
            <div className="citizen-layout">
              <section className="panel citizen-form-panel"><div className="panel-header"><div><h2>Report Hazard</h2><span>Detect · Verify · Assess</span></div></div>
                <form className="hazard-form" onSubmit={createHazard}>
                  <label>Hazard Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{HAZARD_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <div className="form-row"><label>Latitude<input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></label><label>Longitude<input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></label></div>
                  <button type="button" className="location-button" onClick={captureLocation}>◎ Capture GPS Location</button>{locationMessage && <div className="helper-text">{locationMessage}</div>}
                  <label>Description<textarea rows="4" placeholder="Describe what you observed..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
                  <label>Photo<input type="file" accept="image/*" onChange={(e) => verifySelectedPhoto(e.target.files?.[0])} /></label>
                  {verification && <div className="verification-card"><div><b>✓ AI Verification</b><span>{verification.engine}</span></div><strong>{verification.confidence}%</strong></div>}
                  <button className="submit-button" type="submit" disabled={loading}>{loading ? "Processing intelligence..." : "Submit Hazard Report"}</button>
                </form>
              </section>
              <section className="panel citizen-map-panel"><div className="panel-header"><div><h2>Nearby Hazards & Warnings</h2><span>Active hazards are visible before you travel</span></div><span className="panel-badge">{alerts.length} ALERTS</span></div>{renderMap("citizen-map")}</section>
            </div>
            <div className="alert-strip"><span>⚠️</span><div><b>{alerts.length ? `${alerts.length} active safety warning${alerts.length > 1 ? "s" : ""}` : "No high-risk warnings nearby"}</b><span>HazardPulse warnings are based on current risk intelligence and are advisory.</span></div><button className="mini-button" onClick={requestNotifications}>Enable browser alerts</button></div>
          </>
        )}

        {view === "operations" && (
          <>
            <div className="page-header"><div><div className="eyebrow">MUNICIPAL RESPONSE CONTROL</div><h1>Municipal Operations</h1><p>Prioritize, dispatch and verify field responses</p></div><div className="header-actions"><button className="refresh-button" onClick={fetchHazards}>↻ Refresh</button><span className="live-indicator"><span className="status-dot"></span>LIVE</span></div></div>
            <div className="stats-grid">{[["ACTIVE", activeHazards.length, "Open incidents"],["ASSIGNED", assignedCount,"Team assigned"],["IN PROGRESS",inProgressCount,"Field response"],["RESOLVED",resolvedCount,"Verified completions"]].map(([label,number,desc]) => <div className="stat-card" key={label}><div className="stat-label">{label}</div><div className="stat-number">{number}</div><div className="stat-description">{desc}</div></div>)}</div>
            <section className="panel operations-panel"><div className="panel-header"><div><h2>Response Queue</h2><span>Highest dynamic risk appears first</span></div><span className="panel-badge">{activeHazards.length} ACTIVE</span></div><div className="operations-list">{sortedActive.length === 0 ? <div className="empty-state">✓ No active response required</div> : sortedActive.map((hazard) => <div className="operation-card" key={hazard.id}><div className="operation-title"><div><strong>#{hazard.id} {typeIcon(hazard.type)} {typeLabel(hazard.type)}</strong><p>{hazard.description || "No description provided"}</p></div><span className={`risk-badge ${riskClass(getEffectiveRiskLevel(hazard))}`}>{getEffectiveRiskLevel(hazard)} · {getEffectiveRiskScore(hazard)}</span></div><div className="operation-meta"><span>📍 {Number(hazard.latitude).toFixed(4)}, {Number(hazard.longitude).toFixed(4)}</span><span>Status: <strong>{statusLabel(hazard.status)}</strong></span><span>Exposure: <strong>{hazard.exposure_label}</strong></span><span>Observations: <strong>{hazard.observation_count || 1}</strong></span>{hazard.work_order_id && <span>Work order: <strong>{hazard.work_order_id}</strong></span>}</div><div className="operation-actions"><select value={selectedTeams[hazard.id] || hazard.assigned_team || ""} onChange={(e) => setSelectedTeams({ ...selectedTeams, [hazard.id]: e.target.value })}><option value="">Select Team</option>{TEAMS.map((team) => <option key={team}>{team}</option>)}</select><button className="operation-button" onClick={() => assignTeam(hazard.id, selectedTeams[hazard.id] || hazard.assigned_team)}>Assign Team</button>{(hazard.status === "ASSIGNED" || hazard.status === "REPORTED") && <button className="operation-button primary" onClick={() => updateHazardStatus(hazard.id, "IN_PROGRESS")}>▶ Start Response</button>}{hazard.status === "IN_PROGRESS" && <><label className="proof-input">Proof<input type="file" accept="image/*" onChange={(e) => setProofFiles({ ...proofFiles, [hazard.id]: e.target.files?.[0] || null })} /></label><button className="operation-button success" disabled={proofLoading} onClick={() => updateHazardStatus(hazard.id, "RESOLVED")}>✓ {proofLoading ? "Uploading..." : "Mark Resolved"}</button></>}</div></div>)}</div></section>
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
            <section className="panel alerts-panel"><div className="panel-header"><div><h2>Active Warnings</h2><span>High and critical incidents only</span></div><span className="panel-badge">{alerts.length}</span></div><div className="alert-list">{alerts.length === 0 ? <div className="empty-state">✓ No high-risk alerts right now</div> : alerts.map((alert) => <div className="alert-card" key={alert.id}><div className={`alert-icon ${riskClass(alert.risk_level)}`}>⚠</div><div><strong>{alert.title}</strong><p>{alert.message}</p><small>Exposure: {alert.exposure} · Hazard #{alert.id}</small></div><button className="mini-button" onClick={() => setView("citizen")}>View map</button></div>)}</div></section>
            <div className="safe-route-card"><div><b>Safer movement</b><span>For the prototype, route guidance uses hazard avoidance zones on the GIS map. A production deployment can connect OSRM/Mapbox to calculate a full alternate route.</span></div><button className="operation-button primary" onClick={() => setView("citizen")}>Open Safety Map</button></div>
          </>
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
