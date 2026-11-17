import { monthEnd, shiftMonth, weekdays } from "./helpers.js";

// Pay rules shared by the payroll run (everyone) and "my salary so far" (one person).
// Example statutory rules only. Replace PF, professional tax and tax with your own.

const round1 = (n) => Math.round(n * 10) / 10;
const pad = (n) => String(n).padStart(2, "0");

/**
 * The dates a pay period covers. startDay 1 = the calendar month.
 * startDay 26 and period "2026-10" = 2026-09-26 to 2026-10-25 (a period is named after the month it ends in).
 */
export const cycleRange = (period, startDay = 1) => {
  if (startDay <= 1) return { from: `${period}-01`, to: monthEnd(period) };
  return { from: `${shiftMonth(period, -1)}-${pad(startDay)}`, to: `${period}-${pad(startDay - 1)}` };
};

/** The period that contains `today` (YYYY-MM-DD). With startDay 26, 27 Oct already belongs to the "2026-11" period. */
export const currentPeriod = (today, startDay = 1) => {
  const month = today.slice(0, 7);
  return startDay > 1 && Number(today.slice(8)) >= startDay ? shiftMonth(month, 1) : month;
};

/**
 * Works out one person's pay for a cycle, counting days up to `asOf`.
 *  attendance: that person's attendance records inside the cycle
 *  leaves:     approved leave inside the cycle as [{ from, to, paid }]. paid:false is without-pay leave (WPL)
 *  holidays:   list of YYYY-MM-DD. They are not working days, so they are never absent and never deducted.
 */
export const calculate = ({ emp, cycle, asOf, attendance, leaves, holidays = [] }) => {
  const { basic = 0, hra = 0, allowances = 0 } = emp.salary || {};
  const gross = basic + hra + allowances;

  const workingDays = weekdays(cycle.from, cycle.to, holidays);
  const last = asOf < cycle.to ? asOf : cycle.to;
  const elapsedDays = last < cycle.from ? 0 : weekdays(cycle.from, last, holidays);

  // work done on a weekend or holiday does not cancel an absence on another day
  const onWorkingDays = attendance.filter((r) => weekdays(r.date, r.date, holidays) === 1 && r.date <= last);
  const presentDays = onWorkingDays.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
  const halfDays = onWorkingDays.filter((r) => r.status === "HALF_DAY").length;

  let paidLeaveDays = 0;
  let wplDays = 0;
  for (const l of leaves) {
    const from = l.from > cycle.from ? l.from : cycle.from;
    const to = l.to < last ? l.to : last;
    if (to < from) continue;
    const days = weekdays(from, to, holidays);
    if (l.paid) paidLeaveDays += days; else wplDays += days;
  }

  // days that were neither worked nor covered by leave
  const absentDays = Math.max(0, round1(elapsedDays - presentDays - halfDays * 0.5 - paidLeaveDays - wplDays));
  const lopDays = round1(absentDays + wplDays); // every unpaid day, absence and WPL together
  const dayRate = workingDays ? gross / workingDays : 0;
  const lopAmount = Math.round(dayRate * lopDays);

  const pf = Math.round(basic * 0.12);
  const professionalTax = gross > 25000 ? 200 : 0;
  const tds = Math.round((Math.max(0, gross * 12 - 700000) * 0.1) / 12);
  const deductions = pf + professionalTax + tds;
  return {
    basic, hra, allowances, gross, workingDays, elapsedDays, presentDays, halfDays, paidLeaveDays, wplDays, absentDays, lopDays,
    dayRate: Math.round(dayRate), lopAmount, pf, professionalTax, tds, deductions, net: Math.max(0, gross - lopAmount - deductions),
  };
};

/** The same numbers as plain lines an employee can read: why is my pay what it is? */
export const explain = (c) => {
  const absentAmount = Math.round(c.dayRate * c.absentDays);
  const days = [
    { label: "Working days in the cycle", value: c.workingDays },
    { label: "Working days so far", value: c.elapsedDays },
    { label: "Present days", value: c.presentDays },
    { label: "Half days (each counts 0.5)", value: c.halfDays },
    { label: "Approved paid leave", value: c.paidLeaveDays },
    { label: "Without-pay leave (WPL)", value: c.wplDays },
    { label: "Absent days", value: c.absentDays },
  ];
  const lines = [
    { label: "Basic", amount: c.basic, kind: "earn" },
    { label: "HRA", amount: c.hra, kind: "earn" },
    { label: "Allowances", amount: c.allowances, kind: "earn" },
    { label: "Gross for the full cycle", amount: c.gross, kind: "total" },
    ...(c.absentDays ? [{ label: `Absent: ${c.absentDays} days x ${c.dayRate}`, amount: -absentAmount, kind: "deduct" }] : []),
    ...(c.wplDays ? [{ label: `Without-pay leave: ${c.wplDays} days x ${c.dayRate}`, amount: -(c.lopAmount - absentAmount), kind: "deduct" }] : []),
    { label: "Provident fund", amount: -c.pf, kind: "deduct" },
    { label: "Professional tax", amount: -c.professionalTax, kind: "deduct" },
    { label: "Income tax (estimate)", amount: -c.tds, kind: "deduct" },
    { label: "Net pay if the cycle ended today", amount: c.net, kind: "total" },
  ];
  return { days, lines };
};

