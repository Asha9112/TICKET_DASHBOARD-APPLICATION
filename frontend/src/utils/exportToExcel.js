import * as XLSX from "xlsx";

export const exportToExcel = (rows, fileName = "tickets.xlsx", sheetName = "Data") => {
  if (!rows || rows.length === 0) {
    alert("No data to export");
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
};
