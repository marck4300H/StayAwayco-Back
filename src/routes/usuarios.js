import express from "express";
import {
  registrarUsuario,
  loginUsuario,
  obtenerPerfil,
  editarPerfil,
  eliminarUsuario,
  obtenerNumerosUsuario, // ✅ NUEVA IMPORTACIÓN
} from "../controllers/usuariosController.js";

import { verifyUsuarioToken } from "../middleware/authUsuarios.js";

const router = express.Router();

console.log("✅ usuariosRoutes cargado correctamente");

// Registrar usuario
router.post("/registrar", registrarUsuario);

// Login
router.post("/login", loginUsuario);

// Obtener perfil (usuario autenticado)
router.get("/perfil", verifyUsuarioToken, obtenerPerfil);

// Obtener números del usuario (usuario autenticado) - ✅ NUEVA RUTA
router.get("/numeros", verifyUsuarioToken, obtenerNumerosUsuario);

// Editar perfil (usuario autenticado)
router.put("/editar", verifyUsuarioToken, editarPerfil);

// Eliminar usuario (usuario autenticado)
router.delete("/eliminar", verifyUsuarioToken, eliminarUsuario);

export default router;