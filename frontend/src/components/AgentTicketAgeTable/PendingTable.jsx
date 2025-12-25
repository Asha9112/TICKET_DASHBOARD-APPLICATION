// src/components/AgentTicketAgeTable/PendingTable.jsx
import React from "react";
import {
  headerStyle3D,
  leftCellStyle,
  centerCellStyle,
  rowBaseStyle,
} from "./styles";
import { formatDateWithMonthName } from "./utils";

export default function PendingTable({
  pendingTableColumns,     // Dynamic column configuration
  searchedGroupedPendingRows, // Pre-grouped rows with rowSpan data
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "separate", fontSize: 12, tableLayout: "auto" }}>
      <thead>
        <tr>
          {pendingTableColumns.map((col) => (
            <th
              key={col.key}
              style={
                // Sticky Name column (left: 0)
                col.key === "name"
                  ? { ...headerStyle3D, textAlign: "left", position: "sticky", left: 0, zIndex: 4 }
                // Left-aligned department
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
        {searchedGroupedPendingRows.length === 0 ? (
          // Empty state row
          <tr>
            <td
              colSpan={pendingTableColumns.length}
              style={{ textAlign: "center", padding: 16, color: "white", fontSize: 12, background: "#181b26" }}
            >
              No pending status tickets found.
            </td>
          </tr>
        ) : (
          searchedGroupedPendingRows.map((row, idx) => {
            // Zebra striping background
            const stripeBg = idx % 2 === 0 ? "#b4c2e3ff" : "#eef1f5ff";
            
            return (
              <tr
                key={`${row.name}_${row.ticketNumber}_${idx}`}
                style={rowBaseStyle(idx)}
              >
                {/* Sticky Name column with rowSpan (first row only) */}
                {row._isFirst ? (
                  <td
                    style={{
                      ...leftCellStyle,
                      position: "sticky",
                      left: 0,
                      zIndex: 3,
                      background: stripeBg,
                    }}
                    rowSpan={row._rowSpan}
                  >
                    {row.name}
                  </td>
                ) : null}

                {/* Department name */}
                <td style={leftCellStyle}>{row.department}</td>

                {/* Total tickets with rowSpan (first row only) */}
                {row._isFirst ? (
                  <td style={centerCellStyle} rowSpan={row._rowSpan}>
                    {row.totalTickets}
                  </td>
                ) : null}

                {/* Ticket status */}
                <td style={centerCellStyle}>{row.status}</td>
                
                {/* Ticket number */}
                <td style={centerCellStyle}>{row.ticketNumber}</td>

                {/* Split date display: Day + Month */}
                <td style={centerCellStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                    <span>{formatDateWithMonthName(row.ticketCreated).split(",")[0]}</span>
                    <span>{formatDateWithMonthName(row.ticketCreated).split(",")[1]}</span>
                  </div>
                </td>

                {/* Days not responded (handle fractional values) */}
                <td style={centerCellStyle}>
                  {row.daysNotResponded !== "" && Number(row.daysNotResponded) < 1
                    ? 0
                    : row.daysNotResponded}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
