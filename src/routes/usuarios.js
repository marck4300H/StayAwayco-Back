// routes/usuariosRoutes.js
import express from "express";
import {
  registrarUsuario,
  loginUsuario,
  obtenerPerfil,
  editarPerfil,
  eliminarUsuario,
} from "../controllers/usuariosController.js";

import { verifyUsuarioToken } from "../middleware/authUsuarios.js";

const router = express.Router();

// Registrar usuario
router.post("/registrar", registrarUsuario);

// Login
router.post("/login", loginUsuario);

// Obtener perfil
router.get("/perfil", verifyUsuarioToken, obtenerPerfil);

// Editar perfil
router.put("/editar", verifyUsuarioToken, editarPerfil);

// Eliminar usuario
router.delete("/eliminar", verifyUsuarioToken, eliminarUsuario);

export default router;
