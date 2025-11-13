import express from "express";
import {
  registrarUsuario,
  loginUsuario,
} from "../controllers/usuariosController.js";

const router = express.Router();

// 📌 POST /api/usuarios/registrar
router.post("/registrar", registrarUsuario);

// 📌 POST /api/usuarios/login
router.post("/login", loginUsuario);

export default router;
