import { supabaseAdmin } from "../../supabaseAdminClient.js";

/**
 * Comprar números de una rifa - CORREGIDO PARA NUEVA BD
 */
export const comprarNumeros = async (req, res) => {
  const { rifaId } = req.params;
  const { cantidad } = req.body;

  // ✅ VERIFICACIÓN ACTUALIZADA PARA NUEVA BD
  if (!req.usuario || (!req.usuario.id && !req.usuario.numero_documento)) {
    console.error('❌ Usuario no autenticado:', req.usuario);
    return res.status(401).json({ 
      success: false, 
      message: "Usuario no autenticado." 
    });
  }

  const usuario = req.usuario;
  const userId = usuario.id;
  const numeroDocumento = usuario.numero_documento;

  console.log(`🛒 Iniciando compra para usuario:`, {
    userId,
    numeroDocumento,
    rifaId,
    cantidad
  });

  // ✅ VALIDACIÓN DE CANTIDAD MÍNIMA (5 números)
  if (!cantidad || cantidad < 5) {
    return res.status(400).json({ 
      success: false, 
      message: "La cantidad mínima es 5 números." 
    });
  }

  // ✅ VALIDACIÓN DE CANTIDAD MÁXIMA
  if (cantidad > 100) {
    return res.status(400).json({ 
      success: false, 
      message: "La cantidad máxima permitida es 100 números por compra." 
    });
  }

  try {
    // ✅ PRIMERO: Obtener información de la rifa
    const { data: rifa, error: rifaError } = await supabaseAdmin
      .from("rifas")
      .select("id, titulo, cantidad_numeros")
      .eq("id", rifaId)
      .single();

    if (rifaError || !rifa) {
      console.error("❌ Error obteniendo información de la rifa:", rifaError);
      return res.status(404).json({ 
        success: false, 
        message: "Rifa no encontrada." 
      });
    }

    console.log(`📊 Información de la rifa: "${rifa.titulo}" con ${rifa.cantidad_numeros} números (0-${rifa.cantidad_numeros - 1})`);

    // ✅ SEGUNDO: Obtener TODOS los números disponibles para esta rifa
    let allNumerosDisponibles = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    console.log(`🔍 Buscando TODOS los números disponibles para rifa ${rifaId}...`);

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
        console.log(`📦 Lote de números disponibles: ${batch.length}. Total acumulado: ${allNumerosDisponibles.length}`);
      } else {
        hasMore = false;
      }
    }

    console.log(`🎯 TOTAL números disponibles encontrados: ${allNumerosDisponibles.length} de ${rifa.cantidad_numeros} totales`);

    if (allNumerosDisponibles.length < cantidad) {
      return res.status(400).json({ 
        success: false, 
        message: `No hay suficientes números disponibles. Solo quedan ${allNumerosDisponibles.length} números de ${rifa.cantidad_numeros}.` 
      });
    }

    // ✅ SELECCIÓN VERDADERAMENTE ALEATORIA
    const mezclarArray = (array) => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    const numerosMezclados = mezclarArray(allNumerosDisponibles);
    const numerosSeleccionados = numerosMezclados.slice(0, cantidad);

    const numerosIds = numerosSeleccionados.map((n) => n.id);
    const numerosParaUsuario = numerosSeleccionados.map((n) => n.numero).sort((a, b) => a - b);

    // ✅ Calcular estadísticas
    const minSeleccionado = Math.min(...numerosParaUsuario);
    const maxSeleccionado = Math.max(...numerosParaUsuario);

    console.log(`🎲 Números seleccionados ALEATORIAMENTE:`, {
      cantidad: numerosParaUsuario.length,
      rango: `${minSeleccionado} a ${maxSeleccionado}`,
      numeros: numerosParaUsuario
    });

    // ✅ Verificar que no haya duplicados
    const numerosUnicos = [...new Set(numerosParaUsuario)];
    if (numerosUnicos.length !== numerosParaUsuario.length) {
      console.error("❌ ERROR: Se detectaron números duplicados:", numerosParaUsuario);
      return res.status(500).json({ 
        success: false, 
        message: "Error interno: se detectaron números duplicados en la selección." 
      });
    }

    // ✅ OBTENER NUMERO_DOCUMENTO SI NO VIENE EN EL TOKEN (para usuarios nuevos)
    let userDoc = numeroDocumento;
    if (!userDoc && userId) {
      const { data: userData, error: userError } = await supabaseAdmin
        .from("usuarios")
        .select("numero_documento")
        .eq("id", userId)
        .single();
      
      if (userError || !userData) {
        return res.status(404).json({ 
          success: false, 
          message: "Usuario no encontrado." 
        });
      }
      userDoc = userData.numero_documento;
    }

    // ✅ Marcar como comprados en la tabla 'numeros' - ACTUALIZADO
    console.log(`🔐 Marcando ${cantidad} números como comprados...`);
    const { error: actualizarError } = await supabaseAdmin
      .from("numeros")
      .update({ 
        comprado_por: userDoc, // ← Mantener compatibilidad
        usuario_id: userId      // ← NUEVO: guardar relación con id
      })
      .in("id", numerosIds);

    if (actualizarError) {
      console.error("❌ Error actualizando tabla numeros:", actualizarError);
      throw actualizarError;
    }

    // ✅ Guardar en tabla numeros_usuario - ACTUALIZADO
    const numerosUsuario = numerosParaUsuario.map((numero) => ({
      numero,
      numero_documento: userDoc, // ← Mantener compatibilidad
      usuario_id: userId,        // ← NUEVO: guardar relación con id
      rifa_id: rifaId,
    }));

    console.log(`💾 Guardando ${numerosUsuario.length} números en numeros_usuario`);

    const { error: insertError } = await supabaseAdmin
      .from("numeros_usuario")
      .insert(numerosUsuario);

    if (insertError) {
      console.error("❌ Error insertando en numeros_usuario:", insertError);
      throw insertError;
    }

    console.log(`✅ Compra completada exitosamente`);
    console.log(`📈 Resumen: ${cantidad} números aleatorios de "${rifa.titulo}"`);

    return res.json({
      success: true,
      message: `¡Compra exitosa! Has adquirido ${cantidad} números aleatoriamente de "${rifa.titulo}".`,
      numeros: numerosParaUsuario,
      rifa: {
        titulo: rifa.titulo,
        total_numeros: rifa.cantidad_numeros
      }
    });
  } catch (err) {
    console.error("❌ Error al comprar números:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Error interno del servidor durante la compra." 
    });
  }
};

