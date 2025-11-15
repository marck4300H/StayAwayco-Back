import { supabaseAdmin } from "../../supabaseAdminClient.js";

// ✅ SERVICIO OPTIMIZADO PARA PRODUCCIÓN
class EPaycoSmartCheckoutService {
  static async login() {
    try {
      const credentials = Buffer.from(
        `${process.env.EPAYCO_PUBLIC_KEY}:${process.env.EPAYCO_PRIVATE_KEY}`
      ).toString('base64');

      const response = await fetch('https://apify.epayco.co/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`
        }
      });

      if (!response.ok) throw new Error(`Login falló: ${response.status}`);
      
      const result = await response.json();
      return result.token;
      
    } catch (error) {
      console.error('❌ Error en login EPayco:', error);
      throw error;
    }
  }

  static async createSession(sessionData) {
    try {
      const token = await this.login();
      
      const response = await fetch('https://apify.epayco.co/payment/session/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(sessionData)
      });

      const result = await response.json();

      if (result.success && result.data?.sessionId) {
        console.log("✅ Sesión creada:", result.data.sessionId);
        return result.data;
      } else {
        throw new Error(result.textResponse || 'Error creando sesión');
      }
    } catch (error) {
      console.error('❌ Error creando sesión:', error);
      throw error;
    }
  }
}

// ✅ URLs PARA PRODUCCIÓN
const getProductionUrls = () => {
  return {
    frontend: process.env.FRONTEND_URL || "https://stayaway.com.co",
    backend: process.env.BACKEND_URL || "https://api.stayaway.com.co"
  };
};

/**
 * Crear pago - VERSIÓN PRODUCCIÓN
 */
