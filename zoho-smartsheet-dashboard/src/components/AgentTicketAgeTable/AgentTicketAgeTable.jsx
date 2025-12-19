// src/components/AgentTicketAgeTable/AgentTicketAgeTable.jsx

import React, { useEffect, useMemo, useState } from "react";

import MetricsTable from "./MetricsTable";
import PendingTable from "./PendingTable";
import ArchivedTable from "./ArchivedTable";
import DepartmentAgeTable from "./DepartmentAgeTable";
import AgentAgeTable from "./AgentAgeTable";
import { exportToExcel } from "../../utils/exportToExcel";
import AgentPerformanceTable from "./AgentPerformanceTable";
import AgentPerformanceCharts from "./AgentPerformanceCharts";


import {
  formatDateWithMonthName,
  formatToIST,
  fromZohoHrsToHM,
  zohoHrsToMinutes,
  minutesToHM,
  minutesToDaysLabel,
  getFirstResponseDateTime,
  normalizeStatus,
} from "./utils";

import {
  baseFont,
  centerCellStyle,
  leftCellStyle,
  centerCellStyleHovered,
  serialHeaderStyle,
  headerStyle3D,
  rowBaseStyle,
} from "./styles";

const statusColors = {
  open: "#bd2331",
  hold: "#ffc107",
  inProgress: "#8fc63d",
  escalated: "#ef6724",
  unassigned: "#1e4489",
};

