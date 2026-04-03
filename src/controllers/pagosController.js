import { supabaseAdmin } from "../../supabaseAdminClient.js";
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import bcrypt from "bcrypt";
import { enviarCorreoCompraExitosa, enviarCorreoBienvenida } from '../services/emailService.js';
/**
 * ✅ Calcular cantidad de dígitos necesarios según el total de números de la rifa
 * Ejemplo: 10000 números → 4 dígitos (0000-9999)
 *          100000 números → 5 dígitos (00000-99999)
 */
const calcularDigitos = (cantidadNumeros) => {
  return (cantidadNumeros - 1).toString().length;
};

/**
 * ✅ Formatear número con ceros a la izquierda
 */
const formatearNumero = (numero, digitos) => {
  return numero.toString().padStart(digitos, '0');
};


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
 * Webhook para recibir notificaciones de Mercado Pago - CORREGIDO
 */
export const webhookHandler = async (req, res) => {
  try {
    console.log("🔄 Webhook recibido de Mercado Pago");
    
    // ✅ LOG COMPLETO PARA DEBUGGING
    console.log("📝 Body completo del webhook:", JSON.stringify(req.body, null, 2));

    const { type, topic, action, data, resource, id } = req.body;

    console.log("🔍 Datos extraídos:", { type, topic, action, data, resource, id });

    // ✅ SOLUCIÓN CRÍTICA: EVITAR PROCESAMIENTO DUPLICADO
    // Mercado Pago envía múltiples webhooks para el mismo pago
    // Debemos asegurarnos de que solo UNO procese la compra

    // ✅ CASO 1: Webhook de tipo "payment" (PRINCIPAL)
    if (type === 'payment' && data?.id) {
      console.log("💰 Procesando webhook de payment (PRINCIPAL)");
      return await procesarPaymentWebhook(data.id, res);
    }

    // ✅ CASO 2: Webhook de tipo "merchant_order" (SECUNDARIO - SOLO LOG, NO PROCESAR)
    if (topic === 'merchant_order' && resource) {
      console.log("📦 Webhook de merchant_order recibido - SOLO REGISTRO, NO PROCESAMIENTO");
      // ❌ NO procesar merchant_order para evitar duplicación
      // Solo registrar que llegó y retornar éxito
      return res.status(200).json({ 
        success: true, 
        message: "Webhook merchant_order recibido (no se procesa para evitar duplicación)" 
      });
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
 * Procesar payment webhook - MEJORADO CON VERIFICACIÓN DE ESTADO
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

    // ✅ VERIFICACIÓN CRÍTICA: Si ya está aprobada y tiene números, NO PROCESAR DE NUEVO
    if (transaccion.estado === 'aprobado' && transaccion.datos_respuesta?.numeros_asignados) {
      console.log("✅ Transacción YA PROCESADA - Evitando duplicación");
      return res.status(200).json({ 
        success: true, 
        message: "Transacción ya procesada anteriormente" 
      });
    }

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
 * 🎁 Calcular números gratis según promociones configuradas
 */
const calcularNumerosGratis = (cantidadComprada, paquetesPromo) => {
  if (!paquetesPromo) {
    console.log("📊 Sin paquetes de promoción configurados");
    return 0;
  }

  console.log("🎁 Evaluando promociones:", paquetesPromo);

  // Crear array de paquetes válidos y ordenar de MAYOR a MENOR cantidad
  const paquetes = [];
  
  ['paquete1', 'paquete2', 'paquete3'].forEach((key) => {
    const paquete = paquetesPromo[key];
    if (paquete && paquete.cantidad_compra && paquete.numeros_gratis >= 0) {
      paquetes.push({
        nombre: key,
        cantidad: paquete.cantidad_compra,
        gratis: paquete.numeros_gratis
      });
    }
  });

  if (paquetes.length === 0) {
    console.log("📊 No hay paquetes válidos configurados");
    return 0;
  }

  // Ordenar de MAYOR a MENOR para aplicar el mejor descuento primero
  paquetes.sort((a, b) => b.cantidad - a.cantidad);

  console.log("📦 Paquetes disponibles (ordenados):", paquetes);

  // Buscar el paquete aplicable (el MAYOR que cumpla la condición)
  for (const paquete of paquetes) {
    if (cantidadComprada >= paquete.cantidad) {
      console.log(`🎉 ¡PROMOCIÓN APLICADA! ${paquete.nombre}: ${cantidadComprada} números → +${paquete.gratis} GRATIS`);
      return paquete.gratis;
    }
  }

  console.log(`📊 Sin promoción aplicable para ${cantidadComprada} números`);
  console.log(`   Cantidad mínima requerida: ${paquetes[paquetes.length - 1].cantidad}`);
  return 0;
};


/**
 * Procesar compra exitosa - CORREGIDO SIN DUPLICACIÓN + EMAIL
 */
const procesarCompraExitosa = async (transaccion, orderData) => {
  try {
    console.log("🎉 Procesando compra exitosa:", transaccion.referencia);

    // ✅ VERIFICACIÓN EXTRA: Revisar si ya se asignaron números
    if (transaccion.datos_respuesta?.numeros_asignados) {
      console.log("⚠️ Ya hay números asignados para esta transacción. Evitando duplicación.");
      return;
    }

    const { rifa_id, cantidad, datos_usuario, usuario_documento } = transaccion;

    // ✅ 0. OBTENER INFORMACIÓN DE LA RIFA CON PROMOCIONES
    const { data: rifa, error: rifaError } = await supabaseAdmin
      .from("rifas")
      .select("titulo, cantidad_numeros, paquetes_promocion")
      .eq("id", rifa_id)
      .single();

    if (rifaError || !rifa) {
      console.error("❌ Error obteniendo info de rifa:", rifaError);
      throw new Error("No se pudo obtener información de la rifa");
    }

    console.log(`✅ Rifa: ${rifa.titulo} (${rifa.cantidad_numeros.toLocaleString()} números)`);

    // ✅ 1. CREAR O BUSCAR USUARIO
    let usuarioId = transaccion.usuario_id;
    let numeroDocumento = usuario_documento;
    let usuarioCompleto = null;

    if (datos_usuario && !usuarioId) {
      const { usuario, doc } = await crearOBuscarUsuario(datos_usuario);
      usuarioId = usuario.id;
      numeroDocumento = doc;
      usuarioCompleto = usuario;

      await supabaseAdmin
        .from("transacciones_pagos")
        .update({
          usuario_id: usuarioId,
          usuario_documento: doc
        })
        .eq("id", transaccion.id);
    } else if (usuarioId) {
      const { data: usuario } = await supabaseAdmin
        .from("usuarios")
        .select("*")
        .eq("id", usuarioId)
        .single();
      usuarioCompleto = usuario;
    }

    // ✅ 2. CALCULAR NÚMEROS GRATIS 🎁
    const numerosGratis = calcularNumerosGratis(cantidad, rifa.paquetes_promocion);
    const cantidadTotal = cantidad + numerosGratis;

    console.log(`🎯 RESUMEN DE COMPRA:`);
    console.log(`   • Números comprados: ${cantidad}`);
    console.log(`   • Números GRATIS: ${numerosGratis}`);
    console.log(`   • TOTAL a entregar: ${cantidadTotal}`);

    // ✅ 3. ASIGNAR NÚMEROS ALEATORIOS (COMPRADOS + GRATIS)
    const numerosAsignados = await asignarNumerosAleatorios(
      rifa_id,
      cantidadTotal,
      usuarioId,
      numeroDocumento,
      transaccion.referencia,
      rifa.cantidad_numeros
    );

    console.log(`✅ Compra procesada exitosamente - Usuario: ${usuarioId}, Números entregados: ${numerosAsignados.length}`);

    // ✅ 4. ACTUALIZAR LA TRANSACCIÓN CON LOS NÚMEROS ASIGNADOS
    //    Se hace ANTES del correo para que si el correo falla,
    //    la transacción ya esté marcada como procesada
    await supabaseAdmin
      .from("transacciones_pagos")
      .update({
        datos_respuesta: {
          ...transaccion.datos_respuesta,
          numeros_asignados: numerosAsignados,
          cantidad_comprada: cantidad,
          numeros_gratis: numerosGratis,
          cantidad_entregada: numerosAsignados.length
        }
      })
      .eq("id", transaccion.id);

    // ✅ 5. ENVIAR CORREO EN BACKGROUND (sin bloquear ni generar timeout)
    if (usuarioCompleto) {
      const transaccionConRifa = {
        ...transaccion,
        rifaTitulo: rifa.titulo,
        cantidad: cantidad,
        numerosGratis: numerosGratis,
        cantidadTotal: cantidadTotal,
        total: transaccion.valor_total
      };

      // ✅ Obtener rifa completa para el PDF (con todos los campos legales)
      supabaseAdmin
        .from("rifas")
        .select(`
          id, titulo, cantidad_numeros, precio_unitario, fecha_sorteo,
          loteria_referencia, descripcion, descripcion_premios, valor_premios,
          numero_resolucion, fecha_autorizacion, termino_caducidad,
          responsable_nombre, responsable_domicilio, responsable_id,
          imagen_boleta_url
        `)
        .eq("id", rifa_id)
        .single()
        .then(({ data: rifaCompleta, error: rfError }) => {
          if (rfError || !rifaCompleta) {
            console.error("⚠️ No se pudo obtener rifa completa para el PDF:", rfError);
            rifaCompleta = rifa; // fallback a los datos básicos
          }

          // Fire and forget — el webhook ya respondió, esto corre en background
          enviarCorreoCompraExitosa(usuarioCompleto, transaccionConRifa, numerosAsignados, rifaCompleta)
            .then(() => {
              console.log("📧 Correo de compra enviado exitosamente (background)");
            })
            .catch((emailError) => {
              console.error("⚠️ Error enviando correo en background:", emailError.message || emailError);
            });
        });
    }

  } catch (error) {
    console.error("❌ Error procesando compra exitosa:", error);
    throw error;
  }
};




/**
 * ✅ Asignar números atómicos via RPC — previene race conditions
 */
const asignarNumerosAleatorios = async (rifaId, cantidad, usuarioId, numeroDocumento, referenciaTransaccion, cantidadNumerosRifa) => {
  try {
    console.log(`🔍 Asignando ${cantidad} números para rifa ${rifaId} via RPC atómico...`);

    // ✅ CALCULAR DÍGITOS DINÁMICAMENTE
    const digitosFormato = calcularDigitos(cantidadNumerosRifa);
    console.log(`📏 Formato: ${digitosFormato} dígitos`);

    // ✅ VERIFICACIÓN ANTI-DUPLICACIÓN EN MEMORIA
    const procesamientoKey = `asignacion-${referenciaTransaccion}`;
    if (transaccionesProcesando.has(procesamientoKey)) {
      console.log(`⚠️ Esta transacción ya se está procesando. Ignorando duplicado.`);
      return [];
    }

    transaccionesProcesando.add(procesamientoKey);

    try {
      // ✅ LLAMADA RPC ATÓMICA — SELECT + UPDATE en una sola transacción
      const { data: numerosData, error: rpcError } = await supabaseAdmin.rpc(
        'asignar_numeros_atomico',
        {
          p_rifa_id:    rifaId,
          p_cantidad:   cantidad,
          p_usuario_id: usuarioId,
          p_documento:  numeroDocumento
        }
      );

      if (rpcError) {
        console.error('❌ Error en RPC asignar_numeros_atomico:', rpcError);
        throw rpcError;
      }

      if (!numerosData || numerosData.length === 0) {
        throw new Error('No se pudieron asignar números. No hay suficientes disponibles.');
      }

      console.log(`✅ ${numerosData.length} números asignados atómicamente`);

      // ✅ FORMATEAR NÚMEROS CON CEROS A LA IZQUIERDA
      const numerosFormateados = numerosData.map(row =>
        formatearNumero(row.numero_asignado, digitosFormato)
      );

      console.log(`🎨 Números formateados: ${numerosFormateados.slice(0, 3).join(', ')}... (${digitosFormato} dígitos)`);

      return numerosFormateados;

    } finally {
      transaccionesProcesando.delete(procesamientoKey);
    }

  } catch (error) {
    console.error('❌ Error asignando números:', error);
    throw error;
  }
};


/**
 * Crear o buscar usuario - ACTUALIZADO CON EMAIL
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

    // ✅ USUARIO NUEVO - Crear y enviar correo de bienvenida
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

    // ✅ ENVIAR CORREO DE BIENVENIDA AL NUEVO USUARIO
    try {
      await enviarCorreoBienvenida(usuario, passwordPlana);
      console.log("📧 Correo de bienvenida enviado exitosamente");
    } catch (emailError) {
      console.error("❌ Error enviando correo de bienvenida:", emailError);
      // No fallar la creación por error de email
    }

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