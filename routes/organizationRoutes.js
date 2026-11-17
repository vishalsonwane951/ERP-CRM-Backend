import { Router } from "express";
import { allow } from "../middleware/auth.js";
import * as c from "../controllers/organizationController.js";

const router = Router();
router.get("/me", c.getMine);
router.put("/policy", allow("HR_ADMIN"), c.updateSettings);
router.get("/departments", c.listDepartments);
router.post("/departments", allow("HR_ADMIN", "HR_MANAGER"), c.addDepartment);
router.get("/leave-types", c.listLeaveTypes);
router.post("/leave-types", allow("HR_ADMIN"), c.addLeaveType);
export default router;
