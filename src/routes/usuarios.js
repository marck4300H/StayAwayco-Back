import express from "express";
import {
  registrarUsuario,
  loginUsuario,
  obtenerPerfil,
  editarPerfil,
  eliminarUsuario,
  obtenerNumerosUsuario,
  debugNumerosUsuario,
  solicitarRecuperacion,
  restablecerPassword
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

// Obtener números del usuario (para el perfil)
router.get("/numeros", verifyUsuarioToken, obtenerNumerosUsuario);

// Recuperación de contraseña
router.post("/recuperar-password", solicitarRecuperacion);
router.post("/reset-password", restablecerPassword);

// Debugging (sin autenticación para facilidad)
router.get("/debug-numeros", debugNumerosUsuario);

// Editar perfil (usuario autenticado)
router.put("/editar", verifyUsuarioToken, editarPerfil);

// Eliminar usuario (usuario autenticado)
router.delete("/eliminar", verifyUsuarioToken, eliminarUsuario);

export default router;