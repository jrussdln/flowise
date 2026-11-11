/* ------------------------------------------------------------------
   Routes for /api/users — thin wiring only; logic lives in the
   controller. Mounted by server/app.js, which api/index.js runs as
   Vercel's single Serverless Function (one for all of /api/*).
   ------------------------------------------------------------------ */

import { Router } from "express";
import * as userController from "../controllers/user.controller.js";

const router = Router();

router.get("/", userController.listUsers);
router.post("/", userController.createUser);
router.get("/:id", userController.getUser);
router.put("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);

/* Wrong method on an existing path -> 405 (matches the app.all in server/app.js).
   Registered after the real routes so they always win. */
const methodNotAllowed = (allow) => (_req, res) => {
  res.setHeader("Allow", allow);
  res.status(405).json({ ok: false, message: "Method not allowed" });
};
router.all("/", methodNotAllowed("GET, POST"));
router.all("/:id", methodNotAllowed("GET, PUT, DELETE"));

export default router;
