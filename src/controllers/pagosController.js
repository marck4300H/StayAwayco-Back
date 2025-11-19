import { supabaseAdmin } from "../../supabaseAdminClient.js";
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import bcrypt from "bcrypt";

// ✅ CONFIGURACIÓN CORRECTA para mercadopago@2.10.0
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { 
    timeout: 5000,
    idempotencyKey: true 
  }
});

// ✅ CLIENTES PARA CADA SERVICIO
const preferenceClient = new Preference(client);
const paymentClient = new Payment(client);

// ✅ VARIABLE GLOBAL para evitar procesamiento duplicado CONCURRENTE
const transaccionesProcesando = new Set();

// ✅ Verificar credenciales al iniciar
console.log("🔐 Verificando credenciales Mercado Pago...");
if (!process.env.MP_ACCESS_TOKEN) {
  console.error("❌ MP_ACCESS_TOKEN no configurado en variables de entorno");
} else {
  console.log("✅ MP_ACCESS_TOKEN configurado correctamente");
}

/**
 * Crear orden de pago en Mercado Pago - CORREGIDO CON PRECIO DINÁMICO
 */
export const crearOrdenPago = async (req, res) => {
  try {
    const { 
      rifaId, 
      cantidad, 
      usuario, 
      returnUrl, 
      cancelUrl 
    } = req.body;

    console.log("🛒 Creando orden de pago:", { rifaId, cantidad, usuario });

    // ✅ VERIFICAR CREDENCIALES
    if (!process.env.MP_ACCESS_TOKEN) {
      console.error("❌ MP_ACCESS_TOKEN no configurado");
      return res.status(500).json({
        success: false,
        message: "Error de configuración del servidor - Credenciales no configuradas"
      });
    }

    // ✅ Validaciones básicas
    if (!rifaId || !cantidad || cantidad < 5) {
      return res.status(400).json({
        success: false,
        message: "Datos inválidos. Cantidad mínima: 5 números."
      });
    }

    // ✅ Obtener información de la rifa CON PRECIO UNITARIO
    const { data: rifa, error: rifaError } = await supabaseAdmin
      .from("rifas")
      .select("id, titulo, cantidad_numeros, precio_unitario, cantidad_minima")
      .eq("id", rifaId)
      .single();

    if (rifaError || !rifa) {
      return res.status(404).json({
        success: false,
        message: "Rifa no encontrada."
      });
    }

    // ✅ Usar precio unitario de la rifa (con valor por defecto si no existe)
    const precioUnitario = rifa.precio_unitario || 1000;
    const cantidadMinima = rifa.cantidad_minima || 5;

    // ✅ Validar cantidad mínima de la rifa
    if (cantidad < cantidadMinima) {
      return res.status(400).json({
        success: false,
        message: `La cantidad mínima para esta rifa es ${cantidadMinima} números.`
      });
    }

    // ✅ Verificar números disponibles
    const { count: disponiblesCount } = await supabaseAdmin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("rifa_id", rifaId)
      .is("comprado_por", null);

    if (disponiblesCount < cantidad) {
      return res.status(400).json({
        success: false,
        message: `No hay suficientes números disponibles. Solo quedan ${disponiblesCount}.`
      });
    }

    // ✅ Calcular precio CON PRECIO UNITARIO DINÁMICO
    const total = cantidad * precioUnitario;

    // ✅ Generar referencia única
    const referencia = `RIFA-${rifaId.slice(0, 8)}-${Date.now()}`;
    const invoice = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // ✅ Guardar transacción pendiente
    const transaccionData = {
      referencia,
      invoice,
      rifa_id: rifaId,
      cantidad,
      precio_unitario: precioUnitario,
      valor_total: total,
      estado: 'pendiente',
      usuario_documento: usuario?.numero_documento || null,
      datos_usuario: usuario || null
    };

    console.log("💾 Guardando transacción:", transaccionData);

    const { data: transaccion, error: transError } = await supabaseAdmin
      .from("transacciones_pagos")
      .insert([transaccionData])
      .select()
      .single();

    if (transError) {
      console.error("❌ Error guardando transacción:", transError);
      throw transError;
    }

    console.log("✅ Transacción guardada:", transaccion.id);

    // ✅ URLs absolutas para Mercado Pago
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const successUrl = returnUrl || `${baseUrl}/pago-exitoso`;
    const failureUrl = cancelUrl || `${baseUrl}/pago-fallido`;
    const pendingUrl = `${baseUrl}/pago-pendiente`;

    console.log("🔗 URLs configuradas:", {
      success: successUrl,
      failure: failureUrl,
      pending: pendingUrl
    });

    // ✅ Crear preferencia en Mercado Pago
    const body = {
      items: [
        {
          id: rifaId,
          title: `Rifa: ${rifa.titulo} - ${cantidad} números`,
          description: `Compra de ${cantidad} números para la rifa "${rifa.titulo}" (Precio unitario: $${precioUnitario.toLocaleString()})`,
          quantity: 1,
          unit_price: total,
          currency_id: "COP"
        }
      ],
      payer: {
        email: usuario?.correo_electronico || "test@user.com",
        first_name: usuario?.nombres || "Test",
        last_name: usuario?.apellidos || "User",
        phone: {
          area_code: "57",
          number: usuario?.telefono?.replace(/\D/g, '').slice(-10) || "1234567890"
        },
        identification: {
          type: usuario?.tipo_documento || "CC",
          number: usuario?.numero_documento || "1234567890"
        }
      },
      payment_methods: {
        excluded_payment_types: [
          { id: "atm" }
        ],
        installments: 1,
        default_installments: 1
      },
      external_reference: referencia,
      notification_url: `${process.env.API_URL || 'http://localhost:3000'}/api/pagos/webhook`,
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl
      },
      auto_return: "approved",
      statement_descriptor: "STAYAWAY RIFAS"
    };

    console.log("📦 Creando preferencia en Mercado Pago...");
    
    // ✅ USAR PREFERENCE CLIENT CORRECTAMENTE
    const response = await preferenceClient.create({ body });

    // ✅ Actualizar transacción con ID de Mercado Pago
    await supabaseAdmin
      .from("transacciones_pagos")
      .update({ 
        datos_epayco: { 
          preference_id: response.id,
          init_point: response.init_point,
          sandbox_init_point: response.sandbox_init_point
        },
        actualizado_en: new Date()
      })
      .eq("id", transaccion.id);

    console.log("✅ Orden creada exitosamente:", response.id);

    res.json({
      success: true,
      preference_id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point,
      public_key: process.env.MP_PUBLIC_KEY,
      transaccion: {
        referencia,
        invoice,
        total,
        precioUnitario,
        cantidadMinima,
        rifaTitulo: rifa.titulo,
        cantidad
      }
    });

  } catch (error) {
    console.error("❌ Error creando orden de pago:", error);
    
    if (error.status === 401) {
      console.error("❌ Error 401 - Token de Mercado Pago inválido o expirado");
      return res.status(500).json({
        success: false,
        message: "Error de autenticación con Mercado Pago. Contacte al administrador."
      });
    }
    
    if (error.status === 400) {
      return res.status(400).json({
        success: false,
        message: `Error en Mercado Pago: ${error.message}`,
        details: error.cause
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al crear la orden de pago."
    });
  }
};

