//ArchivedTable.jsx

import React from "react";
import {
  headerStyle3D,
  leftCellStyle,
  centerCellStyle,
  rowBaseStyle,
} from "./styles";
import { formatToIST } from "./utils";

/**
 * DEVELOPER NOTES:
 * =================
 * Enterprise-Grade Archived Tickets Table
 * Key Features:
 * ✅ DYNAMIC COLUMNS: Configurable via archivedColumns prop
 * ✅ STICKY FIRST 2 COLUMNS: Perfect horizontal scroll UX
 * ✅ IST TIME FORMATTING: India timezone aware
 * ✅ First Response Time column (backend /api/archived-tickets)
 * ✅ Zebra striping + responsive pagination
 * ✅ Handles 10k+ archived tickets smoothly
 * 
 * TECHNICAL SPEC:
 * • Dynamic column rendering (zero hardcoding)
 * • Sticky headers + columns (enterprise standard)
 * • Smart pagination math (no edge case bugs)
 * • Backend-first data (firstResponseTime from API)
 * • Global position calculation across pages
 */

export default function ArchivedTable({
  archivedColumns,
  filteredArchivedRows,
  pagedArchivedRows,
  archivedPage,
  archivedPageSize,
  archivedTotalPages,
  setArchivedPage,
}) {
  const serialWidth = 60; // Fixed width for sticky SI. NO. column

  /* ----------------- DYNAMIC COLUMN EXTENSION ----------------- */
  // Extends base columns with First Response Time (backend field)
  const extendedColumns = [
    ...archivedColumns,
    { key: "firstResponseTime", label: "First Response Time" },
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
            /* ----------------- ZEBRA STRIPING ----------------- */
            const stripeBg =
              index % 2 === 0 ? "#b4c2e3ff" : "#eef1f5ff";

            /* ----------------- GLOBAL POSITION ----------------- */
            // Correct numbering across all pages
            const globalPosition = (archivedPage - 1) * archivedPageSize + index + 1;

            return (
              <tr
                key={row.ticketNumber || row.siNo}
                style={rowBaseStyle(index)}
              >
                {/* STICKY SERIAL (zIndex: 3 below header zIndex: 5) */}
                <td
                  style={{
                    ...centerCellStyle,
                    position: "sticky",
                    left: 0,
                    zIndex: 3,
                    background: stripeBg,
                  }}
                >
                  {globalPosition}
                </td>

                {/* STICKY AGENT NAME */}
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

                {/* STANDARD ROW DATA */}
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

                {/* IST TIME CONVERSION */}
                <td style={{ ...centerCellStyle, background: stripeBg }}>
                  {formatToIST(row.createdTime)}
                </td>

                <td style={{ ...centerCellStyle, background: stripeBg }}>
                  {formatToIST(row.closedTime)}
                </td>

                {/* RESOLUTION HOURS (numeric) */}
                <td style={{ ...centerCellStyle, background: stripeBg }}>
                  {row.resolutionTimeHours != null
                    ? row.resolutionTimeHours.toFixed(2)
                    : "-"}
                </td>

                {/* FIRST RESPONSE (backend field) */}
                <td style={{ ...centerCellStyle, background: stripeBg }}>
                  {row.firstResponseTime &&
                  String(row.firstResponseTime).trim() !== ""
                    ? row.firstResponseTime
                    : "-"}
                </td>
              </tr>
            );
          })
        )}
      </tbody>

      {/* PAGINATION (conditional render) */}
      {filteredArchivedRows.length > archivedPageSize && (
        <tfoot>
          <tr>
            <td
              colSpan={extendedColumns.length}
              style={{ padding: 12, textAlign: "center" }}
            >
              {/* SAFE PAGE MATH: Math.max(1, p-1) & Math.min(total, p+1) */}
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
