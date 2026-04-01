export interface ShopifyTotalSalesReferenceRow {
  day: string;
  orders: number;
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  shippingCharges: number;
  duties: number;
  additionalFees: number;
  taxes: number;
  totalSales: number;
}

function parseCsvLine(line: string) {
  return line
    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    .map((entry) => entry.replace(/^"|"$/g, "").trim());
}

function toNumber(value: string | undefined) {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseShopifyTotalSalesReferenceCsv(csv: string): ShopifyTotalSalesReferenceRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const [headerLine, ...rowLines] = lines;
  if (!headerLine) return [];
  const header = parseCsvLine(headerLine);
  const indexOf = (column: string) => header.indexOf(column);

  return rowLines
    .map((line) => parseCsvLine(line))
    .map((row) => ({
      day: row[indexOf("Day")] ?? "",
      orders: Number.parseInt(row[indexOf("Orders")] ?? "0", 10) || 0,
      grossSales: toNumber(row[indexOf("Gross sales")]),
      discounts: toNumber(row[indexOf("Discounts")]),
      returns: toNumber(row[indexOf("Returns")]),
      netSales: toNumber(row[indexOf("Net sales")]),
      shippingCharges: toNumber(row[indexOf("Shipping charges")]),
      duties: toNumber(row[indexOf("Duties")]),
      additionalFees: toNumber(row[indexOf("Additional fees")]),
      taxes: toNumber(row[indexOf("Taxes")]),
      totalSales: toNumber(row[indexOf("Total sales")]),
    }))
    .filter((row) => row.day);
}

export function summarizeShopifyTotalSalesReference(rows: ShopifyTotalSalesReferenceRow[]) {
  return rows.reduce(
    (summary, row) => ({
      rowCount: summary.rowCount + 1,
      orders: summary.orders + row.orders,
      totalSales: round2(summary.totalSales + row.totalSales),
    }),
    {
      rowCount: 0,
      orders: 0,
      totalSales: 0,
    }
  );
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
