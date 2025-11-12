// routes/numeros.js
import express from "express";
import {
  generarNumeros,
  obtenerNumerosPorRifa,
} from "../controllers/numerosController.js";

const router = express.Router();

router.post("/generar/:rifaId", generarNumeros); // Generar los 100,000 números
router.get("/:rifaId", obtenerNumerosPorRifa); // Ver los números de una rifa

export default router;
