// backend/Application/agentPerformanceRoutes.js

// =====================
// Helpers
// =====================

// Parse Zoho duration strings like:
// "20 days 04:40 hrs", "04:40 hrs", "5 hrs"
function parseZohoDurationToHours(str) {
  if (!str || typeof str !== "string") return 0;

  const s = str.trim().toLowerCase();

  // "20 days 04:40 hrs"
  let m = s.match(/(\d+)\s*days?\s+(\d{1,2}):(\d{2})\s*hrs?/);
  if (m) {
    const days = parseInt(m[1], 10) || 0;
    const hours = parseInt(m[2], 10) || 0;
    const minutes = parseInt(m[3], 10) || 0;
    return days * 24 + hours + minutes / 60;
  }

  // "04:40 hrs"
  m = s.match(/(\d{1,2}):(\d{2})\s*hrs?/);
  if (m) {
    const hours = parseInt(m[1], 10) || 0;
    const minutes = parseInt(m[2], 10) || 0;
    return hours + minutes / 60;
  }

  // "5" or "5 hrs"
  m = s.match(/(\d+(\.\d+)?)/);
  if (m) {
    return parseFloat(m[1]) || 0;
  }

  return 0;
}

// =====================
// Route Registration
// =====================

function registerAgentPerformanceRoutes(app, helpers) {
  const {
    getAccessToken,
    fetchAllTickets,
    fetchAllArchivedTickets,
    fetchTicketMetricsForTickets,
    departmentList,
  } = helpers;

  /**
   * AGENT PERFORMANCE ENDPOINT
   * Accurate for date ranges and averages
   */
  app.get("/api/agent-performance", async (req, res) => {
    try {
      const { fromDate, toDate, departmentId, agentId } = req.query;

      const fromDateObj = fromDate ? new Date(fromDate) : null;
      const toDateObj = toDate ? new Date(toDate) : null;

      const accessToken = await getAccessToken();

      // =====================
      // 1) Fetch ACTIVE tickets
      // =====================
      const deptIds =
        departmentId && departmentId !== "all" ? [departmentId] : [];

      const activeTickets = await fetchAllTickets(
        accessToken,
        deptIds,
        agentId || null
      );

      // =====================
      // 2) Fetch ARCHIVED tickets
      // =====================
      let archivedTickets = [];

      const departmentsToUse =
        departmentId && departmentId !== "all"
          ? departmentList.filter((d) => d.id === departmentId)
          : departmentList;

      for (const dep of departmentsToUse) {
        const batch = await fetchAllArchivedTickets(accessToken, dep.id);
        archivedTickets = archivedTickets.concat(batch || []);
      }

      // =====================
      // 3) Merge tickets
      // =====================
      let allTickets = activeTickets.concat(archivedTickets);

      // Agent filter
      if (agentId && agentId !== "all") {
        allTickets = allTickets.filter(
          (t) => String(t.assigneeId || "") === String(agentId)
        );
      }

      // =====================
      // 4) Date filter (Zoho-style)
      // Include if created OR closed is in range
      // =====================
      if (fromDateObj || toDateObj) {
        allTickets = allTickets.filter((t) => {
          const created = t.createdTime ? new Date(t.createdTime) : null;
          const closed = t.closedTime ? new Date(t.closedTime) : null;

          const inCreatedRange =
            created &&
            (!fromDateObj || created >= fromDateObj) &&
            (!toDateObj || created <= toDateObj);

          const inClosedRange =
            closed &&
            (!fromDateObj || closed >= fromDateObj) &&
            (!toDateObj || closed <= toDateObj);

          return inCreatedRange || inClosedRange;
        });
      }

      if (!allTickets.length) {
        return res.json({ agents: [] });
      }

      // =====================
      // 5) Build ticket status map (SOURCE OF TRUTH)
      // =====================
      const ticketStatusMap = {};
      allTickets.forEach((t) => {
        const key = String(t.ticketNumber || t.id || "");
        if (!key) return;
        ticketStatusMap[key] = (t.status || "").toLowerCase();
      });

      // =====================
      // 6) Fetch metrics
      // =====================
      const metricRows = await fetchTicketMetricsForTickets(
        accessToken,
        allTickets
      );

      // =====================
      // 7) Aggregate per agent
      // =====================
      const agentsMap = {};

      metricRows.forEach((row) => {
        const agentName = row.agentName || "Unassigned";
        const ticketId = String(row.ticketNumber || row.id || "");
        if (!ticketId) return;

        if (!agentsMap[agentName]) {
          agentsMap[agentName] = {
            agentName,
            ticketIds: new Set(),
            resolvedIds: new Set(),
            pendingIds: new Set(),

            totalResolutionHours: 0,
            resolutionCount: 0,

            totalFirstResponseHours: 0,
            firstResponseCount: 0,

            totalThreads: 0,
            threadCount: 0,
          };
        }

        const bucket = agentsMap[agentName];
        bucket.ticketIds.add(ticketId);

        const status = ticketStatusMap[ticketId] || "";

        if (status === "closed" || status === "resolved") {
          bucket.resolvedIds.add(ticketId);
        } else {
          bucket.pendingIds.add(ticketId);
        }

        // Resolution time
        const resHrs = parseZohoDurationToHours(row.resolutionTime);
        if (resHrs > 0) {
          bucket.totalResolutionHours += resHrs;
          bucket.resolutionCount += 1;
        }

        // First response time
        const frHrs = parseZohoDurationToHours(row.firstResponseTime);
        if (frHrs > 0) {
          bucket.totalFirstResponseHours += frHrs;
          bucket.firstResponseCount += 1;
        }

        // Threads
        const threads = Number(row.threadCount || row.responseCount || 0);
        if (threads > 0) {
          bucket.totalThreads += threads;
          bucket.threadCount += 1;
        }
      });

      // =====================
      // 8) Finalize result
      // =====================
      const agents = Object.values(agentsMap).map((a) => ({
        agentName: a.agentName,

        ticketsCreated: a.ticketIds.size,
        ticketsResolved: a.resolvedIds.size,
        pendingTickets: a.pendingIds.size,

        avgResolutionHours:
          a.resolutionCount > 0
            ? a.totalResolutionHours / a.resolutionCount
            : 0,

        avgFirstResponseHours:
          a.firstResponseCount > 0
            ? a.totalFirstResponseHours / a.firstResponseCount
            : 0,

        avgThreads:
          a.threadCount > 0 ? a.totalThreads / a.threadCount : 0,
      }));

      return res.json({ agents });
    } catch (err) {
      console.error("Error in /api/agent-performance", err.message);
      res.status(500).json({
        error: "Failed to compute agent performance",
      });
    }
  });
}

module.exports = registerAgentPerformanceRoutes;
