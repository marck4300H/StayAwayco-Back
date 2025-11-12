import express from "express";
import { crearRifa, listarRifas, upload } from "../controllers/rifasController.js";
import { verificarAdmin } from "../middleware/authAdmin.js";

const router = express.Router();

// POST /api/rifas/crear
router.post("/crear", verificarAdmin, upload.single("imagen"), crearRifa);
router.get("/listar", listarRifas);


export default router;
