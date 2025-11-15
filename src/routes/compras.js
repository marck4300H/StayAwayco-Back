import { Router } from "express";
import { getComprasPorUsuario, comprarNumeros } from "../controllers/comprasController.js";
import { verifyUsuarioToken } from "../middleware/authUsuarios.js";

const router = Router();

// ✅ RUTAS ACTUALIZADAS
router.post("/crear/:rifaId", verifyUsuarioToken, comprarNumeros);
router.get("/usuario", verifyUsuarioToken, getComprasPorUsuario); // ← Cambiado: ya no necesita parámetro

export default router;