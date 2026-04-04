import { supabaseAdmin } from "../../supabaseAdminClient.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { enviarCorreoRecuperacion } from '../services/emailService.js';

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
        }
      ])
      .select();

    if (error) throw error;

    // ✅ Generar token con el NUEVO id
    const token = jwt.sign(
      {
        id: data[0].id,
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
        id: usuario.id,
        numero_documento: usuario.numero_documento,
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
        id: usuario.id,
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

// 🎯 FUNCIÓN CORREGIDA: Obtener números comprados por el usuario - SIN DUPLICACIÓN
export const obtenerNumerosUsuario = async (req, res) => {
  try {
    const usuario = req.usuario;

    if (!usuario || (!usuario.id && !usuario.numero_documento)) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado.",
      });
    }

    console.log(`📋 Buscando números para usuario:`, usuario);

    let allNumerosUsuario = [];

    // ── Buscar por usuario_id (prioritario — usuarios nuevos) ──
    if (usuario.id) {
      const { data: byUserId, error: error1 } = await supabaseAdmin
        .from("numeros")
        .select("numero, rifa_id")
        .eq("usuario_id", usuario.id)
        .order("numero", { ascending: true });

      if (!error1 && byUserId?.length > 0) {
        allNumerosUsuario = byUserId;
        console.log(`📊 Encontrados ${allNumerosUsuario.length} números por usuario_id`);
      }
    }

    // ── Fallback: buscar por numero_documento (compatibilidad usuarios antiguos) ──
    if (allNumerosUsuario.length === 0 && usuario.numero_documento) {
      const { data: byDoc, error: error2 } = await supabaseAdmin
        .from("numeros")
        .select("numero, rifa_id")
        .eq("comprado_por", usuario.numero_documento)
        .order("numero", { ascending: true });

      if (!error2 && byDoc?.length > 0) {
        allNumerosUsuario = byDoc;
        console.log(`📊 Encontrados ${allNumerosUsuario.length} números por numero_documento`);
      }
    }

    if (allNumerosUsuario.length === 0) {
      return res.json({ success: true, numeros: [], rifas: [] });
    }

    // ── Obtener datos completos de las rifas involucradas ──
    const rifaIds = [...new Set(allNumerosUsuario.map((n) => n.rifa_id))];

    const { data: rifas, error: rifasError } = await supabaseAdmin
      .from("rifas")
      .select(`
        id,
        titulo,
        descripcion,
        cantidad_numeros,
        precio_unitario,
        fecha_sorteo,
        estado,
        imagen_url,
        imagen_boleta_url,
        loteria_referencia,
        numero_resolucion,
        fecha_autorizacion,
        termino_caducidad,
        responsable_nombre,
        responsable_domicilio,
        responsable_id,
        descripcion_premios,
        valor_premios,
        es_pagadero_portador
      `)
      .in("id", rifaIds);

    if (rifasError) {
      console.error("❌ Error obteniendo rifas:", rifasError);
      throw rifasError;
    }

    // ── Calcular dígitos de formato por rifa ──
    const calcularDigitos = (cantidadNumeros) =>
      (cantidadNumeros - 1).toString().length;

    // ── Mapa rifa_id → datos de rifa ──
    const rifaMap = {};
    rifas.forEach((rifa) => {
      rifaMap[rifa.id] = {
        ...rifa,
        digitos_formato: calcularDigitos(rifa.cantidad_numeros),
      };
    });

    // ── Agrupar números por rifa ──
    const numerosAgrupados = {};
    allNumerosUsuario.forEach((item) => {
      if (!numerosAgrupados[item.rifa_id]) {
        numerosAgrupados[item.rifa_id] = [];
      }
      numerosAgrupados[item.rifa_id].push(
        String(item.numero).padStart(
          rifaMap[item.rifa_id]?.digitos_formato ?? 5,
          "0"
        )
      );
    });

    // ── Obtener datos del usuario autenticado para el PDF ──
    const { data: datosUsuario } = await supabaseAdmin
      .from("usuarios")
      .select("nombres, apellidos, numero_documento, tipo_documento, correo_electronico, telefono, ciudad")
      .eq("id", usuario.id)
      .single();

    // ── Construir respuesta agrupada por rifa ──
    const rifasConNumeros = rifaIds.map((rifaId) => {
      const rifa    = rifaMap[rifaId];
      const numeros = numerosAgrupados[rifaId] ?? [];

      return {
        rifa_id:   rifaId,
        numeros,
        cantidad:  numeros.length,
        // ── Datos básicos ──
        titulo:              rifa.titulo,
        descripcion:         rifa.descripcion,
        estado:              rifa.estado,
        imagen_url:          rifa.imagen_url,
        imagen_boleta_url:   rifa.imagen_boleta_url,
        cantidad_numeros:    rifa.cantidad_numeros,
        precio_unitario:     rifa.precio_unitario,
        digitos_formato:     rifa.digitos_formato,
        fecha_sorteo:        rifa.fecha_sorteo    ?? null,
        loteria_referencia:  rifa.loteria_referencia ?? null,
        // ── Datos legales para pie de boleto ──
        numero_resolucion:     rifa.numero_resolucion     ?? null,
        fecha_autorizacion:    rifa.fecha_autorizacion    ?? null,
        termino_caducidad:     rifa.termino_caducidad     ?? null,
        responsable_nombre:    rifa.responsable_nombre    ?? null,
        responsable_domicilio: rifa.responsable_domicilio ?? null,
        responsable_id:        rifa.responsable_id        ?? null,
        descripcion_premios:   rifa.descripcion_premios   ?? null,
        valor_premios:         rifa.valor_premios         ?? null,
        es_pagadero_portador:  rifa.es_pagadero_portador  ?? false,
      };
    });

    // ── Lista plana (compatibilidad con respuesta anterior) ──
    const numerosPlanos = allNumerosUsuario.map((item) => {
      const rifa = rifaMap[item.rifa_id];
      return {
        numero:             String(item.numero).padStart(rifa?.digitos_formato ?? 5, "0"),
        rifa_id:            item.rifa_id,
        titulo_rifa:        rifa?.titulo            ?? "Rifa no encontrada",
        total_numeros_rifa: rifa?.cantidad_numeros  ?? 0,
      };
    });

    console.log("✅ Números entregados:", {
      total: allNumerosUsuario.length,
      rifas_unicas: rifaIds.length,
    });

    return res.json({
      success: true,
      // ── Lista plana (retrocompatibilidad) ──
      numeros: numerosPlanos,
      // ── Agrupado por rifa con datos completos para PDF ──
      rifas: rifasConNumeros,
      // ── Datos del usuario para encabezado del PDF ──
      usuario: datosUsuario ?? null,
    });

  } catch (err) {
    console.error("❌ Error obteniendo números del usuario:", err);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor al obtener números.",
    });
  }
};

