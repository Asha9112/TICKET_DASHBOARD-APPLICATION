const registerAgentPerformanceRoutes = require("./Application/agentPerformanceRoutes");


const express = require("express");
const axios = require("axios");
const cors = require("cors");
const Bottleneck = require("bottleneck");
const axiosRetry = require("axios-retry").default;

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self' http://localhost:5000 http://127.0.0.1:5000 http://192.168.3.8:5000"
  );
  next();
});

// ===== RAM store for archived tickets =====
const archivedCache = Object.create(null);



const clientId = "1000.VEPAX9T8TKDWJZZD95XT6NN52PRPQY";
const clientSecret = "acca291b89430180ced19660cd28ad8ce1e4bec6e8";
const refreshToken =
  "1000.465100d543b8d9471507bdf0b0263414.608f3f3817d11b09f142fd29810cca6f";

const limiter = new Bottleneck({
  minTime: 200,
  maxConcurrent: 3,
});

axiosRetry(axios, {
  retries: 4,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    error.response &&
    (error.response.status === 429 || error.response.status >= 500),
});

const departmentList = [
  { id: "634846000000006907", name: "IT Support" },
  { id: "634846000000334045", name: "Wescon" },
  { id: "634846000006115409", name: "ERP or SAP Support" },
  { id: "634846000009938029", name: "EDI Support" },
  { id: "634846000018669037", name: "Test Help Desk" },
  { id: "634846000054176855", name: "Digitization" },
  { id: "634846000054190373", name: "PLM or IoT & CAD Support" },
];

let cachedAccessToken = null;
let accessTokenExpiry = null;

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
  accessTokenExpiry = now + (response.data.expires_in - 60) * 1000;
  return cachedAccessToken;
}

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
    } catch (err) {}
  }
  return users;
}

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

function diffInHours(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  if (Number.isNaN(ms)) return null;
  return +(ms / (1000 * 60 * 60)).toFixed(2);
}

