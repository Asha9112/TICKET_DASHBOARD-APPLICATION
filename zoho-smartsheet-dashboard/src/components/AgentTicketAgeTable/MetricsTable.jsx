// src/components/AgentTicketAgeTable/MetricsTable.jsx

import React from "react";
import {
  headerStyle3D,
  leftCellStyle,
  centerCellStyle,
  rowBaseStyle,
} from "./styles";
import {
  formatToIST,
  fromZohoHrsToHM,
  zohoHrsToMinutes,
  minutesToDaysLabel,
  getFirstResponseDateTime,
} from "./utils";

export default function MetricsTable({
  metricsColumns,
  sortedMetricsRows,
  agentAverageMap,
}) {
  // extend columns with Serial No
  const extendedColumns = [
    { key: "serial", label: "Sl. No." },
    // { key: "totalTickets", label: "Total Tickets" },
    ...metricsColumns,
  ];

  // precompute total tickets per agent
  const agentTicketCount = {};
  sortedMetricsRows.forEach((row) => {
    const name = row.agentName || "";
    if (!agentTicketCount[name]) agentTicketCount[name] = 0;
    agentTicketCount[name] += 1;
  });

  return (
    <div
      style={{
        maxHeight: "150vh",
        overflowY: "auto",
        overflowX: "auto",
      }}
    >
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
                  col.key === "serial"
                    ? {
                        ...headerStyle3D,
                        textAlign: "center",
                        position: "sticky",
                        left: 0,
                        zIndex: 5,
                        width: 70,
                        minWidth: 70,
                      }
                    : col.key === "agentName"
                    ? {
                        ...headerStyle3D,
                        textAlign: "left",
                        position: "sticky",
                        left: 70, // right after Sl. No.
                        zIndex: 4,
                      }
                    : col.key === "departmentName"
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
          {sortedMetricsRows.length === 0 ? (
            <tr>
              <td
                colSpan={extendedColumns.length}
                style={{
                  textAlign: "center",
                  padding: 16,
                  color: "black",
                  fontSize: 12,
                  background: "#181b26",
                }}
              >
                No metrics data available.
              </td>
            </tr>
          ) : (
            sortedMetricsRows.map((row, idx) => {
              const agentName = row.agentName || "";
              const avg = agentAverageMap[agentName];
              const totalTicketsForAgent = agentTicketCount[agentName] || 0;

              return (
                <tr
                  key={row.ticketNumber || `${agentName}_${idx}`}
                  style={rowBaseStyle(idx)}
                >
                  {extendedColumns.map((col) => {
                    // Serial number column (sticky)
                    if (col.key === "serial") {
                      const bg =
                        idx % 2 === 0 ? "#b4c2e3ff" : "#eef1f5ff";
                      return (
                        <td
                          key={col.key}
                          style={{
                            ...centerCellStyle,
                            position: "sticky",
                            left: 0,
                            zIndex: 3,
                            background: bg,
                            width: 70,
                            minWidth: 70,
                          }}
                        >
                          {idx + 1}
                        </td>
                      );
                    }

                    // Total tickets per agent
                    if (col.key === "totalTickets") {
                      return (
                        <td key={col.key} style={centerCellStyle}>
                          {totalTicketsForAgent}
                        </td>
                      );
                    }

                    // Agent name: show on every row, sticky just after Sl. No.
                    if (col.key === "agentName") {
                      const bg =
                        idx % 2 === 0 ? "#b4c2e3ff" : "#eef1f5ff";
                      return (
                        <td
                          key={col.key}
                          style={{
                            ...leftCellStyle,
                            position: "sticky",
                            left: 70, // same as header
                            zIndex: 3,
                            background: bg,
                          }}
                        >
                          {agentName}
                        </td>
                      );
                    }

                    if (col.key === "stagingData") {
                      return (
                        <td key={col.key} style={centerCellStyle}>
                          {Array.isArray(row.stagingData) &&
                          row.stagingData.length > 0 ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                              }}
                            >
                              {row.stagingData.map((s, i2) => (
                                <div key={i2}>
                                  {s.status}: {s.handledTime}
                                </div>
                              ))}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      );
                    }

                    if (col.key === "agentsHandled") {
                      return (
                        <td key={col.key} style={centerCellStyle}>
                          {Array.isArray(row.agentsHandled) &&
                          row.agentsHandled.length > 0 ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                              }}
                            >
                              {row.agentsHandled.map((a, i2) => (
                                <div key={i2}>
                                  {a.agentName}: {a.handlingTime}
                                </div>
                              ))}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      );
                    }

                    if (col.key === "createdTime") {
                      return (
                        <td key={col.key} style={centerCellStyle}>
                          {formatToIST(row.createdTime)}
                        </td>
                      );
                    }

                    if (col.key === "firstResponseTime") {
                      const minutes = zohoHrsToMinutes(
                        row.firstResponseTime
                      );
                      const metricHM = fromZohoHrsToHM(
                        row.firstResponseTime
                      );
                      const firstRespDateTime = getFirstResponseDateTime(
                        row.createdTime,
                        row.firstResponseTime
                      );

                      if (minutes == null || minutes < 1) {
                        return (
                          <td key={col.key} style={centerCellStyle}>
                            <span>-</span>
                          </td>
                        );
                      }

                      return (
                        <td key={col.key} style={centerCellStyle}>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              lineHeight: 1.2,
                            }}
                          >
                            <span>{metricHM}</span>
                            {firstRespDateTime && (
                              <span style={{ fontSize: 11 }}>
                                {firstRespDateTime}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    }

                    if (col.key === "resolutionTime") {
                      const metricHM = fromZohoHrsToHM(
                        row.resolutionTime
                      );
                      const minutes = zohoHrsToMinutes(
                        row.resolutionTime
                      );
                      const daysLabel =
                        minutes != null
                          ? minutesToDaysLabel(minutes)
                          : "";

                      if (!metricHM && !daysLabel) {
                        return (
                          <td key={col.key} style={centerCellStyle}>
                            <span>-</span>
                          </td>
                        );
                      }

                      return (
                        <td key={col.key} style={centerCellStyle}>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              lineHeight: 1.2,
                            }}
                          >
                            <span>{metricHM || "-"}</span>
                            {daysLabel && (
                              <span style={{ fontSize: 11 }}>
                                {daysLabel}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    }

                    if (col.key === "avgFirstResponse") {
                      const hm = avg?.avgFirstResponseHM || "-";
                      const minutes = avg?.avgFirstResponseMin;
                      const daysLabel =
                        minutes != null
                          ? minutesToDaysLabel(minutes)
                          : "";

                      return (
                        <td key={col.key} style={centerCellStyle}>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              lineHeight: 1.2,
                            }}
                          >
                            <span>{hm}</span>
                            {daysLabel && (
                              <span style={{ fontSize: 11 }}>
                                {daysLabel}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    }

                    const value = row[col.key];
                    const isLeft =
                      col.key === "departmentName" ||
                      col.key === "status" ||
                      col.key === "ticketNumber";

                    return (
                      <td
                        key={col.key}
                        style={isLeft ? leftCellStyle : centerCellStyle}
                      >
                        {value ?? ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
