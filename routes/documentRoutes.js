import { Router } from "express";
import * as c from "../controllers/documentController.js";

const router = Router();
router.get("/categories", c.categories);
router.post("/upload-url", c.uploadUrl);
router.post("/confirm", c.confirm);
router.get("/", c.list);
router.get("/:id/download-url", c.downloadUrl);
export default router;
