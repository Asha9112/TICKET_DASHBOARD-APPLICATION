// ===== IMPORTS AND INITIAL SETUP =====
const express = require("express");           // Web framework for handling HTTP requests
const axios = require("axios");               // HTTP client for Zoho Desk API calls
const cors = require("cors");                 // Enable CORS for frontend requests
const Bottleneck = require("bottleneck");     // Rate limiter to respect Zoho API limits
const axiosRetry = require("axios-retry").default; // Automatic retry for failed API calls

const app = express();
const port = process.env.PORT || 5000;        // Server port from env or default 5000

// ===== MIDDLEWARE SETUP =====
app.use(cors());                              // Allow cross-origin requests from frontend
app.use(express.json());                      // Parse JSON request bodies

// Custom middleware for Content Security Policy (security headers)
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self' http://localhost:5000 http://127.0.0.1:5000 http://192.168.3.8:5000"
  );
  next();
});

// ===== IN-MEMORY CACHE FOR ARCHIVED TICKETS =====
const archivedCache = Object.create(null);    // RAM store for quick archived ticket access

// ===== SHARED HELPER FUNCTIONS =====

// Parse Zoho duration strings (e.g., "20 days 04:40 hrs", "04:40 hrs", "5 hrs") to total hours
function parseZohoDurationToHours(str) {
  if (!str || typeof str !== "string") return 0;

  const s = str.trim().toLowerCase();

  // Handle "20 days 04:40 hrs" format
  let m = s.match(/(\d+)\s*days?\s+(\d{1,2}):(\d{2})\s*hrs?/);
  if (m) {
    const days = +m[1] || 0;
    const hours = +m[2] || 0;
    const minutes = +m[3] || 0;
    return days * 24 + hours + minutes / 60;
  }

  // Handle "04:40 hrs" format
  m = s.match(/(\d{1,2}):(\d{2})\s*hrs?/);
  if (m) {
    return (+m[1] || 0) + (+m[2] || 0) / 60;
  }

  // Handle "5 hrs" or plain number format
  m = s.match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) || 0 : 0;
}

// Set of resolved ticket statuses for filtering
const RESOLVED_STATUSES = new Set([
  "resolved",
  "closed",
  "archived",
  "completed",
]);

// Convert decimal hours back to Zoho-style "H:MM" format
const formatHoursToText = (hrs) => {
  if (!hrs || hrs <= 0) return "0:00";
  const h = Math.floor(hrs);
  const m = Math.round((hrs % 1) * 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}`;
};

// ===== ZOHO API CREDENTIALS (Keep these in .env in production!) =====
const clientId = "1000.VEPAX9T8TKDWJZZD95XT6NN52PRPQY";
const clientSecret = "acca291b89430180ced19660cd28ad8ce1e4bec6e8";
const refreshToken =
  "1000.465100d543b8d9471507bdf0b0263414.608f3f3817d11b09f142fd29810cca6f";

// ===== RATE LIMITING SETUP =====
const limiter = new Bottleneck({
  minTime: 200,        // Minimum 200ms between requests
  maxConcurrent: 3,    // Maximum 3 concurrent requests
});

// Configure axios retry for rate limits (429) and server errors (500+)
axiosRetry(axios, {
  retries: 4,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    error.response &&
    (error.response.status === 429 || error.response.status >= 500),
});

// ===== DEPARTMENT CONFIGURATION =====
const departmentList = [
  { id: "634846000000006907", name: "IT Support" },
  { id: "634846000000334045", name: "Wescon" },
  { id: "634846000006115409", name: "ERP or SAP Support" },
  { id: "634846000009938029", name: "EDI Support" },
  { id: "634846000018669037", name: "Test Help Desk" },
  { id: "634846000054176855", name: "Digitization" },
  { id: "634846000054190373", name: "PLM or IoT & CAD Support" },
];

// ===== ACCESS TOKEN MANAGEMENT (with caching) =====
let cachedAccessToken = null;
let accessTokenExpiry = null;

// Fetch fresh access token using refresh token (cached to avoid unnecessary calls)
async function getAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && accessTokenExpiry && now < accessTokenExpiry) {
    return cachedAccessToken;
  }

  const params = new URLSearchParams();
  params.append("refresh_token", refreshToken);
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("grant_type", "refresh_token");

  const response = await axios.post(
    "https://accounts.zoho.com/oauth/v2/token",
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  cachedAccessToken = response.data.access_token;
  accessTokenExpiry = now + (response.data.expires_in - 60) * 1000; // Refresh 1 min early
  return cachedAccessToken;
}

// ===== CORE DATA FETCHING FUNCTIONS =====

// Fetch ALL active tickets (paginated) for specific departments/agents
async function fetchAllTickets(accessToken, departmentIds = [], agentId = null) {
  let limit = 100;
  let allTickets = [];
  const deptIdsToFetch = departmentIds.length > 0 ? departmentIds : [null];

  for (const deptId of deptIdsToFetch) {
    let continueFetching = true;
    let pageFrom = 1;

    while (continueFetching) {
      const params = { from: pageFrom, limit };
      if (deptId) params.departmentId = deptId;
      if (agentId) params.agentId = agentId;

      const response = await limiter.schedule(() =>
        axios.get("https://desk.zoho.com/api/v1/tickets", {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
          params,
        })
      );

      const ticketsBatch = response.data.data || [];
      allTickets = allTickets.concat(ticketsBatch);

      if (ticketsBatch.length < limit) continueFetching = false;
      else pageFrom += limit;
    }
  }
  return allTickets;
}

// Fetch ALL users (paginated) from Zoho Desk
async function fetchAllUsers(accessToken) {
  let from = 1;
  let limit = 100;
  let allUsers = [];

  while (true) {
    const response = await limiter.schedule(() =>
      axios.get("https://desk.zoho.com/api/v1/users", {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        params: { from, limit },
      })
    );

    allUsers = allUsers.concat(response.data.data || []);
    if (!response.data.data || response.data.data.length < limit) break;
    from += limit;
  }

  return allUsers;
}

// Fetch specific users by their IDs (parallel requests)
async function fetchUsersByIds(accessToken, ids) {
  const users = [];
  for (const id of ids) {
    try {
      const response = await limiter.schedule(() =>
        axios.get(`https://desk.zoho.com/api/v1/users/${id}`, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        })
      );
      users.push(response.data);
    } catch (err) { } // Skip failed user fetches
  }
  return users;
}

// Status mapping for frontend display consistency
const statusMap = {
  open: "open",
  "on hold": "hold",
  hold: "hold",
  closed: "closed",
  "in progress": "inProgress",
  escalated: "escalated",
  unassigned: "unassigned",
  "": "unassigned",
};

// Fetch all agents for a specific department (paginated)
async function getAllAgentsForDepartment(departmentId, accessToken) {
  const limit = 200;
  let from = 1;
  let allAgents = [];

  while (true) {
    const response = await limiter.schedule(() =>
      axios.get(
        `https://desk.zoho.com/api/v1/departments/${departmentId}/agents`,
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
          params: { from, limit },
        }
      )
    );

    const agentsBatch = response.data.data || [];
    allAgents = allAgents.concat(agentsBatch);
    if (agentsBatch.length < limit) break;
    from += limit;
  }

  return allAgents;
}

