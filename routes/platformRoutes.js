import { Router } from "express";
import { allowPlatform } from "../middleware/auth.js";
import * as c from "../controllers/platformController.js";

// Every route here is for people whose orgId is "platform". SUPER_ADMIN can do everything; SALES manages plans and features; FINANCE reads money.
const router = Router();
router.get("/dashboard", allowPlatform("SUPER_ADMIN"), c.dashboard);
router.get("/reports", allowPlatform("SUPER_ADMIN", "FINANCE"), c.reports);
router.get("/audit", allowPlatform("SUPER_ADMIN"), c.auditLogs);

router.get("/organizations", allowPlatform("SUPER_ADMIN", "SALES"), c.listOrganizations);
router.post("/organizations", allowPlatform("SUPER_ADMIN"), c.createOrganization);
router.patch("/organizations/:orgId", allowPlatform("SUPER_ADMIN"), c.updateOrganization);
router.post("/organizations/:orgId/suspend", allowPlatform("SUPER_ADMIN"), c.suspend);
router.post("/organizations/:orgId/reactivate", allowPlatform("SUPER_ADMIN"), c.reactivate);
router.put("/organizations/:orgId/features", allowPlatform("SUPER_ADMIN", "SALES"), c.setFeatures);
router.put("/organizations/:orgId/plan", allowPlatform("SUPER_ADMIN", "SALES"), c.setOrganizationPlan);

router.get("/plans", allowPlatform("SUPER_ADMIN", "SALES", "FINANCE"), c.listPlans);
router.post("/plans", allowPlatform("SUPER_ADMIN", "SALES"), c.createPlan);
router.patch("/plans/:planId", allowPlatform("SUPER_ADMIN", "SALES"), c.updatePlan);

router.get("/staff", allowPlatform("SUPER_ADMIN"), c.listStaff);
router.post("/staff", allowPlatform("SUPER_ADMIN"), c.createStaff);
export default router;
