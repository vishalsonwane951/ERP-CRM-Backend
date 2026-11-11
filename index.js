import "dotenv/config";
import express from "express";
import cors from "cors";
import { authenticate } from "./middleware/auth.js";
import authRoutes from "./routes/authRoutes.js";
import organizationRoutes from "./routes/organizationRoutes.js";
import employeeRoutes from "./routes/employeeRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import leaveRoutes from "./routes/leaveRoutes.js";
import approvalRoutes from "./routes/approvalRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import payrollRoutes from "./routes/payrollRoutes.js";
import assetRoutes from "./routes/assetRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || "*" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/v1/auth", authRoutes); // login and refresh are public

const api = express.Router();
api.use(authenticate); // everything below needs a valid token
api.use("/organizations", organizationRoutes);
api.use("/employees", employeeRoutes);
api.use("/attendance", attendanceRoutes);
api.use("/leaves", leaveRoutes);
api.use("/approvals", approvalRoutes);
api.use("/expenses", expenseRoutes);
api.use("/payroll", payrollRoutes);
api.use("/assets", assetRoutes);
api.use("/documents", documentRoutes);
api.use("/reports", reportRoutes);
api.use("/notifications", notificationRoutes);
app.use("/api/v1", api);

app.use((req, res) => res.status(404).json({ error: { code: 404, message: `${req.method} ${req.path} was not found` } }));
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: { code: status, message: status === 500 ? "Something went wrong. Try again." : err.message } });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Muster API running on http://localhost:${port}`));
