import { Router } from "express";
import * as c from "../controllers/approvalController.js";

const router = Router();
router.get("/pending", c.pending);
router.get("/", c.byStatus);
router.get("/:id", c.detail);
router.post("/:id/act", c.act);
export default router;
