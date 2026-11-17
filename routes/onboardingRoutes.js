import { Router } from "express";
import { allow } from "../middleware/auth.js";
import * as c from "../controllers/onboardingController.js";

// HR only. The whole router sits behind requireFeature("onboarding") (see index.js)
const router = Router();
router.use(allow("HR_ADMIN", "HR_MANAGER"));
router.get("/invites", c.listInvites);
router.post("/invites", c.createInvite);
router.get("/invites/:token", c.getInvite);
router.get("/invites/:token/documents/:documentId/url", c.documentUrl);
router.post("/invites/:token/resend", c.resend);
router.post("/invites/:token/convert", allow("HR_ADMIN"), c.convert);
export default router;