// ===== UTILITY FUNCTIONS =====

// Format ISO date to readable "DD/MM/YYYY, HH:MM" format
function formatDate(dateString) {
  if (!dateString) return "";
  try {
    const dt = new Date(dateString);
    if (isNaN(dt)) return "";
    return dt.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Calculate hours difference between two dates
function diffInHours(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  if (Number.isNaN(ms)) return null;
  return +(ms / (1000 * 60 * 60)).toFixed(2);
}

/**
 * Add Zoho-style "H:MM hrs" duration to start datetime and return ISO end date
 */
function addZohoDurationToDate(startDateString, zohoHrsString) {
  if (!startDateString || !zohoHrsString) return null;

  const start = new Date(startDateString);
  if (isNaN(start)) return null;

  const m = String(zohoHrsString).trim().match(/^(\d+):(\d{2})\s*hrs$/i);
  if (!m) return null;

  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const totalMs = (hours * 60 + minutes) * 60 * 1000;

  const end = new Date(start.getTime() + totalMs);
  if (isNaN(end)) return null;
  return end.toISOString();
}

// Fetch ALL archived tickets for a department (paginated, up to ~5000 tickets)
async function fetchAllArchivedTickets(accessToken, departmentId) {
  const limit = 100;
  let from = 0;
  let allTickets = [];

  while (true) {
    const response = await limiter.schedule(() =>
      axios.get("https://desk.zoho.com/api/v1/tickets/archivedTickets", {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        params: { departmentId, from, limit },
      })
    );

    const batch = response.data.data || [];
    allTickets = allTickets.concat(batch);

    if (batch.length < limit || from >= 4900) break; // Safety limit
    from += limit;
  }
  return allTickets;
}

// ===== GLOBAL CACHES =====
let cachedActiveTickets = [];
let agentIdToName = {};

const ARCHIVED_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL for archived data

// Fetch detailed metrics for up to 300 most recent tickets
async function fetchTicketMetricsForTickets(accessToken, tickets) {
  const MAX_METRICS_TICKETS = 300;

  const ticketsSorted = tickets
    .filter((t) => t.createdTime)
    .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
    .slice(0, MAX_METRICS_TICKETS);

  const metricsPromises = ticketsSorted.map((t) =>
    limiter
      .schedule(() =>
        axios.get(`https://desk.zoho.com/api/v1/tickets/${t.id}/metrics`, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        })
      )
      .then((res) => ({ ticket: t, metrics: res.data }))
      .catch(() => null)
  );

  const results = await Promise.all(metricsPromises);
  const rows = [];

  for (const item of results) {
    if (!item) continue;
    const { ticket, metrics } = item;

    // Determine agent name from multiple possible fields
    const assigneeIdStr = ticket.assigneeId ? String(ticket.assigneeId) : "";
    const nameFromMap = assigneeIdStr && agentIdToName[assigneeIdStr];
    const agentName =
      nameFromMap ||
      (ticket.assignee &&
        (ticket.assignee.displayName ||
          ticket.assignee.fullName ||
          ticket.assignee.name ||
          ticket.assignee.email)) ||
      ticket.assigneeName ||
      "Unassigned";

    const dept = departmentList.find((d) => d.id === ticket.departmentId);
    const departmentId = ticket.departmentId || "";
    const departmentName = dept ? dept.name : "";

    // Calculate actual first response datetime by adding duration to created time
    const firstResponseDateTime = addZohoDurationToDate(
      ticket.createdTime,
      metrics.firstResponseTime
    );

    rows.push({
      ticketNumber: ticket.ticketNumber || ticket.id,
      status: ticket.status || "",
      agentName,
      createdTime: ticket.createdTime || "",

      firstResponseTime: metrics.firstResponseTime || "",
      totalResponseTime: metrics.totalResponseTime || "",
      resolutionTime: metrics.resolutionTime || "",

      firstResponseDateTime: firstResponseDateTime || "",

      departmentId,
      departmentName,
      responseCount: metrics.responseCount || "",
      outgoingCount: metrics.outgoingCount || "",
      threadCount: metrics.threadCount || "",
      reopenCount: metrics.reopenCount || "",
      reassignCount: metrics.reassignCount || "",
      stagingData: Array.isArray(metrics.stagingData) ? metrics.stagingData : [],
      agentsHandled: Array.isArray(metrics.agentsHandled)
        ? metrics.agentsHandled
        : [],
    });
  }

  return rows;
}

// ===== CACHING VARIABLES FOR PERFORMANCE =====
const CACHE_TTL_MS = 7 * 60 * 1000; // 7 minutes cache TTL
let assigneeCachePayload = null;
let assigneeCacheTime = 0;
let assigneeInFlightPromise = null;

let departmentsCachePayload = null;
let departmentsCacheTime = 0;
let departmentsInFlightPromise = null;

let deptTicketCachePayload = null;
let deptTicketCacheTime = 0;
let deptTicketInFlightPromise = null;

const deptMembersCachePayload = {};
const deptMembersCacheTime = {};
const deptMembersInFlightPromise = {};

let metricsCachePayload = null;
let metricsCacheTime = 0;
let metricsInFlightPromise = null;

// =====================
// 1) AGENT PERFORMANCE API ENDPOINT
// =====================
app.get("/api/agent-performance", async (req, res) => {
  try {
    const { fromDate, toDate, departmentId, agentId } = req.query;

    const fromDateObj = fromDate ? new Date(fromDate) : null;
    const toDateObj = toDate ? new Date(toDate) : null;

    const accessToken = await getAccessToken();

    // Step 1: Fetch active tickets for specified departments/agents
    const deptIds =
      departmentId && departmentId !== "all" ? [departmentId] : [];

    const activeTickets = await fetchAllTickets(
      accessToken,
      deptIds,
      agentId || null
    );

    // Step 2: Fetch archived tickets for all relevant departments
    let archivedTickets = [];
    const deps =
      departmentId && departmentId !== "all"
        ? departmentList.filter((d) => d.id === departmentId)
        : departmentList;

    for (const dep of deps) {
      const batch = await fetchAllArchivedTickets(accessToken, dep.id);
      archivedTickets.push(...(batch || []));
    }

    // Step 3: Merge active + archived tickets
    let allTickets = [...activeTickets, ...archivedTickets];

    // Step 4: Filter by specific agent if requested
    if (agentId && agentId !== "all") {
      allTickets = allTickets.filter(
        (t) => String(t.assigneeId || "") === String(agentId)
      );
    }

    // Step 5: Filter by date range (created OR closed within range)
    if (fromDateObj || toDateObj) {
      allTickets = allTickets.filter((t) => {
        const created = t.createdTime && new Date(t.createdTime);
        const closed = t.closedTime && new Date(t.closedTime);

        const inCreated =
          created &&
          (!fromDateObj || created >= fromDateObj) &&
          (!toDateObj || created <= toDateObj);

        const inClosed =
          closed &&
          (!fromDateObj || closed >= fromDateObj) &&
          (!toDateObj || closed <= toDateObj);

        return inCreated || inClosed;
      });
    }

    if (!allTickets.length) {
      return res.json({ agents: [], summary: null });
    }

    // -------- Build initial agent statistics from raw tickets --------
    const statusMapLocal = {};                    // Track ticket statuses by ID
    const baseAgentsMap = {};                     // Aggregate stats per agent

    allTickets.forEach((t) => {
      const key = String(t.ticketNumber || t.id || "");
      if (key) statusMapLocal[key] = (t.status || "").toLowerCase();

      const agentKey = String(t.assigneeId || "unassigned");

      if (!baseAgentsMap[agentKey]) {
        const assignee = t.assignee || {};
        const nameFromTicket =
          assignee.displayName ||
          assignee.fullName ||
          assignee.name ||
          assignee.email ||
          t.assigneeName ||
          "Unassigned";

        baseAgentsMap[agentKey] = {
          agentId: agentKey,
          agentName: nameFromTicket,
          ticketIds: new Set(),
          resolvedIds: new Set(),
          pendingIds: new Set(),
          totalResolutionHours: 0,
          resolutionCount: 0, // Will be populated from metrics
        };
      }

      const bucket = baseAgentsMap[agentKey];
      const ticketId = String(t.ticketNumber || t.id || "");
      if (!ticketId) return;
      bucket.ticketIds.add(ticketId);

      const status = statusMapLocal[ticketId] || "";
      if (RESOLVED_STATUSES.has(status)) {
        bucket.resolvedIds.add(ticketId);
      } else {
        bucket.pendingIds.add(ticketId);
      }
    });

    // -------- Fetch metrics and calculate resolution time averages --------
    const metricRows = await fetchTicketMetricsForTickets(
      accessToken,
      allTickets
    );

    metricRows.forEach((row) => {
      const agentKey = String(row.agentId || row.assigneeId || "unassigned");
      const ticketId = String(row.ticketNumber || row.id || "");
      if (!ticketId) return;

      // Ensure agent exists in base map
      if (!baseAgentsMap[agentKey]) {
        baseAgentsMap[agentKey] = {
          agentId: agentKey,
          agentName: row.agentName || "Unassigned",
          ticketIds: new Set(),
          resolvedIds: new Set(),
          pendingIds: new Set(),
          totalResolutionHours: 0,
          resolutionCount: 0,
        };
      }

      const bucket = baseAgentsMap[agentKey];

      const status = statusMapLocal[ticketId] || "";
      if (RESOLVED_STATUSES.has(status)) {
        const resHrs = parseZohoDurationToHours(row.resolutionTime);
        if (resHrs >= 0) {
          bucket.totalResolutionHours += resHrs;
          bucket.resolutionCount++;
        }
      }
    });

    // -------- Format final agent performance data --------
    const agents = Object.values(baseAgentsMap).map((a) => {
      const avgRes =
        a.resolutionCount > 0
          ? a.totalResolutionHours / a.resolutionCount
          : 0;

      return {
        agentId: a.agentId,
        agentName: a.agentName,
        ticketsCreated: a.ticketIds.size,
        ticketsResolved: a.resolvedIds.size,
        pendingCount: a.pendingIds.size,
        avgResolutionHours: avgRes,
        avgResolutionText: formatHoursToText(avgRes),
      };
    });

    // -------- Calculate global summary statistics --------
    let totalResolved = 0;
    let totalPending = 0;
    let totalResolutionHours = 0;

    agents.forEach((a) => {
      const resolved = Number(a.ticketsResolved) || 0;
      const pending = Number(a.pendingCount) || 0;
      const resHrs =
        typeof a.avgResolutionHours === "number"
          ? a.avgResolutionHours
          : 0;

      totalResolved += resolved;
      totalPending += pending;
      totalResolutionHours += resHrs * resolved;
    });

    const totalCreated = totalResolved + totalPending;
    const avgResolutionHours =
      totalResolved > 0
        ? +(totalResolutionHours / totalResolved).toFixed(2)
        : 0;

    res.json({
      agents,
      summary: {
        totalCreated,
        totalResolved,
        totalPending,
        avgResolutionHours,
      },
    });
  } catch (err) {
    console.error("Error in /api/agent-performance", err);
    res.status(500).json({ error: "Failed to compute agent performance" });
  }
});

// =====================
// 2) YEARLY TICKET SUMMARY API ENDPOINT
// =====================
app.get("/api/tickets-yearly-summary", async (req, res) => {
  try {
    const { departmentId, agentId } = req.query;
    const accessToken = await getAccessToken();

    const deptIds =
      departmentId && departmentId !== "all" ? [departmentId] : [];

    // Fetch active tickets
    const activeTickets = await fetchAllTickets(
      accessToken,
      deptIds,
      agentId && agentId !== "all" ? agentId : null
    );

    // Fetch archived tickets
    let archivedTickets = [];
    const deps =
      departmentId && departmentId !== "all"
        ? departmentList.filter((d) => d.id === departmentId)
        : departmentList;

    for (const dep of deps) {
      const batch = await fetchAllArchivedTickets(accessToken, dep.id);
      archivedTickets.push(...(batch || []));
    }

    if (agentId && agentId !== "all") {
      archivedTickets = archivedTickets.filter(
        (t) => String(t.assigneeId || "") === String(agentId)
      );
    }

    const allTickets = [...activeTickets, ...archivedTickets];

    // Group tickets by year (2020-2025)
    const summary = {};
    for (let y = 2020; y <= 2025; y++) {
      summary[y] = { created: 0, resolved: 0 };
    }

    allTickets.forEach((t) => {
      const d = t.createdTime && new Date(t.createdTime);
      if (!d || Number.isNaN(d.getTime())) return;

      const y = d.getFullYear();
      if (!summary[y]) return;

      summary[y].created += 1;

      if (RESOLVED_STATUSES.has((t.status || "").toLowerCase())) {
        summary[y].resolved += 1;
      }
    });

    res.json({
      years: Object.keys(summary).map((y) => ({
        year: y,
        created: summary[y].created,
        resolved: summary[y].resolved,
      })),
    });
  } catch (err) {
    console.error("Error in /api/tickets-yearly-summary", err);
    res.status(500).json({ error: "Failed to compute yearly summary" });
  }
});

// ================================
// EXISTING ROUTES (unchanged)
// ================================

// ===== ASSIGNEES WITH TICKET COUNTS API (cached, comprehensive agent stats) =====
app.get("/api/zoho-assignees-with-ticket-counts", async (req, res) => {
  try {
    // Check cache first (7-minute TTL)
    const nowTs = Date.now();
    if (assigneeCachePayload && nowTs - assigneeCacheTime < CACHE_TTL_MS) {
      return res.json(assigneeCachePayload);
    }

    // Return in-flight promise result if already computing
    if (assigneeInFlightPromise) {
      const payload = await assigneeInFlightPromise;
      return res.json(payload);
    }

    // Start new computation with in-flight promise to prevent duplicates
    assigneeInFlightPromise = (async () => {
      // Parse departmentIds from query (handles both JSON array and single ID)
      let departmentIds = [];
      if (req.query.departmentIds) {
        try {
          departmentIds = JSON.parse(req.query.departmentIds);
        } catch {
          departmentIds = [req.query.departmentIds];
        }
      }

      const agentId = req.query.agentId || null;
      const accessToken = await getAccessToken();

      // Fetch all users and tickets
      let users = await fetchAllUsers(accessToken);
      const tickets = await fetchAllTickets(accessToken, departmentIds, agentId);
      const allDepartments = departmentList || [];
      const activeStatuses = ["open", "on hold", "in progress", "escalated"];

      // Cache active (non-closed) tickets globally for other endpoints
      cachedActiveTickets = tickets.filter((t) =>
        activeStatuses.includes((t.status || "").toLowerCase())
      );

      // Fetch all agents per department in parallel and build name map
      const deptAgentFetchPromises = allDepartments.map((dep) =>
        getAllAgentsForDepartment(dep.id, accessToken)
          .then((agents) =>
            agents.map(
              (a) =>
                a.displayName ||
                a.fullName ||
                a.name ||
                a.email ||
                "Unknown"
            )
          )
          .catch(() => [])
      );

      const deptAgentNamesArray = await Promise.all(deptAgentFetchPromises);
      const deptAgentNameMap = {};
      allDepartments.forEach((dep, idx) => {
        deptAgentNameMap[dep.id] = deptAgentNamesArray[idx];
      });

      // Collect all unique assignee IDs from tickets
      const allAssigneeIds = new Set(
        tickets.map((t) => t.assigneeId).filter(Boolean)
      );

      const knownUserIds = new Set(users.map((u) => u.id));
      const missingUserIds = Array.from(allAssigneeIds).filter(
        (id) => !knownUserIds.has(id)
      );

      // Fetch missing users individually (rate limited)
      if (missingUserIds.length > 0) {
        const missingUserPromises = missingUserIds.map((id) =>
          limiter
            .schedule(() =>
              axios
                .get(`https://desk.zoho.com/api/v1/users/${id}`, {
                  headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                })
                .then((res) => res.data)
            )
            .catch(() => null)
        );
        const missingUsers = await Promise.all(missingUserPromises);
        users = users.concat(missingUsers.filter(Boolean));
      }

      // Build global agentId -> name mapping
      agentIdToName = {};
      users.forEach((u) => {
        const name =
          u.displayName || u.fullName || u.name || u.email || "Unknown";
        agentIdToName[String(u.id)] = name;
      });

      // Initialize ticket status counters for all users + "unassigned"
      const ticketStatusCountMap = {};
      const latestUnassignedTicketIdMap = {};

      users.forEach((user) => {
        ticketStatusCountMap[user.id] = {
          open: 0,
          closed: 0,
          hold: 0,
          escalated: 0,
          unassigned: 0,
          inProgress: 0,
        };
        latestUnassignedTicketIdMap[user.id] = null;
      });

      ticketStatusCountMap["unassigned"] = {
        open: 0,
        closed: 0,
        hold: 0,
        escalated: 0,
        unassigned: 0,
        inProgress: 0,
      };
      latestUnassignedTicketIdMap["unassigned"] = null;

      // Track aging statistics per user per department
      const now = Date.now();
      const userDeptAgingCounts = {};
      const allUnassignedTicketNumbers = [];

      // Process each ticket and populate counters + aging data
      tickets.forEach((ticket) => {
        // Normalize assignee handling (empty/null -> "unassigned")
        const assigneeRaw =
          ticket.assigneeId === undefined || ticket.assigneeId === null
            ? ""
            : ticket.assigneeId.toString().toLowerCase();
        const isUnassignedAssignee =
          assigneeRaw === "" || assigneeRaw === "none" || assigneeRaw === "null";
        const assigneeId = isUnassignedAssignee ? "unassigned" : ticket.assigneeId;

        // Initialize counters for new assignees
        if (!ticketStatusCountMap[assigneeId]) {
          ticketStatusCountMap[assigneeId] = {
            open: 0,
            closed: 0,
            hold: 0,
            escalated: 0,
            unassigned: 0,
            inProgress: 0,
          };
          latestUnassignedTicketIdMap[assigneeId] = null;
        }

        // Initialize aging counters per department
        if (!userDeptAgingCounts[assigneeId]) userDeptAgingCounts[assigneeId] = {};
        const deptId = ticket.departmentId || "no_department";
        if (!userDeptAgingCounts[assigneeId][deptId]) {
          userDeptAgingCounts[assigneeId][deptId] = {
            // 1-15 days buckets
            openBetweenOneAndFifteenDaysCount: 0,
            openBetweenOneAndFifteenDaysTickets: [],
            openBetweenSixteenAndThirtyDaysCount: 0,
            openBetweenSixteenAndThirtyDaysTickets: [],
            openOlderThanThirtyDaysCount: 0,
            openOlderThanThirtyDaysTickets: [],
            holdBetweenOneAndFifteenDaysCount: 0,
            holdBetweenOneAndFifteenDaysTickets: [],
            holdBetweenSixteenAndThirtyDaysCount: 0,
            holdBetweenSixteenAndThirtyDaysTickets: [],
            holdOlderThanThirtyDaysCount: 0,
            holdOlderThanThirtyDaysTickets: [],
            inProgressBetweenOneAndFifteenDaysCount: 0,
            inProgressBetweenOneAndFifteenDaysTickets: [],
            inProgressBetweenSixteenAndThirtyDaysCount: 0,
            inProgressBetweenSixteenAndThirtyDaysTickets: [],
            inProgressOlderThanThirtyDaysCount: 0,
            inProgressOlderThanThirtyDaysTickets: [],
            escalatedBetweenOneAndFifteenDaysCount: 0,
            escalatedBetweenOneAndFifteenDaysTickets: [],
            escalatedBetweenSixteenAndThirtyDaysCount: 0,
            escalatedBetweenSixteenAndThirtyDaysTickets: [],
            escalatedOlderThanThirtyDaysCount: 0,
            escalatedOlderThanThirtyDaysTickets: [],
            // Finer 1-7/8-15 day buckets for dashboard
            openBetweenOneAndSevenDaysTickets: [],
            openBetweenEightAndFifteenDaysTickets: [],
            openOlderThanFifteenDaysTickets: [],
            holdBetweenOneAndSevenDaysTickets: [],
            holdBetweenEightAndFifteenDaysTickets: [],
            holdOlderThanFifteenDaysTickets: [],
            inProgressBetweenOneAndSevenDaysTickets: [],
            inProgressBetweenEightAndFifteenDaysTickets: [],
            inProgressOlderThanFifteenDaysTickets: [],
            escalatedBetweenOneAndSevenDaysTickets: [],
            escalatedBetweenEightAndFifteenDaysTickets: [],
            escalatedOlderThanFifteenDaysTickets: [],
          };
        }

        // Normalize ticket status using statusMap
        const rawStatus = (ticket.status || "").toLowerCase();
        const normalizedStatus = statusMap[rawStatus] || "unassigned";
        const isEscalated =
          ticket.isEscalated === true ||
          String(ticket.escalated).toLowerCase() === "true";

        // Calculate ticket age in days
        const ageDays = ticket.createdTime
          ? (now - new Date(ticket.createdTime)) / (1000 * 60 * 60 * 24)
          : null;

        const agingCounts = userDeptAgingCounts[assigneeId][deptId];
        const ticketNumber = ticket.ticketNumber || ticket.id;

        // Populate aging buckets (1-7, 8-15, 16+ days)
        if (ageDays !== null) {
          if (
            ["open", "hold", "inProgress", "escalated"].includes(normalizedStatus)
          ) {
            if (ageDays >= 0 && ageDays < 8)
              agingCounts[
                normalizedStatus + "BetweenOneAndSevenDaysTickets"
              ].push(ticketNumber);
            else if (ageDays >= 8 && ageDays < 16)
              agingCounts[
                normalizedStatus + "BetweenEightAndFifteenDaysTickets"
              ].push(ticketNumber);
            else if (ageDays >= 16)
              agingCounts[normalizedStatus + "OlderThanFifteenDaysTickets"].push(
                ticketNumber
              );
          }

          // Main aging buckets (1-15, 16-30, 30+ days)
          if (normalizedStatus === "open") {
            if (ageDays >= 0 && ageDays < 16) {
              agingCounts.openBetweenOneAndFifteenDaysCount++;
              agingCounts.openBetweenOneAndFifteenDaysTickets.push(ticketNumber);
            } else if (ageDays >= 16 && ageDays < 31) {
              agingCounts.openBetweenSixteenAndThirtyDaysCount++;
              agingCounts.openBetweenSixteenAndThirtyDaysTickets.push(
                ticketNumber
              );
            } else if (ageDays > 30) {
              agingCounts.openOlderThanThirtyDaysCount++;
              agingCounts.openOlderThanThirtyDaysTickets.push(ticketNumber);
            }
          } else if (normalizedStatus === "hold") {
            if (ageDays >= 0 && ageDays < 16) {
              agingCounts.holdBetweenOneAndFifteenDaysCount++;
              agingCounts.holdBetweenOneAndFifteenDaysTickets.push(ticketNumber);
            } else if (ageDays >= 16 && ageDays < 31) {
              agingCounts.holdBetweenSixteenAndThirtyDaysCount++;
              agingCounts.holdBetweenSixteenAndThirtyDaysTickets.push(
                ticketNumber
              );
            } else if (ageDays > 30) {
              agingCounts.holdOlderThanThirtyDaysCount++;
              agingCounts.holdOlderThanThirtyDaysTickets.push(ticketNumber);
            }
          } else if (normalizedStatus === "inProgress") {
            if (ageDays >= 0 && ageDays < 16) {
              agingCounts.inProgressBetweenOneAndFifteenDaysCount++;
              agingCounts.inProgressBetweenOneAndFifteenDaysTickets.push(
                ticketNumber
              );
            } else if (ageDays >= 16 && ageDays < 31) {
              agingCounts.inProgressBetweenSixteenAndThirtyDaysCount++;
              agingCounts.inProgressBetweenSixteenAndThirtyDaysTickets.push(
                ticketNumber
              );
            } else if (ageDays > 30) {
              agingCounts.inProgressOlderThanThirtyDaysCount++;
              agingCounts.inProgressOlderThanThirtyDaysTickets.push(
                ticketNumber
              );
            }
          } else if (normalizedStatus === "escalated") {
            if (ageDays >= 0 && ageDays < 16) {
              agingCounts.escalatedBetweenOneAndFifteenDaysCount++;
              agingCounts.escalatedBetweenOneAndFifteenDaysTickets.push(
                ticketNumber
              );
            } else if (ageDays >= 16 && ageDays < 31) {
              agingCounts.escalatedBetweenSixteenAndThirtyDaysCount++;
              agingCounts.escalatedBetweenSixteenAndThirtyDaysTickets.push(
                ticketNumber
              );
            } else if (ageDays > 30) {
              agingCounts.escalatedOlderThanThirtyDaysCount++;
              agingCounts.escalatedOlderThanThirtyDaysTickets.push(ticketNumber);
            }
          }
        }

        // Track latest unassigned ticket per assignee
        if (isUnassignedAssignee && normalizedStatus !== "closed") {
          if (ticketNumber) allUnassignedTicketNumbers.push(ticketNumber);
          const currentLatest = latestUnassignedTicketIdMap[assigneeId];
          if (
            currentLatest === null ||
            (typeof currentLatest === "number" && ticketNumber > currentLatest) ||
            (typeof currentLatest === "string" &&
              ticketNumber.localeCompare(currentLatest) > 0)
          )
            latestUnassignedTicketIdMap[assigneeId] = ticketNumber;
        }

        // Skip closed unassigned tickets from status counting
        if (isUnassignedAssignee && normalizedStatus === "closed") return;

        // Increment appropriate status counter
        if (isUnassignedAssignee)
          ticketStatusCountMap["unassigned"].unassigned++;
        else if (normalizedStatus === "escalated" || isEscalated)
          ticketStatusCountMap[assigneeId].escalated++;
        else if (normalizedStatus === "open")
          ticketStatusCountMap[assigneeId].open++;
        else if (normalizedStatus === "hold")
          ticketStatusCountMap[assigneeId].hold++;
        else if (normalizedStatus === "closed")
          ticketStatusCountMap[assigneeId].closed++;
        else if (normalizedStatus === "inProgress")
          ticketStatusCountMap[assigneeId].inProgress++;
      });

      // Add "Unassigned" pseudo-user
      users.push({
        id: "unassigned",
        fullName: "Unassigned",
        displayName: "Unassigned",
      });

      // Build final member objects with comprehensive statistics
      const now2 = Date.now();
      const members = users
        .filter((user) => user.id in ticketStatusCountMap)
        .map((user) => {
          const candidateName =
            user.displayName ||
            user.fullName ||
            user.name ||
            user.email ||
            "Unknown";

          // Determine user's department membership
          let departmentIds2 = [];
          for (const dep of allDepartments) {
            if (
              (user.departmentIds && user.departmentIds.includes(dep.id)) ||
              (deptAgentNameMap[dep.id] &&
                deptAgentNameMap[dep.id].includes(candidateName))
            ) {
              departmentIds2.push(dep.id);
            }
          }

          // Get agent's non-closed tickets
          const agentTickets = tickets.filter(
            (t) =>
              String(t.assigneeId) === String(user.id) &&
              t.status &&
              t.status.toLowerCase() !== "closed"
          );

          // Calculate per-status aging buckets for agent dashboard
          const statusKeys = ["open", "hold", "inProgress", "escalated"];
          let perStatusAge = {};

          statusKeys.forEach((status) => {
            // 1-7 days
            perStatusAge[`${status}BetweenOneAndSevenDays`] =
              agentTickets.filter((t) => {
                const rawStatus = (t.status || "").toLowerCase();
                const normalized = statusMap[rawStatus] || rawStatus;
                const ageDays = t.createdTime
                  ? (now2 - new Date(t.createdTime)) / (1000 * 60 * 60 * 24)
                  : null;
                return (
                  normalized === status &&
                  ageDays !== null &&
                  ageDays < 8 &&
                  ageDays >= 0
                );
              }).length;

            // 8-15 days
            perStatusAge[`${status}BetweenEightAndFifteenDays`] =
              agentTickets.filter((t) => {
                const rawStatus = (t.status || "").toLowerCase();
                const normalized = statusMap[rawStatus] || rawStatus;
                const ageDays = t.createdTime
                  ? (now2 - new Date(t.createdTime)) / (1000 * 60 * 60 * 24)
                  : null;
                return (
                  normalized === status &&
                  ageDays !== null &&
                  ageDays >= 8 &&
                  ageDays < 16
                );
              }).length;

            // 16+ days
            perStatusAge[`${status}OlderThanFifteenDays`] = agentTickets.filter(
              (t) => {
                const rawStatus = (t.status || "").toLowerCase();
                const normalized = statusMap[rawStatus] || rawStatus;
                const ageDays = t.createdTime
                  ? (now2 - new Date(t.createdTime)) / (1000 * 60 * 60 * 24)
                  : null;
                return normalized === status && ageDays !== null && ageDays >= 16;
              }
            ).length;

            // 1-15 days (combined)
            perStatusAge[`${status}BetweenOneAndFifteenDays`] =
              agentTickets.filter((t) => {
                const rawStatus = (t.status || "").toLowerCase();
                const normalized = statusMap[rawStatus] || rawStatus;
                const ageDays = t.createdTime
                  ? (now2 - new Date(t.createdTime)) / (1000 * 60 * 60 * 24)
                  : null;
                return (
                  normalized === status &&
                  ageDays !== null &&
                  ageDays < 16 &&
                  ageDays >= 0
                );
              }).length;

            // 16-30 days
            perStatusAge[`${status}BetweenSixteenAndThirtyDays`] =
              agentTickets.filter((t) => {
                const rawStatus = (t.status || "").toLowerCase();
                const normalized = statusMap[rawStatus] || rawStatus;
                const ageDays = t.createdTime
                  ? (now2 - new Date(t.createdTime)) / (1000 * 60 * 60 * 24)
                  : null;
                return (
                  normalized === status &&
                  ageDays !== null &&
                  ageDays >= 16 &&
                  ageDays < 31
                );
              }).length;

            // 30+ days
            perStatusAge[`${status}OlderThanThirtyDays`] = agentTickets.filter(
              (t) => {
                const rawStatus = (t.status || "").toLowerCase();
                const normalized = statusMap[rawStatus] || rawStatus;
                const ageDays = t.createdTime
                  ? (now2 - new Date(t.createdTime)) / (1000 * 60 * 60 * 24)
                  : null;
                return normalized === status && ageDays !== null && ageDays > 30;
              }
            ).length;
          });

          // Department-specific ticket counts
          const departmentTicketCounts = {};
          departmentIds2.forEach((depId) => {
            departmentTicketCounts[depId] = agentTickets.filter(
              (t) =>
                String(t.assigneeId) === String(user.id) &&
                t.departmentId === depId
            ).length;
          });

          // Detailed pending tickets list with aging info
          const pendingTickets = agentTickets
            .filter((t) => (t.status || "").toLowerCase() !== "closed")
            .map((t) => {
              const createdDate = new Date(t.createdTime);
              const nowLocal = Date.now();
              const daysNotResponded = !isNaN(createdDate)
                ? Math.floor(
                  (nowLocal - createdDate.getTime()) /
                  (1000 * 60 * 60 * 24)
                )
                : null;
              return {
                departmentName:
                  departmentList.find((dep) => dep.id === t.departmentId)?.name ||
                  "",
                departmentId: t.departmentId || "",
                status: t.status || "",
                ticketNumber: t.ticketNumber || t.id || "",
                ticketCreated: formatDate(t.createdTime),
                daysNotResponded,
              };
            });

          // Final member object with all metrics
          return {
            id: user.id,
            name: candidateName,
            departmentIds: departmentIds2,
            tickets: { ...ticketStatusCountMap[user.id], ...perStatusAge },
            latestUnassignedTicketId: latestUnassignedTicketIdMap[user.id] || null,
            departmentTicketCounts,
            departmentAgingCounts: userDeptAgingCounts[user.id] || {},
            pendingTickets,
          };
        });

      // Update global agent name cache from final results
      agentIdToName = {};
      members.forEach((m) => {
        if (m.id && m.name) {
          agentIdToName[String(m.id)] = m.name;
        }
      });

      // Cache the final result
      assigneeCachePayload = { members, unassignedTickets: allUnassignedTicketNumbers };
      assigneeCacheTime = Date.now();
      assigneeInFlightPromise = null;

      return assigneeCachePayload;
    })();

    const payload = await assigneeInFlightPromise;
    res.json(payload);

  } catch (err) {
    console.error("Error in /api/zoho-assignees-with-ticket-counts", err);
    assigneeInFlightPromise = null;
    res.status(500).json({ error: "Failed to fetch assignees with ticket counts" });
  }
});

// ===== CONTINUATION OF ASSIGNEES ENDPOINT - DEPARTMENT AGING BUCKETS =====
// Calculate cross-department aging statistics (1-7, 8-15, 15+ days buckets)
const departmentAgeBuckets = departmentList.map((dep) => {
  let count_1_7 = 0;
  let count_8_15 = 0;
  let count_15plus = 0;
  let total = 0;

  // Aggregate aging data across ALL agents for this department
  Object.values(userDeptAgingCounts).forEach((agentDeptCounts) => {
    const agingCounts = agentDeptCounts[dep.id];
    if (agingCounts) {
      // 1-7 days: Sum all status buckets
      count_1_7 +=
        (agingCounts.openBetweenOneAndSevenDaysTickets.length || 0) +
        (agingCounts.holdBetweenOneAndSevenDaysTickets.length || 0) +
        (agingCounts.inProgressBetweenOneAndSevenDaysTickets.length || 0) +
        (agingCounts.escalatedBetweenOneAndSevenDaysTickets.length || 0);

      // 8-15 days: Sum all status buckets
      count_8_15 +=
        (agingCounts.openBetweenEightAndFifteenDaysTickets.length || 0) +
        (agingCounts.holdBetweenEightAndFifteenDaysTickets.length || 0) +
        (agingCounts.inProgressBetweenEightAndFifteenDaysTickets.length || 0) +
        (agingCounts.escalatedBetweenEightAndFifteenDaysTickets.length || 0);

      // 15+ days: Sum all status buckets
      count_15plus +=
        (agingCounts.openOlderThanFifteenDaysTickets.length || 0) +
        (agingCounts.holdOlderThanFifteenDaysTickets.length || 0) +
        (agingCounts.inProgressOlderThanFifteenDaysTickets.length || 0) +
        (agingCounts.escalatedOlderThanFifteenDaysTickets.length || 0);
    }
  });

  total = count_1_7 + count_8_15 + count_15plus;

  return {
    departmentId: dep.id,
    departmentName: dep.name,
    count_1_7,
    count_8_15,
    count_15plus,
    total,
  };
});

// Finalize comprehensive payload with all agent/department statistics
const payload = {
  members,                              // Individual agent statistics
  unassignedTicketNumbers: allUnassignedTicketNumbers,  // Global unassigned list
  departments: allDepartments.map((dep) => ({
    id: dep.id,
    name: dep.name,
    description: dep.description,
    agents: deptAgentNameMap[dep.id],   // Agents per department
  })),
  departmentAgeBuckets,                 // Cross-agent department aging
};

// Cache final result and clear in-flight promise
assigneeCachePayload = payload;
assigneeCacheTime = Date.now();
return payload;


assigneeInFlightPromise = null;
res.json(payload);
(error)
assigneeInFlightPromise = null;
console.error(
  "Error in /api/zoho-assignees-with-ticket-counts",
  error.message
);
res
  .status(500)
  .json({ error: "Failed to fetch assignee ticket counts" });

// ===== DEPARTMENTS WITH AGENTS API (cached) =====
app.get("/api/zoho-departments", async (req, res) => {
  try {
    // Cache check (7-minute TTL)
    const nowTs = Date.now();
    if (departmentsCachePayload && nowTs - departmentsCacheTime < CACHE_TTL_MS) {
      return res.json(departmentsCachePayload);
    }

    // In-flight promise check
    if (departmentsInFlightPromise) {
      const payload = await departmentsInFlightPromise;
      return res.json(payload);
    }

    // Compute departments + agents mapping
    departmentsInFlightPromise = (async () => {
      const accessToken = await getAccessToken();
      const allUsers = await fetchAllUsers(accessToken);
      const deptUserMap = {};

      // Initialize department arrays
      departmentList.forEach((dep) => {
        deptUserMap[dep.id] = [];
      });

      // Map users to their departments
      allUsers.forEach((user) => {
        if (user.departmentIds && Array.isArray(user.departmentIds)) {
          user.departmentIds.forEach((depId) => {
            if (deptUserMap[depId]) {
              const displayName =
                user.displayName ||
                user.fullName ||
                user.name ||
                user.email ||
                "Unknown";
              deptUserMap[depId].push(displayName);
            }
          });
        }
      });

      // Build final department objects with agent lists
      const departmentsWithUsers = departmentList.map((dep) => ({
        ...dep,
        agents: deptUserMap[dep.id] || [],
      }));

      const payload = { departments: departmentsWithUsers };
      departmentsCachePayload = payload;
      departmentsCacheTime = Date.now();
      return payload;
    })();

    const payload = await departmentsInFlightPromise;
    departmentsInFlightPromise = null;
    res.json(payload);
  } catch (error) {
    departmentsInFlightPromise = null;
    console.error("Error in /api/zoho-departments", error.message);
    res.status(500).json({ error: "Failed to fetch departments with users" });
  }
});

// ===== DEPARTMENT TICKET COUNTS API (cached) =====
app.get("/api/zoho-department-ticket-counts", async (req, res) => {
  try {
    // Cache + in-flight checks
    const nowTs = Date.now();
    if (deptTicketCachePayload && nowTs - deptTicketCacheTime < CACHE_TTL_MS) {
      return res.json(deptTicketCachePayload);
    }
    if (deptTicketInFlightPromise) {
      const payload = await deptTicketInFlightPromise;
      return res.json(payload);
    }

    deptTicketInFlightPromise = (async () => {
      const accessToken = await getAccessToken();
      const tickets = await fetchAllTickets(accessToken);
      const ticketStatusCountMap = {};

      // Initialize counters for all departments
      departmentList.forEach((dep) => {
        ticketStatusCountMap[dep.id] = {
          open: 0,
          closed: 0,
          hold: 0,
          escalated: 0,
          unassigned: 0,
          inProgress: 0,
        };
      });

      // Count tickets by status per department
      tickets.forEach((ticket) => {
        const deptId = ticket.departmentId;
        if (deptId && ticketStatusCountMap[deptId]) {
          const rawStatus = (ticket.status || "").toLowerCase();
          const normalizedStatus = statusMap[rawStatus] || "unassigned";
          const isEscalated =
            ticket.isEscalated === true ||
            String(ticket.escalated).toLowerCase() === "true";

          // Unassigned logic (non-closed tickets without assignee)
          if (
            (!ticket.assigneeId ||
              ["null", "none", null].includes(ticket.assigneeId)) &&
            normalizedStatus !== "closed"
          ) {
            ticketStatusCountMap[deptId].unassigned++;
          } else if (normalizedStatus === "escalated" || isEscalated) {
            ticketStatusCountMap[deptId].escalated++;
          } else if (normalizedStatus === "open") {
            ticketStatusCountMap[deptId].open++;
          } else if (normalizedStatus === "hold") {
            ticketStatusCountMap[deptId].hold++;
          } else if (normalizedStatus === "closed") {
            ticketStatusCountMap[deptId].closed++;
          } else if (normalizedStatus === "inProgress") {
            ticketStatusCountMap[deptId].inProgress++;
          }
        }
      });

      // Format results
      const departmentTicketCounts = departmentList.map((dep) => ({
        id: dep.id,
        name: dep.name,
        tickets:
          ticketStatusCountMap[dep.id] || {
            open: 0,
            closed: 0,
            hold: 0,
            escalated: 0,
            unassigned: 0,
            inProgress: 0,
          },
      }));

      const payload = { departmentTicketCounts };
      deptTicketCachePayload = payload;
      deptTicketCacheTime = Date.now();
      return payload;
    })();

    const payload = await deptTicketInFlightPromise;
    deptTicketInFlightPromise = null;
    res.json(payload);
  } catch (error) {
    deptTicketInFlightPromise = null;
    console.error("Error in /api/zoho-department-ticket-counts", error.message);
    res
      .status(500)
      .json({ error: "Failed to get department ticket counts" });
  }
});

// ===== DEPARTMENT MEMBERS API (per-department caching) =====
app.get("/api/department-members/:departmentId", async (req, res) => {
  const { departmentId } = req.params;
  try {
    // Per-department cache check
    const nowTs = Date.now();
    if (
      deptMembersCachePayload[departmentId] &&
      deptMembersCacheTime[departmentId] &&
      nowTs - deptMembersCacheTime[departmentId] < CACHE_TTL_MS
    ) {
      return res.json(deptMembersCachePayload[departmentId]);
    }
    if (deptMembersInFlightPromise[departmentId]) {
      const payload = await deptMembersInFlightPromise[departmentId];
      return res.json(payload);
    }

    // Fetch agents for specific department
    deptMembersInFlightPromise[departmentId] = (async () => {
      const accessToken = await getAccessToken();
      const agents = await getAllAgentsForDepartment(departmentId, accessToken);
      const payload = { members: agents };
      deptMembersCachePayload[departmentId] = payload;
      deptMembersCacheTime[departmentId] = Date.now();
      return payload;
    })();

    const payload = await deptMembersInFlightPromise[departmentId];
    deptMembersInFlightPromise[departmentId] = null;
    res.json(payload);
  } catch (error) {
    deptMembersInFlightPromise[departmentId] = null;
    console.error("Error in /api/department-members", error.message);
    res.status(500).json({ error: "Failed to fetch department members" });
  }
});

// ===== SIMPLE TICKET METRICS API (uses cached active tickets) =====
app.get("/api/ticket-metrics-simple", async (req, res) => {
  try {
    const nowTs = Date.now();
    const tickets = cachedActiveTickets || [];

    // Return empty if no cached tickets
    if (!tickets.length) {
      return res.json({ rows: [] });
    }

    // Cache + in-flight checks
    if (metricsCachePayload && nowTs - metricsCacheTime < CACHE_TTL_MS) {
      return res.json(metricsCachePayload);
    }
    if (metricsInFlightPromise) {
      const payload = await metricsInFlightPromise;
      return res.json(payload);
    }

    metricsInFlightPromise = (async () => {
      const accessToken = await getAccessToken();
      const rows = await fetchTicketMetricsForTickets(accessToken, tickets);
      const payload = { rows };
      metricsCachePayload = payload;
      metricsCacheTime = Date.now();
      return payload;
    })();

    const payload = await metricsInFlightPromise;
    metricsInFlightPromise = null;
    res.json(payload);
  } catch (error) {
    metricsInFlightPromise = null;
    console.error("Error in /api/ticket-metrics-simple", error.message);
    res.status(500).json({ error: "Failed to fetch ticket metrics" });
  }
});

// ===== ARCHIVED + ACTIVE CLOSED TICKETS API (5-min cache) =====
app.get("/api/archived-tickets", async (req, res) => {
  try {
    const { departmentId, agentId } = req.query;
    const cacheKey = `${departmentId || "all"}_${agentId || "all"}`;
    const now = Date.now();

    // ---------- CACHE CHECK (5-minute TTL) ----------
    const cached = archivedCache[cacheKey];
    if (cached && now - cached.ts < ARCHIVED_TTL_MS) {
      return res.json({
        totalTickets: cached.rows.length,
        rows: cached.rows,
      });
    }

    // ---------- AUTH ----------
    const accessToken = await getAccessToken();

    // ---------- 1. FETCH ARCHIVED TICKETS ----------
    let archivedTickets = [];
    if (departmentId) {
      // Single department
      archivedTickets = await fetchAllArchivedTickets(accessToken, departmentId);
    } else {
      // All departments (parallel)
      const archivedBatches = await Promise.all(
        departmentList.map((dep) =>
          fetchAllArchivedTickets(accessToken, dep.id)
        )
      );
      archivedTickets = archivedBatches.flat();
    }

    // Filter by agent if specified
    if (agentId) {
      archivedTickets = archivedTickets.filter(
        (t) => String(t.assigneeId) === String(agentId)
      );
    }

    // Only include CLOSED archived tickets
    archivedTickets = archivedTickets.filter(
      (t) => (t.status || "").toLowerCase() === "closed"
    );

    // ---------- 2. FETCH ACTIVE CLOSED TICKETS ----------
    const activeTickets = await fetchAllTickets(
      accessToken,
      departmentId ? [departmentId] : [],
      agentId || null
    );

    const activeClosedTickets = activeTickets.filter(
      (t) => (t.status || "").toLowerCase() === "closed"
    );

    // ---------- 3. NORMALIZE TICKET DATA ----------
    function mapTicket(ticket, source) {
      const dept = departmentList.find(
        (d) => String(d.id) === String(ticket.departmentId)
      );

      const assigneeIdStr = ticket.assigneeId
        ? String(ticket.assigneeId)
        : "";

      // Multi-source agent name resolution
      const agentName =
        agentIdToName?.[assigneeIdStr] ||
        ticket.assignee?.displayName ||
        ticket.assignee?.fullName ||
        ticket.assignee?.name ||
        ticket.assignee?.email ||
        ticket.assigneeName ||
        "Unassigned";

      const createdTime = ticket.createdTime || null;
      const closedTime =
        ticket.closedTime || ticket.lastModifiedTime || null;

      return {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber || ticket.id,
        status: ticket.status || "closed",
        agentId: assigneeIdStr,
        agentName,
        departmentId: ticket.departmentId || "",
        departmentName: dept?.name || "",
        subject: ticket.subject || "",
        createdTime,
        closedTime,
        resolutionTimeHours:
          createdTime && closedTime
            ? diffInHours(createdTime, closedTime)
            : null,
        source, // "archived" | "activeClosed"
        // firstResponseTime added later from metrics
      };
    }

    const archivedRows = archivedTickets.map((t) =>
      mapTicket(t, "archived")
    );

    const activeClosedRows = activeClosedTickets.map((t) =>
      mapTicket(t, "activeClosed")
    );

    // ---------- 4. MERGE + DEDUPLICATE ----------
    const seen = new Set();
    let allRows = [...archivedRows, ...activeClosedRows].filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    // ---------- 4b. ENRICH WITH METRICS (First Response Time) ----------
    try {
      const metricsRows = await fetchTicketMetricsForTickets(
        accessToken,
        [...archivedTickets, ...activeClosedTickets]
      );

      // Create firstResponseTime lookup map
      const frMap = {};
      metricsRows.forEach((m) => {
        const key = String(m.ticketNumber || m.id || "");
        if (!key) return;
        frMap[key] = m.firstResponseTime || "";
      });

      // Enrich all rows with FRT
      allRows = allRows.map((row) => ({
        ...row,
        firstResponseTime: frMap[row.ticketNumber] || "",
      }));
    } catch (e) {
      console.error(
        "Error enriching archived tickets with metrics FRT:",
        e?.message
      );
      // Graceful fallback without FRT
      allRows = allRows.map((row) => ({
        ...row,
        firstResponseTime: "",
      }));
    }

    // ---------- 5. SORT (Latest closed first) ----------
    allRows.sort((a, b) => {
      const da = a.closedTime ? new Date(a.closedTime).getTime() : 0;
      const db = b.closedTime ? new Date(b.closedTime).getTime() : 0;
      return db - da;
    });

    // ---------- 6. CACHE RESULT ----------
    archivedCache[cacheKey] = {
      ts: now,
      rows: allRows,
    };

    res.json({
      totalTickets: allRows.length,
      rows: allRows,
    });
  } catch (error) {
    console.error(
      "❌ Error in /api/archived-tickets:",
      error?.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to fetch archived and closed tickets",
    });
  }
});

// ===== HEALTH CHECK =====
app.get("/", (req, res) => {
  res.send("Zoho Desk backend is running");
});

// ===== SERVER START =====
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