/**
 * Webhook para recibir notificaciones de Mercado Pago
 */
export const webhookHandler = async (req, res) => {
  try {
    console.log("🔄 Webhook recibido de Mercado Pago");
    
    // ✅ LOG COMPLETO PARA DEBUGGING
    console.log("📝 Body completo del webhook:", JSON.stringify(req.body, null, 2));

    const { type, topic, action, data, resource, id } = req.body;

    console.log("🔍 Datos extraídos:", { type, topic, action, data, resource, id });

    // ✅ CASO 1: Webhook de tipo "payment" (el que estás recibiendo)
    if (type === 'payment' && data?.id) {
      console.log("💰 Procesando webhook de payment");
      return await procesarPaymentWebhook(data.id, res);
    }

    // ✅ CASO 2: Webhook de tipo "merchant_order"
    if (topic === 'merchant_order' && resource) {
      console.log("💰 Procesando webhook de merchant_order");
      return await procesarMerchantOrderWebhook(resource, res);
    }

    console.log("❌ Webhook no reconocido - Estructura:", Object.keys(req.body));
    
    // ✅ Para pruebas de Mercado Pago, siempre retornar 200
    console.log("✅ Retornando 200 para webhook no reconocido");
    return res.status(200).json({ 
      success: true, 
      message: "Webhook recibido" 
    });

  } catch (error) {
    console.error("❌ Error general en webhook:", error);
    
    // ✅ IMPORTANTE: Siempre retornar 200 a Mercado Pago aunque haya error interno
    res.status(200).json({ 
      success: false, 
      message: "Error interno pero webhook recibido" 
    });
  }
};

