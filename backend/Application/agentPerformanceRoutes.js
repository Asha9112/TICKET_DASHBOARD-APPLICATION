// // backend/Application/agentPerformanceRoutes.js

// // =====================
// // Helpers
// // =====================

// // Parse Zoho duration strings like:
// // "20 days 04:40 hrs", "04:40 hrs", "5 hrs"
// function parseZohoDurationToHours(str) {
//   if (!str || typeof str !== "string") return 0;

//   const s = str.trim().toLowerCase();

//   // "20 days 04:40 hrs"
//   let m = s.match(/(\d+)\s*days?\s+(\d{1,2}):(\d{2})\s*hrs?/);
//   if (m) {
//     const days = +m[1] || 0;
//     const hours = +m[2] || 0;
//     const minutes = +m[3] || 0;
//     return days * 24 + hours + minutes / 60;
//   }

//   // "04:40 hrs"
//   m = s.match(/(\d{1,2}):(\d{2})\s*hrs?/);
//   if (m) {
//     return (+m[1] || 0) + (+m[2] || 0) / 60;
//   }

//   // "5 hrs" or "5"
//   m = s.match(/(\d+(\.\d+)?)/);
//   return m ? parseFloat(m[1]) || 0 : 0;
// }

// const RESOLVED_STATUSES = new Set([
//   "resolved",
//   "closed",
//   "archived",
//   "completed",
// ]);

// const formatHoursToText = (hrs) => {
//   if (!hrs || hrs <= 0) return "0:00";
//   const h = Math.floor(hrs);
//   const m = Math.round((hrs % 1) * 60)
//     .toString()
//     .padStart(2, "0");
//   return `${h}:${m}`;
// };

// // =====================
// // Route Registration
// // =====================

// function registerAgentPerformanceRoutes(app, helpers) {
//   const {
//     getAccessToken,
//     fetchAllTickets,
//     fetchAllArchivedTickets,
//     fetchTicketMetricsForTickets,
//     departmentList,
//   } = helpers;

//   // ======================================================
//   // 1️⃣ AGENT PERFORMANCE (DATE-AWARE, ALL DEPTS)
//   // ======================================================
//   app.get("/api/agent-performance", async (req, res) => {
//     try {
//       const { fromDate, toDate, departmentId, agentId } = req.query;

//       const fromDateObj = fromDate ? new Date(fromDate) : null;
//       const toDateObj = toDate ? new Date(toDate) : null;

//       const accessToken = await getAccessToken();

//       // Active tickets (optionally filtered by departmentId + agentId)
//       const deptIds =
//         departmentId && departmentId !== "all" ? [departmentId] : [];

//       const activeTickets = await fetchAllTickets(
//         accessToken,
//         deptIds,
//         agentId || null
//       );

//       // Archived tickets: fetch per department (or all departments)
//       let archivedTickets = [];
//       const deps =
//         departmentId && departmentId !== "all"
//           ? departmentList.filter((d) => d.id === departmentId)
//           : departmentList;

//       for (const dep of deps) {
//         const batch = await fetchAllArchivedTickets(accessToken, dep.id);
//         archivedTickets.push(...(batch || []));
//       }

//       // Merge active + archived
//       let allTickets = [...activeTickets, ...archivedTickets];

//       // Filter by agentId if specified
//       if (agentId && agentId !== "all") {
//         allTickets = allTickets.filter(
//           (t) => String(t.assigneeId || "") === String(agentId)
//         );
//       }

//       // Filter by date range (created or closed within range)
//       if (fromDateObj || toDateObj) {
//         allTickets = allTickets.filter((t) => {
//           const created = t.createdTime && new Date(t.createdTime);
//           const closed = t.closedTime && new Date(t.closedTime);

//           const inCreated =
//             created &&
//             (!fromDateObj || created >= fromDateObj) &&
//             (!toDateObj || created <= toDateObj);

//           const inClosed =
//             closed &&
//             (!fromDateObj || closed >= fromDateObj) &&
//             (!toDateObj || closed <= toDateObj);

//           return inCreated || inClosed;
//         });
//       }

//       if (!allTickets.length) {
//         return res.json({ agents: [] });
//       }

//       // Build status map keyed by ticketNumber/id
//       const statusMap = {};
//       allTickets.forEach((t) => {
//         const key = String(t.ticketNumber || t.id || "");
//         if (key) statusMap[key] = (t.status || "").toLowerCase();
//       });

//       // Fetch metrics for these tickets (Zoho Desk ticket metrics API)
//       const metricRows = await fetchTicketMetricsForTickets(
//         accessToken,
//         allTickets
//       );

//       const agentsMap = {};

//       // Aggregate per agent
//       metricRows.forEach((row) => {
//         const agentKey = String(row.agentId || row.assigneeId || "unassigned");
//         const ticketId = String(row.ticketNumber || row.id || "");
//         if (!ticketId) return;

