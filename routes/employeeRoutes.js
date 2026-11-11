import { Router } from "express";
import { allow } from "../middleware/auth.js";
import * as c from "../controllers/employeeController.js";

const router = Router();
router.get("/", allow("HR_ADMIN", "HR_MANAGER", "MANAGER", "FINANCE", "AUDITOR"), c.list);
router.get("/:id", c.getOne);
router.post("/", allow("HR_ADMIN", "HR_MANAGER"), c.create);
router.patch("/:id", allow("HR_ADMIN", "HR_MANAGER"), c.update);
export default router;
