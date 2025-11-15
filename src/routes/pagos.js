import express from "express";
import { 
  crearPago, 
  confirmarPago, 
  verificarEstadoPago,
  debugEpayco
} from "../controllers/pagosController.js";
import { verifyUsuarioToken } from "../middleware/authUsuarios.js";

const router = express.Router();

// Crear sesión de pago Smart Checkout
router.post("/crear", verifyUsuarioToken, crearPago);

// Webhook de confirmación desde ePayco (sin autenticación)
router.post("/confirmacion", confirmarPago);

// ✅ IMPORTANTE: También aceptar GET para redirecciones
router.get("/confirmacion", confirmarPago);

// Verificar estado de pago
router.get("/estado/:referencia", verifyUsuarioToken, verificarEstadoPago);

// Diagnóstico de ePayco
router.get("/debug", debugEpayco);

export default router;