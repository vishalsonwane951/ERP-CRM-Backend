import { Router } from "express";
import { allow } from "../middleware/auth.js";
import * as c from "../controllers/employeeController.js";

const router = Router();
router.get("/", allow("HR_ADMIN", "HR_MANAGER", "MANAGER", "PROJECT_MANAGER", "FINANCE", "AUDITOR"), c.list);
router.get("/performance", allow("HR_ADMIN", "HR_MANAGER", "MANAGER", "PROJECT_MANAGER", "AUDITOR"), c.teamPerformance); // before /:id
router.get("/:id", c.getOne);
router.get("/:id/performance", c.performance); // the controller checks: self, HR, finance, auditor or the person's manager
router.post("/", allow("HR_ADMIN", "HR_MANAGER"), c.create);
router.patch("/:id", allow("HR_ADMIN", "HR_MANAGER"), c.update);
export default router;
