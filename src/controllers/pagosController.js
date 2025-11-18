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

// ✅ Verificar credenciales al iniciar
console.log("🔐 Verificando credenciales Mercado Pago...");
if (!process.env.MP_ACCESS_TOKEN) {
  console.error("❌ MP_ACCESS_TOKEN no configurado en variables de entorno");
} else {
  console.log("✅ MP_ACCESS_TOKEN configurado correctamente");
}

// ✅ VARIABLE GLOBAL para evitar procesamiento duplicado
const transaccionesProcesando = new Set();

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
 * Webhook para recibir notificaciones de Mercado Pago - CON ANTI-DUPLICACIÓN
 */
export const webhookHandler = async (req, res) => {
  const webhookId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`🔄 Webhook [${webhookId}] recibido de Mercado Pago`);
    
    // ✅ LOG COMPLETO PARA DEBUGGING
    console.log(`📝 Body del webhook [${webhookId}]:`, JSON.stringify(req.body, null, 2));

    const { type, topic, action, data, resource, id } = req.body;

    console.log(`🔍 Datos extraídos [${webhookId}]:`, { type, topic, action, data, resource, id });

    // ✅ CASO 1: Webhook de tipo "order" (nueva estructura)
    if (type === 'order' && data?.id) {
      console.log(`💰 [${webhookId}] Procesando webhook de order`);
      return await procesarOrderWebhook(data, res, webhookId);
    }

    // ✅ CASO 2: Webhook de tipo "merchant_order" (estructura antigua)
    if (topic === 'merchant_order' && resource) {
      console.log(`💰 [${webhookId}] Procesando webhook de merchant_order`);
      return await procesarMerchantOrderWebhook(resource, res, webhookId);
    }

    // ✅ CASO 3: Webhook de tipo "payment" (caso legacy)
    if (type === 'payment' && data?.id) {
      console.log(`💰 [${webhookId}] Procesando webhook de payment`);
      return await procesarPaymentWebhook(data.id, res, webhookId);
    }

    console.log(`❌ [${webhookId}] Webhook no reconocido`);
    
    // ✅ Para pruebas de Mercado Pago, siempre retornar 200
    return res.status(200).json({ 
      success: true, 
      message: "Webhook recibido" 
    });

  } catch (error) {
    console.error(`❌ [${webhookId}] Error general en webhook:`, error);
    
    // ✅ IMPORTANTE: Siempre retornar 200 a Mercado Pago aunque haya error interno
    res.status(200).json({ 
      success: false, 
      message: "Error interno pero webhook recibido" 
    });
  }
};

/**
 * Procesar webhook de tipo "order" con ANTI-DUPLICACIÓN
 */
const procesarOrderWebhook = async (orderData, res, webhookId) => {
  try {
    console.log(`📦 [${webhookId}] Procesando order webhook:`, orderData);

    const { external_reference, id: orderId, status, transactions } = orderData;

    // ✅ VERIFICACIÓN ANTI-DUPLICACIÓN: Si ya estamos procesando esta transacción
    if (transaccionesProcesando.has(external_reference)) {
      console.log(`⚠️ [${webhookId}] Transacción ${external_reference} YA se está procesando. Ignorando duplicado.`);
      return res.status(200).json({ 
        success: true, 
        message: "Transacción ya en proceso" 
      });
    }

    // ✅ Agregar a procesamiento
    transaccionesProcesando.add(external_reference);

    // ✅ MANEJO DE PRUEBAS
    if (external_reference === 'ext_ref_1234' || external_reference === 'TEST_REFERENCE') {
      console.log(`🧪 [${webhookId}] Procesando webhook de prueba`);
      await procesarWebhookDePrueba(orderData);
      transaccionesProcesando.delete(external_reference);
      return res.status(200).json({ 
        success: true, 
        message: "Webhook de prueba procesado"
      });
    }

    if (!external_reference) {
      console.error(`❌ [${webhookId}] No se encontró external_reference`);
      transaccionesProcesando.delete(external_reference);
      return res.status(200).json({ 
        success: false, 
        message: "External reference no encontrado" 
      });
    }

    console.log(`🔍 [${webhookId}] Buscando transacción: ${external_reference}`);

    // ✅ Buscar la transacción en nuestra base de datos
    const { data: transaccion, error: transError } = await supabaseAdmin
      .from("transacciones_pagos")
      .select("*")
      .eq("referencia", external_reference)
      .single();

    if (transError || !transaccion) {
      console.error(`❌ [${webhookId}] Transacción no encontrada: ${external_reference}`);
      transaccionesProcesando.delete(external_reference);
      return res.status(200).json({ 
        success: false, 
        message: "Transacción no encontrada" 
      });
    }

    console.log(`✅ [${webhookId}] Transacción encontrada: ${transaccion.id}`);

    // ✅ VERIFICAR SI YA FUE PROCESADA
    if (transaccion.estado === 'aprobado' && transaccion.datos_respuesta?.numeros_asignados) {
      console.log(`⚠️ [${webhookId}] Transacción ${external_reference} YA fue procesada y tiene números asignados.`);
      transaccionesProcesando.delete(external_reference);
      return res.status(200).json({ 
        success: true, 
        message: "Transacción ya procesada anteriormente" 
      });
    }

    const resultado = await procesarTransaccionConOrder(transaccion, orderData, webhookId);
    transaccionesProcesando.delete(external_reference);
    return resultado;

  } catch (error) {
    console.error(`❌ [${webhookId}] Error procesando order webhook:`, error);
    transaccionesProcesando.delete(external_reference);
    return res.status(200).json({ 
      success: false, 
      message: "Error interno procesando webhook" 
    });
  }
};

