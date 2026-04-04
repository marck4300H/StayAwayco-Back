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

router.post(
  "/crear",
  upload.fields([
    { name: "imagen_url",        maxCount: 1 },
    { name: "imagen_boleta_url", maxCount: 1 }
  ]),
  crearRifa
);

router.get("/", listarRifas);
router.get("/:id", getRifaById);

router.put(
  "/editar/:id",
  upload.fields([
    { name: "imagen_url",        maxCount: 1 },
    { name: "imagen_boleta_url", maxCount: 1 }
  ]),
  editarRifa
);

router.delete("/eliminar/:id", eliminarRifa);

export default router;