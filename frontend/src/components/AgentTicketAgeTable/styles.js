// src/components/AgentTicketAgeTable/styles.js

export const baseFont = `'Montserrat', 'Poppins', sans-serif`;

// Standard data cell (center)
export const centerCellStyle = {
  padding: "8px 10px",
  fontWeight: 700,
  fontSize: 12,
  fontFamily: baseFont,
  background: "transparent",
  color: "Black",
  borderBottom: "1px solid #1E4489",
  borderRight: "1px solid #1E4489",
  textAlign: "center",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

export const leftCellStyle = {
  ...centerCellStyle,
  textAlign: "left",
};

export const centerCellStyleHovered = {
  ...centerCellStyle,
  background: "#2446a3",
  color: "Black",
};

// Header style for serial column
export const serialHeaderStyle = {
  padding: "8px 10px",
  fontWeight: 900,
  fontSize: 14,
  fontFamily: baseFont,
  background: "#1E4489",
  color: "white",
  borderBottom: "2px solid #32406b",
  textAlign: "center",
  position: "sticky",
  top: 0,
  zIndex: 3,
  width: 40,
  minWidth: 40,
  maxWidth: 50,
  whiteSpace: "nowrap",
};

// Common header style
export const headerStyle3D = {
  padding: "8px 10px",
  fontWeight: 900,
  fontSize: 14,
  fontFamily: baseFont,
  background: "#1E4489",
  color: "white",
  borderBottom: "2px solid #32406b",
  textAlign: "center",
  position: "sticky",
  top: 0,
  zIndex: 3,
  whiteSpace: "nowrap",
};

// Row base style (for stripes)
export const rowBaseStyle = (index) => ({
  backgroundColor: index % 2 === 0 ? "#b4c2e3ff" : "#eef1f5ff",
  color: "Black",
  fontSize: 12,
  fontWeight: 900,
});