/**
 * Procesar transacción con datos de order - CON ANTI-DUPLICACIÓN
 */
const procesarTransaccionConOrder = async (transaccion, orderData, webhookId) => {
  try {
    const { status, transactions } = orderData;
    const { referencia } = transaccion;

    console.log(`✅ [${webhookId}] Procesando transacción: ${referencia}`);

    // ✅ Determinar estado basado en el order webhook
    let nuevoEstado = 'pendiente';
    let esAprobado = false;

    // Lógica de estados según la documentación de Mercado Pago
    if (status === 'processed' || status === 'accredited') {
      nuevoEstado = 'aprobado';
      esAprobado = true;
    } else if (status === 'pending') {
      nuevoEstado = 'pendiente';
    } else if (status === 'cancelled') {
      nuevoEstado = 'cancelado';
    } else if (status === 'rejected') {
      nuevoEstado = 'rechazado';
    } else if (status === 'refunded') {
      nuevoEstado = 'reembolsado';
    }

    // ✅ Verificar payments dentro de transactions
    const payments = transactions?.payments || [];
    if (payments.length > 0) {
      const payment = payments[0];
      console.log(`💳 [${webhookId}] Información del payment:`, {
        id: payment.id,
        status: payment.status,
        status_detail: payment.status_detail
      });

      // Si el payment está aprobado, sobreescribir el estado
      if (payment.status === 'approved' || payment.status === 'accredited') {
        nuevoEstado = 'aprobado';
        esAprobado = true;
      } else if (payment.status === 'pending') {
        nuevoEstado = 'pendiente';
      } else if (payment.status === 'rejected') {
        nuevoEstado = 'rechazado';
      }
    }

    console.log(`📊 [${webhookId}] Estado determinado:`, { 
      order_status: status,
      payments_count: payments.length,
      estado_final: nuevoEstado
    });

    const updateData = {
      estado: nuevoEstado,
      datos_respuesta: orderData,
      actualizado_en: new Date()
    };

    // ✅ Si está aprobado, procesar la compra (SOLO UNA VEZ)
    if (esAprobado) {
      updateData.fecha_aprobacion = new Date();
      
      if (payments.length > 0) {
        const payment = payments[0];
        updateData.metodo_pago = payment.payment_method?.id;
        updateData.referencia_pago = payment.id;
      }

      console.log(`🎉 [${webhookId}] Orden aprobada, procesando compra...`);
      
      // ✅ VERIFICAR ANTI-DUPLICACIÓN antes de procesar
      const { data: transaccionVerificada } = await supabaseAdmin
        .from("transacciones_pagos")
        .select("datos_respuesta")
        .eq("referencia", referencia)
        .single();

      if (transaccionVerificada?.datos_respuesta?.numeros_asignados) {
        console.log(`⚠️ [${webhookId}] Transacción ${referencia} YA tiene números asignados. Evitando duplicación.`);
      } else {
        await procesarCompraExitosa(transaccion, orderData, webhookId);
      }
    }

    // ✅ Actualizar la transacción en la base de datos
    const { error: updateError } = await supabaseAdmin
      .from("transacciones_pagos")
      .update(updateData)
      .eq("referencia", referencia);

    if (updateError) {
      console.error(`❌ [${webhookId}] Error actualizando transacción:`, updateError);
      throw updateError;
    }

    console.log(`✅ [${webhookId}] Webhook procesado - Transacción: ${referencia}, Estado: ${nuevoEstado}`);

    return res.status(200).json({ 
      success: true, 
      message: `Webhook procesado. Estado: ${nuevoEstado}`,
      transaccion: referencia,
      estado: nuevoEstado
    });

  } catch (error) {
    console.error(`❌ [${webhookId}] Error procesando transacción con order:`, error);
    throw error;
  }
};