//         if (!agentsMap[agentKey]) {
//           agentsMap[agentKey] = {
//             agentId: agentKey,
//             agentName: row.agentName || "Unassigned",
//             ticketIds: new Set(),
//             resolvedIds: new Set(),
//             pendingIds: new Set(),
//             totalResolutionHours: 0,
//             resolutionCount: 0, // Only resolved tickets
//             totalFirstResponseHours: 0,
//             firstResponseCount: 0, // All tickets with first response
//           };
//         }

//         const bucket = agentsMap[agentKey];
//         bucket.ticketIds.add(ticketId);

//         const status = statusMap[ticketId] || "";
//         if (RESOLVED_STATUSES.has(status)) {
//           bucket.resolvedIds.add(ticketId);
//         } else {
//           bucket.pendingIds.add(ticketId);
//         }

//         // First Response: count for ALL tickets that have it (pending + resolved)
//         const frHrs = parseZohoDurationToHours(row.firstResponseTime);
//         if (frHrs >= 0) {
//           bucket.totalFirstResponseHours += frHrs;
//           bucket.firstResponseCount++;
//         }

//         // Resolution: ONLY for resolved tickets
//         if (RESOLVED_STATUSES.has(status)) {
//           const resHrs = parseZohoDurationToHours(row.resolutionTime);
//           if (resHrs >= 0) {
//             bucket.totalResolutionHours += resHrs;
//             bucket.resolutionCount++;
//           }
//         }
//       });

//       const agents = Object.values(agentsMap).map((a) => {
//         const avgRes =
//           a.resolutionCount > 0
//             ? a.totalResolutionHours / a.resolutionCount
//             : 0;

//         const avgFR =
//           a.firstResponseCount > 0
//             ? a.totalFirstResponseHours / a.firstResponseCount
//             : 0;

//         return {
//           agentId: a.agentId,
//           agentName: a.agentName,

//           ticketsCreated: a.ticketIds.size,
//           ticketsResolved: a.resolvedIds.size,
//           pendingCount: a.pendingIds.size,

//           avgResolutionHours: avgRes,
//           avgResolutionText: formatHoursToText(avgRes),

//           avgFirstResponseHours: avgFR,
//           avgFirstResponseText: formatHoursToText(avgFR),
//         };
//       });

//       res.json({ agents });
//     } catch (err) {
//       console.error("Error in /api/agent-performance", err);
//       res.status(500).json({ error: "Failed to compute agent performance" });
//     }
//   });

//   //======================================================
// // 2️⃣ YEAR-WISE SUMMARY (FULL HISTORY, ACTIVE + ARCHIVED)
// // ======================================================
// app.get("/api/tickets-yearly-summary", async (req, res) => {
//   try {
//     const { departmentId, agentId } = req.query;
//     const accessToken = await getAccessToken();

//     // -------- active tickets (optionally filtered by departmentId + agentId) ------
//     const deptIds =
//       departmentId && departmentId !== "all" ? [departmentId] : [];

//     const activeTickets = await fetchAllTickets(
//       accessToken,
//       deptIds,
//       agentId && agentId !== "all" ? agentId : null
//     );

//     // -------- archived tickets: per department (or all departments) ---------------
//     let archivedTickets = [];
//     const deps =
//       departmentId && departmentId !== "all"
//         ? departmentList.filter((d) => d.id === departmentId)
//         : departmentList;

//     for (const dep of deps) {
//       const batch = await fetchAllArchivedTickets(accessToken, dep.id);
//       archivedTickets.push(...(batch || []));
//     }

//     // agent filter for archived (active already got it via fetchAllTickets)
//     if (agentId && agentId !== "all") {
//       archivedTickets = archivedTickets.filter(
//         (t) => String(t.assigneeId || "") === String(agentId)
//       );
//     }

//     // -------- merge active + archived --------------------------------------------
//     const allTickets = [...activeTickets, ...archivedTickets];

//     const summary = {};
//     // Adjust years range as needed
//     for (let y = 2020; y <= 2025; y++) {
//       summary[y] = { created: 0, resolved: 0 };
//     }

//     allTickets.forEach((t) => {
//       const d = t.createdTime && new Date(t.createdTime);
//       if (!d || Number.isNaN(d.getTime())) return;

//       const y = d.getFullYear();
//       if (!summary[y]) return;

//       // every ticket contributes to "created"
//       summary[y].created += 1;

//       // only resolved/closed/etc contribute to "resolved"
//       if (RESOLVED_STATUSES.has((t.status || "").toLowerCase())) {
//         summary[y].resolved += 1;
//       }
//     });

//     res.json({
//       years: Object.keys(summary).map((y) => ({
//         year: y,
//         created: summary[y].created,
//         resolved: summary[y].resolved,
//       })),
//     });
//   } catch (err) {
//     console.error("Error in /api/tickets-yearly-summary", err);
//     res.status(500).json({ error: "Failed to compute yearly summary" });
//   }
// });

// }

// module.exports = registerAgentPerformanceRoutes;