// Editar perfil - ACTUALIZADO PARA COMPATIBILIDAD
export const editarPerfil = async (req, res) => {
  console.log("🎯 EJECUTANDO editarPerfil - Usuario:", req.usuario);
  
  try {
    const usuarioReq = req.usuario;
    
    // ✅ COMPATIBILIDAD: Usar id (nuevo) O por numero_documento (antiguo)
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
    
    // ✅ COMPATIBILIDAD: Usar id (nuevo) O por numero_documento (antiguo)
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

// 🔐 SISTEMA DE RECUPERACIÓN DE CONTRASEÑA CON RESEND
export const solicitarRecuperacion = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "El correo electrónico es requerido"
      });
    }

    console.log("🔐 Solicitud de recuperación para:", email);

    // Buscar usuario
    const { data: usuario, error } = await supabaseAdmin
      .from("usuarios")
      .select("id, nombres, correo_electronico")
      .eq("correo_electronico", email)
      .single();

    if (error || !usuario) {
      // Por seguridad, no revelar si el email existe o no
      console.log("📧 Email no encontrado (por seguridad no se revela)");
      return res.json({
        success: true,
        message: "Si el email existe, recibirás instrucciones para restablecer tu contraseña"
      });
    }

    // Generar token de recuperación (expira en 1 hora)
    const tokenRecuperacion = jwt.sign(
      { 
        userId: usuario.id, 
        tipo: 'password_reset',
        timestamp: Date.now()
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log("✅ Token de recuperación generado para usuario:", usuario.id);

    // ✅ ENVIAR CORREO DE RECUPERACIÓN CON RESEND
    const emailResult = await enviarCorreoRecuperacion(usuario, tokenRecuperacion);

    if (!emailResult.success) {
      console.error("❌ Error enviando correo de recuperación:", emailResult.error);
      // No revelar el error al usuario por seguridad
    }

    res.json({
      success: true,
      message: "Si el email existe, recibirás instrucciones para restablecer tu contraseña"
    });

  } catch (error) {
    console.error("❌ Error en recuperación:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

export const restablecerPassword = async (req, res) => {
  try {
    const { token, nuevaPassword } = req.body;

    if (!token || !nuevaPassword) {
      return res.status(400).json({
        success: false,
        message: "Token y nueva contraseña son requeridos"
      });
    }

    console.log("🔐 Intentando restablecer contraseña con token");

    // Verificar token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.tipo !== 'password_reset') {
      console.error("❌ Token inválido - tipo incorrecto");
      return res.status(400).json({
        success: false,
        message: "Token inválido o expirado"
      });
    }

    // Validar que la contraseña tenga al menos 6 caracteres
    if (nuevaPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "La contraseña debe tener al menos 6 caracteres"
      });
    }

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(nuevaPassword, 10);

    // Actualizar contraseña
    const { error } = await supabaseAdmin
      .from("usuarios")
      .update({ 
        password: hashedPassword,
        actualizado_en: new Date()
      })
      .eq("id", decoded.userId);

    if (error) {
      console.error("❌ Error actualizando contraseña:", error);
      throw error;
    }

    console.log("✅ Contraseña actualizada exitosamente para usuario:", decoded.userId);

    res.json({
      success: true,
      message: "Contraseña actualizada exitosamente"
    });

  } catch (error) {
    console.error("❌ Error restableciendo password:", error);
    
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(400).json({
        success: false,
        message: "Token inválido o expirado"
      });
    }

    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

// 🎯 ENDPOINT ESPECIAL PARA DEBUGGING - Verificar números de usuario
export const debugNumerosUsuario = async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el parámetro 'email'"
      });
    }

    console.log(`🔍 Debugging números para usuario: ${email}`);

    // 1. Buscar usuario por email
    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .select("id, nombres, apellidos, correo_electronico, numero_documento")
      .eq("correo_electronico", email)
      .single();

    if (usuarioError || !usuario) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado"
      });
    }

    console.log("✅ Usuario encontrado:", usuario);

    // 2. Contar números en tabla 'numeros'
    const { count: countNumeros, error: errorNumeros } = await supabaseAdmin
      .from("numeros")
      .select("*", { count: 'exact', head: true })
      .or(`usuario_id.eq.${usuario.id},comprado_por.eq.${usuario.numero_documento}`);

    if (errorNumeros) {
      console.error("❌ Error contando en tabla numeros:", errorNumeros);
    }

    // 3. Contar números en tabla 'numeros_usuario'
    const { count: countNumerosUsuario, error: errorNumerosUsuario } = await supabaseAdmin
      .from("numeros_usuario")
      .select("*", { count: 'exact', head: true })
      .or(`usuario_id.eq.${usuario.id},numero_documento.eq.${usuario.numero_documento}`);

    if (errorNumerosUsuario) {
      console.error("❌ Error contando en tabla numeros_usuario:", errorNumerosUsuario);
    }

    // 4. Obtener detalles de los números
    const { data: detallesNumeros, error: errorDetallesNumeros } = await supabaseAdmin
      .from("numeros")
      .select("id, numero, rifa_id, comprado_por, usuario_id")
      .or(`usuario_id.eq.${usuario.id},comprado_por.eq.${usuario.numero_documento}`)
      .order("numero", { ascending: true });

    const { data: detallesNumerosUsuario, error: errorDetallesNumerosUsuario } = await supabaseAdmin
      .from("numeros_usuario")
      .select("id, numero, rifa_id, numero_documento, usuario_id")
      .or(`usuario_id.eq.${usuario.id},numero_documento.eq.${usuario.numero_documento}`)
      .order("numero", { ascending: true });

    // 5. Respuesta detallada
    const respuesta = {
      success: true,
      usuario: {
        id: usuario.id,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        email: usuario.correo_electronico,
        numero_documento: usuario.numero_documento
      },
      conteo: {
        en_tabla_numeros: countNumeros || 0,
        en_tabla_numeros_usuario: countNumerosUsuario || 0,
        total_general: (countNumeros || 0) + (countNumerosUsuario || 0)
      },
      detalles: {
        tabla_numeros: detallesNumeros || [],
        tabla_numeros_usuario: detallesNumerosUsuario || []
      },
      analisis: {
        tiene_duplicados: (countNumeros || 0) > 0 && (countNumerosUsuario || 0) > 0,
        diferencia: Math.abs((countNumeros || 0) - (countNumerosUsuario || 0))
      }
    };

    console.log("📊 Resultado del debugging:", respuesta.conteo);

    res.json(respuesta);

  } catch (error) {
    console.error("❌ Error en debugNumerosUsuario:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor en debugging"
    });
  }
};