/**
 * NEW: add a Zoho-style "H:MM hrs" duration to a start datetime,
 * and return the resulting Date in ISO string.
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

// NEW helper: fetch all archived tickets for a department (paginated, capped by Zoho)
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

    if (batch.length < limit || from >= 4900) break;
    from += limit;
  }
  return allTickets;
}

let cachedActiveTickets = [];
let agentIdToName = {};

// cache for archived tickets per department (in RAM)
const ARCHIVED_TTL_MS = 5 * 60 * 1000; // 5 minutes
// let archivedCache = {}; // { [departmentId_agent]: { ts, rows } }
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
      "Unassigned"; // fallback so metrics views never show blank agent

    const dept = departmentList.find((d) => d.id === ticket.departmentId);
    const departmentId = ticket.departmentId || "";
    const departmentName = dept ? dept.name : "";

    // NEW: compute firstResponseDateTime from createdTime + firstResponseTime
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

      // NEW field
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

const CACHE_TTL_MS = 7 * 60 * 1000;
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

registerAgentPerformanceRoutes(app, {
  getAccessToken,
  fetchAllTickets,
  fetchAllArchivedTickets,
  fetchTicketMetricsForTickets,
  departmentList,
});


app.get("/api/zoho-assignees-with-ticket-counts", async (req, res) => {
  try {
    const nowTs = Date.now();
    if (assigneeCachePayload && nowTs - assigneeCacheTime < CACHE_TTL_MS) {
      return res.json(assigneeCachePayload);
    }
    if (assigneeInFlightPromise) {
      const payload = await assigneeInFlightPromise;
      return res.json(payload);
    }

    assigneeInFlightPromise = (async () => {
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
      let users = await fetchAllUsers(accessToken);
      const tickets = await fetchAllTickets(accessToken, departmentIds, agentId);
      const allDepartments = departmentList || [];
      const activeStatuses = ["open", "on hold", "in progress", "escalated"];

      cachedActiveTickets = tickets.filter((t) =>
        activeStatuses.includes((t.status || "").toLowerCase())
      );

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

      const allAssigneeIds = new Set(
        tickets.map((t) => t.assigneeId).filter(Boolean)
      );

      const knownUserIds = new Set(users.map((u) => u.id));
      const missingUserIds = Array.from(allAssigneeIds).filter(
        (id) => !knownUserIds.has(id)
      );

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

      // build global id -> name map used by metrics + archived endpoints
      agentIdToName = {};
      users.forEach((u) => {
        const name =
          u.displayName || u.fullName || u.name || u.email || "Unknown";
        agentIdToName[String(u.id)] = name;
      });

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

      const now = Date.now();
      const userDeptAgingCounts = {};
      const allUnassignedTicketNumbers = [];

      tickets.forEach((ticket) => {
        const assigneeRaw =
          ticket.assigneeId === undefined || ticket.assigneeId === null
            ? ""
            : ticket.assigneeId.toString().toLowerCase();
        const isUnassignedAssignee =
          assigneeRaw === "" || assigneeRaw === "none" || assigneeRaw === "null";
        const assigneeId = isUnassignedAssignee ? "unassigned" : ticket.assigneeId;

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

        if (!userDeptAgingCounts[assigneeId]) userDeptAgingCounts[assigneeId] = {};
        const deptId = ticket.departmentId || "no_department";
        if (!userDeptAgingCounts[assigneeId][deptId]) {
          userDeptAgingCounts[assigneeId][deptId] = {
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

        const rawStatus = (ticket.status || "").toLowerCase();
        const normalizedStatus = statusMap[rawStatus] || "unassigned";
        const isEscalated =
          ticket.isEscalated === true ||
          String(ticket.escalated).toLowerCase() === "true";

        const ageDays = ticket.createdTime
          ? (now - new Date(ticket.createdTime)) / (1000 * 60 * 60 * 24)
          : null;

        const agingCounts = userDeptAgingCounts[assigneeId][deptId];
        const ticketNumber = ticket.ticketNumber || ticket.id;

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

        if (isUnassignedAssignee && normalizedStatus === "closed") return;

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

      users.push({
        id: "unassigned",
        fullName: "Unassigned",
        displayName: "Unassigned",
      });

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

          const agentTickets = tickets.filter(
            (t) =>
              String(t.assigneeId) === String(user.id) &&
              t.status &&
              t.status.toLowerCase() !== "closed"
          );

          const statusKeys = ["open", "hold", "inProgress", "escalated"];
          let perStatusAge = {};

          statusKeys.forEach((status) => {
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

          const departmentTicketCounts = {};
          departmentIds2.forEach((depId) => {
            departmentTicketCounts[depId] = agentTickets.filter(
              (t) =>
                String(t.assigneeId) === String(user.id) &&
                t.departmentId === depId
            ).length;
          });

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

      agentIdToName = {};
      members.forEach((m) => {
        if (m.id && m.name) {
          agentIdToName[String(m.id)] = m.name;
        }
      });

      const departmentAgeBuckets = departmentList.map((dep) => {
        let count_1_7 = 0;
        let count_8_15 = 0;
        let count_15plus = 0;
        let total = 0;

        Object.values(userDeptAgingCounts).forEach((agentDeptCounts) => {
          const agingCounts = agentDeptCounts[dep.id];
          if (agingCounts) {
            count_1_7 +=
              (agingCounts.openBetweenOneAndSevenDaysTickets.length || 0) +
              (agingCounts.holdBetweenOneAndSevenDaysTickets.length || 0) +
              (agingCounts.inProgressBetweenOneAndSevenDaysTickets.length || 0) +
              (agingCounts.escalatedBetweenOneAndSevenDaysTickets.length || 0);

            count_8_15 +=
              (agingCounts.openBetweenEightAndFifteenDaysTickets.length || 0) +
              (agingCounts.holdBetweenEightAndFifteenDaysTickets.length || 0) +
              (agingCounts.inProgressBetweenEightAndFifteenDaysTickets.length ||
                0) +
              (agingCounts.escalatedBetweenEightAndFifteenDaysTickets.length ||
                0);

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

      const payload = {
        members,
        unassignedTicketNumbers: allUnassignedTicketNumbers,
        departments: allDepartments.map((dep) => ({
          id: dep.id,
          name: dep.name,
          description: dep.description,
          agents: deptAgentNameMap[dep.id],
        })),
        departmentAgeBuckets,
      };

      assigneeCachePayload = payload;
      assigneeCacheTime = Date.now();
      return payload;
    })();

    const payload = await assigneeInFlightPromise;
    assigneeInFlightPromise = null;
    res.json(payload);
  } catch (error) {
    assigneeInFlightPromise = null;
    console.error(
      "Error in /api/zoho-assignees-with-ticket-counts",
      error.message
    );
    res
      .status(500)
      .json({ error: "Failed to fetch assignee ticket counts" });
  }
});
app.get("/api/zoho-departments", async (req, res) => {
  try {
    const nowTs = Date.now();
    if (departmentsCachePayload && nowTs - departmentsCacheTime < CACHE_TTL_MS) {
      return res.json(departmentsCachePayload);
    }
    if (departmentsInFlightPromise) {
      const payload = await departmentsInFlightPromise;
      return res.json(payload);
    }

    departmentsInFlightPromise = (async () => {
      const accessToken = await getAccessToken();
      const allUsers = await fetchAllUsers(accessToken);
      const deptUserMap = {};
      departmentList.forEach((dep) => {
        deptUserMap[dep.id] = [];
      });

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

app.get("/api/zoho-department-ticket-counts", async (req, res) => {
  try {
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

      tickets.forEach((ticket) => {
        const deptId = ticket.departmentId;
        if (deptId && ticketStatusCountMap[deptId]) {
          const rawStatus = (ticket.status || "").toLowerCase();
          const normalizedStatus = statusMap[rawStatus] || "unassigned";
          const isEscalated =
            ticket.isEscalated === true ||
            String(ticket.escalated).toLowerCase() === "true";

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

app.get("/api/department-members/:departmentId", async (req, res) => {
  const { departmentId } = req.params;
  try {
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
app.get("/api/ticket-metrics-simple", async (req, res) => {
  try {
    const nowTs = Date.now();
    const tickets = cachedActiveTickets || [];
    if (!tickets.length) {
      return res.json({ rows: [] });
    }
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
// archived + active closed tickets endpoint
// supports optional departmentId & agentId
app.get("/api/archived-tickets", async (req, res) => {
  try {
    const { departmentId, agentId } = req.query;
    const cacheKey = `${departmentId || "all"}_${agentId || "all"}`;
    const now = Date.now();

    // ---------------- CACHE ----------------
    const cached = archivedCache[cacheKey];
    if (cached && now - cached.ts < ARCHIVED_TTL_MS) {
      return res.json({
        totalTickets: cached.rows.length,
        rows: cached.rows,
      });
    }

    // ---------------- AUTH ----------------
    const accessToken = await getAccessToken();

    // ---------------- 1. FETCH ARCHIVED ----------------
    let archivedTickets = [];

    if (departmentId) {
      archivedTickets = await fetchAllArchivedTickets(
        accessToken,
        departmentId
      );
    } else {
      // fetch all departments in parallel
      const archivedBatches = await Promise.all(
        departmentList.map((dep) =>
          fetchAllArchivedTickets(accessToken, dep.id)
        )
      );
      archivedTickets = archivedBatches.flat();
    }

    // agent filter on archived tickets
    if (agentId) {
      archivedTickets = archivedTickets.filter(
        (t) => String(t.assigneeId) === String(agentId)
      );
    }

    // only CLOSED archived tickets
    archivedTickets = archivedTickets.filter(
      (t) => (t.status || "").toLowerCase() === "closed"
    );

    // ---------------- 2. FETCH ACTIVE (CLOSED ONLY) ----------------
    const activeTickets = await fetchAllTickets(
      accessToken,
      departmentId ? [departmentId] : [],
      agentId || null
    );

    const activeClosedTickets = activeTickets.filter(
      (t) => (t.status || "").toLowerCase() === "closed"
    );

    // ---------------- 3. NORMALIZE DATA ----------------
    function mapTicket(ticket, source) {
      const dept = departmentList.find(
        (d) => String(d.id) === String(ticket.departmentId)
      );

      const assigneeIdStr = ticket.assigneeId
        ? String(ticket.assigneeId)
        : "";

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
        source, // archived | activeClosed
      };
    }

    const archivedRows = archivedTickets.map((t) =>
      mapTicket(t, "archived")
    );

    const activeClosedRows = activeClosedTickets.map((t) =>
      mapTicket(t, "activeClosed")
    );

    // ---------------- 4. MERGE + DEDUPE ----------------
     // ---------------- 4. MERGE + DEDUPE ----------------
    const seen = new Set();
    let allRows = [...archivedRows, ...activeClosedRows].filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    // 4b) ENRICH WITH METRICS FIRST RESPONSE TIME
    try {
      const metricsRows = await fetchTicketMetricsForTickets(
        accessToken,
        [...archivedTickets, ...activeClosedTickets]
      );

      const frMap = {};
      metricsRows.forEach((m) => {
        const key = String(m.ticketNumber || m.id || "");
        if (!key) return;
        frMap[key] = m.firstResponseTime || "";
      });

      allRows = allRows.map((row) => ({
        ...row,
        firstResponseTime: frMap[row.ticketNumber] || "",
      }));
    } catch (e) {
      console.error(
        "Error enriching archived tickets with metrics FRT:",
        e?.message
      );
      // continue without firstResponseTime if metrics fail
    }

    // sort by closed time (latest first)
    allRows.sort((a, b) => {
      const da = a.closedTime ? new Date(a.closedTime).getTime() : 0;
      const db = b.closedTime ? new Date(b.closedTime).getTime() : 0;
      return db - da;
    });

    // ---------------- CACHE SAVE ----------------
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


// Default health check route (optional, keep if already present or needed)
app.get("/", (req, res) => {
  res.send("Zoho Desk backend is running");
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
