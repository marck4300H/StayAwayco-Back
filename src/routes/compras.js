import { Router } from "express";
import { getComprasPorUsuario, comprarNumeros } from "../controllers/comprasController.js";
import { verifyUsuarioToken } from "../middleware/authUsuarios.js";

const router = Router();

// ✅ RUTAS CORREGIDAS - ambas protegidas con autenticación
router.post("/crear/:rifaId", verifyUsuarioToken, comprarNumeros);
router.get("/usuario/:cedula", verifyUsuarioToken, getComprasPorUsuario);

export default router;