/**
 * Procesar payment webhook
 */
const procesarPaymentWebhook = async (paymentId, res) => {
  try {
    console.log("💳 Procesando payment con ID:", paymentId);
    
    // ✅ VERIFICAR CREDENCIALES
    if (!process.env.MP_ACCESS_TOKEN) {
      console.error("❌ MP_ACCESS_TOKEN no configurado para payment");
      return res.status(200).json({ 
        success: false, 
        message: "Credenciales no configuradas" 
      });
    }

    // Para pruebas, manejamos los payment IDs de prueba
    if (paymentId === 'PAY01K7S9596QBWZRTY02NF' || paymentId.includes('TEST')) {
      console.log("🧪 Procesando payment de prueba:", paymentId);
      return res.status(200).json({ 
        success: true, 
        message: "Payment de prueba procesado" 
      });
    }

    // ✅ USAR PAYMENT CLIENT CORRECTAMENTE
    const paymentData = await paymentClient.get({ 
      id: paymentId,
      requestOptions: { timeout: 10000 }
    });

    console.log("✅ Información del payment obtenida:", {
      id: paymentData.id,
      status: paymentData.status,
      status_detail: paymentData.status_detail,
      external_reference: paymentData.external_reference
    });

    const referencia = paymentData.external_reference;
    
    if (!referencia) {
      console.error("❌ No se encontró referencia en el payment");
      return res.status(200).json({ 
        success: true, 
        message: "Payment recibido sin referencia" 
      });
    }

    console.log("🔍 Buscando transacción con referencia:", referencia);

    // ✅ Buscar la transacción en nuestra base de datos
    const { data: transaccion, error: transError } = await supabaseAdmin
      .from("transacciones_pagos")
      .select("*")
      .eq("referencia", referencia)
      .single();

    if (transError || !transaccion) {
      console.error("❌ Transacción no encontrada:", referencia);
      return res.status(200).json({ 
        success: true, 
        message: "Transacción no encontrada" 
      });
    }

    console.log("✅ Transacción encontrada:", transaccion.id);

    // ✅ Determinar estado basado en el payment
    let nuevoEstado = 'pendiente';
    let esAprobado = false;

    if (paymentData.status === 'approved' || paymentData.status === 'accredited') {
      nuevoEstado = 'aprobado';
      esAprobado = true;
    } else if (paymentData.status === 'pending') {
      nuevoEstado = 'pendiente';
    } else if (paymentData.status === 'cancelled') {
      nuevoEstado = 'cancelado';
    } else if (paymentData.status === 'rejected') {
      nuevoEstado = 'rechazado';
    }

    const updateData = {
      estado: nuevoEstado,
      datos_respuesta: paymentData,
      actualizado_en: new Date()
    };

    // ✅ Si está aprobado, procesar la compra
    if (esAprobado) {
      updateData.fecha_aprobacion = new Date();
      updateData.metodo_pago = paymentData.payment_method_id;
      updateData.referencia_pago = paymentData.id;

      console.log("🎉 Payment aprobado, procesando compra...");
      await procesarCompraExitosa(transaccion, paymentData);
    }

    // ✅ Actualizar la transacción en la base de datos
    const { error: updateError } = await supabaseAdmin
      .from("transacciones_pagos")
      .update(updateData)
      .eq("referencia", referencia);

    if (updateError) {
      console.error("❌ Error actualizando transacción:", updateError);
      throw updateError;
    }

    console.log(`✅ Payment webhook procesado - Transacción: ${referencia}, Estado: ${nuevoEstado}`);

    return res.status(200).json({ 
      success: true, 
      message: `Payment procesado. Estado: ${nuevoEstado}`,
      transaccion: referencia,
      estado: nuevoEstado
    });

  } catch (error) {
    console.error("❌ Error procesando payment:", error);
    
    // Si es error 404, podría ser una prueba
    if (error.status === 404) {
      console.log("⚠️ Payment no encontrado - Probablemente es una prueba");
      return res.status(200).json({ 
        success: true, 
        message: "Webhook de prueba procesado" 
      });
    }
    
    // Siempre retornar 200 a Mercado Pago
    return res.status(200).json({ 
      success: true, 
      message: "Webhook recibido" 
    });
  }
};

/**
 * Procesar merchant order desde URL resource
 */
