import express from "express";
import { loginAdmin, asignarNumerosDirecto } from "../controllers/adminController.js";
import { verificarAdmin } from "../middleware/authAdmin.js";

const router = express.Router();

// POST /api/admin/login
router.post("/login", loginAdmin);
// POST Asignación directa de números (SOLO ADMIN)
router.post("/asignar-numeros", verificarAdmin, asignarNumerosDirecto);

export default router;
