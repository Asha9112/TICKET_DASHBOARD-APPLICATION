import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

/* ----------------- Helpers ----------------- */
const toNumber = (v) => Number(v) || 0;

const toMinutes = (txt) => {
  if (!txt || typeof txt !== "string") return 0;
  const [h, m] = txt.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};

const minutesToHours = (min) => +(min / 60).toFixed(2);

/* ----------------- Component ----------------- */
export default function AgentPerformanceCharts({
  rows = [],
  metricsRows = [],
  archivedRows = [], // NEW: archived tickets for yearly chart
}) {
  /* FILTER STATE */
  const [agent, setAgent] = useState("all");
  const [department, setDepartment] = useState("all");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [showDate, setShowDate] = useState(false);
  const dateRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (dateRef.current && !dateRef.current.contains(e.target)) {
        setShowDate(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* DROPDOWN VALUES */
  const agentOptions = useMemo(
    () => [...new Set(rows.map((r) => r.agentName).filter(Boolean))].sort(),
    [rows]
  );

  const departmentOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.departmentName).filter(Boolean))].sort(),
    [rows]
  );

  /* APPLY FILTERS (for agent-wise charts) */
  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (agent !== "all" && r.agentName !== agent) return false;
        if (department !== "all" && r.departmentName !== department) return false;
        return true;
      }),
    [rows, agent, department]
  );

  const filteredMetrics = useMemo(
    () =>
      metricsRows.filter((r) => {
        if (agent !== "all" && r.agentName !== agent) return false;
        if (department !== "all" && r.departmentName !== department) return false;

        if (!dateRange.start && !dateRange.end) return true;

        const d = new Date(r.createdTime);
        if (Number.isNaN(d.getTime())) return false;

        if (dateRange.start && d < new Date(dateRange.start)) return false;
        if (dateRange.end && d > new Date(dateRange.end)) return false;

        return true;
      }),
    [metricsRows, agent, department, dateRange]
  );

  const sortedRows = useMemo(
    () =>
      [...filteredRows].sort((a, b) =>
        (a.agentName || "").localeCompare(b.agentName || "")
      ),
    [filteredRows]
  );

  /* SUMMARY */
  const summary = useMemo(() => {
    let totalResolved = 0;
    let totalPending = 0;
    let totalResolutionHours = 0;
    let totalFirstResponseHours = 0;

    sortedRows.forEach((r) => {
      const resolved = toNumber(r.ticketsResolved);
      totalResolved += resolved;
      totalPending += toNumber(r.pendingCount);

      const resHrs =
        typeof r.avgResolutionHours === "number"
          ? r.avgResolutionHours
          : minutesToHours(toMinutes(r.avgResolutionText));

      const frHrs =
        typeof r.avgFirstResponseHours === "number"
          ? r.avgFirstResponseHours
          : minutesToHours(toMinutes(r.avgFirstResponseText));

      totalResolutionHours += resHrs * resolved;
      totalFirstResponseHours += frHrs * resolved;
    });

    return {
      totalCreated: totalResolved + totalPending,
      totalResolved,
      avgResolutionHours:
        totalResolved > 0 ? +(totalResolutionHours / totalResolved).toFixed(2) : 0,
      avgFirstResponseHours:
        totalResolved > 0 ? +(totalFirstResponseHours / totalResolved).toFixed(2) : 0,
    };
  }, [sortedRows]);

  if (!sortedRows.length) {
    return (
      <div style={{ padding: 1, textAlign: "center" }}>
        No data available for selected filters
      </div>
    );
  }

  /* CHART DATA: AGENT-WISE */
  const agentChartData = {
    labels: sortedRows.map((r) => r.agentName),
    datasets: [
      {
        label: "Tickets Created",
        data: sortedRows.map(
          (r) => toNumber(r.ticketsResolved) + toNumber(r.pendingCount)
        ),
        backgroundColor: "#1e4489",
      },
      {
        label: "Tickets Resolved",
        data: sortedRows.map((r) => toNumber(r.ticketsResolved)),
        backgroundColor: "#8fc63d",
      },
      {
        label: "Pending Tickets",
        data: sortedRows.map((r) => toNumber(r.pendingCount)),
        backgroundColor: "#bd2331",
      },
      // {
      //   label: "Avg Resolution (hrs)",
      //   data: sortedRows.map((r) =>
      //     typeof r.avgResolutionHours === "number"
      //       ? r.avgResolutionHours
      //       : minutesToHours(toMinutes(r.avgResolutionText))
      //   ),
      //   yAxisID: "y2",
      //   backgroundColor: "#5a2e9d",
      // },
    ],
  };

  const timeCompareData = {
    labels: sortedRows.map((r) => r.agentName),
    datasets: [
      {
        label: "Avg Resolution (hrs)",
        data: sortedRows.map((r) =>
          typeof r.avgResolutionHours === "number"
            ? r.avgResolutionHours
            : minutesToHours(toMinutes(r.avgResolutionText))
        ),
        backgroundColor: "#1e88e5",
      },
      {
        label: "Avg First Response (hrs)",
        data: sortedRows.map((r) =>
          typeof r.avgFirstResponseHours === "number"
            ? r.avgFirstResponseHours
            : minutesToHours(toMinutes(r.avgFirstResponseText))
        ),
        backgroundColor: "#ffb300",
      },
    ],
  };

  const statusSummaryData = {
    labels: ["Resolved", "Pending"],
    datasets: [
      {
        data: [
          summary.totalResolved,
          summary.totalCreated - summary.totalResolved,
        ],
        backgroundColor: ["#3fabe0", "#ef6724"],
      },
    ],
  };

  const statusTotalsData = {
    labels: ["Open", "Hold", "In Progress", "Escalated"],
    datasets: [
      {
        data: sortedRows.reduce(
          (a, r) => {
            a[0] += toNumber(r.openCount || r.open);
            a[1] += toNumber(r.holdCount || r.hold);
            a[2] += toNumber(r.inProgressCount || r.inProgress);
            a[3] += toNumber(r.escalatedCount || r.escalated);
            return a;
          },
          [0, 0, 0, 0]
        ),
        backgroundColor: ["#bd2331", "#ffc107", "#8fc63d", "#ef6724"],
      },
    ],
  };

  /* YEARLY DATA: FROM ARCHIVED ROWS (NOT METRICS) */
  const yearlyData = useMemo(() => {
    if (!archivedRows.length) {
      return { labels: [], datasets: [] };
    }

    // Apply same agent/department filters to archived rows
    const filteredArchived = archivedRows.filter((t) => {
      if (agent !== "all" && t.agentName !== agent) return false;
      if (department !== "all" && t.departmentName !== department) return false;
      // dateRange is optional for yearly chart; if you want it to respect date range,
      // uncomment the section below.
      /*
      if (dateRange.start || dateRange.end) {
        const d = t.createdTime ? new Date(t.createdTime) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        if (dateRange.start && d < new Date(dateRange.start)) return false;
        if (dateRange.end && d > new Date(dateRange.end)) return false;
      }
      */
      return true;
    });

    if (!filteredArchived.length) {
      return { labels: [], datasets: [] };
    }

    const map = {};
    const resolvedSet = new Set(["resolved", "closed", "archived", "completed"]);

    filteredArchived.forEach((t) => {
      const d = t.createdTime && new Date(t.createdTime);
      if (!d || Number.isNaN(d.getTime())) return;

      const y = d.getFullYear();
      if (!map[y]) map[y] = { created: 0, resolved: 0 };

      map[y].created += 1;
      if (resolvedSet.has((t.status || "").toLowerCase())) {
        map[y].resolved += 1;
      }
    });

    const years = Object.keys(map)
      .map((y) => Number(y))
      .sort((a, b) => a - b);

    return {
      labels: years.map(String),
      datasets: [
        {
          label: "Tickets Created",
          data: years.map((y) => map[y].created),
          backgroundColor: "#1e4489",
        },
        {
          label: "Tickets Resolved",
          data: years.map((y) => map[y].resolved),
          backgroundColor: "#bd2331",
        },
      ],
    };
  }, [archivedRows, agent, department, dateRange]);

  /* OPTIONS */
  const barOpts = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { beginAtZero: true } },
  };

  const agentOpts = {
    ...barOpts,
    scales: {
      y: { beginAtZero: true },
      y2: {
        beginAtZero: true,
        position: "right",
        grid: { drawOnChartArea: false },
      },
    },
  };

  /* STYLES */
  const container = {
    minHeight: "100vh",
    background: "linear-gradient(135deg,#667eea,#764ba2)",
    fontFamily: "Segoe UI",
  };

  const filterBar = {
    display: "flex",
    gap: 12,
    padding: 5,
    flexWrap: "wrap",
    background: "rgba(255,255,255,.95)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  };

  const selectStyle = {
    padding: "2px 2px",
    borderRadius: 2,
    border: "1px solid #ccc",
    minWidth: 160,
  };

  const summaryGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
    gap: 1,
    padding: 2,
  };

  const summaryCard = {
    background: "white",
    borderRadius: 12,
    padding: 2,
    textAlign: "center",
    boxShadow: "0 4px 16px rgba(0,0,0,.1)",
  };

  const valueStyle = { fontSize: 28, fontWeight: 700, marginTop: 6 };

  const chartCard = {
    background: "white",
    borderRadius: 6,
    padding: 16,
    margin: 1,
    height: 420, // Increased background box height
  };

  const chartTitle = {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 8,
  };

  /* UI */
  return (
    <div style={container}>
      {/* FILTER BAR */}
      <div style={filterBar}>
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All Agents</option>
          {agentOptions.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>

        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All Departments</option>
          {departmentOptions.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>

        <div ref={dateRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowDate((p) => !p)}
            style={selectStyle}
          >
            📅 {dateRange.start || dateRange.end ? "Custom Range" : "All Time"}
          </button>

          {showDate && (
            <div
              style={{
                position: "absolute",
                top: "110%",
                background: "white",
                border: "1px solid #ccc",
                padding: 10,
                borderRadius: 6,
                zIndex: 1000,
                width: 220,
              }}
            >
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) =>
                  setDateRange((p) => ({ ...p, start: e.target.value }))
                }
                style={{ width: "100%", marginBottom: 6 }}
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) =>
                  setDateRange((p) => ({ ...p, end: e.target.value }))
                }
                style={{ width: "100%", marginBottom: 6 }}
              />
              <button
                onClick={() => setDateRange({ start: "", end: "" })}
                style={{ width: "100%" }}
              >
                Reset
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SUMMARY */}
      <div style={summaryGrid}>
        <div style={summaryCard}>
          <div>Total Created Tickets</div>
          <div style={valueStyle}>{summary.totalCreated}</div>
        </div>
        <div style={summaryCard}>
          <div>Total Resolved Tickets</div>
          <div style={valueStyle}>{summary.totalResolved}</div>
        </div>
        <div style={summaryCard}>
          <div>Avg Resolution Time (hrs)</div>
          <div style={valueStyle}>{summary.avgResolutionHours}</div>
        </div>
        <div style={summaryCard}>
          <div>Avg First Response Time (hrs)</div>
          <div style={valueStyle}>{summary.avgFirstResponseHours}</div>
        </div>
      </div>

      {/* CHARTS */}
      <div style={chartCard}>
        <div style={chartTitle}>
          Tickets Created, Resolved, Pending & Avg Resolution (Agent-wise)
        </div>
        <div style={{ height: 400 }}> {/* Increased chart height */}
          <Bar data={agentChartData} options={agentOpts} />
        </div>
      </div>

      <div style={chartCard}>
        <div style={chartTitle}>Avg Resolution vs First Response (Agent-wise)</div>
        <div style={{ height: 340 }}> {/* Increased chart height */}
          <Bar data={timeCompareData} options={barOpts} />
        </div>
      </div>

      <div style={chartCard}>
        <div style={chartTitle}>Resolved vs Pending (Overall)</div>
        <div style={{ height: 320 }}> {/* Increased chart height */}
          <Doughnut data={statusSummaryData} />
        </div>
      </div>

      <div style={chartCard}>
        <div style={chartTitle}>Ticket Status Totals</div>
        <div style={{ height: 340 }}> {/* Increased chart height */}
          <Bar data={statusTotalsData} options={barOpts} />
        </div>
      </div>

      <div style={chartCard}>
        <div style={chartTitle}>Year-wise Tickets Created vs Resolved</div>
        <div style={{ height: 360 }}> {/* Increased chart height */}
          <Bar data={yearlyData} options={barOpts} />
        </div>
      </div>
    </div>
  );
}
