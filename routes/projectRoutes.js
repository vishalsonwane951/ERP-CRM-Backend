import { Router } from "express";
import { allow } from "../middleware/auth.js";
import * as c from "../controllers/projectController.js";

// The whole router sits behind requireFeature("projects") (see index.js).
// Roles are checked here; "is it MY project" is checked in the controller.
const router = Router();
router.get("/tasks/mine", c.myTasks); // before /:projectId
router.patch("/tasks/:projectId/:taskId/status", c.setTaskStatus);

router.get("/", c.list);
router.post("/", allow("MANAGER", "HR_ADMIN"), c.create);
router.get("/:projectId", c.getOne);
router.patch("/:projectId", allow("MANAGER", "HR_ADMIN"), c.update);
router.put("/:projectId/pm", allow("MANAGER", "HR_ADMIN"), c.setPm);
router.post("/:projectId/members", allow("MANAGER", "HR_ADMIN"), c.addMember);
router.delete("/:projectId/members/:empId", allow("MANAGER", "HR_ADMIN"), c.removeMember);
router.post("/:projectId/tasks", allow("MANAGER", "PROJECT_MANAGER"), c.addTask);
router.patch("/:projectId/tasks/:taskId", allow("MANAGER", "PROJECT_MANAGER"), c.editTask);
router.delete("/:projectId/tasks/:taskId", allow("MANAGER", "PROJECT_MANAGER"), c.deleteTask);
export default router;
