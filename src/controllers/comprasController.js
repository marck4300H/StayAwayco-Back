import { supabaseAdmin } from "../../supabaseAdminClient.js";

/**
 * Comprar números de una rifa - CORREGIDO CON VALIDACIÓN DE CANTIDAD MÍNIMA
 */
export const comprarNumeros = async (req, res) => {
  const { rifaId } = req.params;
  const { cantidad } = req.body;

  // ✅ VERIFICACIÓN ROBUSTA DEL USUARIO
  if (!req.usuario || !req.usuario.numero_documento) {
    console.error('❌ Usuario no autenticado:', req.usuario);
    return res.status(401).json({ 
      success: false, 
      message: "Usuario no autenticado." 
    });
  }

  const usuario = req.usuario;
  const numeroDocumento = usuario.numero_documento;

  console.log(`🛒 Iniciando compra para usuario ${numeroDocumento}:`, {
    rifaId,
    cantidad,
    usuario: usuario
  });

  // ✅ VALIDACIÓN DE CANTIDAD MÍNIMA (5 números)
  if (!cantidad || cantidad < 5) {
    return res.status(400).json({ 
      success: false, 
      message: "La cantidad mínima es 5 números." 
    });
  }

  // ✅ VALIDACIÓN DE CANTIDAD MÁXIMA (opcional, puedes ajustar)
  if (cantidad > 100) {
    return res.status(400).json({ 
      success: false, 
      message: "La cantidad máxima permitida es 100 números por compra." 
    });
  }

  try {
    // ✅ PRIMERO: Obtener información de la rifa para saber el rango
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

    // ✅ VERIFICAR el rango real de números disponibles
    if (allNumerosDisponibles.length > 0) {
      const numerosMin = Math.min(...allNumerosDisponibles.map(n => n.numero));
      const numerosMax = Math.max(...allNumerosDisponibles.map(n => n.numero));
      console.log(`📊 Rango REAL de números disponibles: ${numerosMin} a ${numerosMax}`);
      console.log(`🎯 Rango ESPERADO de la rifa: 0 a ${rifa.cantidad_numeros - 1}`);
    }

    // ✅ SELECCIÓN VERDADERAMENTE ALEATORIA de TODO el rango disponible
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

    // ✅ Calcular estadísticas de la selección
    const minSeleccionado = Math.min(...numerosParaUsuario);
    const maxSeleccionado = Math.max(...numerosParaUsuario);
    const rangoSeleccionado = maxSeleccionado - minSeleccionado;

    console.log(`🎲 Números seleccionados ALEATORIAMENTE para ${numeroDocumento}:`, {
      cantidad: numerosParaUsuario.length,
      rango: `${minSeleccionado} a ${maxSeleccionado}`,
      amplitud_rango: rangoSeleccionado,
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

    // Marcar como comprados en la tabla 'numeros'
    console.log(`🔐 Marcando ${cantidad} números como comprados por ${numeroDocumento}...`);
    const { error: actualizarError } = await supabaseAdmin
      .from("numeros")
      .update({ comprado_por: numeroDocumento })
      .in("id", numerosIds);

    if (actualizarError) {
      console.error("❌ Error actualizando tabla numeros:", actualizarError);
      throw actualizarError;
    }

    // ✅ Guardar en tabla numeros_usuario CON EL NÚMERO DE DOCUMENTO CORRECTO
    const numerosUsuario = numerosParaUsuario.map((numero) => ({
      numero,
      numero_documento: numeroDocumento, // ✅ Usar la variable correcta
      rifa_id: rifaId,
    }));

    console.log(`💾 Guardando ${numerosUsuario.length} números en numeros_usuario para usuario ${numeroDocumento}`);

    const { error: insertError } = await supabaseAdmin
      .from("numeros_usuario")
      .insert(numerosUsuario);

    if (insertError) {
      console.error("❌ Error insertando en numeros_usuario:", insertError);
      throw insertError;
    }

    console.log(`✅ Compra completada exitosamente para usuario ${numeroDocumento}`);
    console.log(`📈 Resumen: ${cantidad} números aleatorios de "${rifa.titulo}" (0-${rifa.cantidad_numeros - 1})`);

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
 * Obtener números comprados por el usuario - CORREGIDO SIN LÍMITES
 */
export const getComprasPorUsuario = async (req, res) => {
  try {
    const { cedula } = req.params;
    const usuario = req.usuario;

    // ✅ VERIFICAR QUE EL USUARIO SOLO PUEDA VER SUS PROPIAS COMPRAS
    if (usuario.numero_documento !== cedula) {
      return res.status(403).json({ 
        success: false, 
        message: "No tienes permisos para ver estas compras." 
      });
    }

    console.log(`📋 Buscando TODAS las compras para cédula: ${cedula}`);

    // ✅ CONSULTA CORREGIDA - Obtener TODOS los números sin límite
    let allNumerosUsuario = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    // ✅ Obtener datos en lotes para evitar límites de Supabase
    while (hasMore) {
      const { data: batch, error: numerosError } = await supabaseAdmin
        .from("numeros_usuario")
        .select("numero, rifa_id")
        .eq("numero_documento", cedula)
        .order("numero", { ascending: true })
        .range(from, from + batchSize - 1);

      if (numerosError) {
        console.error("❌ Error obteniendo números_usuario:", numerosError);
        throw numerosError;
      }

      if (batch && batch.length > 0) {
        allNumerosUsuario = [...allNumerosUsuario, ...batch];
        from += batchSize;
        console.log(`📦 Lote obtenido: ${batch.length} números. Total acumulado: ${allNumerosUsuario.length}`);
      } else {
        hasMore = false;
      }
    }

    console.log(`📊 TOTAL números encontrados en numeros_usuario:`, allNumerosUsuario.length);

    if (allNumerosUsuario.length === 0) {
      return res.json({ 
        success: true, 
        numeros: [] 
      });
    }

    // ✅ Obtener información de las rifas por separado
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

    console.log(`🎯 RIFAS ENCONTRADAS:`, rifas);

    // ✅ Contar números por rifa ANTES de construir la respuesta
    const conteoPorRifa = {};
    allNumerosUsuario.forEach(item => {
      const rifaInfo = rifaMap[item.rifa_id];
      const tituloRifa = rifaInfo?.titulo || "Rifa no encontrada";
      conteoPorRifa[tituloRifa] = (conteoPorRifa[tituloRifa] || 0) + 1;
    });

    console.log(`🔢 CONTEOS REALES POR RIFA:`, conteoPorRifa);

    // ✅ Construir respuesta CORREGIDA con TODOS los números
    const respuesta = allNumerosUsuario.map((item) => {
      const rifaInfo = rifaMap[item.rifa_id];
      return {
        numero: item.numero,
        rifa_id: item.rifa_id,
        titulo_rifa: rifaInfo?.titulo || "Rifa no encontrada",
        total_numeros_rifa: rifaInfo?.total_numeros || 0
      };
    });

    console.log("✅ RESPUESTA FINAL DE COMPRAS - DATOS REALES:", {
      total_numeros: respuesta.length,
      rifas_unicas: [...new Set(respuesta.map(r => r.titulo_rifa))],
      numeros_por_rifa: conteoPorRifa
    });

    // ✅ Mostrar ejemplos de números por rifa con sus rangos
    Object.keys(conteoPorRifa).forEach(rifa => {
      const numerosDeEstaRifa = respuesta
        .filter(item => item.titulo_rifa === rifa)
        .slice(0, 5)
        .map(item => item.numero);
      const rifaInfo = rifas.find(r => r.titulo === rifa);
      const rangoEsperado = rifaInfo ? `(0-${rifaInfo.cantidad_numeros - 1})` : '';
      
      console.log(`🎯 ${rifa} ${rangoEsperado}: ${conteoPorRifa[rifa]} números (ej: ${numerosDeEstaRifa.join(', ')})`);
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