// src/components/AgentTicketAgeTable/ArchivedTable.jsx

import React from "react";
import {
  headerStyle3D,
  leftCellStyle,
  centerCellStyle,
  rowBaseStyle,
} from "./styles";
import { formatToIST } from "./utils";

// keep SLA thresholds in sync with backend
const FIRST_RESPONSE_SLA_HOURS = 4;
const RESOLUTION_SLA_HOURS = 48;

// helper to parse "20 days 04:40 hrs", "04:40 hrs", "5 hrs" → hours
function parseZohoDurationToHours(str) {
  if (!str || typeof str !== "string") return 0;
  const s = str.trim().toLowerCase();

  let m = s.match(/(\d+)\s*days?\s+(\d{1,2}):(\d{2})\s*hrs?/);
  if (m) {
    const days = +m[1] || 0;
    const hours = +m[2] || 0;
    const minutes = +m[3] || 0;
    return days * 24 + hours + minutes / 60;
  }

  m = s.match(/(\d{1,2}):(\d{2})\s*hrs?/);
  if (m) {
    return (+m[1] || 0) + (+m[2] || 0) / 60;
  }

  m = s.match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) || 0 : 0;
}

export default function ArchivedTable({
  archivedColumns,
  filteredArchivedRows,
  pagedArchivedRows,
  archivedPage,
  archivedPageSize,
  archivedTotalPages,
  setArchivedPage,
}) {
  const serialWidth = 60; // width for SI. NO.

  // extend columns config with SLA + CSAT columns for header rendering
  const extendedColumns = [
    ...archivedColumns,
    { key: "slaStatus", label: "SLA Status" },
    { key: "csat", label: "CSAT" },
  ];

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
          {extendedColumns.map((col) => (
            <th
              key={col.key}
              style={
                col.key === "siNo"
                  ? {
                      ...headerStyle3D,
                      position: "sticky",
                      left: 0,
                      zIndex: 5,
                    }
                  : col.key === "agentName"
                  ? {
                      ...headerStyle3D,
                      textAlign: "left",
                      position: "sticky",
                      left: serialWidth,
                      zIndex: 5,
                    }
                  : col.key === "subject"
                  ? { ...headerStyle3D, textAlign: "left" }
                  : headerStyle3D
              }
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {filteredArchivedRows.length === 0 ? (
          <tr>
            <td
              colSpan={extendedColumns.length}
              style={{
                textAlign: "center",
                padding: 16,
                color: "white",
                fontSize: 12,
                background: "#181b26",
              }}
            >
              No archived tickets loaded.
            </td>
          </tr>
        ) : (
          pagedArchivedRows.map((row, index) => {
            const stripeBg =
              index % 2 === 0 ? "#b4c2e3ff" : "#eef1f5ff";

            // SLA per ticket (Closed + Archived only)
            const frHrs = parseZohoDurationToHours(row.firstResponseTime);
            const resHrs = row.resolutionTimeHours ?? null; // backend already gives hours
            let slaStatus = "-";

            if (
              resHrs != null &&
              resHrs >= 0 &&
              (row.status || "").toLowerCase() === "closed"
            ) {
              const frOk =
                frHrs > 0 && frHrs <= FIRST_RESPONSE_SLA_HOURS;
              const resOk =
                resHrs > 0 && resHrs <= RESOLUTION_SLA_HOURS;

              if (frOk && resOk) slaStatus = "Met";
              else slaStatus = "Breached";
            }

            // CSAT per ticket (Closed + Archived only; needs row.csatRating)
            let csatDisplay = "-";
            if (
              (row.status || "").toLowerCase() === "closed" &&
              row.csatRating != null
            ) {
              // if rating is 1–5
              csatDisplay = Number(row.csatRating).toFixed(1);
            }

            return (
              <tr
                key={row.ticketNumber || row.siNo}
                style={rowBaseStyle(index)}
              >
                {/* SI. NO. (sticky) */}
                <td
                  style={{
                    ...centerCellStyle,
                    position: "sticky",
                    left: 0,
                    zIndex: 3,
                    background: stripeBg,
                  }}
                >
                  {(archivedPage - 1) * archivedPageSize + index + 1}
                </td>

                {/* Agent Name (sticky) */}
                <td
                  style={{
                    ...leftCellStyle,
                    position: "sticky",
                    left: serialWidth,
                    zIndex: 3,
                    background: stripeBg,
                  }}
                >
                  {row.agentName || "Unassigned"}
                </td>

                <td style={{ ...leftCellStyle, background: stripeBg }}>
                  {row.departmentName}
                </td>

                <td style={{ ...centerCellStyle, background: stripeBg }}>
                  {row.ticketNumber}
                </td>

                <td style={{ ...leftCellStyle, background: stripeBg }}>
                  {row.subject}
                </td>

                <td style={{ ...centerCellStyle, background: stripeBg }}>
                  {row.status}
                </td>

                <td style={{ ...centerCellStyle, background: stripeBg }}>
                  {formatToIST(row.createdTime)}
                </td>

                <td style={{ ...centerCellStyle, background: stripeBg }}>
                  {formatToIST(row.closedTime)}
                </td>

                <td style={{ ...centerCellStyle, background: stripeBg }}>
                  {row.resolutionTimeHours != null
                    ? row.resolutionTimeHours.toFixed(2)
                    : "-"}
                </td>

                {/* First Response Time */}
                <td style={{ ...centerCellStyle, background: stripeBg }}>
                  {row.firstResponseTime &&
                  String(row.firstResponseTime).trim() !== ""
                    ? row.firstResponseTime
                    : "-"}
                </td>

                {/* SLA Status */}
                <td style={{ ...centerCellStyle, background: stripeBg }}>
                  {slaStatus}
                </td>

                {/* CSAT Rating (only Closed/Archived tickets with rating) */}
                <td style={{ ...centerCellStyle, background: stripeBg }}>
                  {csatDisplay}
                </td>
              </tr>
            );
          })
        )}
      </tbody>

      {filteredArchivedRows.length > archivedPageSize && (
        <tfoot>
          <tr>
            <td
              colSpan={extendedColumns.length}
              style={{ padding: 12, textAlign: "center" }}
            >
              <button
                onClick={() => setArchivedPage((p) => Math.max(1, p - 1))}
                disabled={archivedPage === 1}
                style={{ marginRight: 8 }}
              >
                Prev
              </button>
              <span style={{ margin: "0 8px" }}>
                Page {archivedPage} of {archivedTotalPages}
              </span>
              <button
                onClick={() =>
                  setArchivedPage((p) =>
                    Math.min(archivedTotalPages, p + 1)
                  )
                }
                disabled={archivedPage === archivedTotalPages}
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
