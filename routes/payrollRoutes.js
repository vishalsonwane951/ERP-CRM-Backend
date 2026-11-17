import { Router } from "express";
import { allow } from "../middleware/auth.js";
import * as c from "../controllers/payrollController.js";

// HR (HR_ADMIN) prepares and sends; FINANCE approves and pays. HR_MANAGER and AUDITOR can read.
const router = Router();
router.get("/payslips/me", c.myPayslips);
router.get("/payslips/employee/:id", c.employeePayslips); // the controller checks: HR, finance, or the person himself
router.get("/my-estimate", c.myEstimate); // any employee: only ever his own

router.get("/runs", allow("HR_ADMIN", "HR_MANAGER", "FINANCE", "AUDITOR"), c.runs);
router.get("/runs/:period/lines", allow("HR_ADMIN", "HR_MANAGER", "FINANCE", "AUDITOR"), c.lines);
router.post("/runs", allow("HR_ADMIN"), c.create);
router.post("/runs/:period/calculate", allow("HR_ADMIN"), c.calculateRun);
router.post("/runs/:period/submit", allow("HR_ADMIN"), c.submit);
router.post("/runs/:period/approve", allow("FINANCE"), c.approve);
router.post("/runs/:period/return", allow("FINANCE"), c.returnRun);
router.post("/runs/:period/payments", allow("FINANCE"), c.recordPayments);
router.post("/runs/:period/payslips", allow("HR_ADMIN"), c.sendPayslips);
export default router;
