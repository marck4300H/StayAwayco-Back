import { supabaseAdmin } from "../../supabaseAdminClient.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/**
 * ✅ Formatear número con ceros a la izquierda
 * Ejemplo: 4813 → "04813", 95629 → "95629"
 */
const formatearNumero = (numero, digitos = 5) => {
  return numero.toString().padStart(digitos, '0');
};

// Iniciar sesión de administrador
export const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  console.log("🔐 Intentando login de administrador:", { email });

  if (!email || !password) {
    return res.status(400).json({ 
      success: false, 
      message: "Email y contraseña son requeridos" 
    });
  }

  try {
    // Forzar email en minúsculas
    const emailLower = email.toLowerCase();
    
    const { data: admin, error } = await supabaseAdmin
      .from("admins")
      .select("*")
      .eq("email", emailLower)
      .single();

    console.log("📊 Admin encontrado en BD:", admin ? "Sí" : "No");

    if (error || !admin) {
      console.log("❌ Admin no encontrado o error:", error);
      return res.status(401).json({ 
        success: false, 
        message: "Credenciales inválidas" 
      });
    }

    // Comparar password con bcrypt
    const validPassword = await bcrypt.compare(password, admin.password);
    console.log("🔑 Comparación de contraseña:", validPassword);

    if (!validPassword) {
      console.log("❌ Contraseña incorrecta");
      return res.status(401).json({ 
        success: false, 
        message: "Credenciales inválidas" 
      });
    }

    console.log("🔑 JWT_SECRET usado en login:", process.env.JWT_SECRET);
    
    // Generar token JWT para administrador
    const token = jwt.sign(
      { 
        id: admin.id, 
        email: admin.email,
        userType: "admin" // ✅ Identificar como administrador
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    
    console.log("✅ Token de administrador generado");

    res.json({ 
      success: true, 
      token,
      userType: "admin",
      message: "Login de administrador exitoso"
    });
  } catch (err) {
    console.error("❌ Error en loginAdmin:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error interno del servidor" 
    });
  }
};

