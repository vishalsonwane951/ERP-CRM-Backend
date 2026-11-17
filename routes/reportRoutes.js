import { Router } from "express";
<<<<<<< HEAD
import { allow } from "../middleware/auth.js";
=======
import { allow, requireFeature } from "../middleware/auth.js";
>>>>>>> master
import * as c from "../controllers/reportController.js";

const router = Router();
router.get("/dashboard", c.dashboard);
<<<<<<< HEAD
router.get("/attendance-trend", allow("HR_ADMIN", "HR_MANAGER", "FINANCE", "AUDITOR"), c.trend);
router.get("/audit", allow("HR_ADMIN", "AUDITOR"), c.audit);
=======
router.get("/attendance-trend", requireFeature("reports"), allow("HR_ADMIN", "HR_MANAGER", "FINANCE", "AUDITOR"), c.trend);
router.get("/audit", requireFeature("reports"), allow("HR_ADMIN", "AUDITOR"), c.audit);
>>>>>>> master
export default router;
