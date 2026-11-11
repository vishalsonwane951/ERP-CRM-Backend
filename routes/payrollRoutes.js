import { Router } from "express";
import { allow } from "../middleware/auth.js";
import * as c from "../controllers/payrollController.js";

const router = Router();
router.get("/payslips/me", c.myPayslips);
router.get("/runs", allow("HR_ADMIN", "HR_MANAGER", "FINANCE", "AUDITOR"), c.runs);
router.post("/runs", allow("HR_ADMIN", "FINANCE"), c.create);
router.post("/runs/:period/process", allow("HR_ADMIN", "FINANCE"), c.calculateRun);
router.post("/runs/:period/finalize", allow("FINANCE"), c.finalize);
router.get("/runs/:period/lines", allow("HR_ADMIN", "HR_MANAGER", "FINANCE", "AUDITOR"), c.lines);
export default router;
