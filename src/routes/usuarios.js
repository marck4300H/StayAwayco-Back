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

console.log("✅ usuariosRoutes cargado correctamente");

// Registrar usuario
router.post("/registrar", registrarUsuario);

// Login
router.post("/login", loginUsuario);

// Obtener perfil (usuario autenticado)
router.get("/perfil", verifyUsuarioToken, (req, res, next) => {
  console.log("🎯 Llegó a la ruta /perfil");
  next();
}, obtenerPerfil);

// Editar perfil (usuario autenticado)
router.put("/editar", verifyUsuarioToken, editarPerfil);

// Eliminar usuario (usuario autenticado)
router.delete("/eliminar", verifyUsuarioToken, eliminarUsuario);

export default router;