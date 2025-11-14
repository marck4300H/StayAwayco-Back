import { Router } from "express";
import { comprarNumeros } from "../controllers/comprasController.js";
import { verifyUsuarioToken } from "../middleware/authUsuarios.js";

const router = Router();

router.post("/rifas/:rifaId/comprar", verifyUsuarioToken, comprarNumeros);

export default router;