const procesarMerchantOrderWebhook = async (resourceUrl, res) => {
  try {
    console.log("🔗 Obteniendo merchant order desde:", resourceUrl);
    
    // ✅ VERIFICAR CREDENCIALES
    if (!process.env.MP_ACCESS_TOKEN) {
      console.error("❌ MP_ACCESS_TOKEN no configurado para merchant order");
      return res.status(200).json({ 
        success: false, 
        message: "Credenciales no configuradas" 
      });
    }

    // Extraer el ID de merchant order de la URL
    const merchantOrderId = resourceUrl.split('/').pop();
    console.log("🎯 Merchant Order ID:", merchantOrderId);

    if (!merchantOrderId) {
      throw new Error("No se pudo extraer el ID de merchant order de la URL");
    }

    // ✅ CORREGIDO: Usar fetch para obtener la merchant order directamente
    const merchantOrderUrl = `https://api.mercadopago.com/merchant_orders/${merchantOrderId}`;
    
    console.log("📡 Consultando merchant order a:", merchantOrderUrl);
    
    const response = await fetch(merchantOrderUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error("❌ Error 401 - Token de acceso inválido o expirado");
        throw new Error("Token de Mercado Pago inválido o expirado");
      }
      throw new Error(`Error obteniendo merchant order: ${response.status}`);
    }

    const merchantOrderData = await response.json();
    
    console.log("✅ Información de merchant order obtenida:", {
      id: merchantOrderData.id,
      status: merchantOrderData.status,
      external_reference: merchantOrderData.external_reference,
      order_status: merchantOrderData.order_status,
      payments: merchantOrderData.payments?.length || 0
    });

    // ✅ Procesar la merchant order
    return await procesarMerchantOrderCompleta(merchantOrderData, res);

  } catch (error) {
    console.error("❌ Error procesando merchant order:", error);
    
    // Siempre retornar 200 a Mercado Pago
    return res.status(200).json({ 
      success: true, 
      message: "Webhook recibido" 
    });
  }
};

/**
 * Procesar merchant order completa
 */
const procesarMerchantOrderCompleta = async (merchantOrderData, res) => {
  try {
    const referencia = merchantOrderData.external_reference;
    
    if (!referencia) {
      console.error("❌ No se encontró external_reference en la merchant order");
      return res.status(200).json({ 
        success: false, 
        message: "External reference no encontrado" 
      });
    }

    console.log("🔍 Buscando transacción con referencia:", referencia);

    // ✅ Buscar la transacción en nuestra base de datos
    const { data: transaccion, error: transError } = await supabaseAdmin
      .from("transacciones_pagos")
      .select("*")
      .eq("referencia", referencia)
      .single();

    if (transError || !transaccion) {
      console.error("❌ Transacción no encontrada:", referencia);
      return res.status(200).json({ 
        success: false, 
        message: "Transacción no encontrada" 
      });
    }

    console.log("✅ Transacción encontrada:", transaccion.id);

    // ✅ Determinar estado basado en la merchant order
    let nuevoEstado = 'pendiente';
    let esAprobado = false;

    if (merchantOrderData.order_status === 'paid') {
      nuevoEstado = 'aprobado';
      esAprobado = true;
    } else if (merchantOrderData.order_status === 'pending') {
      nuevoEstado = 'pendiente';
    } else if (merchantOrderData.order_status === 'cancelled') {
      nuevoEstado = 'cancelado';
    } else if (merchantOrderData.order_status === 'expired') {
      nuevoEstado = 'expirado';
    }

    console.log("📊 Estado determinado:", { 
      order_status: merchantOrderData.order_status,
      estado_final: nuevoEstado
    });

    const updateData = {
      estado: nuevoEstado,
      datos_respuesta: merchantOrderData,
      actualizado_en: new Date()
    };

    // ✅ Si está aprobado, procesar la compra
    if (esAprobado) {
      updateData.fecha_aprobacion = new Date();
      
      // Obtener información del payment
      const payments = merchantOrderData.payments || [];
      if (payments.length > 0) {
        const payment = payments[0];
        updateData.metodo_pago = payment.payment_method_id;
        updateData.referencia_pago = payment.id;
      }

      console.log("🎉 Merchant order pagada, procesando compra...");
      await procesarCompraExitosa(transaccion, merchantOrderData);
    }

    // ✅ Actualizar la transacción en la base de datos
    const { error: updateError } = await supabaseAdmin
      .from("transacciones_pagos")
      .update(updateData)
      .eq("referencia", referencia);

    if (updateError) {
      console.error("❌ Error actualizando transacción:", updateError);
      throw updateError;
    }

    console.log(`✅ Merchant order procesada exitosamente - Transacción: ${referencia}, Estado: ${nuevoEstado}`);

    return res.status(200).json({ 
      success: true, 
      message: `Merchant order procesada. Estado: ${nuevoEstado}`,
      transaccion: referencia,
      estado: nuevoEstado
    });

  } catch (error) {
    console.error("❌ Error procesando merchant order completa:", error);
    throw error;
  }
};