// Middleware para verificar token de administrador
export const verificarAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  console.log("🧾 Verificando token de administrador...");

  if (!token) {
    return res.status(403).json({ 
      success: false, 
      message: "Acceso denegado: token faltante" 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ✅ Verificar que sea un administrador
    if (decoded.userType !== "admin") {
      return res.status(403).json({ 
        success: false, 
        message: "Acceso denegado: se requiere permisos de administrador" 
      });
    }
    
    req.admin = decoded;
    console.log("✅ Token de administrador verificado correctamente:", decoded.email);
    next();
  } catch (err) {
    console.error("❌ Error verificando token de admin:", err.message);
    return res.status(401).json({ 
      success: false, 
      message: "Token inválido o expirado" 
    });
  }
};

/**
 * ✅ ASIGNACIÓN DIRECTA DE NÚMEROS (Compra sin pasarela) - SOLO ADMINISTRADORES
 * Permite a un admin asignar números a un usuario que pagó directamente
 */
export const asignarNumerosDirecto = async (req, res) => {
  try {
    const { 
      rifa_id, 
      numero_documento, 
      cantidad,
      notas_admin // Opcional: notas del admin sobre esta asignación
    } = req.body;

    console.log("🎯 Asignación directa solicitada por admin:", req.admin.email);
    console.log("📝 Datos:", { rifa_id, numero_documento, cantidad, notas_admin });

    // ✅ Validaciones básicas
    if (!rifa_id || !numero_documento || !cantidad) {
      return res.status(400).json({
        success: false,
        message: "Faltan campos obligatorios: rifa_id, numero_documento y cantidad"
      });
    }

    if (cantidad < 1) {
      return res.status(400).json({
        success: false,
        message: "La cantidad debe ser al menos 1"
      });
    }

    // ✅ 1. Verificar que la rifa existe
    const { data: rifa, error: rifaError } = await supabaseAdmin
      .from("rifas")
      .select("id, titulo, cantidad_numeros, precio_unitario, cantidad_minima")
      .eq("id", rifa_id)
      .single();

    if (rifaError || !rifa) {
      console.error("❌ Error buscando rifa:", rifaError);
      return res.status(404).json({
        success: false,
        message: "Rifa no encontrada"
      });
    }

    console.log(`✅ Rifa encontrada: ${rifa.titulo}`);

    // ✅ 2. Verificar que el usuario existe (por número de documento)
    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .select("id, nombres, apellidos, correo_electronico, numero_documento, tipo_documento")
      .eq("numero_documento", numero_documento)
      .single();

    if (usuarioError || !usuario) {
      console.error("❌ Usuario no encontrado:", usuarioError);
      return res.status(404).json({
        success: false,
        message: `Usuario con documento ${numero_documento} no encontrado. El usuario debe estar registrado primero.`
      });
    }

    console.log(`✅ Usuario encontrado: ${usuario.nombres} ${usuario.apellidos} (${usuario.correo_electronico})`);

    // ✅ 3. Verificar números disponibles
    const { count: disponiblesCount, error: countError } = await supabaseAdmin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("rifa_id", rifa_id)
      .is("comprado_por", null);

    if (countError) {
      console.error("❌ Error contando números disponibles:", countError);
      throw countError;
    }

    if (disponiblesCount < cantidad) {
      return res.status(400).json({
        success: false,
        message: `No hay suficientes números disponibles. Solicitados: ${cantidad}, Disponibles: ${disponiblesCount}`
      });
    }

    console.log(`✅ Números disponibles verificados: ${disponiblesCount}`);

    // ✅ 4. ASIGNAR NÚMEROS ALEATORIOS
    const numerosAsignados = await asignarNumerosAleatoriosAdmin(
      rifa_id, 
      cantidad, 
      usuario.id, 
      numero_documento
    );

    if (!numerosAsignados || numerosAsignados.length === 0) {
      throw new Error("Error asignando números");
    }

    console.log(`✅ ${numerosAsignados.length} números asignados`);

    // ✅ 5. Calcular valor real de la compra
    const valorTotal = cantidad * rifa.precio_unitario;
    console.log(`💰 Valor total de la compra: $${valorTotal.toLocaleString()}`);

    // ✅ 6. Crear registro en transacciones (para auditoría) - CON VALOR REAL
    const referencia = `MANUAL-${rifa_id.slice(0, 8)}-${Date.now()}`;
    
    const transaccionData = {
      referencia,
      invoice: `ADMIN-${Date.now()}`,
      rifa_id: rifa_id,
      cantidad: cantidad,
      precio_unitario: rifa.precio_unitario, // Precio real de la rifa
      valor_total: valorTotal, // Valor real calculado
      estado: 'aprobado',
      usuario_id: usuario.id,
      usuario_documento: numero_documento,
      datos_usuario: {
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        correo_electronico: usuario.correo_electronico,
        numero_documento: usuario.numero_documento,
        tipo_documento: usuario.tipo_documento
      },
      metodo_pago: 'pago_directo_admin', // Compra directa sin pasarela
      fecha_aprobacion: new Date().toISOString(),
      datos_respuesta: {
        tipo: 'asignacion_manual',
        admin_email: req.admin.email,
        admin_id: req.admin.id,
        numeros_asignados: numerosAsignados,
        cantidad_entregada: numerosAsignados.length,
        notas: notas_admin || 'Compra directa sin pasarela de pagos'
      }
    };

    const { data: transaccion, error: transError } = await supabaseAdmin
      .from("transacciones_pagos")
      .insert([transaccionData])
      .select()
      .single();

    if (transError) {
      console.error("⚠️ Error creando registro de transacción (no crítico):", transError);
    } else {
      console.log("✅ Transacción registrada para auditoría:", transaccion.id);
    }

    // ✅ 7. ENVIAR CORREO DE CONFIRMACIÓN CON VALOR REAL
    try {
      const { enviarCorreoCompraExitosa } = await import('../services/emailService.js');
      
      const transaccionParaEmail = {
        referencia,
        rifaTitulo: rifa.titulo,
        cantidad: cantidad,
        total: valorTotal // Valor real de la compra
      };

      await enviarCorreoCompraExitosa(usuario, transaccionParaEmail, numerosAsignados);
      console.log("📧 Correo de confirmación enviado exitosamente");
    } catch (emailError) {
      console.error("⚠️ Error enviando correo (no crítico):", emailError.message);
      // No fallar la operación por error de email
    }

    // ✅ 8. RESPUESTA EXITOSA CON NÚMEROS FORMATEADOS
    res.json({
      success: true,
      message: `${numerosAsignados.length} números asignados exitosamente a ${usuario.nombres} ${usuario.apellidos}`,
      data: {
        usuario: {
          id: usuario.id,
          nombre_completo: `${usuario.nombres} ${usuario.apellidos}`,
          correo: usuario.correo_electronico,
          documento: usuario.numero_documento
        },
        rifa: {
          id: rifa.id,
          titulo: rifa.titulo
        },
        numeros_asignados: numerosAsignados, // Ya vienen formateados con ceros
        cantidad_asignada: numerosAsignados.length,
        precio_unitario: rifa.precio_unitario,
        valor_total: valorTotal,
        referencia_transaccion: referencia,
        asignado_por: req.admin.email,
        fecha_asignacion: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("❌ Error en asignarNumerosDirecto:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al asignar números",
      error: error.message
    });
  }
};

/**
 * ✅ Función auxiliar para asignar números VERDADERAMENTE aleatorios
 * IDÉNTICA a la función de MercadoPago que SÍ funciona correctamente
 * Compatible con schema: numeros.numero es INTEGER, no TEXT
 */
const asignarNumerosAleatoriosAdmin = async (rifaId, cantidad, usuarioId, numeroDocumento) => {
  try {
    console.log(`🔍 Buscando ${cantidad} números disponibles para rifa ${rifaId}...`);
    
    // ✅ OBTENER TODOS LOS NÚMEROS DISPONIBLES (IGUAL QUE MERCADOPAGO)
    let allNumerosDisponibles = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: batch, error: disponiblesError } = await supabaseAdmin
        .from("numeros")
        .select("id, numero")
        .eq("rifa_id", rifaId)
        .is("comprado_por", null)
        .range(from, from + batchSize - 1);

      if (disponiblesError) {
        console.error("❌ Error obteniendo lote de números:", disponiblesError);
        throw disponiblesError;
      }

      if (batch && batch.length > 0) {
        allNumerosDisponibles = [...allNumerosDisponibles, ...batch];
        from += batchSize;
      } else {
        hasMore = false; // ← Solo para cuando ya no hay más registros
      }
    }

    console.log(`🎯 TOTAL números disponibles encontrados: ${allNumerosDisponibles.length.toLocaleString()}`);

    if (allNumerosDisponibles.length < cantidad) {
      throw new Error(`No hay suficientes números disponibles. Solicitados: ${cantidad}, Disponibles: ${allNumerosDisponibles.length}`);
    }

    // ✅ SELECCIÓN VERDADERAMENTE ALEATORIA (FISHER-YATES SHUFFLE)
    const mezclarArray = (array) => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    const numerosMezclados = mezclarArray(allNumerosDisponibles);
    const seleccionados = numerosMezclados.slice(0, cantidad);
    const numerosIds = seleccionados.map(n => n.id);
    const numerosValores = seleccionados.map(n => n.numero); // Ya son integers

    // ✅ MOSTRAR DISTRIBUCIÓN PARA VERIFICACIÓN
    const numerosOrdenados = [...numerosValores].sort((a, b) => a - b);
    console.log(`🎲 ${cantidad} números seleccionados ALEATORIAMENTE:`);
    console.log(`   - Mínimo: ${numerosOrdenados[0].toLocaleString()}`);
    console.log(`   - Máximo: ${numerosOrdenados[numerosOrdenados.length - 1].toLocaleString()}`);
    console.log(`   - Primeros 5: [${numerosOrdenados.slice(0, 5).join(', ')}]`);
    
    if (numerosOrdenados.length > 1) {
      let sumaDiferencias = 0;
      for (let i = 1; i < numerosOrdenados.length; i++) {
        sumaDiferencias += numerosOrdenados[i] - numerosOrdenados[i - 1];
      }
      const dispersionPromedio = Math.floor(sumaDiferencias / (numerosOrdenados.length - 1));
      console.log(`   - Dispersión promedio: ${dispersionPromedio.toLocaleString()} (${dispersionPromedio > 1000 ? '✅ Bien distribuido' : '⚠️ Agrupados'})`);
    }

    // ✅ ACTUALIZAR TABLA 'numeros' CON LA ASIGNACIÓN
    const { error: updateError } = await supabaseAdmin
      .from("numeros")
      .update({
        comprado_por: numeroDocumento, // VARCHAR
        usuario_id: usuarioId // UUID
      })
      .in("id", numerosIds);

    if (updateError) {
      console.error("❌ Error actualizando números:", updateError);
      throw updateError;
    }

    console.log(`✅ ${cantidad} números asignados correctamente en la base de datos`);
    
    // ✅ FORMATEAR NÚMEROS CON CEROS A LA IZQUIERDA ANTES DE RETORNAR
    return numerosValores.map(num => formatearNumero(num));

  } catch (error) {
    console.error("❌ Error asignando números (admin):", error);
    throw error;
  }
};
