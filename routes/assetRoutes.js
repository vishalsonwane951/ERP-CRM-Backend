import { Router } from "express";
import { allow } from "../middleware/auth.js";
import * as c from "../controllers/assetController.js";

const router = Router();
router.get("/", c.list);
router.get("/mine", c.mine);
router.post("/", allow("HR_ADMIN", "HR_MANAGER"), c.create);
router.post("/:id/assign", allow("HR_ADMIN", "HR_MANAGER"), c.assign);
router.post("/:id/return", allow("HR_ADMIN", "HR_MANAGER"), c.giveBack);
router.get("/:id/history", allow("HR_ADMIN", "HR_MANAGER", "AUDITOR"), c.history);
export default router;
