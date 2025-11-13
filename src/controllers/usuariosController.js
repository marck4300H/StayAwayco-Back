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

    // Verificar si ya existe el usuario
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
          numeros_comprados: [],
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

// 🔐 Login de usuario
export const loginUsuario = async (req, res) => {
  try {
    const { correo_electronico, password } = req.body;

    // 1️⃣ Buscar usuario por correo
    const { data: usuario, error } = await supabaseAdmin
      .from("usuarios")
      .select("*")
      .eq("correo_electronico", correo_electronico)
      .single();

    if (error || !usuario) {
      return res.status(401).json({
        success: false,
        message: "Correo electrónico o contraseña incorrectos.",
      });
    }

    // 2️⃣ Comparar contraseñas
    const passwordValida = await bcrypt.compare(password, usuario.password);
    if (!passwordValida) {
      return res.status(401).json({
        success: false,
        message: "Correo electrónico o contraseña incorrectos.",
      });
    }

    // 3️⃣ Generar token
    const token = jwt.sign(
      {
        numero_documento: usuario.numero_documento,
        correo_electronico: usuario.correo_electronico,
      },
      JWT_SECRET,
      { expiresIn: "6h" }
    );

    // 4️⃣ Enviar respuesta
    res.status(200).json({
      success: true,
      message: "Inicio de sesión exitoso.",
      token,
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
      message: "Error en el servidor.",
    });
  }
};
