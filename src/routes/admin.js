import express from "express";
import { loginAdmin, asignarNumerosDirecto } from "../controllers/adminController.js";
import { verificarAdmin } from "../middleware/authAdmin.js";
import { sortearRifa, obtenerGanador, notificarSorteoDesierto } from "../controllers/sorteoController.js";

const router = express.Router();

// POST /api/admin/login
router.post("/login", loginAdmin);

// POST /api/admin/asignar-numeros - Asignación directa de números (SOLO ADMIN)
router.post("/asignar-numeros", verificarAdmin, asignarNumerosDirecto);

// POST /api/admin/sortear-rifa - Sortear rifa ingresando número ganador
router.post("/sortear-rifa", verificarAdmin, sortearRifa);

// GET /api/admin/ganador/:rifaId - Obtener ganador de una rifa sorteada
router.get("/ganador/:rifaId", obtenerGanador);

// POST /api/admin/sorteo-desierto - Notificar sorteo sin ganador y programar nuevo
router.post("/sorteo-desierto", verificarAdmin, notificarSorteoDesierto);

export default router;
