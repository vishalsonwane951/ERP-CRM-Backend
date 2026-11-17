import { Router } from "express";
import { allow } from "../middleware/auth.js";
import * as c from "../controllers/teamController.js";

const router = Router();
router.get("/overview", allow("MANAGER", "PROJECT_MANAGER"), c.overview);
router.get("/employee/:id", allow("MANAGER", "PROJECT_MANAGER", "HR_ADMIN", "HR_MANAGER", "FINANCE", "AUDITOR"), c.employee);
export default router;
