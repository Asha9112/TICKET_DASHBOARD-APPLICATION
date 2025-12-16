// src/components/AgentTicketAgeTable/AgentTicketAgeTable.jsx

import React, { useEffect, useMemo, useState } from "react";

import MetricsTable from "./MetricsTable";
import PendingTable from "./PendingTable";
import ArchivedTable from "./ArchivedTable";
import DepartmentAgeTable from "./DepartmentAgeTable";
import AgentAgeTable from "./AgentAgeTable";
import { exportToExcel } from "../../utils/exportToExcel";
import AgentPerformanceTable from "./AgentPerformanceTable";

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
// ------------------- ARCHIVED TABLE FILTER + PAGINATION -------------------

const filteredArchivedRows = useMemo(() => {
  let rows = [...archivedRows];
  const raw = searchTerm.trim().toLowerCase();

  // ---------- DATE FILTER ----------
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

  // ---------- NO SEARCH ----------
  if (!raw) {
    return rows.sort((a, b) =>
      String(a.agentName || "")
        .toLowerCase()
        .localeCompare(String(b.agentName || "").toLowerCase())
    );
  }

  // ---------- 1️⃣ DEPARTMENT PRIORITY ----------
  const departmentMatches = rows.filter((row) =>
    String(row.departmentName || "").toLowerCase().includes(raw)
  );

  if (departmentMatches.length > 0) {
    return departmentMatches.sort((a, b) =>
      String(a.agentName || "")
        .toLowerCase()
        .localeCompare(String(b.agentName || "").toLowerCase())
    );
  }

  // ---------- 2️⃣ AGENT NAME + TICKET NUMBER ----------
  const isNumeric = /^\d+$/.test(raw);

  rows = rows.filter((row) => {
    const agent = String(row.agentName || "").toLowerCase();
    const ticketNo = String(row.ticketNumber || "").toLowerCase();

    if (isNumeric) {
      return ticketNo.includes(raw);
    }

    return agent.includes(raw);
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

  // ---------- AGENT PERFORMANCE TABLE DATA (TEMP) ----------
  // ---------- AGENT PERFORMANCE TABLE DATA (AGGREGATED) ----------

// which statuses count as resolved
const resolvedStatusSet = new Set(["closed", "resolved", "archived"]);
// which statuses count as escalated
const escalatedStatusSet = new Set(["escalated"]);

const agentPerformanceRows = useMemo(() => {
  const byAgent = {};

  const ensureAgent = (name) => {
    const key = name || "Unknown";
    if (!byAgent[key]) {
      byAgent[key] = {
        agentName: key,
        ticketsCreated: 0,
        ticketsResolved: 0,
        pendingCount: 0,
        frSumMin: 0,
        frCount: 0,
        resSumMin: 0,
        resCount: 0,
        threadSum: 0,
        threadCount: 0,
        escalatedCount: 0,
        singleTouchCount: 0,
      };
    }
    return byAgent[key];
  };

  // 1) METRICS ROWS -> created, FRT, resolution, threads, escalations, single-touch
  sortedMetricsRows.forEach((row) => {
    const agentName = row.agentName || "Unknown";
    const ag = ensureAgent(agentName);

    ag.ticketsCreated += 1;

    const normStatus = normalizeStatus(row.status);

    if (resolvedStatusSet.has(normStatus)) {
      ag.ticketsResolved += 1;
    }

    const frMin = zohoHrsToMinutes(row.firstResponseTime);
    if (frMin != null) {
      ag.frSumMin += frMin;
      ag.frCount += 1;
    }

    const resMin = zohoHrsToMinutes(row.resolutionTime);
    if (resMin != null) {
      ag.resSumMin += resMin;
      ag.resCount += 1;
    }

    const tc = Number(row.threadCount) || 0;
    ag.threadSum += tc;
    if (tc > 0) ag.threadCount += 1;

    if (escalatedStatusSet.has(normStatus)) {
      ag.escalatedCount += 1;
    }

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
  });

  // 3) ARCHIVED ROWS -> extra resolved (if any tickets only appear there)
  filteredArchivedRows.forEach((row) => {
    const agentName = row.agentName || "Unknown";
    const ag = ensureAgent(agentName);
    const normStatus = normalizeStatus(row.status);
    if (resolvedStatusSet.has(normStatus)) {
      ag.ticketsResolved += 1;
    }
  });

  // build final rows
  return Object.values(byAgent)
    .map((ag) => {
      const avgResMin =
        ag.resCount > 0 ? Math.round(ag.resSumMin / ag.resCount) : null;
      const avgFrMin =
        ag.frCount > 0 ? Math.round(ag.frSumMin / ag.frCount) : null;
      const avgThreads =
        ag.threadCount > 0 ? ag.threadSum / ag.threadCount : 0;

      return {
        agentName: ag.agentName,
        ticketsCreated: ag.ticketsCreated,
        ticketsResolved: ag.ticketsResolved,
        pendingCount: ag.pendingCount,
        avgResolutionText:
          avgResMin != null ? minutesToHM(avgResMin) : "-",
        avgFirstResponseText:
          avgFrMin != null ? minutesToHM(avgFrMin) : "-",
        avgThreads,
        escalatedCount: ag.escalatedCount,
        singleTouchCount: ag.singleTouchCount,
      };
    })
    .sort((a, b) =>
      (a.agentName || "").localeCompare(b.agentName || "", undefined, {
        sensitivity: "base",
      })
    );
}, [sortedMetricsRows, pendingTableRows, filteredArchivedRows]);


const [agentPerfPage, setAgentPerfPage] = useState(1);
const agentPerfPageSize = 100;

// NEW: filter by global searchTerm for performance table
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
      {/* Title + Search row */}
      <div
        style={{
          maxWidth: "100%",
          margin: "10px auto 4px auto",
          padding: "0 5px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div
          style={{
            padding: "7px 7px",
            borderRadius: 4,
            background: "linear-gradient(135deg,#1E4489 70%,#1E4489 100%)",
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

        {/* Right side: Search + Date range + Export */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={currentSearchPlaceholder}
            style={{
              minWidth: 240,
              maxWidth: 360,
              padding: "5px 5px",
              borderRadius: 4,
              border: "2px solid #34495e",
              outline: "none",
              fontSize: 12,
              fontWeight: 900,
              fontFamily: baseFont,
              background: "white",
              color: "Black",
              textAlign: "left",
            }}
          />

          {/* Date range inputs */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: "4px 6px",
              borderRadius: 4,
              border: "1px solid #34495e",
              fontSize: 11,
              fontFamily: baseFont,
            }}
          />
          <span style={{ color: "#fff", fontSize: 12 }}>to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: "4px 6px",
              borderRadius: 4,
              border: "1px solid #34495e",
              fontSize: 11,
              fontFamily: baseFont,
            }}
          />

          <button
            onClick={() => {
              let excelRows = [];

              // 1) METRICS TABLE VIEW
              if (showMetricsTable) {
                excelRows = sortedMetricsRows.map((r, idx) => ({
                  "Sl. No.": idx + 1,
                  "Agent Name": r.agentName,
                  "Ticket Number": r.ticketNumber,
                  "Ticket Status": r.status,
                  Department: r.departmentName,
                  "Ticket Created (IST)": r.createdTime,
                  "First Response Time": r.firstResponseTime,
                  "Resolution Time": r.resolutionTime,
                  Threads: r.threadCount,
                  "User Response": r.responseCount,
                  "Agent Response": r.outgoingCount,
                  Reopens: r.reopenCount,
                  Reassigns: r.reassignCount,
                }));
                exportToExcel(excelRows, "Ticket_Metrics.xlsx", "Metrics");
                return;
              }

              // 2) PENDING STATUS TABLE VIEW
              if (showPendingTable) {
                excelRows = searchedGroupedPendingRows.map((r, idx) => ({
                  "Sl. No.": idx + 1,
                  "Agent Name": r.name,
                  "Department Name": r.department,
                  "Total Pending Tickets": r.totalTickets,
                  "Ticket Status": r.status,
                  "Ticket Number": r.ticketNumber,
                  "Ticket Created Date & Time": r.ticketCreated,
                  "Ticket Age Days": r.daysNotResponded,
                }));
                exportToExcel(excelRows, "Pending_Tickets.xlsx", "Pending");
                return;
              }

              // 3) ARCHIVED TICKETS TABLE VIEW
              if (showArchivedTable) {
                excelRows = filteredArchivedRows.map((r, idx) => ({
                  "Sl. No.": idx + 1,
                  "Agent Name": r.agentName,
                  Department: r.departmentName,
                  "Ticket Number": r.ticketNumber,
                  Subject: r.subject,
                  Status: r.status,
                  Created: r.createdTime,
                  Closed: r.closedTime,
                  "Resolution Time (Hours)": r.resolutionTimeHours,
                }));
                exportToExcel(excelRows, "Archived_Tickets.xlsx", "Archived");
                return;
              }

              // 4) DEPARTMENT-WISE TICKET AGE VIEW
              if (departmentViewEnabled) {
                excelRows = departmentRowsForDisplay.map((r) => ({
                  "Sl. No.": r.si,
                  Department: r.departmentName,
                  "Total Tickets": r.total,
                  "1 - 7 Days Open": r.tickets_1_7_open,
                  "1 - 7 Days Hold": r.tickets_1_7_hold,
                  "1 - 7 Days In Progress": r.tickets_1_7_inProgress,
                  "1 - 7 Days Escalated": r.tickets_1_7_escalated,
                  "8 - 15 Days Open": r.tickets_8_15_open,
                  "8 - 15 Days Hold": r.tickets_8_15_hold,
                  "8 - 15 Days In Progress": r.tickets_8_15_inProgress,
                  "8 - 15 Days Escalated": r.tickets_8_15_escalated,
                  "15+ Days Open": r.tickets_15plus_open,
                  "15+ Days Hold": r.tickets_15plus_hold,
                  "15+ Days In Progress": r.tickets_15plus_inProgress,
                  "15+ Days Escalated": r.tickets_15plus_escalated,
                }));
                exportToExcel(
                  excelRows,
                  "Department_Ticket_Age.xlsx",
                  "Departments"
                );
                return;
              }

              // 5) DEFAULT: AGENT-WISE TICKET AGE VIEW
              excelRows = tableRowsForDisplay.map((row, index) => {
                const base = {
                  "Sl. No.": index + 1,
                  "Agent Name": row.name,
                };

                if (selectedDepartmentId) {
                  base["Department"] = row.departmentName || "";
                }

                base["Total Ticket Count"] = visibleAgeColumns.reduce(
                  (sum, col) =>
                    sum +
                    statusOrder.reduce(
                      (s, status) =>
                        s + countFromArray(row, col.ageProp, status),
                      0
                    ),
                  0
                );

                visibleAgeColumns.forEach((col) => {
                  base[col.label] = statusOrder.reduce(
                    (s, status) =>
                      s + countFromArray(row, col.ageProp, status),
                    0
                  );
                });

                return base;
              });

              exportToExcel(excelRows, "Agent_Ticket_Age.xlsx", "Agents");
            }}
            style={{
              padding: "6px 14px",
              backgroundColor: "#4CAF50",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            Export to Excel
          </button>
        </div>
      </div>
      {/* Main scroll container: only the tables scroll */}
      <div
        style={{
          margin: "8px auto 8px auto",
          border: "2px solid #32406b",
          background: "white",
          width: "100%",
          overflowX: "auto",
          overflowY: "auto",
          maxHeight: "70vh",
        }}
      >
        {showAgentPerformanceTable ? (
          <AgentPerformanceTable
           rows={agentPerformanceRowsForDisplay}   // <--- filtered using global searchTerm
           
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

      {/* Metrics pagination OUTSIDE table height & scroll area */}
      {showMetricsTable && sortedMetricsRows.length > metricsPageSize && (
        <div
          style={{
            padding: "8px 12px 16px 12px",
            textAlign: "center",
            color: "white",
            fontSize: 12,
          }}
        >
          <button
            onClick={() => setMetricsPage((p) => Math.max(1, p - 1))}
            disabled={metricsPage === 1}
            style={{ marginRight: 8 }}
          >
            Prev
          </button>
          <span style={{ margin: "0 8px" }}>
            Page {metricsPage} of {metricsTotalPages}
          </span>
          <button
            onClick={() =>
              setMetricsPage((p) => Math.min(metricsTotalPages, p + 1))
            }
            disabled={metricsPage === metricsTotalPages}
            style={{ marginLeft: 8 }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
