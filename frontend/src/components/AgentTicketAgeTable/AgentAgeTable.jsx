import React from "react";
import Tippy from "@tippyjs/react";
import "tippy.js/dist/tippy.css";

import {
  serialHeaderStyle,
  headerStyle3D,
  centerCellStyle,
  centerCellStyleHovered,
  leftCellStyle,
  rowBaseStyle,
} from "./styles";

/**
 * Maps ticket status keys to fixed UI colors for status boxes.
 */
const STATUS_COLORS = {
  open: "#bd2331",       // Red for open tickets
  hold: "#ffc107",       // Yellow for hold tickets
  inProgress: "#8fc63d", // Green for in-progress
  escalated: "#ef6724",  // Orange for escalated
};

/**
 * AgentAgeTable - Agent-wise ticket aging analysis table
 * Features: Sticky columns, hover effects, status color coding, ticket ID tooltips
 */
export default function AgentAgeTable({
  columnsToShow,           // Column definitions for header
  tableRowsForDisplay,     // Processed agent row data
  visibleAgeColumns,       // Active age buckets (0-2 days, 3-5 days, etc.)
  normalizedStatusKeys,    // Filtered status keys (e.g. ["open", "hold"])
  statusOrder,             // Default status display order
  aggregateTickets,        // Returns ticket IDs array for tooltip
  countFromArray,          // Returns ticket count for cell display
  hoveredRowIndex,         // Currently hovered row index
  setHoveredRowIndex,      // Hover state setter
  selectedDepartmentId,    // Currently selected department filter
  departmentsMap,          // Department ID to name mapping
}) {
  // Fixed width for serial column sticky positioning
  const serialWidth = 60;

  return (
    <table style={{ width: "100%", borderCollapse: "separate", borderRadius: 16, fontSize: 12, tableLayout: "auto" }}>
      <thead>
        <tr>
          {columnsToShow.map((col) => (
            <th
              key={col.key}
              style={
                // Sticky Serial column (left: 0, highest z-index)
                col.key === "serial"
                  ? { ...serialHeaderStyle, position: "sticky", left: 0, zIndex: 5 }
                // Sticky Agent Name column (left: serialWidth)
                : col.key === "name"
                ? { ...headerStyle3D, textAlign: "left", position: "sticky", left: serialWidth, zIndex: 5 }
                // Left-aligned department column
                : col.key === "department" ? { ...headerStyle3D, textAlign: "left" }
                : headerStyle3D
              }
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {tableRowsForDisplay.length === 0 ? (
          // Department-specific empty state message
          <tr>
            <td
              colSpan={columnsToShow.length}
              style={{ textAlign: "center", padding: 16, color: "black", fontSize: 12, background: "#181b26", borderRadius: 14 }}
            >
              {selectedDepartmentId && departmentsMap?.[selectedDepartmentId]?.name ? (
                <>
                  Looks like the <strong>{departmentsMap[selectedDepartmentId].name}</strong> department has no tickets right now.
                </>
              ) : (
                "No data available"
              )}
            </td>
          </tr>
        ) : (
          tableRowsForDisplay.map((row, rowIndex) => {
            // Zebra stripe background for readability
            const stripeBg = rowIndex % 2 === 0 ? "#b4c2e3ff" : "#eef1f5ff";
            
            // Hover style for serial column
            const serialBaseStyle = hoveredRowIndex === rowIndex ? centerCellStyleHovered : centerCellStyle;

            return (
              <tr key={row.name} style={rowBaseStyle(rowIndex)}>
                {/* Sticky Serial Number */}
                <td
                  style={{
                    ...serialBaseStyle,
                    position: "sticky",
                    left: 0,
                    zIndex: 3,
                    background: stripeBg,
                  }}
                >
                  {rowIndex + 1}
                </td>

                {/* Sticky Agent Name with hover handler */}
                <td
                  style={{
                    ...(hoveredRowIndex === rowIndex ? { ...leftCellStyle, background: "#2446a3" } : leftCellStyle),
                    position: "sticky",
                    left: serialWidth,
                    zIndex: 3,
                  }}
                  onMouseEnter={() => setHoveredRowIndex(rowIndex)}
                  onMouseLeave={() => setHoveredRowIndex(null)}
                >
                  {row.name}
                </td>

                {/* Department name (conditional) */}
                {selectedDepartmentId && <td style={leftCellStyle}>{row.departmentName}</td>}

                {/* Total tickets across all age buckets */}
                <td
                  style={hoveredRowIndex === rowIndex ? centerCellStyleHovered : centerCellStyle}
                >
                  {visibleAgeColumns.reduce(
                    (sum, col) =>
                      sum +
                      countFromArray(row, col.ageProp, "open") +
                      countFromArray(row, col.ageProp, "hold") +
                      countFromArray(row, col.ageProp, "inProgress") +
                      countFromArray(row, col.ageProp, "escalated"),
                    0
                  )}
                </td>

                {/* Age bucket columns with status breakdown */}
                {visibleAgeColumns.map((col) => (
                  <td
                    key={col.key}
                    style={hoveredRowIndex === rowIndex ? centerCellStyleHovered : centerCellStyle}
                  >
                    {/* SIMPLE MODE: Total count + all ticket IDs tooltip */}
                    {normalizedStatusKeys.length === 0 ? (
                      <Tippy
                        content={
                          statusOrder
                            .map((key) => aggregateTickets(row, col.ageProp, key))
                            .flat()
                            .join(", ") || "No tickets"
                        }
                      >
                        <span style={{ fontWeight: 900 }}>
                          {statusOrder.reduce(
                            (sum, key) => sum + countFromArray(row, col.ageProp, key),
                            0
                          )}
                        </span>
                      </Tippy>
                    ) : (
                      /* ADVANCED MODE: Status-specific colored boxes */
                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                        {normalizedStatusKeys.map((statusKey) => (
                          <Tippy
                            key={statusKey}
                            content={aggregateTickets(row, col.ageProp, statusKey).join(", ") || "No tickets"}
                          >
                            <span
                              style={{
                                background: STATUS_COLORS[statusKey],
                                borderRadius: "12px",
                                fontWeight: 900,
                                minWidth: "45px",
                                minHeight: "36px",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {aggregateTickets(row, col.ageProp, statusKey).length}
                            </span>
                          </Tippy>
                        ))}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