/**
 * Procesar compra exitosa - CON ANTI-DUPLICACIÓN COMPLETA
 */
const procesarCompraExitosa = async (transaccion, orderData, webhookId) => {
  try {
    console.log(`🎉 [${webhookId}] Procesando compra exitosa: ${transaccion.referencia}`);

    const { rifa_id, cantidad, datos_usuario, usuario_documento } = transaccion;

    // ✅ VERIFICACIÓN ANTI-DUPLICACIÓN: Chequear si YA se procesó
    const { data: transaccionVerificada } = await supabaseAdmin
      .from("transacciones_pagos")
      .select("datos_respuesta")
      .eq("referencia", transaccion.referencia)
      .single();

    if (transaccionVerificada?.datos_respuesta?.numeros_asignados) {
      console.log(`⚠️ [${webhookId}] Transacción ${transaccion.referencia} YA tiene números asignados. EVITANDO DUPLICACIÓN.`);
      return;
    }

    // ✅ 1. CREAR O BUSCAR USUARIO
    let usuarioId = transaccion.usuario_id;
    let numeroDocumento = usuario_documento;

    if (datos_usuario && !usuarioId) {
      const { usuario, doc } = await crearOBuscarUsuario(datos_usuario);
      usuarioId = usuario.id;
      numeroDocumento = doc;
      
      await supabaseAdmin
        .from("transacciones_pagos")
        .update({
          usuario_id: usuarioId,
          usuario_documento: doc
        })
        .eq("id", transaccion.id);
    }

    // ✅ 2. ASIGNAR NÚMEROS ALEATORIOS (con verificación anti-duplicación)
    const numerosAsignados = await asignarNumerosAleatorios(rifa_id, cantidad, usuarioId, numeroDocumento, webhookId);

    console.log(`✅ [${webhookId}] Compra procesada - Usuario: ${usuarioId}, Números: ${numerosAsignados.length}`);

    // ✅ 3. ACTUALIZAR LA TRANSACCIÓN CON LOS NÚMEROS ASIGNADOS
    await supabaseAdmin
      .from("transacciones_pagos")
      .update({
        datos_respuesta: {
          ...transaccion.datos_respuesta,
          numeros_asignados: numerosAsignados,
          cantidad_entregada: numerosAsignados.length,
          procesado_en: new Date().toISOString(),
          webhook_id: webhookId
        }
      })
      .eq("referencia", transaccion.referencia);

  } catch (error) {
    console.error(`❌ [${webhookId}] Error procesando compra exitosa:`, error);
    throw error;
  }
};

/**
 * Asignar números aleatorios - CON ANTI-DUPLICACIÓN ROBUSTA
 */
