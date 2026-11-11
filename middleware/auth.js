import jwt from "jsonwebtoken";
import { HttpError } from "../services/helpers.js";

/** Reads the Bearer token and puts { empId, orgId, role, name } on req.user */
export const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const p = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = { empId: p.sub, orgId: p.orgId, role: p.role, name: p.name };
    next();
  } catch {
    next(new HttpError(401, "Sign in to continue"));
  }
};

/** allow("HR_ADMIN", "FINANCE") lets those roles through. SUPER_ADMIN is always allowed. */
export const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) || req.user.role === "SUPER_ADMIN" ? next() : next(new HttpError(403, "You do not have access to this"));
