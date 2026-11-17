import PDFDocument from "pdfkit";

// Builds one payslip as a PDF and returns it as a Buffer. The built-in font has no rupee sign, so amounts read "Rs. 12,345".
const rs = (n) => `Rs. ${Math.round(n || 0).toLocaleString("en-IN")}`;
const monthName = (period) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

export const buildPayslipPdf = ({ orgName, line, run }) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = 48;
    const right = 547;
    const mid = 297;

    doc.font("Helvetica-Bold").fontSize(20).text(orgName, left, 48);
    doc.font("Helvetica").fontSize(11).fillColor("#555").text(`Payslip for ${monthName(line.period)}`, left, 74);
    if (run.cycleFrom) doc.text(`Pay cycle ${run.cycleFrom} to ${run.cycleTo}`, left, 89);

    doc.fillColor("#000").font("Helvetica-Bold").fontSize(12).text(line.name, mid, 48, { width: right - mid, align: "right" });
    doc.font("Helvetica").fontSize(10).fillColor("#555")
      .text(`${line.designation || ""}`, mid, 66, { width: right - mid, align: "right" })
      .text(`Employee code ${line.empCode}`, mid, 80, { width: right - mid, align: "right" });
    doc.moveTo(left, 112).lineTo(right, 112).strokeColor("#ccc").stroke();

    // a row with a label on the left and an amount on the right, inside the column that starts at x
    const row = (x, y, label, amount, bold) => {
      doc.fillColor("#000").font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10.5);
      doc.text(label, x, y, { width: 150 });
      doc.text(amount, x + 150, y, { width: 90, align: "right" });
      return y + 20;
    };

    let y = 128;
    doc.font("Helvetica-Bold").fontSize(12).text("Earnings", left, y);
    doc.text("Deductions", mid + 12, y);
    let ly = y + 24;
    ly = row(left, ly, "Basic", rs(line.basic));
    ly = row(left, ly, "HRA", rs(line.hra));
    ly = row(left, ly, "Allowances", rs(line.allowances));
    if (line.lopAmount > 0) ly = row(left, ly, `Loss of pay (${line.lopDays} days)`, `- ${rs(line.lopAmount)}`);
    let ry = y + 24;
    ry = row(mid + 12, ry, "Provident fund", rs(line.pf));
    ry = row(mid + 12, ry, "Professional tax", rs(line.professionalTax));
    ry = row(mid + 12, ry, "Income tax (estimate)", rs(line.tds));
    ry = row(mid + 12, ry, "Total deductions", rs(line.deductions), true);

    y = Math.max(ly, ry) + 20;
    doc.rect(left, y, right - left, 46).fillColor("#EAF4F4").fill();
    doc.fillColor("#0B5C62").font("Helvetica-Bold").fontSize(14).text("Net pay", left + 14, y + 15);
    doc.fontSize(18).text(rs(line.net), mid, y + 12, { width: right - mid - 14, align: "right" });

    y += 70;
    doc.fillColor("#333").font("Helvetica").fontSize(10);
    if (line.paidOn) doc.text(`Paid on ${line.paidOn}${line.transactionRef ? `, payment reference ${line.transactionRef}` : ""}`, left, y);
    doc.fillColor("#888").fontSize(9).text("This is a computer-generated payslip and needs no signature.", left, 770, { width: right - left, align: "center" });
    doc.end();
  });