const asignarNumerosAleatorios = async (rifaId, cantidad, usuarioId, numeroDocumento, webhookId) => {
  try {
    console.log(`🔍 [${webhookId}] Buscando ${cantidad} números para rifa ${rifaId}...`);

    // ✅ VERIFICACIÓN CRÍTICA: Chequear si el usuario YA tiene números para esta rifa
    const { data: numerosExistentes } = await supabaseAdmin
      .from("numeros_usuario")
      .select("numero")
      .eq("usuario_id", usuarioId)
      .eq("rifa_id", rifaId);

    if (numerosExistentes && numerosExistentes.length > 0) {
      console.log(`⚠️ [${webhookId}] Usuario YA TIENE ${numerosExistentes.length} números. EVITANDO DUPLICACIÓN.`);
      return numerosExistentes.map(n => n.numero);
    }

    // ✅ OBTENER NÚMEROS DISPONIBLES
    const { data: numerosDisponibles, error: disponiblesError } = await supabaseAdmin
      .from("numeros")
      .select("id, numero")
      .eq("rifa_id", rifaId)
      .is("comprado_por", null)
      .limit(cantidad + 50);

    if (disponiblesError) throw disponiblesError;

    console.log(`🎯 [${webhookId}] Números disponibles: ${numerosDisponibles?.length || 0}`);

    if (!numerosDisponibles || numerosDisponibles.length < cantidad) {
      throw new Error(`No hay suficientes números. Solicitados: ${cantidad}, Disponibles: ${numerosDisponibles?.length || 0}`);
    }

    // ✅ MEZCLAR Y SELECCIONAR
    const mezclarArray = (array) => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    const numerosMezclados = mezclarArray(numerosDisponibles);
    const seleccionados = numerosMezclados.slice(0, cantidad);
    const numerosIds = seleccionados.map(n => n.id);
    const numerosValores = seleccionados.map(n => n.numero).sort((a, b) => parseInt(a) - parseInt(b));

    console.log(`🎲 [${webhookId}] ${cantidad} números seleccionados:`, numerosValores);

    // ✅ ACTUALIZAR TABLA 'numeros'
    const { error: updateError } = await supabaseAdmin
      .from("numeros")
      .update({
        comprado_por: numeroDocumento,
        usuario_id: usuarioId,
        fecha_compra: new Date()
      })
      .in("id", numerosIds);

    if (updateError) throw updateError;

    // ✅ INSERTAR EN 'numeros_usuario'
    const numerosUsuarioData = seleccionados.map(numeroObj => ({
      numero: numeroObj.numero,
      numero_documento: numeroDocumento,
      usuario_id: usuarioId,
      rifa_id: rifaId,
      fecha_asignacion: new Date()
    }));

    const { error: insertError } = await supabaseAdmin
      .from("numeros_usuario")
      .insert(numerosUsuarioData);

    if (insertError) {
      // ✅ REVERTIR en caso de error
      await supabaseAdmin
        .from("numeros")
        .update({
          comprado_por: null,
          usuario_id: null,
          fecha_compra: null
        })
        .in("id", numerosIds);
      throw insertError;
    }

    console.log(`✅ [${webhookId}] ${cantidad} números asignados SIN DUPLICACIÓN`);
    return numerosValores;

  } catch (error) {
    console.error(`❌ [${webhookId}] Error asignando números:`, error);
    throw error;
  }
};

// ... (las otras funciones auxiliares se mantienen igual, pero con los webhookId)
const procesarWebhookDePrueba = async (orderData) => {
  try {
    console.log("🧪 Procesando webhook de prueba...", orderData);
    return true;
  } catch (error) {
    console.error("❌ Error procesando webhook de prueba:", error);
    throw error;
  }
};

const procesarMerchantOrderWebhook = async (resourceUrl, res, webhookId) => {
  try {
    console.log(`🔗 [${webhookId}] Obteniendo merchant order desde: ${resourceUrl}`);
    
    if (!process.env.MP_ACCESS_TOKEN) {
      console.error(`❌ [${webhookId}] MP_ACCESS_TOKEN no configurado`);
      return res.status(200).json({ 
        success: false, 
        message: "Credenciales no configuradas" 
      });
    }

    const merchantOrderId = resourceUrl.split('/').pop();
    console.log(`🎯 [${webhookId}] Merchant Order ID: ${merchantOrderId}`);

    if (!merchantOrderId) {
      throw new Error("No se pudo extraer el ID de merchant order de la URL");
    }

    const merchantOrderUrl = `https://api.mercadopago.com/merchant_orders/${merchantOrderId}`;
    
    console.log(`📡 [${webhookId}] Consultando merchant order a: ${merchantOrderUrl}`);
    
    const response = await fetch(merchantOrderUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error(`❌ [${webhookId}] Error 401 - Token inválido`);
        throw new Error("Token de Mercado Pago inválido o expirado");
      }
      throw new Error(`Error obteniendo merchant order: ${response.status}`);
    }

    const merchantOrderData = await response.json();
    
    console.log(`✅ [${webhookId}] Información de merchant order obtenida:`, {
      id: merchantOrderData.id,
      status: merchantOrderData.status,
      external_reference: merchantOrderData.external_reference
    });

    return await procesarMerchantOrderCompleta(merchantOrderData, res, webhookId);

  } catch (error) {
    console.error(`❌ [${webhookId}] Error procesando merchant order:`, error);
    return res.status(200).json({ 
      success: true, 
      message: "Webhook recibido" 
    });
  }
};