/**
 * Obtener números comprados por el usuario - CORREGIDO PARA NUEVA BD
 */
export const getComprasPorUsuario = async (req, res) => {
  try {
    const usuario = req.usuario;

    // ✅ VERIFICACIÓN ACTUALIZADA
    if (!usuario || (!usuario.id && !usuario.numero_documento)) {
      return res.status(401).json({ 
        success: false, 
        message: "Usuario no autenticado." 
      });
    }

    console.log(`📋 Buscando compras para usuario:`, usuario);

    let allNumerosUsuario = [];
    
    // ✅ BUSCAR POR USUARIO_ID (prioritario para nuevos usuarios)
    if (usuario.id) {
      const { data: byUserId, error: error1 } = await supabaseAdmin
        .from("numeros_usuario")
        .select("numero, rifa_id")
        .eq("usuario_id", usuario.id)
        .order("numero", { ascending: true });

      if (!error1 && byUserId) {
        allNumerosUsuario = byUserId;
        console.log(`📊 Encontrados ${allNumerosUsuario.length} números por usuario_id`);
      }
    }

    // ✅ SI NO ENCONTRÓ POR ID, BUSCAR POR NUMERO_DOCUMENTO (compatibilidad)
    if (allNumerosUsuario.length === 0 && usuario.numero_documento) {
      const { data: byDoc, error: error2 } = await supabaseAdmin
        .from("numeros_usuario")
        .select("numero, rifa_id")
        .eq("numero_documento", usuario.numero_documento)
        .order("numero", { ascending: true });

      if (!error2 && byDoc) {
        allNumerosUsuario = byDoc;
        console.log(`📊 Encontrados ${allNumerosUsuario.length} números por numero_documento`);
      }
    }

    if (allNumerosUsuario.length === 0) {
      return res.json({ 
        success: true, 
        numeros: [] 
      });
    }

    // ✅ Obtener información de las rifas
    const rifaIds = [...new Set(allNumerosUsuario.map(item => item.rifa_id))];
    
    const { data: rifas, error: rifasError } = await supabaseAdmin
      .from("rifas")
      .select("id, titulo, cantidad_numeros")
      .in("id", rifaIds);

    if (rifasError) {
      console.error("❌ Error obteniendo rifas:", rifasError);
      throw rifasError;
    }

    // ✅ Crear mapa de rifas para búsqueda rápida
    const rifaMap = {};
    rifas.forEach(rifa => {
      rifaMap[rifa.id] = {
        titulo: rifa.titulo,
        total_numeros: rifa.cantidad_numeros
      };
    });

    // ✅ Construir respuesta
    const respuesta = allNumerosUsuario.map((item) => {
      const rifaInfo = rifaMap[item.rifa_id];
      return {
        numero: item.numero,
        rifa_id: item.rifa_id,
        titulo_rifa: rifaInfo?.titulo || "Rifa no encontrada",
        total_numeros_rifa: rifaInfo?.total_numeros || 0
      };
    });

    console.log("✅ RESPUESTA FINAL DE COMPRAS:", {
      total_numeros: respuesta.length,
      rifas_unicas: [...new Set(respuesta.map(r => r.titulo_rifa))]
    });

    return res.json({ 
      success: true, 
      numeros: respuesta 
    });

  } catch (err) {
    console.error("❌ Error getComprasPorUsuario:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Error interno del servidor al obtener compras." 
    });
  }
};