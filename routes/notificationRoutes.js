import { Router } from "express";
import * as c from "../controllers/notificationController.js";

const router = Router();
router.get("/", c.list);
router.post("/read-all", c.readAll);
export default router;