const procesarMerchantOrderCompleta = async (merchantOrderData, res, webhookId) => {
  try {
    const referencia = merchantOrderData.external_reference;
    
    if (!referencia) {
      console.error(`❌ [${webhookId}] No se encontró external_reference`);
      return res.status(200).json({ 
        success: false, 
        message: "External reference no encontrado" 
      });
    }

    console.log(`🔍 [${webhookId}] Buscando transacción: ${referencia}`);

    const { data: transaccion, error: transError } = await supabaseAdmin
      .from("transacciones_pagos")
      .select("*")
      .eq("referencia", referencia)
      .single();

    if (transError || !transaccion) {
      console.error(`❌ [${webhookId}] Transacción no encontrada: ${referencia}`);
      return res.status(200).json({ 
        success: false, 
        message: "Transacción no encontrada" 
      });
    }

    console.log(`✅ [${webhookId}] Transacción encontrada: ${transaccion.id}`);

    // ✅ VERIFICAR ANTI-DUPLICACIÓN
    if (transaccion.estado === 'aprobado' && transaccion.datos_respuesta?.numeros_asignados) {
      console.log(`⚠️ [${webhookId}] Transacción ${referencia} YA procesada. Ignorando.`);
      return res.status(200).json({ 
        success: true, 
        message: "Transacción ya procesada" 
      });
    }

    let nuevoEstado = 'pendiente';
    let esAprobado = false;

    if (merchantOrderData.order_status === 'paid') {
      nuevoEstado = 'aprobado';
      esAprobado = true;
    }

    console.log(`📊 [${webhookId}] Estado determinado:`, { 
      order_status: merchantOrderData.order_status,
      estado_final: nuevoEstado
    });

    const updateData = {
      estado: nuevoEstado,
      datos_respuesta: merchantOrderData,
      actualizado_en: new Date()
    };

    if (esAprobado) {
      updateData.fecha_aprobacion = new Date();
      
      const payments = merchantOrderData.payments || [];
      if (payments.length > 0) {
        const payment = payments[0];
        updateData.metodo_pago = payment.payment_method_id;
        updateData.referencia_pago = payment.id;
      }

      console.log(`🎉 [${webhookId}] Merchant order pagada, procesando compra...`);
      
      // ✅ VERIFICAR ANTI-DUPLICACIÓN
      const { data: transaccionVerificada } = await supabaseAdmin
        .from("transacciones_pagos")
        .select("datos_respuesta")
        .eq("referencia", referencia)
        .single();

      if (!transaccionVerificada?.datos_respuesta?.numeros_asignados) {
        await procesarCompraExitosa(transaccion, merchantOrderData, webhookId);
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("transacciones_pagos")
      .update(updateData)
      .eq("referencia", referencia);

    if (updateError) throw updateError;

    console.log(`✅ [${webhookId}] Merchant order procesada - Transacción: ${referencia}, Estado: ${nuevoEstado}`);

    return res.status(200).json({ 
      success: true, 
      message: `Merchant order procesada. Estado: ${nuevoEstado}`,
      transaccion: referencia,
      estado: nuevoEstado
    });

  } catch (error) {
    console.error(`❌ [${webhookId}] Error procesando merchant order completa:`, error);
    throw error;
  }
};

const procesarPaymentWebhook = async (paymentId, res, webhookId) => {
  try {
    console.log(`💳 [${webhookId}] Procesando payment con ID: ${paymentId}`);
    
    if (!process.env.MP_ACCESS_TOKEN) {
      console.error(`❌ [${webhookId}] MP_ACCESS_TOKEN no configurado`);
      return res.status(200).json({ 
        success: false, 
        message: "Credenciales no configuradas" 
      });
    }

    // Para pruebas
    if (paymentId === 'PAY01K7S9596QBWZRTY02NF' || paymentId.includes('TEST')) {
      console.log(`🧪 [${webhookId}] Procesando payment de prueba: ${paymentId}`);
      await procesarWebhookDePrueba({ id: paymentId, status: 'approved' });
      return res.status(200).json({ 
        success: true, 
        message: "Payment de prueba procesado" 
      });
    }

    const paymentData = await paymentClient.get({ 
      id: paymentId,
      requestOptions: { timeout: 10000 }
    });

    console.log(`✅ [${webhookId}] Información del payment obtenida:`, {
      id: paymentData.id,
      status: paymentData.status,
      external_reference: paymentData.external_reference
    });

    const referencia = paymentData.external_reference;
    
    if (!referencia) {
      console.error(`❌ [${webhookId}] No se encontró referencia en el payment`);
      return res.status(200).json({ 
        success: true, 
        message: "Payment recibido sin referencia" 
      });
    }

    console.log(`🔍 [${webhookId}] Buscando transacción: ${referencia}`);

    const { data: transaccion, error: transError } = await supabaseAdmin
      .from("transacciones_pagos")
      .select("*")
      .eq("referencia", referencia)
      .single();

    if (transError || !transaccion) {
      console.error(`❌ [${webhookId}] Transacción no encontrada: ${referencia}`);
      return res.status(200).json({ 
        success: true, 
        message: "Transacción no encontrada" 
      });
    }

    console.log(`✅ [${webhookId}] Transacción encontrada: ${transaccion.id}`);

    // ✅ VERIFICAR ANTI-DUPLICACIÓN
    if (transaccion.estado === 'aprobado' && transaccion.datos_respuesta?.numeros_asignados) {
      console.log(`⚠️ [${webhookId}] Transacción ${referencia} YA procesada. Ignorando.`);
      return res.status(200).json({ 
        success: true, 
        message: "Transacción ya procesada" 
      });
    }

    let nuevoEstado = 'pendiente';
    let esAprobado = false;

    if (paymentData.status === 'approved' || paymentData.status === 'accredited') {
      nuevoEstado = 'aprobado';
      esAprobado = true;
    }

    const updateData = {
      estado: nuevoEstado,
      datos_respuesta: paymentData,
      actualizado_en: new Date()
    };

    if (esAprobado) {
      updateData.fecha_aprobacion = new Date();
      updateData.metodo_pago = paymentData.payment_method_id;
      updateData.referencia_pago = paymentData.id;

      console.log(`🎉 [${webhookId}] Payment aprobado, procesando compra...`);
      
      // ✅ VERIFICAR ANTI-DUPLICACIÓN
      const { data: transaccionVerificada } = await supabaseAdmin
        .from("transacciones_pagos")
        .select("datos_respuesta")
        .eq("referencia", referencia)
        .single();

      if (!transaccionVerificada?.datos_respuesta?.numeros_asignados) {
        await procesarCompraExitosa(transaccion, paymentData, webhookId);
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("transacciones_pagos")
      .update(updateData)
      .eq("referencia", referencia);

    if (updateError) throw updateError;

    console.log(`✅ [${webhookId}] Payment webhook procesado - Transacción: ${referencia}, Estado: ${nuevoEstado}`);

    return res.status(200).json({ 
      success: true, 
      message: `Payment procesado. Estado: ${nuevoEstado}`,
      transaccion: referencia,
      estado: nuevoEstado
    });

  } catch (error) {
    console.error(`❌ [${webhookId}] Error procesando payment:`, error);
    
    if (error.status === 404) {
      console.log(`⚠️ [${webhookId}] Payment no encontrado - Probablemente prueba`);
      return res.status(200).json({ 
        success: true, 
        message: "Webhook de prueba procesado" 
      });
    }
    
    if (error.status === 401) {
      console.error(`❌ [${webhookId}] Error 401 - Token inválido`);
    }
    
    return res.status(200).json({ 
      success: true, 
      message: "Webhook recibido" 
    });
  }
};

// ... (funciones auxiliares de usuario se mantienen igual)
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

    if (error) throw error;

    console.log("✅ Nuevo usuario creado:", usuario.id);
    return { 
        usuario, 
        doc: usuario.numero_documento 
    };

  } catch (error) {
    console.error("❌ Error creando/buscando usuario:", error);
    throw error;
  }
};

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