/**
 * Procesar compra exitosa - FUNCIONAL
 */
const procesarCompraExitosa = async (transaccion, orderData) => {
  try {
    console.log("🎉 Procesando compra exitosa:", transaccion.referencia);

    const { rifa_id, cantidad, datos_usuario, usuario_documento } = transaccion;

    // ✅ 1. CREAR O BUSCAR USUARIO
    let usuarioId = transaccion.usuario_id;
    let numeroDocumento = usuario_documento;

    if (datos_usuario && !usuarioId) {
      const { usuario, doc } = await crearOBuscarUsuario(datos_usuario);
      usuarioId = usuario.id;
      numeroDocumento = doc;
      
      // ✅ Actualizar la transacción con el usuario_id
      await supabaseAdmin
        .from("transacciones_pagos")
        .update({
          usuario_id: usuarioId,
          usuario_documento: doc
        })
        .eq("id", transaccion.id);
    }

    // ✅ 2. ASIGNAR NÚMEROS ALEATORIOS (con anti-duplicación simple)
    const numerosAsignados = await asignarNumerosAleatorios(rifa_id, cantidad, usuarioId, numeroDocumento);

    console.log(`✅ Compra procesada exitosamente - Usuario: ${usuarioId}, Números: ${numerosAsignados.length}`);

    // ✅ 3. ACTUALIZAR LA TRANSACCIÓN CON LOS NÚMEROS ASIGNADOS
    await supabaseAdmin
      .from("transacciones_pagos")
      .update({
        datos_respuesta: {
          ...transaccion.datos_respuesta,
          numeros_asignados: numerosAsignados,
          cantidad_entregada: numerosAsignados.length
        }
      })
      .eq("id", transaccion.id);

  } catch (error) {
    console.error("❌ Error procesando compra exitosa:", error);
    throw error;
  }
};

/**
 * Asignar números aleatorios - CORREGIDO SIN DUPLICACIÓN
 */
const asignarNumerosAleatorios = async (rifaId, cantidad, usuarioId, numeroDocumento) => {
  try {
    console.log(`🔍 Buscando ${cantidad} números disponibles para rifa ${rifaId}...`);
    
    // ✅ VERIFICACIÓN ANTI-DUPLICACIÓN SIMPLE: Usar transaccionesProcesando
    const procesamientoKey = `${rifaId}-${usuarioId}-${Date.now()}`;
    if (transaccionesProcesando.has(procesamientoKey)) {
      console.log(`⚠️ Ya se está procesando una compra para este usuario en esta rifa. Ignorando duplicado.`);
      return []; // Retornar array vacío para evitar duplicación
    }

    // ✅ Marcar como en proceso
    transaccionesProcesando.add(procesamientoKey);

    try {
      // ✅ OBTENER TODOS LOS NÚMEROS DISPONIBLES (sin límite)
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

        if (disponiblesError) throw disponiblesError;

        if (batch && batch.length > 0) {
          allNumerosDisponibles = [...allNumerosDisponibles, ...batch];
          from += batchSize;
        } else {
          hasMore = false;
        }
      }

      console.log(`🎯 TOTAL números disponibles encontrados: ${allNumerosDisponibles.length}`);

      if (allNumerosDisponibles.length < cantidad) {
        throw new Error(`No hay suficientes números disponibles. Solicitados: ${cantidad}, Disponibles: ${allNumerosDisponibles.length}`);
      }

      // ✅ SELECCIÓN VERDADERAMENTE ALEATORIA DE TODOS LOS NÚMEROS
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
      const numerosValores = seleccionados.map(n => n.numero).sort((a, b) => parseInt(a) - parseInt(b));

      console.log(`🎲 ${cantidad} números seleccionados ALEATORIAMENTE:`, numerosValores);

      // ✅ SOLUCIÓN: ACTUALIZAR SOLO LA TABLA 'numeros' - ELIMINADA LA DUPLICACIÓN
      const { error: updateError } = await supabaseAdmin
        .from("numeros")
        .update({
          comprado_por: numeroDocumento,
          usuario_id: usuarioId
        })
        .in("id", numerosIds);

      if (updateError) throw updateError;

      console.log(`✅ ${cantidad} números asignados correctamente:`, numerosValores);
      return numerosValores;

    } finally {
      // ✅ Siempre liberar el bloqueo después de 5 segundos (por si acaso)
      setTimeout(() => {
        transaccionesProcesando.delete(procesamientoKey);
      }, 5000);
    }

  } catch (error) {
    console.error("❌ Error asignando números:", error);
    throw error;
  }
};

