import { formatDisplayValue } from "../data/ingestion.js";

function cellText(value) {
  if (value === null || value === undefined || value === "") return "Not supplied";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function renderTable(container, rows, caption) {
  container.replaceChildren();
  if (!rows.length) {
    container.textContent = "No rows were returned.";
    return;
  }
  const columns = Object.keys(rows[0]);
  const wrapper = document.createElement("div");
  wrapper.className = "table-wrap";
  const table = document.createElement("table");
  const tableCaption = document.createElement("caption");
  tableCaption.textContent = caption;
  table.append(tableCaption);
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((column) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = column;
    headRow.append(th);
  });
  head.append(headRow);
  table.append(head);
  const body = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((column) => {
      const td = document.createElement("td");
      td.textContent = formatDisplayValue(row[column], column) || cellText(row[column]);
      tr.append(td);
    });
    body.append(tr);
  });
  table.append(body);
  wrapper.append(table);
  container.append(wrapper);
}
