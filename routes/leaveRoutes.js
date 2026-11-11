import { Router } from "express";
import * as c from "../controllers/leaveController.js";

const router = Router();
router.get("/me", c.overview);
router.post("/requests", c.apply);
router.post("/requests/:id/cancel", c.cancel);
export default router;