export default function AgentTicketAgeTable({
  membersData,
  metricsRows = [],
  onClose,
  selectedAges = ["fifteenDays", "sixteenToThirty", "month"],
  selectedStatuses = [],
  showTimeDropdown,
  selectedDepartmentId,
  selectedAgentNames = [],
  departmentsMap = {},
  departmentViewEnabled,
  setDepartmentViewEnabled,
  archivedRows = [],
  showAgentPerformance = false, // NEW
}) {
  const [hoveredRowIndex, setHoveredRowIndex] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(""); // YYYY-MM-DD
  const [agentPerfView, setAgentPerfView] = useState("charts"); // "charts" | "table"
  const [showDateRange, setShowDateRange] = useState(false);



  const showMetricsTable = selectedAges.includes("metrics");
  const showPendingTable = selectedAges.includes("pending");
  const showArchivedTable = selectedAges.includes("archived");
  const showAgentPerformanceTable = showAgentPerformance; // NEW
const archivedColumns = [
  { key: "siNo", label: "SI. NO." },
  { key: "agentName", label: "Agent Name" },
  { key: "departmentName", label: "Department" },
  { key: "ticketNumber", label: "Ticket Number" },
  { key: "subject", label: "Subject" },
  { key: "status", label: "Status" },
  { key: "createdTime", label: "Created" },
  { key: "closedTime", label: "Closed" },
  { key: "resolutionTimeHours", label: "Resolution Time (Hours)" },

  // ✅ NEW COLUMN (THIS IS THE FIX)
  { key: "firstResponseTime", label: "First Response Time" },
];


  const ageColumns = [
    {
      key: "fifteenDays",
      label: "1 - 15 Days Tickets",
      ageProp: "BetweenOneAndFifteenDays",
    },
    {
      key: "sixteenToThirty",
      label: "16 - 30 Days Tickets",
      ageProp: "BetweenSixteenAndThirtyDays",
    },
    { key: "month", label: "30+ Days Tickets", ageProp: "OlderThanThirtyDays" },
  ];

  const metricsColumns = [
    { key: "agentName", label: "Agent Name" },
    { key: "ticketNumber", label: "Ticket Number" },
    { key: "status", label: "Ticket Status" },
    { key: "departmentName", label: "Department" },
    { key: "createdTime", label: "Ticket Created (IST)" },
    { key: "firstResponseTime", label: "First Response Time" },
    // { key: "resolutionTime", label: "Resolution Time" },
    { key: "threadCount", label: "Threads" },
    { key: "responseCount", label: "User Response" },
    { key: "outgoingCount", label: "Agent Response" },
    { key: "reopenCount", label: "Reopens" },
    { key: "reassignCount", label: "Reassigns" },
    { key: "stagingData", label: "Staging (Status / Time)" },
    { key: "agentsHandled", label: "Agents (Name / Time)" },
    // { key: "avgFirstResponse", label: "Avg First Response Time & Days" },
  ];

  const visibleAgeColumns = ageColumns.filter((col) =>
    selectedAges.includes(col.key)
  );

  const columnsToShow = [
    { key: "serial", label: "SI. NO." },
    { key: "name", label: "Agent Name" },
    ...(selectedDepartmentId ? [{ key: "department", label: "Department" }] : []),
    { key: "total", label: "Total Ticket Count" },
    ...visibleAgeColumns,
  ];

  const statusOrder = ["open", "hold", "inProgress", "escalated"];

  const statusMapSort = {
    open: 0,
    hold: 1,
    inprogress: 2,
    inProgress: 2,
    escalated: 3,
  };

  const normalizedStatusKeys =
    selectedStatuses && selectedStatuses.length > 0
      ? selectedStatuses.map((st) => normalizeStatus(st.value || st))
      : [];

  const pendingTableColumns = [
    { key: "name", label: "Agent Name" },
    { key: "department", label: "Department Name" },
    { key: "totalTickets", label: "Total Pending Tickets" },
    { key: "status", label: "Ticket Status" },
    { key: "ticketNumber", label: "Ticket Number" },
    { key: "ticketCreated", label: "Ticket Created Date & Time" },
    { key: "daysNotResponded", label: "Ticket Age Days " },
  ];

  const normalizedStatusKeysSet =
    normalizedStatusKeys.length > 0 ? new Set(normalizedStatusKeys) : null;
  // ------------------- METRICS TABLE DATA & FILTERS -------------------

  const filteredMetricsRows = useMemo(() => {
    if (!metricsRows || !Array.isArray(metricsRows)) return [];

    const start =
      startDate && !Number.isNaN(Date.parse(startDate))
        ? new Date(startDate + "T00:00:00")
        : null;
    const end =
      endDate && !Number.isNaN(Date.parse(endDate))
        ? new Date(endDate + "T23:59:59")
        : null;

    return metricsRows.filter((row) => {
      const agentOk =
        !selectedAgentNames?.length ||
        selectedAgentNames.includes(row.agentName);

      const departmentOk =
        !selectedDepartmentId ||
        row.departmentId === selectedDepartmentId ||
        row.departmentName === departmentsMap[selectedDepartmentId]?.name;

      const rowStatusNorm = normalizeStatus(row.status);
      const statusOk =
        !normalizedStatusKeys?.length ||
        normalizedStatusKeys.includes(rowStatusNorm);

      let dateOk = true;
      if (start || end) {
        const d = row.createdTime ? new Date(row.createdTime) : null;
        if (!d || Number.isNaN(d.getTime())) {
          dateOk = false;
        } else {
          if (start && d < start) dateOk = false;
          if (end && d > end) dateOk = false;
        }
      }

      return agentOk && departmentOk && statusOk && dateOk;
    });
  }, [
    metricsRows,
    selectedAgentNames,
    selectedDepartmentId,
    departmentsMap,
    normalizedStatusKeys,
    startDate,
    endDate,
  ]);

  const sortedMetricsRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    let rows = [...filteredMetricsRows];

    if (q) {
      rows = rows.filter((r) => {
        const combined = `${r.agentName || ""} ${r.ticketNumber || ""} ${
          r.status || ""
        } ${r.departmentName || ""} ${r.createdTime || ""}`.toLowerCase();
        return combined.includes(q);
      });
    }

    return rows.sort((a, b) =>
      (a.agentName || "").localeCompare(b.agentName || "", undefined, {
        sensitivity: "base",
      })
    );
  }, [filteredMetricsRows, searchTerm]);

  const agentAverageMap = useMemo(() => {
    const acc = {};

    sortedMetricsRows.forEach((row) => {
      const name = row.agentName || "Unknown";
      if (!acc[name]) {
        acc[name] = { frSum: 0, frCount: 0, resSum: 0, resCount: 0 };
      }

      const frMin = zohoHrsToMinutes(row.firstResponseTime);
      if (frMin !== null) {
        acc[name].frSum += frMin;
        acc[name].frCount += 1;
      }

      const resMin = zohoHrsToMinutes(row.resolutionTime);
      if (resMin !== null) {
        acc[name].resSum += resMin;
        acc[name].resCount += 1;
      }
    });

    const out = {};
    Object.entries(acc).forEach(([name, v]) => {
      const frAvgMin = v.frCount ? Math.round(v.frSum / v.frCount) : null;
      const resAvgMin = v.resCount ? Math.round(v.resSum / v.resCount) : null;
      out[name] = {
        avgFirstResponseHM: frAvgMin != null ? minutesToHM(frAvgMin) : "-",
        avgFirstResponseMin: frAvgMin,
        avgResolutionHM: resAvgMin != null ? minutesToHM(resAvgMin) : "-",
        avgResolutionMin: resAvgMin,
      };
    });
    return out;
  }, [sortedMetricsRows]);

  // ---- METRICS PAGINATION (UI OUTSIDE TABLE) ----

  const [metricsPage, setMetricsPage] = useState(1);
  const metricsPageSize = 200;

  useEffect(() => {
    setMetricsPage(1);
  }, [searchTerm, selectedAgentNames, selectedDepartmentId, selectedStatuses]);

  const metricsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedMetricsRows.length / metricsPageSize)),
    [sortedMetricsRows.length, metricsPageSize]
  );

  const pagedMetricsRows = useMemo(() => {
    const start = (metricsPage - 1) * metricsPageSize;
    return sortedMetricsRows.slice(start, start + metricsPageSize);
  }, [sortedMetricsRows, metricsPage, metricsPageSize]);

  // ------------------- PENDING TABLE DATA -------------------

  const pendingTableRows = useMemo(() => {
    if (!membersData || !Array.isArray(membersData)) return [];

    let filteredAgents = membersData;

    if (selectedDepartmentId) {
      filteredAgents = filteredAgents.filter(
        (agent) =>
          Array.isArray(agent.departmentIds) &&
          agent.departmentIds.includes(selectedDepartmentId)
      );
    }

    if (selectedAgentNames && selectedAgentNames.length > 0) {
      filteredAgents = filteredAgents.filter((agent) =>
        selectedAgentNames.includes(agent.name)
      );
    }

    let rows = [];

    filteredAgents.forEach((agent) => {
      (agent.pendingTickets || [])
        .filter(
          (tkt) =>
            !selectedDepartmentId ||
            tkt.departmentId === selectedDepartmentId ||
            tkt.departmentName === departmentsMap[selectedDepartmentId]?.name
        )
        .forEach((tkt) => {
          const tktNorm = normalizeStatus(tkt.status);

          if (normalizedStatusKeysSet && !normalizedStatusKeysSet.has(tktNorm))
            return;

          const sortKey = tktNorm === "inprogress" ? "inProgress" : tktNorm;

          const dr =
            tkt.daysNotResponded !== undefined &&
            tkt.daysNotResponded !== "" &&
            !Number.isNaN(Number(tkt.daysNotResponded))
              ? Number(tkt.daysNotResponded) < 1
                ? 0
                : Number(tkt.daysNotResponded)
              : "";

          rows.push({
            name: agent.name || "",
            department: tkt.departmentName || "",
            status: tkt.status || "",
            statusSort: statusMapSort[sortKey] ?? 99,
            ticketNumber: tkt.ticketNumber || "",
            ticketCreated: tkt.ticketCreated || "",
            daysNotResponded: dr,
          });
        });
    });

    // date filter for pending table (ticketCreated)
    const start =
      startDate && !Number.isNaN(Date.parse(startDate))
        ? new Date(startDate + "T00:00:00")
        : null;
    const end =
      endDate && !Number.isNaN(Date.parse(endDate))
        ? new Date(endDate + "T23:59:59")
        : null;

    if (start || end) {
      rows = rows.filter((r) => {
        const d = r.ticketCreated ? new Date(r.ticketCreated) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    }

    return rows.sort((a, b) => {
      const nameCmp = a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
      });
      if (nameCmp !== 0) return nameCmp;
      return (a.statusSort ?? 99) - (b.statusSort ?? 99);
    });
  }, [
    membersData,
    selectedDepartmentId,
    selectedAgentNames,
    normalizedStatusKeysSet,
    departmentsMap,
    startDate,
    endDate,
    statusMapSort,
  ]);

  const groupedPendingRows = useMemo(() => {
    const grouped = {};
    pendingTableRows.forEach((row) => {
      if (!grouped[row.name]) grouped[row.name] = [];
      grouped[row.name].push(row);
    });

    const finalRows = [];
    Object.keys(grouped).forEach((agent) => {
      const totalTickets = grouped[agent].length;
      grouped[agent].forEach((row, i) => {
        finalRows.push({
          ...row,
          totalTickets,
          _isFirst: i === 0,
          _rowSpan: grouped[agent].length,
        });
      });
    });
    return finalRows;
  }, [pendingTableRows]);

  const searchedGroupedPendingRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return groupedPendingRows;

    const filtered = pendingTableRows.filter((row) => {
      const combined = `${row.name} ${row.department} ${row.status} ${
        row.ticketNumber
      } ${row.ticketCreated} ${row.daysNotResponded}`.toLowerCase();
      return combined.includes(q);
    });

    const grouped = {};
    filtered.forEach((row) => {
      if (!grouped[row.name]) grouped[row.name] = [];
      grouped[row.name].push(row);
    });

    const finalRows = [];
    Object.keys(grouped).forEach((agent) => {
      const totalTickets = grouped[agent].length;
      grouped[agent].forEach((row, i) => {
        finalRows.push({
          ...row,
          totalTickets,
          _isFirst: i === 0,
          _rowSpan: grouped[agent].length,
        });
      });
    });
    return finalRows;
  }, [pendingTableRows, groupedPendingRows, searchTerm]);

  // ------------------- DEPARTMENT VIEW DATA -------------------

  const departmentRows = useMemo(() => {
    if (!departmentViewEnabled) return null;

    const byDept = {};
    Object.entries(departmentsMap).forEach(([deptId, info]) => {
      byDept[deptId] = {
        departmentName: info.name || deptId,
        ticketSet: new Set(),
        tickets_1_7_open: 0,
        tickets_1_7_hold: 0,
        tickets_1_7_inProgress: 0,
        tickets_1_7_escalated: 0,
        tickets_8_15_open: 0,
        tickets_8_15_hold: 0,
        tickets_8_15_inProgress: 0,
        tickets_8_15_escalated: 0,
        tickets_15plus_open: 0,
        tickets_15plus_hold: 0,
        tickets_15plus_inProgress: 0,
        tickets_15plus_escalated: 0,
        tickets_1_7_open_numbers: [],
        tickets_1_7_hold_numbers: [],
        tickets_1_7_inProgress_numbers: [],
        tickets_1_7_escalated_numbers: [],
        tickets_8_15_open_numbers: [],
        tickets_8_15_hold_numbers: [],
        tickets_8_15_inProgress_numbers: [],
        tickets_8_15_escalated_numbers: [],
        tickets_15plus_open_numbers: [],
        tickets_15plus_hold_numbers: [],
        tickets_15plus_inProgress_numbers: [],
        tickets_15plus_escalated_numbers: [],
      };
    });

    (membersData || []).forEach((agent) => {
      Object.entries(agent.departmentAgingCounts || {}).forEach(
        ([deptId, agingCounts]) => {
          if (!byDept[deptId]) return;

          statusOrder.forEach((key) => {
            (agingCounts[`${key}BetweenOneAndSevenDaysTickets`] || []).forEach(
              (ticketNum) => {
                byDept[deptId][`tickets_1_7_${key}`] += 1;
                byDept[deptId][`tickets_1_7_${key}_numbers`].push(ticketNum);
              }
            );

            (
              agingCounts[`${key}BetweenEightAndFifteenDaysTickets`] || []
            ).forEach((ticketNum) => {
              byDept[deptId][`tickets_8_15_${key}`] += 1;
              byDept[deptId][`tickets_8_15_${key}_numbers`].push(ticketNum);
            });

            (agingCounts[`${key}OlderThanFifteenDaysTickets`] || []).forEach(
              (ticketNum) => {
                byDept[deptId][`tickets_15plus_${key}`] += 1;
                byDept[deptId][`tickets_15plus_${key}_numbers`].push(ticketNum);
              }
            );
          });
        }
      );
    });

    const sortedRows = Object.entries(byDept)
      .map(([deptId, data]) => ({
        ...data,
        total:
          data.tickets_1_7_open +
          data.tickets_1_7_hold +
          data.tickets_1_7_inProgress +
          data.tickets_1_7_escalated +
          data.tickets_8_15_open +
          data.tickets_8_15_hold +
          data.tickets_8_15_inProgress +
          data.tickets_8_15_escalated +
          data.tickets_15plus_open +
          data.tickets_15plus_hold +
          data.tickets_15plus_inProgress +
          data.tickets_15plus_escalated,
      }))
      .sort((a, b) =>
        a.departmentName.localeCompare(b.departmentName, undefined, {
          sensitivity: "base",
        })
      )
      .map((row, idx) => ({
        si: idx + 1,
        ...row,
      }));

    return sortedRows;
  }, [membersData, departmentsMap, departmentViewEnabled, statusOrder]);

  const departmentRowsForDisplay = useMemo(() => {
    if (!departmentRows) return [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return departmentRows;

    return departmentRows.filter((row) => {
      const combined = `${row.departmentName} ${row.total}`.toLowerCase();
      return combined.includes(q);
    });
  }, [departmentRows, searchTerm]);

  // ------------------- AGENT-WISE AGE DATA -------------------

  function aggregateTickets(agentRow, ageProp, status) {
    const agent = agentRow;
    if (!selectedDepartmentId && agent.departmentAgingCounts) {
      return Object.values(agent.departmentAgingCounts).flatMap(
        (age) => age?.[status + ageProp + "Tickets"] || []
      );
    }
    return selectedDepartmentId &&
      agent.departmentAgingCounts?.[selectedDepartmentId]
      ? agent.departmentAgingCounts[selectedDepartmentId][
          status + ageProp + "Tickets"
        ] || []
      : [];
  }

  function countFromArray(agentRow, ageProp, status) {
    return aggregateTickets(agentRow, ageProp, status).length;
  }

  const tableRows = (membersData || [])
    .filter((agent) => {
      if (selectedDepartmentId) {
        const agentHasTickets =
          (agent.departmentTicketCounts?.[selectedDepartmentId] || 0) > 0 ||
          Object.values(
            agent.departmentAgingCounts?.[selectedDepartmentId] || {}
          ).some((v) => v > 0);

        const nameMatch =
          !selectedAgentNames.length ||
          selectedAgentNames.includes(agent.name.trim());
        return agentHasTickets && nameMatch;
      } else {
        const t = agent.tickets || {};
        return (
          (t.open || 0) +
            (t.hold || 0) +
            (t.escalated || 0) +
            (t.unassigned || 0) +
            (t.inProgress || 0) >
          0
        );
      }
    })
    .map((agent) => {
      let agingCounts = {};
      if (selectedDepartmentId) {
        agingCounts = agent.departmentAgingCounts?.[selectedDepartmentId] || {};
      } else if (agent.tickets) {
        agingCounts = agent.tickets;
      }
      return {
        name: agent.name,
        agingCounts,
        departmentAgingCounts: agent.departmentAgingCounts,
        departmentName: selectedDepartmentId
          ? departmentsMap?.[selectedDepartmentId]?.name || selectedDepartmentId
          : "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const tableRowsForDisplay = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return tableRows;

    return tableRows.filter((row) => {
      const nameMatch = (row.name || "").toLowerCase().includes(q);
      const deptMatch = (row.departmentName || "").toLowerCase().includes(q);

      const ticketMatch = visibleAgeColumns.some((col) =>
        statusOrder.some((status) =>
          aggregateTickets(row, col.ageProp, status).some((num) =>
            String(num).toLowerCase().includes(q)
          )
        )
      );

      return nameMatch || deptMatch || ticketMatch;
    });
  }, [tableRows, visibleAgeColumns, searchTerm, statusOrder]);

  // ------------------- ARCHIVED TABLE FILTER + PAGINATION -------------------

  const filteredArchivedRows = useMemo(() => {
    const raw = searchTerm.trim();
    let rows = [...archivedRows];

    const start =
      startDate && !Number.isNaN(Date.parse(startDate))
        ? new Date(startDate + "T00:00:00")
        : null;
    const end =
      endDate && !Number.isNaN(Date.parse(endDate))
        ? new Date(endDate + "T23:59:59")
        : null;

    if (start || end) {
      rows = rows.filter((row) => {
        const d = row.createdTime ? new Date(row.createdTime) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    }

    if (!raw) {
      return rows.sort((a, b) =>
        String(a.agentName || "")
          .toLowerCase()
          .localeCompare(String(b.agentName || "").toLowerCase())
      );
    }

    const q = raw.toLowerCase();
    const isNumeric = /^\d+$/.test(q);

    rows = rows.filter((row) => {
      const agent = String(row.agentName || "").toLowerCase();
      const ticketNo = String(row.ticketNumber || "").trim().toLowerCase();

      if (isNumeric) {
        return ticketNo === q;
      }

      const words = agent.split(/\s+/).filter(Boolean);
      return words.some((w) => w.startsWith(q));
    });

    return rows.sort((a, b) =>
      String(a.agentName || "")
        .toLowerCase()
        .localeCompare(String(b.agentName || "").toLowerCase())
    );
  }, [archivedRows, searchTerm, startDate, endDate]);

  const [archivedPage, setArchivedPage] = useState(1);
  const archivedPageSize = 500;

  useEffect(() => {
    setArchivedPage(1);
  }, [searchTerm, startDate, endDate]);

  const archivedTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredArchivedRows.length / archivedPageSize)),
    [filteredArchivedRows.length, archivedPageSize]
  );

  const pagedArchivedRows = useMemo(() => {
    const start = (archivedPage - 1) * archivedPageSize;
    return filteredArchivedRows.slice(start, start + archivedPageSize);
  }, [filteredArchivedRows, archivedPage, archivedPageSize]);
  // ------------------- GLOBAL DOUBLE-CLICK CLOSE -------------------

  useEffect(() => {
    const handleDoubleClick = () => {
      if (onClose) onClose();
    };
    window.addEventListener("dblclick", handleDoubleClick);
    return () => window.removeEventListener("dblclick", handleDoubleClick);
  }, [onClose]);

  // ------------------- TITLE + SEARCH LABEL -------------------

  const currentTableTitle = useMemo(() => {
    if (showAgentPerformanceTable) return "Agent Performance";
    if (showMetricsTable) return "Ticket Metrics Data";
    if (showPendingTable) return "Pending Status Tickets";
    if (showArchivedTable) return "Archived Tickets";
    if (departmentViewEnabled) return "Department-wise Ticket Age";
    if (selectedDepartmentId && departmentsMap[selectedDepartmentId]?.name) {
      return `${departmentsMap[selectedDepartmentId].name} - Agent-wise Ticket Age`;
    }
    return "Agent-wise Ticket Age";
  }, [
    showAgentPerformanceTable,
    showMetricsTable,
    showPendingTable,
    showArchivedTable,
    departmentViewEnabled,
    selectedDepartmentId,
    departmentsMap,
  ]);

  const currentSearchPlaceholder = useMemo(() => {
    if (showAgentPerformanceTable)
      return "Search agent in performance table...";
    if (showMetricsTable)
      return "Search agent / ticket / status / department...";
    if (showPendingTable) return "Search agent / ticket / status...";
    if (showArchivedTable) return "Search agent / ticket...";
    if (departmentViewEnabled) return "Search by department...";
    return "Search agent / ticket...";
  }, [
    showAgentPerformanceTable,
    showMetricsTable,
    showPendingTable,
    showArchivedTable,
    departmentViewEnabled,
  ]);
// ---------- AGENT PERFORMANCE TABLE DATA (AGGREGATED) ----------

// which statuses count as resolved
const resolvedStatusSet = new Set(["closed", "resolved", "archived"]);
// which statuses count as escalated
const escalatedStatusSet = new Set(["escalated"]);

// NEW: compute resolution stats from archived/closed tickets (calendar hours)
const agentResolutionStats = useMemo(() => {
  const byAgent = {};
  // use filteredArchivedRows which already respects search + date filters
  filteredArchivedRows.forEach((row) => {
    const name = row.agentName || "Unknown";
    const hrs = Number(row.resolutionTimeHours) || 0; // from archived API
    if (!byAgent[name]) {
      byAgent[name] = { sumHrs: 0, count: 0 };
    }
    byAgent[name].sumHrs += hrs;
    byAgent[name].count += 1;
  });
  return byAgent;
}, [filteredArchivedRows]);

// NEW: FRT from archived tickets (using firstResponseTime on archived rows)
const agentArchivedFrStats = useMemo(() => {
  const byAgent = {};
  // filteredArchivedRows already respects search + date filters
  filteredArchivedRows.forEach((row) => {
    const name = row.agentName || "Unknown";
    if (!byAgent[name]) {
      byAgent[name] = { frSumMin: 0, frCount: 0 };
    }
    // firstResponseTime should be same Zoho "H:MM hrs" format
    const frMin = zohoHrsToMinutes(row.firstResponseTime);
    if (frMin != null) {
      byAgent[name].frSumMin += frMin;
      byAgent[name].frCount += 1;
    }
  });
  return byAgent;
}, [filteredArchivedRows]);

// ---------- AGENT PERFORMANCE TABLE DATA (AGGREGATED) ----------
const agentPerformanceRows = useMemo(() => {
  const byAgent = {};

  const ensureAgent = (name, departmentName = null) => {
  const key = name || "Unknown";

  if (!byAgent[key]) {
    byAgent[key] = {
      agentName: key,

      ticketsCreated: 0,
      ticketsResolved: 0,
      pendingCount: 0,

      frSumMin: 0,
      frCount: 0,

      resSumMin: 0, // kept for compatibility
      resCount: 0,

      threadSum: 0,
      threadCount: 0,

      escalatedCount: 0,
      singleTouchCount: 0,

      openCount: 0,
      holdCount: 0,
      inProgressCount: 0,

      // ✅ IMPORTANT: departments must always exist
      departments: new Set(),
    };
  }

  // ✅ ALWAYS REGISTER DEPARTMENT (metrics / pending / archived)
  if (departmentName) {
    byAgent[key].departments.add(departmentName);
  }

  return byAgent[key];
};


  // 1) METRICS ROWS -> created, FRT, threads, escalations, status buckets
  sortedMetricsRows.forEach((row) => {
    const agentName = row.agentName || "Unknown";
    const ag = ensureAgent(agentName);

    ag.ticketsCreated += 1;

    if (row.departmentName) {
      ag.departments.add(row.departmentName);
    }

    const normStatus = normalizeStatus(row.status);

    if (resolvedStatusSet.has(normStatus)) {
      ag.ticketsResolved += 1;
    }

    if (normStatus === "open") ag.openCount += 1;
    else if (normStatus === "hold") ag.holdCount += 1;
    else if (normStatus === "inprogress" || normStatus === "inProgress") {
      ag.inProgressCount += 1;
    }

    if (escalatedStatusSet.has(normStatus)) {
      ag.escalatedCount += 1;
    }

    const frMin = zohoHrsToMinutes(row.firstResponseTime);
    if (frMin != null) {
      ag.frSumMin += frMin;
      ag.frCount += 1;
    }

    const tc = Number(row.threadCount) || 0;
    ag.threadSum += tc;
    if (tc > 0) ag.threadCount += 1;

    const outgoing = Number(row.outgoingCount) || 0;
    if (outgoing === 1) {
      ag.singleTouchCount += 1;
    }
  });

  // 2) PENDING TABLE -> pendingCount
  pendingTableRows.forEach((row) => {
    const agentName = row.name || "Unknown";
    const ag = ensureAgent(agentName);
    ag.pendingCount += 1;
    if (row.department) {
      ag.departments.add(row.department);
    }
  });

  // 3) ARCHIVED ROWS -> extra resolved (if any tickets only appear there)
  filteredArchivedRows.forEach((row) => {
    const agentName = row.agentName || "Unknown";
    const ag = ensureAgent(agentName);
    const normStatus = normalizeStatus(row.status);
    if (resolvedStatusSet.has(normStatus)) {
      ag.ticketsResolved += 1;
    }
    if (row.departmentName) {
      ag.departments.add(row.departmentName);
    }
  });

  // 3b) merge archived FRT stats into per-agent FRT sums/counts
  Object.entries(agentArchivedFrStats).forEach(([name, stats]) => {
    const ag = ensureAgent(name);
    ag.frSumMin += stats.frSumMin;
    ag.frCount += stats.frCount;
  });

  // build final rows using archived-based resolution for avg
  return Object.values(byAgent)
    .map((ag) => {
      // calendar-time resolution from archived/closed tickets
      const resStats =
        agentResolutionStats[ag.agentName] || { sumHrs: 0, count: 0 };
      const avgResHrs =
        resStats.count > 0 ? resStats.sumHrs / resStats.count : 0;

      const avgFrMin =
        ag.frCount > 0 ? Math.round(ag.frSumMin / ag.frCount) : null;
      const avgThreads =
        ag.threadCount > 0 ? ag.threadSum / ag.threadCount : 0;

      return {
        agentName: ag.agentName,
        ticketsCreated: ag.ticketsCreated,
        ticketsResolved: ag.ticketsResolved,
        pendingCount: ag.pendingCount,

        // avgResHrs is in hours -> convert to minutes then HH:MM
        avgResolutionText: avgResHrs
          ? minutesToHM(Math.round(avgResHrs * 60))
          : "0:00",

        avgFirstResponseText:
          avgFrMin != null ? minutesToHM(avgFrMin) : "-",
        avgThreads,
        escalatedCount: ag.escalatedCount,
        singleTouchCount: ag.singleTouchCount,
        openCount: ag.openCount,
        holdCount: ag.holdCount,
        inProgressCount: ag.inProgressCount,
        departmentName:
          Array.from(ag.departments || [])[0] || "All Departments",
      };
    })
    .sort((a, b) =>
      (a.agentName || "").localeCompare(b.agentName || "", undefined, {
        sensitivity: "base",
      })
    );
}, [
  sortedMetricsRows,
  pendingTableRows,
  filteredArchivedRows,
  agentResolutionStats,
  agentArchivedFrStats,
]);


const [agentPerfPage, setAgentPerfPage] = useState(1);
const agentPerfPageSize = 100;

// filter by global searchTerm for performance table (and charts)
const agentPerformanceRowsForDisplay = useMemo(() => {
  const q = searchTerm.trim().toLowerCase();
  if (!q) return agentPerformanceRows;
  return agentPerformanceRows.filter((row) =>
    (row.agentName || "").toLowerCase().includes(q)
  );
}, [agentPerformanceRows, searchTerm]);

const agentPerfTotalPages = Math.max(
  1,
  Math.ceil(agentPerformanceRowsForDisplay.length / agentPerfPageSize)
);

// ------------------- RENDER -------------------

return (
  <div style={{ fontFamily: baseFont }}>
    {/* ================= HEADER : TITLE + FILTERS ================= */}
    <div
      style={{
        maxWidth: "100%",
        margin: "10px auto 4px auto",
        padding: "8px 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        background: "linear-gradient(90deg, #1E4489, #3b6fd8)",
        borderRadius: 6,
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
      }}
    >
      {/* ---------- LEFT: TITLE + CHART/TABLE TOGGLE ---------- */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            color: "white",
            fontWeight: 900,
            fontSize: 15,
            letterSpacing: 1,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {currentTableTitle}
        </div>

        {showAgentPerformanceTable && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setAgentPerfView("charts")}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                borderRadius: 4,
                border: "none",
                cursor: "pointer",
                backgroundColor:
                  agentPerfView === "charts" ? "#f1c40f" : "#2c3e50",
                color: "white",
                fontWeight: 700,
              }}
            >
              Charts
            </button>
            <button
              onClick={() => setAgentPerfView("table")}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                borderRadius: 4,
                border: "none",
                cursor: "pointer",
                backgroundColor:
                  agentPerfView === "table" ? "#f1c40f" : "#2c3e50",
                color: "white",
                fontWeight: 700,
              }}
            >
              Table
            </button>
          </div>
        )}
      </div>

      {/* ---------- RIGHT: SEARCH + DATE RANGE + EXPORT ---------- */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Search */}
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={currentSearchPlaceholder}
          style={{
            minWidth: 50,
            padding: "5px 6px",
            borderRadius: 4,
            border: "2px solid #34495e",
            fontSize: 12,
            fontWeight: 700,
          }}
        />

        {/* -------- ALL TIME : SINGLE DATE RANGE BOX -------- */}
        <div style={{ position: "relative" }}>
          <input
            type="text"
            readOnly
            value={
              startDate && endDate ? `${startDate} → ${endDate}` : "All Time"
            }
            onClick={() => setShowDateRange((v) => !v)}
            style={{
              width: 160,
              padding: "5px 6px",
              borderRadius: 4,
              border: "2px solid #34495e",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              background: "white",
              textAlign: "center",
            }}
          />

          {/* Dropdown */}
          {showDateRange && (
            <div
              style={{
                position: "absolute",
                top: "110%",
                right: 0,
                background: "white",
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: "10px 12px",
                boxShadow: "0 4px 10px rgba(0,0,0,0.25)",
                zIndex: 999,
                minWidth: "auto",
              }}
            >
              {/* Start Date */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginBottom: 8,
                }}
              >
                <label
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#34495e",
                    marginBottom: 2,
                  }}
                >
                  Select start date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    width: 140,
                    padding: "4px 6px",
                    borderRadius: 4,
                    border: "1px solid #34495e",
                    fontSize: 11,
                  }}
                />
              </div>

              {/* End Date */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#34495e",
                    marginBottom: 2,
                  }}
                >
                  Select end date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    width: 140,
                    padding: "4px 6px",
                    borderRadius: 4,
                    border: "1px solid #34495e",
                    fontSize: 11,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Export */}
        <button
          onClick={() => {
            // TODO: Implement export logic
          }}
          style={{
            padding: "6px 14px",
            backgroundColor: "#4CAF50",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          Export to Excel
        </button>
      </div>
    </div>
    {/* ================= END HEADER ================= */}

    {/* -------- AGENT PERFORMANCE CHARTS (ONLY WHEN CHART VIEW) -------- */}
    {showAgentPerformanceTable && agentPerfView === "charts" && (
      <AgentPerformanceCharts
        rows={agentPerformanceRowsForDisplay}
        archivedRows={filteredArchivedRows}
      />
    )}

    {/* -------- MAIN TABLE CONTAINER (HIDDEN WHEN CHART VIEW) -------- */}
    {!(showAgentPerformanceTable && agentPerfView === "charts") && (
      <div
        style={{
          margin: "8px auto",
          border: "2px solid #32406b",
          background: "white",
          width: "100%",
          overflowX: "auto",
          overflowY: "auto",
          maxHeight: "70vh",
        }}
      >
        {showAgentPerformanceTable && agentPerfView === "table" ? (
          <AgentPerformanceTable
            rows={agentPerformanceRowsForDisplay}
            page={agentPerfPage}
            pageSize={agentPerfPageSize}
            totalPages={agentPerfTotalPages}
            setPage={setAgentPerfPage}
          />
        ) : showMetricsTable ? (
          <MetricsTable
            metricsColumns={metricsColumns}
            sortedMetricsRows={pagedMetricsRows}
            agentAverageMap={agentAverageMap}
          />
        ) : showPendingTable ? (
          <PendingTable
            pendingTableColumns={pendingTableColumns}
            searchedGroupedPendingRows={searchedGroupedPendingRows}
          />
        ) : showArchivedTable ? (
          <ArchivedTable
            archivedColumns={archivedColumns}
            filteredArchivedRows={filteredArchivedRows}
            pagedArchivedRows={pagedArchivedRows}
            archivedPage={archivedPage}
            archivedPageSize={archivedPageSize}
            archivedTotalPages={archivedTotalPages}
            setArchivedPage={setArchivedPage}
          />
        ) : departmentViewEnabled ? (
          <DepartmentAgeTable
            departmentRowsForDisplay={departmentRowsForDisplay}
            normalizedStatusKeys={normalizedStatusKeys}
            statusOrder={statusOrder}
            statusColors={statusColors}
          />
        ) : (
          <AgentAgeTable
            columnsToShow={columnsToShow}
            tableRowsForDisplay={tableRowsForDisplay}
            visibleAgeColumns={visibleAgeColumns}
            normalizedStatusKeys={normalizedStatusKeys}
            statusOrder={statusOrder}
            aggregateTickets={aggregateTickets}
            countFromArray={countFromArray}
            hoveredRowIndex={hoveredRowIndex}
            setHoveredRowIndex={setHoveredRowIndex}
            selectedDepartmentId={selectedDepartmentId}
            departmentsMap={departmentsMap}
          />
        )}
      </div>
    )}

    {/* -------- METRICS PAGINATION -------- */}
    {showMetricsTable && sortedMetricsRows.length > metricsPageSize && (
      <div
        style={{
          padding: "8px 12px 16px",
          textAlign: "center",
          color: "white",
          fontSize: 12,
        }}
      >
        <button
          onClick={() => setMetricsPage((p) => Math.max(1, p - 1))}
          disabled={metricsPage === 1}
        >
          Prev
        </button>
        <span style={{ margin: "0 10px" }}>
          Page {metricsPage} of {metricsTotalPages}
        </span>
        <button
          onClick={() =>
            setMetricsPage((p) => Math.min(metricsTotalPages, p + 1))
          }
          disabled={metricsPage === metricsTotalPages}
        >
          Next
        </button>
      </div>
    )}
  </div>
);


}
