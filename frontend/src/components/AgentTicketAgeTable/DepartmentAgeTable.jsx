// src/components/AgentTicketAgeTable/DepartmentAgeTable.jsx
import React from "react";
import Tippy from "@tippyjs/react";
import "tippy.js/dist/tippy.css";
import {
  serialHeaderStyle,
  headerStyle3D,
  centerCellStyle,
  leftCellStyle,
  rowBaseStyle,
} from "./styles";

/**
 * Department Ticket Age Analysis Table
 * Displays ticket aging buckets (1-7, 8-15, 15+ days) with status breakdown
 * 
 * @param {Array} departmentRowsForDisplay - Array of department objects:
 *   - { si: number, departmentName: string, total: number,
 *     tickets_1_7_open: number, tickets_1_7_open_numbers: string[],
 *     tickets_8_15_hold: number, tickets_8_15_hold_numbers: string[], ... }
 * @param {string[]} normalizedStatusKeys - Available status keys: ["open", "hold", "inProgress"]
 * @param {string[]} statusOrder - Display order for tooltips/sums: ["open", "hold", "inProgress"]
 * @param {Object} statusColors - Status color mapping: { open: "#ff0000", hold: "#ffff00" }
 * 
 * FEATURES:
 * - Dual display modes: Simple total vs status breakdown
 * - Tippy.js tooltips showing individual ticket numbers
 * - Status-colored boxes with top border stripe
 * - Responsive zebra striping via rowBaseStyle
 * - Zero re-renders (pure functional component)
 */
export default function DepartmentAgeTable({
  departmentRowsForDisplay,
  normalizedStatusKeys,
  statusOrder,
  statusColors,
}) {
  /**
   * DATA STRUCTURE EXPECTED:
   * {
   *   si: 1,
   *   departmentName: "Technical Support",
   *   total: 45,
   *   tickets_1_7_open: 5,
   *   tickets_1_7_open_numbers: ["123", "456"],
   *   tickets_1_7_hold: 2,
   *   tickets_1_7_hold_numbers: ["789"],
   *   // ... 8_15, 15plus buckets
   * }
   */

  /**
   * RENDER LOGIC:
   * 1. Simple mode (normalizedStatusKeys.length === 0):
   *    - Single bold number = sum across all statuses
   *    - Tooltip shows ALL ticket numbers concatenated
   * 2. Advanced mode (status breakdown available):
   *    - Multiple colored status boxes per bucket
   *    - Each box tooltip shows status-specific ticket numbers
   */

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
          <th style={serialHeaderStyle}>SI. No.</th>
          <th style={{ ...headerStyle3D, textAlign: "left" }}>
            Department Name
          </th>
          <th style={headerStyle3D}>Total Ticket Count</th>
          <th style={headerStyle3D}>1 - 7 Days Tickets</th>
          <th style={headerStyle3D}>8 - 15 Days Tickets</th>
          <th style={headerStyle3D}>15+ Days Tickets</th>
        </tr>
      </thead>

      <tbody>
        {/* EMPTY STATE */}
        {!departmentRowsForDisplay || departmentRowsForDisplay.length === 0 ? (
          <tr>
            <td
              colSpan={6}
              style={{
                textAlign: "center",
                padding: 16,
                color: "Black",
                fontSize: 12,
                background: "#181b26",
              }}
            >
              No department ticket data available
            </td>
          </tr>
        ) : (
          /* AGE BUCKET COLUMNS: 1-7, 8-15, 15+ */
          departmentRowsForDisplay.map((row, idx) => (
            <tr key={row.departmentName} style={rowBaseStyle(idx)}>
              {/* SERIAL NUMBER */}
              <td style={centerCellStyle}>{row.si}</td>
              
              {/* DEPARTMENT NAME */}
              <td style={leftCellStyle}>{row.departmentName}</td>
              
              {/* TOTAL TICKETS */}
              <td style={centerCellStyle}>{row.total}</td>

              {/* DYNAMIC AGE BUCKETS */}
              {["1_7", "8_15", "15plus"].map((bucket) => (
                <td key={bucket} style={centerCellStyle}>
                  {/* SIMPLE MODE: No status data available */}
                  {normalizedStatusKeys.length === 0 ? (
                    <Tippy
                      content={
                        /* CONCATENATE all ticket numbers across all statuses */
                        statusOrder
                          .map(
                            (statusKey) =>
                              row[`tickets_${bucket}_${statusKey}_numbers`] || []
                          )
                          .reduce((a, b) => a.concat(b), [])
                          .join(", ") || "No tickets"
                      }
                    >
                      <span
                        style={{
                          fontWeight: 900,
                          fontSize: "12px",
                          color: "Black",
                          background: "none",
                          padding: "2px 0",
                          minWidth: "40px",
                          minHeight: "10px",
                          textAlign: "center",
                          display: "inline-block",
                        }}
                      >
                        {/* SUM across all statuses in this bucket */}
                        {statusOrder.reduce(
                          (sum, key) => sum + (row[`tickets_${bucket}_${key}`] ?? 0),
                          0
                        )}
                      </span>
                    </Tippy>
                  ) : (
                    /* ADVANCED MODE: Status breakdown with color coding */
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      {normalizedStatusKeys.map((statusKey) => (
                        <Tippy
                          key={statusKey}
                          content={
                            /* Status-specific ticket numbers */
                            (row[`tickets_${bucket}_${statusKey}_numbers`] || []).length > 0
                              ? row[`tickets_${bucket}_${statusKey}_numbers`].join(", ")
                              : "No tickets"
                          }
                        >
                          <span
                            className={`agent-status-box ${statusKey}`}
                            style={{
                              background: "#15171a",
                              color: "White",
                              fontWeight: 900,
                              fontSize: "12px",
                              minWidth: "40px",
                              minHeight: "36px",
                              margin: "2px 6px",
                              textAlign: "center",
                              boxShadow: "0 2px 8px #0a0a0a",
                              border: "none",
                              /* STATUS IDENTIFICATION: Top color stripe */
                              borderTop: `6px solid ${statusColors[statusKey] || "#fff"}`,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            title={
                              /* FALLBACK: Native browser tooltip */
                              `${statusKey.charAt(0).toUpperCase() + statusKey.slice(1)} tickets`
                            }
                          >
                            {row[`tickets_${bucket}_${statusKey}`] ?? 0}
                          </span>
                        </Tippy>
                      ))}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
