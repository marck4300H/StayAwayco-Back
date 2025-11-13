import express from "express";
import { crearRifa, listarRifas, editarRifa, eliminarRifa, upload } from "../controllers/rifasController.js";
import { verificarAdmin } from "../middleware/authAdmin.js";

const router = express.Router();

// Crear
router.post("/crear", verificarAdmin, upload.single("imagen"), crearRifa);

// Listar
router.get("/listar", listarRifas);

// Editar
router.put("/editar/:id", verificarAdmin, upload.single("imagen"), editarRifa);

// Eliminar
router.delete("/eliminar/:id", verificarAdmin, eliminarRifa);

export default router;
