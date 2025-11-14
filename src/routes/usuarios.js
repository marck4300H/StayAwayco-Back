import express from "express";
import {
  registrarUsuario,
  loginUsuario,
  obtenerPerfil,
  editarPerfil,
  eliminarUsuario,
} from "../controllers/usuariosController.js";
import { verifyUsuarioToken } from "../middlewares/verifyUsuarioToken.js";

const router = express.Router();

// Registrar
router.post("/registrar", registrarUsuario);

// Login
router.post("/login", loginUsuario);

// Obtener perfil del usuario autenticado
router.get("/perfil", verifyUsuarioToken, obtenerPerfil);

// Editar datos del usuario autenticado
router.put("/editar", verifyUsuarioToken, editarPerfil);

// Eliminar usuario autenticado
router.delete("/eliminar", verifyUsuarioToken, eliminarUsuario);

export default router;
