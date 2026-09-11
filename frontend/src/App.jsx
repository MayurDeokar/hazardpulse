import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

const PUNE_CENTER = [18.5204, 73.8567];

const hazardIcon = L.divIcon({
  className: "custom-hazard-marker",
  html: `
    <div style="
      width:18px;
      height:18px;
      background:#ef4444;
      border:3px solid white;
      border-radius:50%;
      box-shadow:0 0 12px rgba(239,68,68,.8);
    "></div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function App() {
  const [view, setView] = useState("authority");
  const [hazards, setHazards] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    type: "OPEN_MANHOLE",
    latitude: "18.5204",
    longitude: "73.8567",
    description: "",
  });

  const [selectedTeams, setSelectedTeams] = useState({});

  async function fetchHazards() {
    try {
      const response = await fetch(`${API_URL}/hazards`);

      if (!response.ok) {
        throw new Error("Failed to fetch hazards");
      }

      const data = await response.json();
      setHazards(data);
    } catch (error) {
      console.error("Fetch hazards error:", error);
    }
  }

  useEffect(() => {
    fetchHazards();

    const interval = setInterval(() => {
      fetchHazards();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  async function createHazard(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/hazards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: form.type,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          description: form.description,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create hazard");
      }

      setForm({
        type: "OPEN_MANHOLE",
        latitude: "18.5204",
        longitude: "73.8567",
        description: "",
      });

      await fetchHazards();

      alert("Hazard reported successfully!");
    } catch (error) {
      console.error(error);
      alert("Could not report hazard.");
    } finally {
      setLoading(false);
    }
  }

  async function assignTeam(hazardId, team) {
    if (!team) {
      alert("Please select a response team.");
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/hazards/${hazardId}/assign`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            team: team,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Assignment failed");
      }

      await fetchHazards();
    } catch (error) {
      console.error(error);
      alert("Could not assign team.");
    }
  }

  async function updateHazardStatus(hazardId, status) {
    try {
      const response = await fetch(
        `${API_URL}/hazards/${hazardId}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: status,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Status update failed");
      }

      await fetchHazards();
    } catch (error) {
      console.error(error);
      alert("Could not update hazard status.");
    }
  }

  const activeHazards = hazards.filter(
    (hazard) => hazard.status !== "RESOLVED"
  );

  const criticalCount = activeHazards.filter(
    (hazard) => hazard.risk_level === "CRITICAL"
  ).length;

  const highCount = activeHazards.filter(
    (hazard) => hazard.risk_level === "HIGH"
  ).length;

  const mediumCount = activeHazards.filter(
    (hazard) => hazard.risk_level === "MEDIUM"
  ).length;

  const resolvedCount = hazards.filter(
    (hazard) => hazard.status === "RESOLVED"
  ).length;

  const assignedCount = hazards.filter(
    (hazard) => hazard.status === "ASSIGNED"
  ).length;

  const inProgressCount = hazards.filter(
    (hazard) => hazard.status === "IN_PROGRESS"
  ).length;

  const typeLabel = (type) => {
    const labels = {
      OPEN_MANHOLE: "Open Manhole",
      ROAD_EXCAVATION: "Road Excavation",
      WATERLOGGING: "Waterlogging",
      FALLEN_TREE: "Fallen Tree",
    };

    return labels[type] || type;
  };

  const statusLabel = (status) => {
    const labels = {
      REPORTED: "Reported",
      ASSIGNED: "Assigned",
      IN_PROGRESS: "In Progress",
      RESOLVED: "Resolved",
    };

    return labels[status] || status;
  };

  const riskClass = (level) => {
    if (level === "CRITICAL") return "critical";
    if (level === "HIGH") return "high";
    if (level === "MEDIUM") return "medium";
    return "low";
  };

  return (
    <div className="app-shell">

      {/* SIDEBAR */}
      <aside className="sidebar">

        <div className="sidebar-brand">
          <div className="brand-icon">⚡</div>

          <div>
            <div className="brand-name">HazardPulse</div>
            <div className="brand-subtitle">SAFETY INTELLIGENCE</div>
          </div>
        </div>

        <nav className="sidebar-nav">

          <button
            className={`nav-item ${
              view === "authority" ? "active" : ""
            }`}
            onClick={() => setView("authority")}
          >
            ▦
            <span>Authority Dashboard</span>
          </button>

          <button
            className={`nav-item ${
              view === "citizen" ? "active" : ""
            }`}
            onClick={() => setView("citizen")}
          >
            ♟
            <span>Citizen Portal</span>
          </button>

          <button
            className={`nav-item ${
              view === "operations" ? "active" : ""
            }`}
            onClick={() => setView("operations")}
          >
            ⚙
            <span>Municipal Operations</span>
          </button>

          <button
            className={`nav-item ${
              view === "hazards" ? "active" : ""
            }`}
            onClick={() => setView("authority")}
          >
            △
            <span>Hazards</span>
          </button>

          <button
            className="nav-item"
            onClick={() => setView("operations")}
          >
            ♟
            <span>Response Teams</span>
          </button>

          <button
            className="nav-item"
            onClick={() => setView("authority")}
          >
            ▥
            <span>Analytics</span>
          </button>

        </nav>

        <div className="sidebar-footer">
          <div className="system-status">
            <span className="status-dot"></span>
            System Operational
          </div>

          <div className="footer-text">
            HazardPulse Platform
          </div>
        </div>

      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">

        {/* ================= AUTHORITY ================= */}

        {view === "authority" && (
          <>
            <div className="page-header">

              <div>
                <div className="eyebrow">
                  MUNICIPAL SAFETY CONTROL
                </div>

                <h1>Authority Dashboard</h1>

                <p>
                  Real-time monitoring of public safety hazards
                </p>
              </div>

              <div className="header-actions">

                <button
                  className="refresh-button"
                  onClick={fetchHazards}
                >
                  ↻ Refresh
                </button>

                <span className="live-indicator">
                  <span className="status-dot"></span>
                  LIVE
                </span>

              </div>

            </div>

            {/* STATS */}

            <div className="stats-grid">

              <div className="stat-card">
                <div className="stat-label">
                  CRITICAL
                </div>

                <div className="stat-number">
                  {criticalCount}
                </div>

                <div className="stat-description">
                  Immediate action
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">
                  HIGH RISK
                </div>

                <div className="stat-number">
                  {highCount}
                </div>

                <div className="stat-description">
                  Priority response
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">
                  MEDIUM RISK
                </div>

                <div className="stat-number">
                  {mediumCount}
                </div>

                <div className="stat-description">
                  Monitor closely
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">
                  RESOLVED
                </div>

                <div className="stat-number">
                  {resolvedCount}
                </div>

                <div className="stat-description">
                  Completed incidents
                </div>
              </div>

            </div>

            {/* MAP + PRIORITY */}

            <div className="dashboard-grid">

              <section className="panel map-panel">

                <div className="panel-header">
                  <div>
                    <h2>Live Hazard Map</h2>
                    <span>OpenStreetMap location intelligence</span>
                  </div>

                  <span className="panel-badge">
                    {activeHazards.length} ACTIVE
                  </span>
                </div>

                <div className="map-wrapper">

                  <MapContainer
                    center={PUNE_CENTER}
                    zoom={12}
                    style={{
                      width: "100%",
                      height: "100%",
                    }}
                  >

                    <TileLayer
                      attribution='&copy; OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {activeHazards.map((hazard) => (

                      <Marker
                        key={hazard.id}
                        position={[
                          hazard.latitude,
                          hazard.longitude,
                        ]}
                        icon={hazardIcon}
                      >

                        <Popup>

                          <strong>
                            {typeLabel(hazard.type)}
                          </strong>

                          <br />

                          Risk:{" "}
                          {hazard.risk_level || "LOW"}

                          <br />

                          Status:{" "}
                          {statusLabel(hazard.status)}

                          <br />

                          ID: #{hazard.id}

                        </Popup>

                      </Marker>

                    ))}

                  </MapContainer>

                </div>

              </section>

              <section className="panel priority-panel">

                <div className="panel-header">

                  <div>
                    <h2>Priority Incidents</h2>
                    <span>Requires authority attention</span>
                  </div>

                  <span className="panel-badge">
                    {activeHazards.length}
                  </span>

                </div>

                <div className="priority-list">

                  {activeHazards.length === 0 ? (

                    <div className="empty-state">
                      ✓ No active hazards
                    </div>

                  ) : (

                    activeHazards
                      .slice()
                      .sort(
                        (a, b) =>
                          (b.risk_score || 0) -
                          (a.risk_score || 0)
                      )
                      .map((hazard) => (

                        <div
                          className="priority-item"
                          key={hazard.id}
                        >

                          <div>
                            <strong>
                              #{hazard.id}{" "}
                              {typeLabel(hazard.type)}
                            </strong>

                            <div>
                              {hazard.description ||
                                "No description"}
                            </div>
                          </div>

                          <span
                            className={`risk-badge ${riskClass(
                              hazard.risk_level
                            )}`}
                          >
                            {hazard.risk_level || "LOW"}
                          </span>

                        </div>

                      ))

                  )}

                </div>

              </section>

            </div>

            {/* FEATURE CARDS */}

            <div className="feature-grid">

              <div className="feature-card">
                🧠
                <div>
                  <strong>AI Risk Intelligence</strong>
                  <span>
                    Analyze severity, exposure and
                    environmental conditions.
                  </span>
                </div>
              </div>

              <div className="feature-card">
                🌧️
                <div>
                  <strong>Environmental Context</strong>
                  <span>
                    Weather can dynamically increase
                    hazard response priority.
                  </span>
                </div>
              </div>

              <div className="feature-card">
                🚑
                <div>
                  <strong>Response Coordination</strong>
                  <span>
                    Coordinate municipal field teams.
                  </span>
                </div>
              </div>

            </div>
          </>
        )}

        {/* ================= CITIZEN ================= */}

        {view === "citizen" && (
          <>

            <div className="page-header">

              <div>
                <div className="eyebrow">
                  PUBLIC SAFETY REPORTING
                </div>

                <h1>Citizen Portal</h1>

                <p>
                  Report a temporary public safety hazard
                </p>
              </div>

            </div>

            <div className="citizen-layout">

              <section className="panel citizen-form-panel">

                <div className="panel-header">
                  <div>
                    <h2>Report Hazard</h2>
                    <span>
                      Help keep your community safe
                    </span>
                  </div>
                </div>

                <form
                  className="hazard-form"
                  onSubmit={createHazard}
                >

                  <label>
                    Hazard Type

                    <select
                      value={form.type}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          type: e.target.value,
                        })
                      }
                    >

                      <option value="OPEN_MANHOLE">
                        Open Manhole
                      </option>

                      <option value="ROAD_EXCAVATION">
                        Road Excavation / Deep Pit
                      </option>

                      <option value="WATERLOGGING">
                        Waterlogging
                      </option>

                      <option value="FALLEN_TREE">
                        Fallen Tree / Obstruction
                      </option>

                    </select>
                  </label>

                  <div className="form-row">

                    <label>
                      Latitude

                      <input
                        type="number"
                        step="any"
                        value={form.latitude}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            latitude: e.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Longitude

                      <input
                        type="number"
                        step="any"
                        value={form.longitude}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            longitude: e.target.value,
                          })
                        }
                      />
                    </label>

                  </div>

                  <label>
                    Description

                    <textarea
                      rows="5"
                      placeholder="Describe what you observed..."
                      value={form.description}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          description: e.target.value,
                        })
                      }
                    />

                  </label>

                  <label>
                    Photo

                    <input
                      type="file"
                      accept="image/*"
                    />

                  </label>

                  <button
                    className="submit-button"
                    type="submit"
                    disabled={loading}
                  >
                    {loading
                      ? "Submitting..."
                      : "Submit Hazard Report"}
                  </button>

                </form>

              </section>

              <section className="panel citizen-map-panel">

                <div className="panel-header">

                  <div>
                    <h2>Nearby Hazards</h2>
                    <span>
                      Active safety conditions
                    </span>
                  </div>

                </div>

                <div className="map-wrapper citizen-map">

                  <MapContainer
                    center={PUNE_CENTER}
                    zoom={12}
                    style={{
                      width: "100%",
                      height: "100%",
                    }}
                  >

                    <TileLayer
                      attribution='&copy; OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {activeHazards.map((hazard) => (

                      <Marker
                        key={hazard.id}
                        position={[
                          hazard.latitude,
                          hazard.longitude,
                        ]}
                        icon={hazardIcon}
                      >

                        <Popup>

                          <strong>
                            ⚠️{" "}
                            {typeLabel(hazard.type)}
                          </strong>

                          <br />

                          Hazard #{hazard.id}

                          <br />

                          Risk:{" "}
                          {hazard.risk_level || "LOW"}

                        </Popup>

                      </Marker>

                    ))}

                  </MapContainer>

                </div>

              </section>

            </div>

          </>
        )}

        {/* ================= MUNICIPAL OPERATIONS ================= */}

        {view === "operations" && (
          <>

            <div className="page-header">

              <div>
                <div className="eyebrow">
                  MUNICIPAL RESPONSE CONTROL
                </div>

                <h1>Municipal Operations</h1>

                <p>
                  Assign, coordinate and resolve field responses
                </p>
              </div>

              <div className="header-actions">

                <button
                  className="refresh-button"
                  onClick={fetchHazards}
                >
                  ↻ Refresh
                </button>

                <span className="live-indicator">
                  <span className="status-dot"></span>
                  LIVE
                </span>

              </div>

            </div>

            {/* OPERATIONS STATS */}

            <div className="stats-grid">

              <div className="stat-card">
                <div className="stat-label">
                  ACTIVE
                </div>

                <div className="stat-number">
                  {activeHazards.length}
                </div>

                <div className="stat-description">
                  Open incidents
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">
                  ASSIGNED
                </div>

                <div className="stat-number">
                  {assignedCount}
                </div>

                <div className="stat-description">
                  Team assigned
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">
                  IN PROGRESS
                </div>

                <div className="stat-number">
                  {inProgressCount}
                </div>

                <div className="stat-description">
                  Field response
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">
                  RESOLVED
                </div>

                <div className="stat-number">
                  {resolvedCount}
                </div>

                <div className="stat-description">
                  Completed responses
                </div>
              </div>

            </div>

            {/* RESPONSE QUEUE */}

            <section className="panel operations-panel">

              <div className="panel-header">

                <div>
                  <h2>Response Queue</h2>

                  <span>
                    Prioritized municipal field operations
                  </span>
                </div>

                <span className="panel-badge">
                  {activeHazards.length} ACTIVE
                </span>

              </div>

              <div className="operations-list">

                {activeHazards.length === 0 ? (

                  <div className="empty-state">
                    ✓ No active response required
                  </div>

                ) : (

                  activeHazards
                    .slice()
                    .sort(
                      (a, b) =>
                        (b.risk_score || 0) -
                        (a.risk_score || 0)
                    )
                    .map((hazard) => (

                      <div
                        className="operation-card"
                        key={hazard.id}
                      >

                        <div className="operation-main">

                          <div className="operation-title">

                            <div>
                              <strong>
                                #{hazard.id}{" "}
                                {typeLabel(hazard.type)}
                              </strong>

                              <p>
                                {hazard.description ||
                                  "No description provided"}
                              </p>
                            </div>

                            <span
                              className={`risk-badge ${riskClass(
                                hazard.risk_level
                              )}`}
                            >
                              {hazard.risk_level || "LOW"}
                            </span>

                          </div>

                          <div className="operation-meta">

                            <span>
                              📍{" "}
                              {Number(
                                hazard.latitude
                              ).toFixed(4)}
                              ,{" "}
                              {Number(
                                hazard.longitude
                              ).toFixed(4)}
                            </span>

                            <span>
                              Status:{" "}
                              <strong>
                                {statusLabel(
                                  hazard.status
                                )}
                              </strong>
                            </span>

                            {hazard.assigned_team && (
                              <span>
                                👷{" "}
                                {hazard.assigned_team}
                              </span>
                            )}

                          </div>

                        </div>

                        <div className="operation-actions">

                          {/* TEAM SELECT */}

                          <select
                            value={
                              selectedTeams[hazard.id] ||
                              hazard.assigned_team ||
                              ""
                            }
                            onChange={(e) =>
                              setSelectedTeams({
                                ...selectedTeams,
                                [hazard.id]:
                                  e.target.value,
                              })
                            }
                          >

                            <option value="">
                              Select Team
                            </option>

                            <option value="Road Safety Team">
                              Road Safety Team
                            </option>

                            <option value="Drainage Team">
                              Drainage Team
                            </option>

                            <option value="Tree Removal Team">
                              Tree Removal Team
                            </option>

                            <option value="Emergency Response Team">
                              Emergency Response Team
                            </option>

                          </select>

                          <button
                            className="operation-button"
                            onClick={() =>
                              assignTeam(
                                hazard.id,
                                selectedTeams[
                                  hazard.id
                                ] ||
                                  hazard.assigned_team
                              )
                            }
                          >
                            Assign Team
                          </button>

                          {/* START RESPONSE */}

                          {(hazard.status ===
                            "ASSIGNED" ||
                            hazard.status ===
                              "REPORTED") && (

                            <button
                              className="operation-button primary"
                              onClick={() =>
                                updateHazardStatus(
                                  hazard.id,
                                  "IN_PROGRESS"
                                )
                              }
                            >
                              ▶ Start Response
                            </button>

                          )}

                          {/* RESOLVE */}

                          {hazard.status ===
                            "IN_PROGRESS" && (

                            <button
                              className="operation-button success"
                              onClick={() =>
                                updateHazardStatus(
                                  hazard.id,
                                  "RESOLVED"
                                )
                              }
                            >
                              ✓ Mark Resolved
                            </button>

                          )}

                        </div>

                      </div>

                    ))

                )}

              </div>

            </section>

            {/* RESPONSE WORKFLOW */}

            <div className="feature-grid">

              <div className="feature-card">
                📋
                <div>
                  <strong>1. Prioritize</strong>
                  <span>
                    Highest-risk incidents appear
                    first.
                  </span>
                </div>
              </div>

              <div className="feature-card">
                👷
                <div>
                  <strong>2. Dispatch</strong>
                  <span>
                    Assign the appropriate municipal
                    response team.
                  </span>
                </div>
              </div>

              <div className="feature-card">
                ✓
                <div>
                  <strong>3. Resolve</strong>
                  <span>
                    Field response updates the
                    incident lifecycle.
                  </span>
                </div>
              </div>

            </div>

          </>
        )}

      </main>

    </div>
  );
}

export default App;