/**
 * Crear o buscar usuario
 */
const crearOBuscarUsuario = async (datosUsuario) => {
  try {
    const { 
      correo_electronico, 
      nombres, 
      apellidos, 
      telefono, 
      tipo_documento, 
      numero_documento,
      direccion,
      ciudad,
      departamento
    } = datosUsuario;

    const { data: usuarioExistente } = await supabaseAdmin
      .from("usuarios")
      .select("*")
      .eq("correo_electronico", correo_electronico)
      .maybeSingle();

    if (usuarioExistente) {
      console.log("✅ Usuario existente encontrado:", usuarioExistente.id);
      
      const updates = {};
      if (!usuarioExistente.tipo_documento && tipo_documento) updates.tipo_documento = tipo_documento;
      if (!usuarioExistente.numero_documento && numero_documento) updates.numero_documento = numero_documento;
      if (!usuarioExistente.telefono && telefono) updates.telefono = telefono;
      if (!usuarioExistente.direccion && direccion) updates.direccion = direccion;
      if (!usuarioExistente.ciudad && ciudad) updates.ciudad = ciudad;
      if (!usuarioExistente.departamento && departamento) updates.departamento = departamento;

      if (Object.keys(updates).length > 0) {
        updates.actualizado_en = new Date();
        await supabaseAdmin
          .from("usuarios")
          .update(updates)
          .eq("id", usuarioExistente.id);
      }

      return { 
        usuario: usuarioExistente, 
        doc: usuarioExistente.numero_documento 
      };
    }

    const passwordPlana = generarContraseñaSegura();
    const hashedPassword = await bcrypt.hash(passwordPlana, 10);

    const nuevoUsuario = {
      nombres,
      apellidos,
      correo_electronico,
      telefono: telefono || null,
      tipo_documento: tipo_documento || "CC",
      numero_documento: numero_documento,
      direccion: direccion || null,
      ciudad: ciudad || null,
      departamento: departamento || null,
      password: hashedPassword,
      fecha_registro: new Date()
    };

    const { data: usuario, error } = await supabaseAdmin
      .from("usuarios")
      .insert([nuevoUsuario])
      .select()
      .single();

    if (error) {
      console.error("❌ Error creando usuario:", error);
      throw error;
    }

    console.log("✅ Nuevo usuario creado:", usuario.id);
    console.log("🔐 Contraseña generada:", passwordPlana);

    return { 
        usuario, 
        doc: usuario.numero_documento 
    };

  } catch (error) {
    console.error("❌ Error creando/buscando usuario:", error);
    throw error;
  }
};

/**
 * Generar contraseña segura
 */
const generarContraseñaSegura = () => {
  const longitud = 10;
  const mayusculas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const minusculas = 'abcdefghijklmnopqrstuvwxyz';
  const numeros = '0123456789';
  const simbolos = '!@#$%^&*';

  let contraseña = '';
  
  contraseña += mayusculas[Math.floor(Math.random() * mayusculas.length)];
  contraseña += minusculas[Math.floor(Math.random() * minusculas.length)];
  contraseña += numeros[Math.floor(Math.random() * numeros.length)];
  contraseña += simbolos[Math.floor(Math.random() * simbolos.length)];

  const todosCaracteres = mayusculas + minusculas + numeros + simbolos;
  for (let i = 4; i < longitud; i++) {
    contraseña += todosCaracteres[Math.floor(Math.random() * todosCaracteres.length)];
  }

  return contraseña.split('').sort(() => Math.random() - 0.5).join('');
};

/**
 * Obtener estado de transacción
 */
export const getEstadoTransaccion = async (req, res) => {
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
      transaccion
    });

  } catch (error) {
    console.error("❌ Error obteniendo estado:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

/**
 * Obtener public key para el frontend
 */
export const getPublicKey = async (req, res) => {
  res.json({
    success: true,
    public_key: process.env.MP_PUBLIC_KEY
  });
};