// src/components/AgentTicketAgeTable/AgentPerformanceTable.jsx
import React, { useMemo } from "react";
import {
  headerStyle3D,
  leftCellStyle,
  centerCellStyle,
  rowBaseStyle,
} from "./styles";

export default function AgentPerformanceTable({
  rows,
  page,
  pageSize,
  totalPages,
  setPage,
}) {
  const serialWidth = 60;

  // Normalize row shape so both:
  // - agent objects from /api/agent-performance
  // - agent objects inside department.agents (dept drilldown)
  // work with same table code.
  const normalizedRows = useMemo(
    () =>
      (rows || []).map((r) => {
        const resolved = Number(r.ticketsResolved || 0) || 0;
        const pending = Number(r.pendingCount || 0) || 0;

        return {
          agentName: r.agentName || r.name || "Unassigned",
          // Always: Total Created = Resolved + Pending
          ticketsCreated: resolved + pending,
          ticketsResolved: resolved,
          pendingCount: pending,
          avgResolutionText: r.avgResolutionText || "-",
          avgFirstResponseText: r.avgFirstResponseText || "-",
          avgThreads:
            typeof r.avgThreads === "number" ? r.avgThreads : r.avgThreads ?? null,
        };
      }),
    [rows]
  );

  // Sort rows to keep top tickets resolved agent first
  const sortedRows = useMemo(() => {
    return [...normalizedRows].sort((a, b) => {
      const aResolved = parseInt(a.ticketsResolved, 10) || 0;
      const bResolved = parseInt(b.ticketsResolved, 10) || 0;
      return bResolved - aResolved; // Descending order (highest first)
    });
  }, [normalizedRows]);

  const pagedRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "separate",
        fontSize: 12,
        tableLayout: "auto",
      }}
    >
      <thead>
        <tr>
          <th
            style={{
              ...headerStyle3D,
              position: "sticky",
              left: 0,
              zIndex: 5,
            }}
          >
            SI. NO.
          </th>
          <th
            style={{
              ...headerStyle3D,
              textAlign: "left",
              position: "sticky",
              left: serialWidth,
              zIndex: 5,
            }}
          >
            Agent Name
          </th>
          <th style={headerStyle3D}>Total Tickets Created</th>
          <th style={headerStyle3D}>Tickets Resolved</th>
          <th style={headerStyle3D}>Pending Tickets</th>
          <th style={headerStyle3D}>Avg Resolution Time</th>
          <th style={headerStyle3D}>Avg First Response</th>
          <th style={headerStyle3D}>Avg Threads</th>
        </tr>
      </thead>
      <tbody>
        {sortedRows.length === 0 ? (
          <tr>
            <td
              colSpan={11}
              style={{
                textAlign: "center",
                padding: 16,
                color: "white",
                fontSize: 12,
                background: "#181b26",
              }}
            >
              No agent performance data found.
            </td>
          </tr>
        ) : (
          pagedRows.map((row, index) => {
            const globalPos = (page - 1) * pageSize + index;

            const stripeBg = index % 2 === 0 ? "#b4c2e3ff" : "#eef1f5ff";

            let rowBg = stripeBg;
            if (globalPos === 0) rowBg = "#ffd700"; // gold
            else if (globalPos === 1) rowBg = "#c0c0c0"; // silver
            else if (globalPos === 2) rowBg = "#f0a254ff"; // bronze

            const medal =
              globalPos === 0
                ? "🥇"
                : globalPos === 1
                ? "🥈"
                : globalPos === 2
                ? "🥉"
                : "";

            const serialNo = globalPos + 1;

            const resolved = Number(row.ticketsResolved || 0);
            const pending = Number(row.pendingCount || 0);
            const totalCreated = resolved + pending;

            return (
              <tr key={row.agentName || serialNo} style={rowBaseStyle(index)}>
                <td
                  style={{
                    ...centerCellStyle,
                    position: "sticky",
                    left: 0,
                    zIndex: 3,
                    background: rowBg,
                  }}
                >
                  {serialNo}
                </td>
                <td
                  style={{
                    ...leftCellStyle,
                    position: "sticky",
                    left: serialWidth,
                    zIndex: 3,
                    background: rowBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingRight: 8,
                  }}
                >
                  <span>{row.agentName}</span>
                  {medal && (
                    <span style={{ fontSize: "22px", lineHeight: 1 }}>
                      {medal}
                    </span>
                  )}
                </td>
                <td style={{ ...centerCellStyle, background: rowBg }}>
                  {totalCreated}
                </td>
                <td style={{ ...centerCellStyle, background: rowBg }}>
                  {resolved}
                </td>
                <td style={{ ...centerCellStyle, background: rowBg }}>
                  {pending}
                </td>
                <td style={{ ...centerCellStyle, background: rowBg }}>
                  {row.avgResolutionText}
                </td>
                <td style={{ ...centerCellStyle, background: rowBg }}>
                  {totalCreated > 0 ? row.avgFirstResponseText : "-"}
                </td>
                <td style={{ ...centerCellStyle, background: rowBg }}>
                  {totalCreated > 0
                    ? row.avgThreads != null
                      ? row.avgThreads.toFixed(2)
                      : "0.00"
                    : "-"}
                </td>
              </tr>
            );
          })
        )}
      </tbody>

      {sortedRows.length > pageSize && (
        <tfoot>
          <tr>
            <td colSpan={11} style={{ padding: 12, textAlign: "center" }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ marginRight: 8 }}
              >
                Prev
              </button>
              <span style={{ margin: "0 8px" }}>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ marginLeft: 8 }}
              >
                Next
              </button>
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
