import express from "express";
import { generarNumeros } from "../controllers/numerosController.js";

const router = express.Router();
router.post("/generar", generarNumeros);
export default router;
