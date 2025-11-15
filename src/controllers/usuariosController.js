import { supabaseAdmin } from "../../supabaseAdminClient.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

// 🧾 Registrar nuevo usuario - SIMPLIFICADO
export const registrarUsuario = async (req, res) => {
  try {
    const {
      nombres,
      apellidos,
      correo_electronico,
      telefono,
      password,
    } = req.body;

    // ✅ Validación mínima para registro rápido
    if (!nombres || !apellidos || !correo_electronico || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Faltan campos obligatorios: nombres, apellidos, correo y contraseña." 
      });
    }

    // ✅ Verificar si el correo ya existe
    const { data: existingUser } = await supabaseAdmin
      .from("usuarios")
      .select("id")
      .eq("correo_electronico", correo_electronico)
      .maybeSingle();

    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        message: "El correo electrónico ya está registrado." 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Insertar solo datos esenciales
    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .insert([
        {
          nombres,
          apellidos,
          correo_electronico,
          telefono: telefono || null,
          password: hashedPassword,
          fecha_registro: new Date(),
          // numero_documento, direccion, etc. se llenarán después
        }
      ])
      .select();

    if (error) throw error;

    // ✅ Generar token con el NUEVO id
    const token = jwt.sign(
      {
        id: data[0].id, // ← NUEVO: usar id
        correo_electronico: data[0].correo_electronico,
        userType: "user"
      },
      JWT_SECRET,
      { expiresIn: "6h" }
    );

    res.status(201).json({
      success: true,
      message: "Usuario registrado exitosamente.",
      token,
      userType: "user",
      usuario: {
        id: data[0].id,
        nombres: data[0].nombres,
        apellidos: data[0].apellidos,
        correo_electronico: data[0].correo_electronico,
      },
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

    // ✅ Generar token JWT con el NUEVO id
    const token = jwt.sign(
      {
        id: usuario.id, // ← NUEVO: usar id
        numero_documento: usuario.numero_documento, // ← Mantener para compatibilidad
        correo_electronico: usuario.correo_electronico,
        userType: "user"
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
        id: usuario.id, // ← NUEVO
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

// Obtener perfil - ACTUALIZADO
// Obtener perfil - COMPATIBILIDAD COMPLETA
export const obtenerPerfil = async (req, res) => {
  console.log("🎯 EJECUTANDO obtenerPerfil - Usuario:", req.usuario);
  
  try {
    const usuarioReq = req.usuario;
    
    // ✅ COMPATIBILIDAD: Buscar por id (nuevo) O por numero_documento (antiguo)
    let usuario;
    let error;
    
    if (usuarioReq.id) {
      // Usuario nuevo (con id)
      console.log("🔍 Buscando usuario por ID:", usuarioReq.id);
      const result = await supabaseAdmin
        .from("usuarios")
        .select("*")
        .eq("id", usuarioReq.id)
        .single();
      usuario = result.data;
      error = result.error;
    } else if (usuarioReq.numero_documento) {
      // Usuario antiguo (con numero_documento)
      console.log("🔍 Buscando usuario por numero_documento:", usuarioReq.numero_documento);
      const result = await supabaseAdmin
        .from("usuarios")
        .select("*")
        .eq("numero_documento", usuarioReq.numero_documento)
        .single();
      usuario = result.data;
      error = result.error;
    } else {
      return res.status(400).json({ 
        success: false, 
        message: "Identificador de usuario no válido." 
      });
    }

    if (error || !usuario) {
      console.error("❌ Usuario no encontrado en BD:", usuarioReq);
      return res.status(404).json({ 
        success: false, 
        message: "Usuario no encontrado." 
      });
    }

    console.log("✅ Usuario encontrado:", usuario.correo_electronico);
    res.status(200).json({ success: true, usuario });
  } catch (err) {
    console.error("❌ Error al obtener perfil:", err);
    res.status(500).json({ success: false, message: "Error del servidor." });
  }
};

// Editar perfil - ACTUALIZADO PARA COMPATIBILIDAD
export const editarPerfil = async (req, res) => {
  console.log("🎯 EJECUTANDO editarPerfil - Usuario:", req.usuario);
  
  try {
    const usuarioReq = req.usuario;
    
    // ✅ COMPATIBILIDAD: Usar id (nuevo) O numero_documento (antiguo)
    let condicionBusqueda;
    
    if (usuarioReq.id) {
      // Usuario nuevo (con id)
      condicionBusqueda = { columna: "id", valor: usuarioReq.id };
      console.log("✏️ Actualizando usuario por ID:", usuarioReq.id);
    } else if (usuarioReq.numero_documento) {
      // Usuario antiguo (con numero_documento)
      condicionBusqueda = { columna: "numero_documento", valor: usuarioReq.numero_documento };
      console.log("✏️ Actualizando usuario por numero_documento:", usuarioReq.numero_documento);
    } else {
      return res.status(400).json({ 
        success: false, 
        message: "Identificador de usuario no válido." 
      });
    }

    const camposActualizables = {
      tipo_documento: req.body.tipo_documento,
      numero_documento: req.body.numero_documento,
      nombres: req.body.nombres,
      apellidos: req.body.apellidos,
      correo_electronico: req.body.correo_electronico,
      telefono: req.body.telefono,
      direccion: req.body.direccion,
      ciudad: req.body.ciudad,
      departamento: req.body.departamento,
      actualizado_en: new Date()
    };

    console.log("📝 Campos a actualizar:", camposActualizables);

    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .update(camposActualizables)
      .eq(condicionBusqueda.columna, condicionBusqueda.valor)
      .select();

    if (error) {
      console.error("❌ Error actualizando usuario:", error);
      throw error;
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Usuario no encontrado para actualizar." 
      });
    }

    console.log("✅ Perfil actualizado correctamente");
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

// Eliminar usuario - ACTUALIZADO PARA COMPATIBILIDAD
export const eliminarUsuario = async (req, res) => {
  console.log("🎯 EJECUTANDO eliminarUsuario - Usuario:", req.usuario);
  
  try {
    const usuarioReq = req.usuario;
    
    // ✅ COMPATIBILIDAD: Usar id (nuevo) O numero_documento (antiguo)
    let condicionBusqueda;
    
    if (usuarioReq.id) {
      condicionBusqueda = { columna: "id", valor: usuarioReq.id };
      console.log("🗑️ Eliminando usuario por ID:", usuarioReq.id);
    } else if (usuarioReq.numero_documento) {
      condicionBusqueda = { columna: "numero_documento", valor: usuarioReq.numero_documento };
      console.log("🗑️ Eliminando usuario por numero_documento:", usuarioReq.numero_documento);
    } else {
      return res.status(400).json({ 
        success: false, 
        message: "Identificador de usuario no válido." 
      });
    }

    const { error } = await supabaseAdmin
      .from("usuarios")
      .delete()
      .eq(condicionBusqueda.columna, condicionBusqueda.valor);

    if (error) {
      console.error("❌ Error eliminando usuario:", error);
      throw error;
    }

    console.log("✅ Usuario eliminado correctamente");
    res.status(200).json({ 
      success: true, 
      message: "Usuario eliminado correctamente." 
    });
  } catch (err) {
    console.error("❌ Error al eliminar usuario:", err);
    res.status(500).json({ success: false, message: "Error al eliminar usuario." });
  }
};