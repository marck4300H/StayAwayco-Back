import { supabaseAdmin } from "../../supabaseAdminClient.js";

/**
 * Comprar números de una rifa
 */
export const comprarNumeros = async (req, res) => {
  const { rifaId } = req.params;
  const { cantidad } = req.body;
  const usuario = req.usuario;

  if (!usuario) {
    return res.status(401).json({ success: false, message: "Usuario no autenticado." });
  }

  if (!cantidad || cantidad < 1) {
    return res.status(400).json({ success: false, message: "La cantidad mínima es 1 número." });
  }

  try {
    // Obtener números disponibles
    const { data: numerosDisponibles, error } = await supabaseAdmin
      .from("numeros")
      .select("*")
      .eq("rifa_id", rifaId)
      .is("comprado_por", null)
      .limit(cantidad);

    if (error) throw error;

    if (!numerosDisponibles || numerosDisponibles.length < cantidad) {
      return res.status(400).json({ success: false, message: "No hay suficientes números disponibles." });
    }

    const numerosIds = numerosDisponibles.map((n) => n.id);
    const numerosSeleccionados = numerosDisponibles.map((n) => n.numero);

    // Marcar como comprados
    const { error: actualizarError } = await supabaseAdmin
      .from("numeros")
      .update({ comprado_por: usuario.numero_documento })
      .in("id", numerosIds);

    if (actualizarError) throw actualizarError;

    // Guardar en tabla numeros_usuario
    const numerosUsuario = numerosSeleccionados.map((numero) => ({
      numero,
      numero_documento: usuario.numero_documento,
      rifa_id: rifaId,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("numeros_usuario")
      .insert(numerosUsuario);

    if (insertError) throw insertError;

    return res.json({
      success: true,
      message: "Compra exitosa",
      numeros: numerosSeleccionados,
    });
  } catch (err) {
    console.error("❌ Error al comprar números:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Obtener números comprados por el usuario - COMPLETAMENTE CORREGIDO
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

    console.log(`📋 Buscando compras para cédula: ${cedula}`);

    // ✅ Obtener números comprados del usuario CON INFORMACIÓN DE RIFAS
    const { data: numeros, error } = await supabaseAdmin
      .from("numeros_usuario")
      .select(`
        numero,
        rifa_id,
        rifas (
          titulo
        )
      `)
      .eq("numero_documento", cedula);

    if (error) {
      console.error("❌ Error en consulta Supabase:", error);
      throw error;
    }

    console.log(`📊 Números encontrados: ${numeros ? numeros.length : 0}`);

    if (!numeros || numeros.length === 0) {
      return res.json({ 
        success: true, 
        numeros: [] 
      });
    }

    // ✅ Construir respuesta simplificada
    const respuesta = numeros.map((n) => ({
      numero: n.numero,
      rifa_id: n.rifa_id,
      titulo_rifa: n.rifas?.titulo || "Rifa no encontrada",
    }));

    console.log("✅ Respuesta de compras enviada:", respuesta.length, "números");

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