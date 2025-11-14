import { supabaseAdmin } from "../../supabaseAdminClient.js";

/**
 * Comprar números de una rifa - CON SELECCIÓN ALEATORIA REAL
 */
export const comprarNumeros = async (req, res) => {
  const { rifaId } = req.params;
  const { cantidad } = req.body;
  const usuario = req.usuario;

  console.log(`🛒 Iniciando compra para usuario ${usuario.numero_documento}:`, {
    rifaId,
    cantidad
  });

  if (!usuario) {
    return res.status(401).json({ success: false, message: "Usuario no autenticado." });
  }

  if (!cantidad || cantidad < 1) {
    return res.status(400).json({ success: false, message: "La cantidad mínima es 1 número." });
  }

  try {
    // ✅ Obtener TODOS los números disponibles para esta rifa
    const { data: todosDisponibles, error: disponiblesError } = await supabaseAdmin
      .from("numeros")
      .select("id, numero")
      .eq("rifa_id", rifaId)
      .is("comprado_por", null);

    if (disponiblesError) throw disponiblesError;

    if (!todosDisponibles || todosDisponibles.length < cantidad) {
      return res.status(400).json({ 
        success: false, 
        message: `No hay suficientes números disponibles. Solo quedan ${todosDisponibles?.length || 0} números.` 
      });
    }

    console.log(`🎯 Números disponibles encontrados: ${todosDisponibles.length}`);

    // ✅ SELECCIÓN VERDADERAMENTE ALEATORIA usando Fisher-Yates shuffle
    const mezclarArray = (array) => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    const numerosMezclados = mezclarArray(todosDisponibles);
    const numerosSeleccionadosAleatorio = numerosMezclados
      .slice(0, cantidad)
      .sort((a, b) => a.numero - b.numero); // Ordenar solo para mostrar al usuario

    const numerosIds = numerosSeleccionadosAleatorio.map((n) => n.id);
    const numerosParaUsuario = numerosSeleccionadosAleatorio.map((n) => n.numero);

    console.log(`🎲 Números seleccionados ALEATORIAMENTE:`, numerosParaUsuario);
    console.log(`📋 IDs de números seleccionados:`, numerosIds);

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
    const { error: actualizarError } = await supabaseAdmin
      .from("numeros")
      .update({ comprado_por: usuario.numero_documento })
      .in("id", numerosIds);

    if (actualizarError) {
      console.error("❌ Error actualizando tabla numeros:", actualizarError);
      throw actualizarError;
    }

    // ✅ Guardar en tabla numeros_usuario
    const numerosUsuario = numerosParaUsuario.map((numero) => ({
      numero,
      numero_documento: usuario.numero_documento,
      rifa_id: rifaId,
    }));

    console.log(`💾 Guardando en numeros_usuario:`, numerosUsuario);

    const { error: insertError } = await supabaseAdmin
      .from("numeros_usuario")
      .insert(numerosUsuario);

    if (insertError) {
      console.error("❌ Error insertando en numeros_usuario:", insertError);
      throw insertError;
    }

    console.log(`✅ Compra completada exitosamente para usuario ${usuario.numero_documento}`);

    return res.json({
      success: true,
      message: `¡Compra exitosa! Has adquirido ${cantidad} números aleatoriamente.`,
      numeros: numerosParaUsuario.sort((a, b) => a - b), // Ordenados para mostrar
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
      .select("id, titulo")
      .in("id", rifaIds);

    if (rifasError) {
      console.error("❌ Error obteniendo rifas:", rifasError);
      throw rifasError;
    }

    // ✅ Crear mapa de rifas para búsqueda rápida
    const rifaMap = {};
    rifas.forEach(rifa => {
      rifaMap[rifa.id] = rifa.titulo;
    });

    console.log(`🎯 RIFAS ENCONTRADAS:`, rifas);

    // ✅ Contar números por rifa ANTES de construir la respuesta
    const conteoPorRifa = {};
    allNumerosUsuario.forEach(item => {
      const tituloRifa = rifaMap[item.rifa_id] || "Rifa no encontrada";
      conteoPorRifa[tituloRifa] = (conteoPorRifa[tituloRifa] || 0) + 1;
    });

    console.log(`🔢 CONTEOS REALES POR RIFA:`, conteoPorRifa);

    // ✅ Construir respuesta CORREGIDA con TODOS los números
    const respuesta = allNumerosUsuario.map((item) => ({
      numero: item.numero,
      rifa_id: item.rifa_id,
      titulo_rifa: rifaMap[item.rifa_id] || "Rifa no encontrada",
    }));

    console.log("✅ RESPUESTA FINAL DE COMPRAS - DATOS REALES:", {
      total_numeros: respuesta.length,
      rifas_unicas: [...new Set(respuesta.map(r => r.titulo_rifa))],
      numeros_por_rifa: conteoPorRifa
    });

    // ✅ Mostrar ejemplos de números por rifa
    Object.keys(conteoPorRifa).forEach(rifa => {
      const numerosDeEstaRifa = respuesta
        .filter(item => item.titulo_rifa === rifa)
        .slice(0, 5)
        .map(item => item.numero);
      console.log(`🎯 ${rifa}: ${conteoPorRifa[rifa]} números (ej: ${numerosDeEstaRifa.join(', ')})`);
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