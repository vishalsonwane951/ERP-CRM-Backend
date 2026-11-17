import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as c from "../controllers/onboardingController.js";

// No sign-in here: the long random token in the link is the key. Rate limited per IP so it cannot be guessed or flooded.
const limit = (max) => rateLimit({ windowMs: 15 * 60 * 1000, limit: max, standardHeaders: true, legacyHeaders: false, message: { error: { message: "Too many requests. Try again in a few minutes." } } });

const router = Router();
router.use(limit(120));
router.get("/onboarding/:token", c.publicShow);
router.post("/onboarding/:token/upload-url", limit(30), c.publicUploadUrl);
router.post("/onboarding/:token/confirm", limit(30), c.publicConfirm);
router.post("/onboarding/:token/submit", limit(10), c.publicSubmit);
export default router;
