import { Router } from "express";
import {
  crearOrdenPago,
  webhookHandler,
  getEstadoTransaccion,
  getPublicKey
} from "../controllers/pagosController.js";

const router = Router();

// ✅ Crear orden de pago
router.post("/crear-orden", crearOrdenPago);

// ✅ Webhook de Mercado Pago
router.post("/webhook", webhookHandler);

// ✅ Obtener estado de transacción
router.get("/estado/:referencia", getEstadoTransaccion);

// ✅ Obtener public key
router.get("/public-key", getPublicKey);

export default router;