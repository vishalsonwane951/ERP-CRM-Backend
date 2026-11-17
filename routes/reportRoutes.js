import { Router } from "express";
import { allow, requireFeature } from "../middleware/auth.js";
import * as c from "../controllers/reportController.js";

const router = Router();
router.get("/dashboard", c.dashboard);
router.get("/attendance-trend", requireFeature("reports"), allow("HR_ADMIN", "HR_MANAGER", "FINANCE", "AUDITOR"), c.trend);
router.get("/audit", requireFeature("reports"), allow("HR_ADMIN", "AUDITOR"), c.audit);
export default router;
