import { Router } from "express";
import * as c from "../controllers/expenseController.js";

const router = Router();
router.get("/", c.list);
router.post("/", c.submit);
export default router;
