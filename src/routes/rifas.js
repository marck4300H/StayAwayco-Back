import express from "express";
import { 
  crearRifa, 
  listarRifas, 
  editarRifa, 
  eliminarRifa, 
  getRifaById, 
  upload 
} from "../controllers/rifasController.js";

const router = express.Router();

router.post("/crear", upload.single("imagen"), crearRifa);
router.get("/", listarRifas);
router.get("/:id", getRifaById);
router.put("/editar/:id", upload.single("imagen"), editarRifa);
router.delete("/eliminar/:id", eliminarRifa);

export default router;