/* ------------------------------------------------------------------
   Routes for /api/auth — thin wiring only; logic lives in the
   controller. Mounted by server/app.js, which api/index.js runs as
   Vercel's single Serverless Function (one for all of /api/*).
   ------------------------------------------------------------------ */

import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";

const router = Router();

router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.get("/me", authController.me);

/* Wrong method on an existing path -> 405 (matches users.route.js).
   Registered after the real routes so they always win. */
const methodNotAllowed = (allow) => (_req, res) => {
  res.setHeader("Allow", allow);
  res.status(405).json({ ok: false, message: "Method not allowed" });
};
router.all("/login", methodNotAllowed("POST"));
router.all("/logout", methodNotAllowed("POST"));
router.all("/me", methodNotAllowed("GET"));

export default router;
