import { supabaseAdmin } from "../../supabaseAdminClient.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

// 🧾 Registrar nuevo usuario
export const registrarUsuario = async (req, res) => {
  try {
    const {
      numero_documento,
      tipo_documento,
      nombres,
      apellidos,
      correo_electronico,
      telefono,
      direccion,
      ciudad,
      departamento,
      password,
    } = req.body;

    if (
      !numero_documento ||
      !tipo_documento ||
      !nombres ||
      !apellidos ||
      !correo_electronico ||
      !password
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Faltan campos obligatorios." });
    }

    const { data: existingUser } = await supabaseAdmin
      .from("usuarios")
      .select("*")
      .eq("numero_documento", numero_documento)
      .maybeSingle();

    if (existingUser) {
      return res
        .status(409)
        .json({ success: false, message: "El usuario ya está registrado." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .insert([
        {
          numero_documento,
          tipo_documento,
          nombres,
          apellidos,
          correo_electronico,
          telefono,
          direccion,
          ciudad,
          departamento,
          password: hashedPassword,
        },
      ])
      .select();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: "Usuario registrado exitosamente.",
      usuario: data[0],
    });
  } catch (err) {
    console.error("❌ Error al registrar usuario:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 🔐 Login de usuario - ACTUALIZADO
export const loginUsuario = async (req, res) => {
  try {
    const { correo_electronico, password } = req.body;

    console.log("🔐 Intentando login de usuario:", { correo_electronico });

    const { data: usuario, error } = await supabaseAdmin
      .from("usuarios")
      .select("*")
      .eq("correo_electronico", correo_electronico)
      .single();

    if (error || !usuario) {
      console.log("❌ Usuario no encontrado");
      return res.status(401).json({
        success: false,
        message: "Correo electrónico o contraseña incorrectos.",
      });
    }

    const passwordValida = await bcrypt.compare(password, usuario.password);
    if (!passwordValida) {
      console.log("❌ Contraseña incorrecta para usuario");
      return res.status(401).json({
        success: false,
        message: "Correo electrónico o contraseña incorrectos.",
      });
    }

    // ✅ Generar token JWT para usuario normal
    const token = jwt.sign(
      {
        numero_documento: usuario.numero_documento,
        correo_electronico: usuario.correo_electronico,
        userType: "user" // ✅ Identificar como usuario normal
      },
      JWT_SECRET,
      { expiresIn: "6h" }
    );

    console.log("✅ Login de usuario exitoso:", usuario.correo_electronico);

    res.status(200).json({
      success: true,
      message: "Inicio de sesión exitoso.",
      token,
      userType: "user",
      usuario: {
        numero_documento: usuario.numero_documento,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        correo_electronico: usuario.correo_electronico,
      },
    });
  } catch (err) {
    console.error("❌ Error al iniciar sesión:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error en el servidor." 
    });
  }
};

// ... el resto de las funciones permanecen igual

// Obtener perfil
export const obtenerPerfil = async (req, res) => {
  try {
    const numero_documento = req.usuario.numero_documento;

    const { data: usuario, error } = await supabaseAdmin
      .from("usuarios")
      .select("*")
      .eq("numero_documento", numero_documento)
      .single();

    if (error || !usuario) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado." });
    }

    res.status(200).json({ success: true, usuario });
  } catch (err) {
    console.error("❌ Error al obtener perfil:", err);
    res.status(500).json({ success: false, message: "Error del servidor." });
  }
};

// Editar perfil
export const editarPerfil = async (req, res) => {
  try {
    const numero_documento = req.usuario.numero_documento;

    const camposActualizables = {
      tipo_documento: req.body.tipo_documento,
      nombres: req.body.nombres,
      apellidos: req.body.apellidos,
      correo_electronico: req.body.correo_electronico,
      telefono: req.body.telefono,
      direccion: req.body.direccion,
      ciudad: req.body.ciudad,
      departamento: req.body.departamento,
    };

    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .update(camposActualizables)
      .eq("numero_documento", numero_documento)
      .select();

    if (error) throw error;

    res.status(200).json({
      success: true,
      message: "Perfil actualizado correctamente.",
      usuario: data[0],
    });
  } catch (err) {
    console.error("❌ Error al editar perfil:", err);
    res.status(500).json({ success: false, message: "Error al actualizar perfil." });
  }
};

// Eliminar usuario
export const eliminarUsuario = async (req, res) => {
  try {
    const numero_documento = req.usuario.numero_documento;

    const { error } = await supabaseAdmin
      .from("usuarios")
      .delete()
      .eq("numero_documento", numero_documento);

    if (error) throw error;

    res.status(200).json({ success: true, message: "Usuario eliminado correctamente." });
  } catch (err) {
    console.error("❌ Error al eliminar usuario:", err);
    res.status(500).json({ success: false, message: "Error al eliminar usuario." });
  }
};
