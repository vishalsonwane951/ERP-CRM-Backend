import { monthEnd, weekdays } from "./helpers.js";

// ---- How the performance score is built. HR can change the numbers in this block. ----
export const WEIGHTS = { tasks: 0.5, attendance: 0.4, leaves: 0.1 }; // should add up to 1
export const LATE_CREDIT = 0.75; // a late day counts as this much of a present day
export const HALF_DAY_CREDIT = 0.5;
export const LEAVE_DAYS_FOR_ZERO = 5; // this many leave days in a month (or more) gives 0 for the leave part
export const BANDS = [ // lowest score for each label, highest first
  { min: 85, label: "Excellent" },
  { min: 70, label: "Good" },
  { min: 50, label: "Needs attention" },
  { min: 0, label: "At risk" },
];

/**
 * Score for ONE person and ONE month, 0 to 100. A part with nothing to measure (no tasks due that month) is left out and the
 * other weights are scaled up, so having no tasks is neither rewarded nor punished.
 *   tasks:      tasks due in the month that were done on or before their due date, out of all tasks due so far
 *   attendance: present days (late and half days count part), out of the working days that were not leave days
 *   leaves:     fewer approved leave days is better
 * Inputs: tasks (all of his tasks), attendance (his records), leaves (approved, [{ from, to }]), holidays, today (YYYY-MM-DD).
 */
export const scoreMonth = ({ month, today, tasks, attendance, leaves, holidays = [] }) => {
  const from = `${month}-01`;
  const to = monthEnd(month);
  const asOf = today < to ? today : to; // a month still running is judged up to today
  if (asOf < from) return { month, score: null, label: null, components: {} };

  const due = tasks.filter((t) => t.dueDate >= from && t.dueDate <= asOf);
  const onTime = due.filter((t) => t.status === "DONE" && t.completedAt?.slice(0, 10) <= t.dueDate).length;
  const doneLate = due.filter((t) => t.status === "DONE" && t.completedAt?.slice(0, 10) > t.dueDate).length;

  let leaveDays = 0;
  for (const l of leaves) {
    const a = l.from > from ? l.from : from;
    const b = l.to < asOf ? l.to : asOf;
    if (b >= a) leaveDays += weekdays(a, b, holidays);
  }
  const workDone = attendance.filter((r) => r.date >= from && r.date <= asOf && weekdays(r.date, r.date, holidays) === 1);
  const count = (s) => workDone.filter((r) => r.status === s).length;
  const present = count("PRESENT");
  const late = count("LATE");
  const half = count("HALF_DAY");
  const expected = Math.max(0, weekdays(from, asOf, holidays) - leaveDays);
  const absent = Math.max(0, expected - present - late - half);

  const components = {
    tasks: { weight: WEIGHTS.tasks, score: due.length ? onTime / due.length : null, due: due.length, onTime, doneLate },
    attendance: { weight: WEIGHTS.attendance, score: expected ? Math.min(1, (present + late * LATE_CREDIT + half * HALF_DAY_CREDIT) / expected) : null, expectedDays: expected, present, late, halfDay: half, absent },
    leaves: { weight: WEIGHTS.leaves, score: 1 - Math.min(1, leaveDays / LEAVE_DAYS_FOR_ZERO), days: leaveDays },
  };
  const parts = Object.values(components).filter((c) => c.score !== null);
  const total = parts.reduce((s, c) => s + c.weight, 0);
  const score = total ? Math.round((100 * parts.reduce((s, c) => s + c.weight * c.score, 0)) / total) : null;
  return { month, score, label: score === null ? null : BANDS.find((b) => score >= b.min).label, components };
};
