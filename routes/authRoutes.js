import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import * as c from "../controllers/authController.js";

const router = Router();
router.post("/login", c.login);
router.post("/refresh", c.refresh);
router.get("/me", authenticate, c.me);
router.post("/createadmin", c.createAdmin)
export default router;
