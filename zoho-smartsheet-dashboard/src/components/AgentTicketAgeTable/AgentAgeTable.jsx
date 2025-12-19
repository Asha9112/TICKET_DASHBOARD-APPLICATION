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

/* ================= STATUS COLOR MAP ================= */
const STATUS_COLORS = {
  open: "#bd2331",         // red for open tickets
  hold: "#ffc107",         // yellow for hold tickets
  inProgress: "#8fc63d",   // green for tickets in progress
  escalated: "#ef6724",    // orange for escalated tickets
};
/* =================================================== */

export default function AgentAgeTable({
  columnsToShow,
  tableRowsForDisplay,
  visibleAgeColumns,
  normalizedStatusKeys,
  statusOrder,
  aggregateTickets,
  countFromArray,
  hoveredRowIndex,
  setHoveredRowIndex,
  selectedDepartmentId,
  departmentsMap,
}) {
  const serialWidth = 60;

  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "separate",
        borderRadius: 16,
        fontSize: 12,
        tableLayout: "auto",
      }}
    >
      <thead>
        <tr>
          {columnsToShow.map((col) => (
            <th
              key={col.key}
              style={
                col.key === "serial"
                  ? {
                      ...serialHeaderStyle,
                      position: "sticky",
                      left: 0,
                      zIndex: 5,
                    }
                  : col.key === "name"
                  ? {
                      ...headerStyle3D,
                      textAlign: "left",
                      position: "sticky",
                      left: serialWidth,
                      zIndex: 5,
                    }
                  : col.key === "department"
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
        {tableRowsForDisplay.length === 0 ? (
          <tr>
            <td
              colSpan={columnsToShow.length}
              style={{
                textAlign: "center",
                padding: 16,
                color: "black",
                fontSize: 12,
                background: "#181b26",
                borderRadius: 14,
              }}
            >
              {selectedDepartmentId &&
              departmentsMap?.[selectedDepartmentId]?.name ? (
                <>
                  Looks like the{" "}
                  <span style={{ fontWeight: 900 }}>
                    {departmentsMap[selectedDepartmentId].name}
                  </span>{" "}
                  department has no tickets right now.
                </>
              ) : (
                "No data available"
              )}
            </td>
          </tr>
        ) : (
          tableRowsForDisplay.map((row, rowIndex) => {
            const stripeBg =
              rowIndex % 2 === 0 ? "#b4c2e3ff" : "#eef1f5ff";

            const serialBaseStyle =
              hoveredRowIndex === rowIndex
                ? centerCellStyleHovered
                : centerCellStyle;

            return (
              <tr key={row.name} style={rowBaseStyle(rowIndex)}>
                {/* Serial */}
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

                {/* Agent Name */}
                <td
                  style={{
                    ...(hoveredRowIndex === rowIndex
                      ? { ...leftCellStyle, background: "#2446a3" }
                      : leftCellStyle),
                    position: "sticky",
                    left: serialWidth,
                    zIndex: 3,
                  }}
                  onMouseEnter={() => setHoveredRowIndex(rowIndex)}
                  onMouseLeave={() => setHoveredRowIndex(null)}
                >
                  {row.name}
                </td>

                {/* Department */}
                {selectedDepartmentId && (
                  <td style={leftCellStyle}>{row.departmentName}</td>
                )}

                {/* Total */}
                <td
                  style={
                    hoveredRowIndex === rowIndex
                      ? centerCellStyleHovered
                      : centerCellStyle
                  }
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

                {/* Age Buckets */}
                {visibleAgeColumns.map((col) => (
                  <td
                    key={col.key}
                    style={
                      hoveredRowIndex === rowIndex
                        ? centerCellStyleHovered
                        : centerCellStyle
                    }
                  >
                    {normalizedStatusKeys.length === 0 ? (
                      <Tippy
                        content={
                          statusOrder
                            .map((key) =>
                              aggregateTickets(row, col.ageProp, key)
                            )
                            .flat()
                            .join(", ") || "No tickets"
                        }
                      >
                        <span
                          style={{
                            fontWeight: 900,
                            fontSize: "12px",
                            color: "black",
                          }}
                        >
                          {statusOrder.reduce(
                            (sum, key) =>
                              sum +
                              countFromArray(row, col.ageProp, key),
                            0
                          )}
                        </span>
                      </Tippy>
                    ) : (
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
                              aggregateTickets(
                                row,
                                col.ageProp,
                                statusKey
                              ).length > 0
                                ? aggregateTickets(
                                    row,
                                    col.ageProp,
                                    statusKey
                                  ).join(", ")
                                : "No tickets"
                            }
                          >
                            <span
                              style={{
                                background:
                                  STATUS_COLORS[statusKey],
                                color: "black",
                                borderRadius: "12px",
                                fontWeight: 900,
                                fontSize: "12px",
                                minWidth: "45px",
                                minHeight: "36px",
                                margin: "2px 6px",
                                textAlign: "center",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {
                                aggregateTickets(
                                  row,
                                  col.ageProp,
                                  statusKey
                                ).length
                              }
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