export const crearPago = async (req, res) => {
  let transaccionCreada = null;
  
  try {
    const { rifaId, cantidad, valorTotal } = req.body;
    const usuario = req.usuario;

    // ✅ VALIDACIONES
    if (!rifaId || !cantidad || !valorTotal) {
      return res.status(400).json({
        success: false,
        message: "Datos incompletos"
      });
    }

    if (cantidad < 5) {
      return res.status(400).json({
        success: false,
        message: "La cantidad mínima es 5 números"
      });
    }

    // ✅ OBTENER DATOS DEL USUARIO
    const { data: usuarioCompleto, error: userError } = await supabaseAdmin
      .from("usuarios")
      .select("*")
      .eq("id", usuario.id)
      .single();

    if (userError || !usuarioCompleto) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado"
      });
    }

    // ✅ OBTENER INFORMACIÓN DE LA RIFA
    const { data: rifa, error: rifaError } = await supabaseAdmin
      .from("rifas")
      .select("*")
      .eq("id", rifaId)
      .single();

    if (rifaError || !rifa) {
      return res.status(404).json({
        success: false,
        message: "Rifa no encontrada"
      });
    }

    // ✅ VERIFICAR DISPONIBILIDAD
    const { count: disponibles } = await supabaseAdmin
      .from("numeros")
      .select("*", { count: 'exact', head: true })
      .eq("rifa_id", rifaId)
      .is("comprado_por", null);

    if (disponibles < cantidad) {
      return res.status(400).json({
        success: false,
        message: `No hay suficientes números disponibles. Solo quedan ${disponibles}`
      });
    }

    // ✅ CREAR TRANSACCIÓN
    const referencia = `RIFA_${rifaId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const { data: transaccionGuardada, error: transaccionError } = await supabaseAdmin
      .from("transacciones_pagos")
      .insert([{
        referencia: referencia,
        invoice: referencia,
        usuario_id: usuario.id,
        usuario_documento: usuarioCompleto.numero_documento,
        rifa_id: rifaId,
        cantidad: cantidad,
        valor_total: valorTotal,
        estado: 'pendiente',
        datos_epayco: {},
        datos_respuesta: {}
      }])
      .select();

    if (transaccionError) {
      throw new Error("Error al guardar la transacción");
    }

    transaccionCreada = transaccionGuardada[0];

    // ✅ URLs DE PRODUCCIÓN
    const urls = getProductionUrls();

    // ✅ SESIÓN PARA PRODUCCIÓN
    const sessionData = {
      // REQUERIDOS
      "checkout_version": "2",
      "name": "StayAway Rifas",
      "description": `Compra de ${cantidad} números - ${rifa.titulo}`,
      "currency": "COP",
      "amount": valorTotal,
      "country": "CO",
      "lang": "ES",
      "ip": req.ip, // ✅ En producción usa IP real
      
      // ✅ MODO PRODUCCIÓN
      "test": process.env.NODE_ENV !== 'production', // false en producción
      
      // ✅ URLs DE PRODUCCIÓN
      "response": `${urls.frontend}/confirmacion-pago`,
      "confirmation": `${urls.backend}/api/pagos/confirmacion`,
      
      // CONFIGURACIÓN
      "methodsDisable": [],
      "method": "POST",
      "dues": 1,
      
      // Datos del cliente
      "billing": {
        "email": usuarioCompleto.correo_electronico,
        "name": `${usuarioCompleto.nombres} ${usuarioCompleto.apellidos}`.substring(0, 80),
        "address": usuarioCompleto.direccion || "No especificada",
        "typeDoc": usuarioCompleto.tipo_documento || "CC",
        "numberDoc": usuarioCompleto.numero_documento,
        "callingCode": "+57",
        "mobilePhone": usuarioCompleto.telefono || "3000000000"
      },
      
      "extras": {
        "extra1": rifaId.toString(),
        "extra2": cantidad.toString(),
        "extra3": usuario.id.toString(),
        "extra4": referencia,
        "extra5": "production"
      }
    };

    const sessionResult = await EPaycoSmartCheckoutService.createSession(sessionData);

    // ✅ ACTUALIZAR TRANSACCIÓN
    await supabaseAdmin
      .from("transacciones_pagos")
      .update({ 
        datos_epayco: sessionResult,
        actualizado_en: new Date().toISOString()
      })
      .eq("referencia", referencia);

    res.json({
      success: true,
      message: "Sesión de pago creada",
      sessionData: {
        sessionId: sessionResult.sessionId,
        token: sessionResult.token,
        referencia: referencia,
        amount: valorTotal
      }
    });

  } catch (error) {
    console.error("❌ Error en crearPago:", error.message);
    
    if (transaccionCreada) {
      try {
        await supabaseAdmin
          .from("transacciones_pagos")
          .update({
            estado: 'error_sesion',
            datos_epayco: { error: error.message },
            actualizado_en: new Date().toISOString()
          })
          .eq("referencia", transaccionCreada.referencia);
      } catch (updateError) {
        console.error("❌ Error actualizando transacción fallida:", updateError);
      }
    }

    res.status(500).json({
      success: false,
      message: "Error al crear sesión de pago",
      error: error.message
    });
  }
};

/**
 * Confirmar pago - VERSIÓN PRODUCCIÓN CORREGIDA
 */
export const confirmarPago = async (req, res) => {
  try {
    console.log("🔄 Confirmación de pago recibida");
    
    // ✅ EN PRODUCCIÓN, ePayco envía datos en req.body (application/x-www-form-urlencoded)
    const datosPago = req.body || req.query || {};
    
    console.log("📦 Datos recibidos:", datosPago);

    const { 
      x_ref_payco, 
      x_response, 
      x_extra4, 
      x_transaction_id, 
      x_cod_response 
    } = datosPago;

    // ✅ Usar nuestra referencia (x_extra4)
    const referencia = x_extra4 || x_ref_payco;
    
    if (!referencia) {
      console.error("❌ Referencia no encontrada");
      return res.status(400).send("Referencia no encontrada");
    }

    // ✅ BUSCAR TRANSACCIÓN
    const { data: transaccion, error: transError } = await supabaseAdmin
      .from("transacciones_pagos")
      .select("*")
      .eq("referencia", referencia)
      .single();

    if (transError || !transaccion) {
      console.error("❌ Transacción no encontrada:", referencia);
      return res.status(404).send("Transacción no encontrada");
    }

    // ✅ DETERMINAR ESTADO
    let estado;
    if (x_response === 'Aceptada' || x_cod_response === '1') {
      estado = 'aprobado';
    } else if (x_response === 'Pendiente' || x_cod_response === '2') {
      estado = 'pendiente';
    } else if (x_response === 'Fallida' || x_response === 'Rechazada' || x_cod_response === '3' || x_cod_response === '4') {
      estado = 'rechazado';
    } else {
      estado = 'desconocido';
    }

    console.log("📊 Estado:", estado, "Referencia:", referencia);

    // ✅ ACTUALIZAR TRANSACCIÓN
    await supabaseAdmin
      .from("transacciones_pagos")
      .update({
        estado: estado,
        invoice: x_ref_payco || x_transaction_id,
        datos_respuesta: datosPago,
        actualizado_en: new Date().toISOString()
      })
      .eq("referencia", referencia);

    // ✅ PROCESAR COMPRA EXITOSA
    if (estado === 'aprobado') {
      console.log("✅ Pago aprobado, procesando compra...");
      try {
        await procesarCompraExitosa(transaccion);
        console.log("✅ Compra procesada exitosamente");
      } catch (procesarError) {
        console.error("❌ Error procesando compra:", procesarError);
      }
    }

    // ✅ RESPUESTA PARA EPAYCO
    res.status(200).send("OK");

  } catch (error) {
    console.error("❌ Error en confirmarPago:", error);
    res.status(500).send("Error interno del servidor");
  }
};

// ... (las funciones procesarCompraExitosa, verificarEstadoPago se mantienen igual)
/**
 * Procesar compra exitosa - asignar números al usuario
 */
async function procesarCompraExitosa(transaccion) {
  try {
    console.log(`✅ Procesando compra exitosa:`, transaccion.referencia);

    const { data: numerosDisponibles, error: numerosError } = await supabaseAdmin
      .from("numeros")
      .select("id, numero")
      .eq("rifa_id", transaccion.rifa_id)
      .is("comprado_por", null)
      .limit(transaccion.cantidad);

    if (numerosError || !numerosDisponibles || numerosDisponibles.length < transaccion.cantidad) {
      throw new Error(`No hay suficientes números. Solicitados: ${transaccion.cantidad}, Disponibles: ${numerosDisponibles?.length || 0}`);
    }

    const numerosIds = numerosDisponibles.map(num => num.id);
    
    await supabaseAdmin
      .from("numeros")
      .update({
        comprado_por: transaccion.usuario_id,
        comprado_en: new Date().toISOString(),
        transaccion_id: transaccion.id
      })
      .in('id', numerosIds);

    const numerosUsuario = numerosDisponibles.map((num) => ({
      numero: num.numero,
      numero_documento: transaccion.usuario_documento,
      usuario_id: transaccion.usuario_id,
      rifa_id: transaccion.rifa_id,
    }));

    await supabaseAdmin
      .from("numeros_usuario")
      .insert(numerosUsuario);

    await supabaseAdmin
      .from("transacciones_pagos")
      .update({ 
        estado: 'completado',
        actualizado_en: new Date().toISOString()
      })
      .eq("referencia", transaccion.referencia);

    console.log(`✅ Compra procesada: ${numerosIds.length} números asignados`);

  } catch (error) {
    console.error("❌ Error procesando compra:", error);
    throw error;
  }
}

/**
 * Verificar estado de pago
 */
export const verificarEstadoPago = async (req, res) => {
  try {
    const { referencia } = req.params;

    const { data: transaccion, error } = await supabaseAdmin
      .from("transacciones_pagos")
      .select("*")
      .eq("referencia", referencia)
      .single();

    if (error || !transaccion) {
      return res.status(404).json({
        success: false,
        message: "Transacción no encontrada"
      });
    }

    res.json({
      success: true,
      transaccion: {
        referencia: transaccion.referencia,
        estado: transaccion.estado,
        cantidad: transaccion.cantidad,
        valorTotal: transaccion.valor_total,
        rifaId: transaccion.rifa_id
      }
    });

  } catch (error) {
    console.error("❌ Error verificando estado:", error);
    res.status(500).json({
      success: false,
      message: "Error al verificar estado"
    });
  }
};

/**
 * Endpoint de diagnóstico para ePayco
 */
export const debugEpayco = async (req, res) => {
  try {
    const token = await EPaycoSmartCheckoutService.login();
    
    // Sesión de prueba simple
    const testSession = {
      "checkout_version": "2",
      "name": "Test Session",
      "description": "Sesión de prueba PSE",
      "currency": "COP", 
      "amount": 10000,
      "country": "CO",
      "lang": "ES",
      "ip": getClientIp(req),
      "test": true,
      "response": "https://stayaway-frontend.loca.lt",
      "confirmation": "https://stayaway-api.loca.lt/api/pagos/confirmacion"
    };

    const session = await EPaycoSmartCheckoutService.createSession(testSession);
    
    res.json({
      success: true,
      message: "Conexión ePayco OK",
      sessionId: session.sessionId,
      clientIp: getClientIp(req)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error ePayco",
      error: error.message
    });
  }
};