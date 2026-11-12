/* ------------------------------------------------------------------
   Routes for /api/categories — thin wiring only; logic lives in the
   controller. Mounted by server/app.js (shared by local dev and Vercel).
   ------------------------------------------------------------------ */

import { Router } from "express";
import * as categoryController from "../controllers/category.controller.js";

const router = Router();

router.get("/", categoryController.listCategories);
router.post("/", categoryController.createCategory);
router.get("/:id", categoryController.getCategory);
router.put("/:id", categoryController.updateCategory);
router.delete("/:id", categoryController.deleteCategory);

const methodNotAllowed = (allow) => (_req, res) => {
  res.setHeader("Allow", allow);
  res.status(405).json({ ok: false, message: "Method not allowed" });
};
router.all("/", methodNotAllowed("GET, POST"));
router.all("/:id", methodNotAllowed("GET, PUT, DELETE"));

export default router;
