/* ------------------------------------------------------------------
   Routes for /api/budget-plans — thin wiring only; logic lives in the
   controller. GET/POST list+create; GET/PUT/DELETE /:id. Mounted by
   server/app.js, which api/index.js runs as Vercel's single function.
   ------------------------------------------------------------------ */

import { Router } from "express";
import * as budgetPlanController from "../controllers/budgetPlan.controller.js";

const router = Router();

router.get("/", budgetPlanController.listBudgetPlans);
router.post("/", budgetPlanController.createBudgetPlan);
router.get("/:id", budgetPlanController.getBudgetPlan);
router.put("/:id", budgetPlanController.updateBudgetPlan);
router.delete("/:id", budgetPlanController.deleteBudgetPlan);

/* Wrong method on an existing path -> 405 (matches savings.route.js).
   Registered after the real routes so they always win. */
const methodNotAllowed = (allow) => (_req, res) => {
  res.setHeader("Allow", allow);
  res.status(405).json({ ok: false, message: "Method not allowed" });
};
router.all("/", methodNotAllowed("GET, POST"));
router.all("/:id", methodNotAllowed("GET, PUT, DELETE"));

export default router;
