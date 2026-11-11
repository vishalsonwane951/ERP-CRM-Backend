import { Router } from "express";
import * as c from "../controllers/attendanceController.js";

const router = Router();
router.get("/today", c.today);
router.post("/check-in", c.checkIn);
router.post("/check-out", c.checkOut);
router.get("/me", c.myMonth);
router.get("/org", c.orgDay);
router.get("/employee/:id", c.employeeMonth);
export default router;
