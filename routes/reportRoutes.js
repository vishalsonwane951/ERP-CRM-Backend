import { Router } from "express";
import { allow } from "../middleware/auth.js";
import * as c from "../controllers/reportController.js";

const router = Router();
router.get("/dashboard", c.dashboard);
router.get("/attendance-trend", allow("HR_ADMIN", "HR_MANAGER", "FINANCE", "AUDITOR"), c.trend);
router.get("/audit", allow("HR_ADMIN", "AUDITOR"), c.audit);
export default router;
