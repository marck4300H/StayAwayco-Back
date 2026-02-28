import { supabaseAdmin } from "../../supabaseAdminClient.js";
import { enviarCorreoGanador, enviarCorreoParticipantes } from "../services/emailService.js";

/**
 * ✅ Calcular cantidad de dígitos necesarios según el total de números de la rifa
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

/**
 * 🎲 SORTEAR RIFA - Admin ingresa número ganador
 */
export const sortearRifa = async (req, res) => {
  try {
    const { rifa_id, numero_ganador, loteria_referencia } = req.body;

    console.log("🎲 Solicitud de sorteo recibida:");
    console.log(`   - Rifa ID: ${rifa_id}`);
    console.log(`   - Número ganador: ${numero_ganador}`);
    console.log(`   - Lotería: ${loteria_referencia}`);
    console.log(`   - Admin: ${req.admin.email}`);

    // ✅ VALIDACIONES BÁSICAS
    if (!rifa_id || !numero_ganador) {
      return res.status(400).json({
        success: false,
        message: "Faltan campos obligatorios: rifa_id y numero_ganador"
      });
    }

    // ✅ 1. VERIFICAR QUE LA RIFA EXISTE Y ESTÁ ACTIVA
    const { data: rifa, error: rifaError } = await supabaseAdmin
      .from("rifas")
      .select("*")
      .eq("id", rifa_id)
      .single();

    if (rifaError || !rifa) {
      console.error("❌ Error buscando rifa:", rifaError);
      return res.status(404).json({
        success: false,
        message: "Rifa no encontrada"
      });
    }

    // ✅ VERIFICAR QUE NO ESTÉ YA SORTEADA
    if (rifa.estado === 'sorteada') {
      return res.status(400).json({
        success: false,
        message: `Esta rifa ya fue sorteada el ${new Date(rifa.fecha_sorteo).toLocaleDateString('es-CO')}. Ganador: ${rifa.datos_ganador?.nombre_completo || 'N/A'} (#${rifa.numero_ganador})`
      });
    }

    console.log(`✅ Rifa encontrada: ${rifa.titulo} (${rifa.cantidad_numeros.toLocaleString()} números)`);

    // ✅ 2. NORMALIZAR Y VALIDAR EL NÚMERO GANADOR
    const digitosFormato = calcularDigitos(rifa.cantidad_numeros);
    let numeroGanadorInt;

    try {
      // Eliminar espacios y ceros a la izquierda para convertir a número
      numeroGanadorInt = parseInt(numero_ganador.toString().replace(/\s/g, ''), 10);
      
      if (isNaN(numeroGanadorInt)) {
        throw new Error("Número inválido");
      }

      // Validar rango
      if (numeroGanadorInt < 0 || numeroGanadorInt >= rifa.cantidad_numeros) {
        return res.status(400).json({
          success: false,
          message: `El número ${numero_ganador} no es válido para esta rifa (rango: 0-${(rifa.cantidad_numeros - 1).toLocaleString()})`
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `Formato de número inválido: ${numero_ganador}`
      });
    }

    const numeroFormateado = formatearNumero(numeroGanadorInt, digitosFormato);
    console.log(`🎯 Número ganador procesado: ${numeroGanadorInt} → "${numeroFormateado}"`);

    // ✅ 3. BUSCAR QUIÉN COMPRÓ ESE NÚMERO
    const { data: numeroData, error: numeroError } = await supabaseAdmin
      .from("numeros")
      .select("*")
      .eq("rifa_id", rifa_id)
      .eq("numero", numeroGanadorInt)
      .single();

    if (numeroError) {
      console.error("❌ Error buscando número:", numeroError);
      return res.status(500).json({
        success: false,
        message: "Error interno al buscar el número"
      });
    }

    // ✅ VERIFICAR SI EL NÚMERO FUE VENDIDO
    if (!numeroData.comprado_por || !numeroData.usuario_id) {
      console.log("⚠️ Número no fue vendido");
      return res.status(404).json({
        success: false,
        message: `El número ${numeroFormateado} no fue vendido en esta rifa. No hay ganador para este número.`,
        numero_consultado: numeroFormateado,
        rifa_id: rifa_id
      });
    }

    console.log(`✅ Número vendido a usuario ID: ${numeroData.usuario_id}`);

    // ✅ 4. OBTENER DATOS COMPLETOS DEL GANADOR
    const { data: ganador, error: ganadorError } = await supabaseAdmin
      .from("usuarios")
      .select("*")
      .eq("id", numeroData.usuario_id)
      .single();

    if (ganadorError || !ganador) {
      console.error("❌ Error obteniendo datos del ganador:", ganadorError);
      return res.status(500).json({
        success: false,
        message: "Error obteniendo datos del ganador"
      });
    }

    console.log(`🏆 Ganador identificado: ${ganador.nombres} ${ganador.apellidos}`);

    // ✅ 5. ACTUALIZAR LA RIFA COMO SORTEADA
    const datosGanador = {
      numero: numeroFormateado,
      nombre_completo: `${ganador.nombres} ${ganador.apellidos}`,
      nombres: ganador.nombres,
      apellidos: ganador.apellidos,
      documento: ganador.numero_documento,
      tipo_documento: ganador.tipo_documento,
      correo: ganador.correo_electronico,
      telefono: ganador.telefono,
      ciudad: ganador.ciudad,
      departamento: ganador.departamento
    };

    const { error: updateError } = await supabaseAdmin
      .from("rifas")
      .update({
        estado: 'sorteada',
        fecha_sorteo: new Date().toISOString(),
        numero_ganador: numeroGanadorInt,
        usuario_ganador_id: ganador.id,
        datos_ganador: datosGanador,
        loteria_referencia: loteria_referencia || null
      })
      .eq("id", rifa_id);

    if (updateError) {
      console.error("❌ Error actualizando rifa:", updateError);
      throw updateError;
    }

    console.log("✅ Rifa marcada como sorteada en la base de datos");

    // ✅ 6. OBTENER LISTA DE TODOS LOS PARTICIPANTES
    const { data: participantes, error: participantesError } = await supabaseAdmin
      .from("numeros")
      .select(`
        usuario_id,
        usuarios (
          id,
          nombres,
          apellidos,
          correo_electronico,
          numero_documento
        )
      `)
      .eq("rifa_id", rifa_id)
      .not("usuario_id", "is", null);

    if (participantesError) {
      console.error("⚠️ Error obteniendo participantes:", participantesError);
    }

    // Eliminar duplicados (un usuario puede tener múltiples números)
    const participantesUnicos = participantes?.reduce((acc, curr) => {
      const existe = acc.find(p => p.usuarios?.id === curr.usuarios?.id);
      if (!existe && curr.usuarios) {
        acc.push(curr);
      }
      return acc;
    }, []) || [];

    console.log(`📊 Total participantes únicos: ${participantesUnicos.length}`);

    // ✅ 7. ENVIAR CORREOS (EN SEGUNDO PLANO - NO BLOQUEAR RESPUESTA)
    enviarCorreosPost(ganador, participantesUnicos, rifa, numeroFormateado, loteria_referencia);

    // ✅ 8. RESPUESTA EXITOSA AL FRONTEND
    res.json({
      success: true,
      message: `Rifa sorteada exitosamente. Ganador: ${ganador.nombres} ${ganador.apellidos}`,
      data: {
        rifa: {
          id: rifa.id,
          titulo: rifa.titulo,
          estado: 'sorteada',
          fecha_sorteo: new Date().toISOString()
        },
        ganador: datosGanador,
        loteria_referencia: loteria_referencia || null,
        estadisticas: {
          total_participantes: participantesUnicos.length,
          total_numeros_vendidos: participantes?.length || 0,
          correos_pendientes: participantesUnicos.length + 1 // ganador + participantes
        }
      }
    });

  } catch (error) {
    console.error("❌ Error en sortearRifa:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al sortear la rifa",
      error: error.message
    });
  }
};

/**
 * 📧 Enviar correos en segundo plano (async sin await)
 */
/**
 * 📧 Enviar correos en segundo plano con rate limiting
 * Resend permite 2 requests/segundo, enviamos 1 por segundo para seguridad
 */
const enviarCorreosPost = async (ganador, participantes, rifa, numeroFormateado, loteriaReferencia) => {
  try {
    console.log("📧 Iniciando envío de correos con rate limiting...");
    
    // ✅ Helper para esperar X milisegundos
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    const DELAY_ENTRE_CORREOS = 1000; // 1 segundo entre cada correo
    let correosEnviados = 0;
    let erroresEnvio = 0;

    // 1️⃣ Enviar correo al ganador primero
    try {
      console.log(`📧 [1/${participantes.length + 1}] Enviando correo al ganador: ${ganador.correo_electronico}`);
      await enviarCorreoGanador(ganador, rifa, numeroFormateado, loteriaReferencia);
      correosEnviados++;
      console.log(`✅ Correo al ganador enviado exitosamente`);
    } catch (error) {
      console.error("❌ Error enviando correo al ganador:", error.message);
      erroresEnvio++;
    }

    // Esperar antes de enviar correos a participantes
    await delay(DELAY_ENTRE_CORREOS);

    // 2️⃣ Obtener números de cada participante
    const { data: numerosParticipantes } = await supabaseAdmin
      .from("numeros")
      .select("numero, usuario_id")
      .eq("rifa_id", rifa.id)
      .not("usuario_id", "is", null);

    // Agrupar números por usuario
    const numerosMap = {};
    numerosParticipantes?.forEach(n => {
      if (!numerosMap[n.usuario_id]) {
        numerosMap[n.usuario_id] = [];
      }
      numerosMap[n.usuario_id].push(formatearNumero(n.numero, calcularDigitos(rifa.cantidad_numeros)));
    });

    // 3️⃣ Enviar correos a participantes UNO POR UNO con delay
    const totalParticipantes = participantes.length;
    
    for (let i = 0; i < participantes.length; i++) {
      const participante = participantes[i];
      
      // Saltar al ganador (ya le enviamos correo)
      if (participante.usuarios.id === ganador.id) {
        continue;
      }

      try {
        const numerosUsuario = numerosMap[participante.usuarios.id] || [];
        
        console.log(`📧 [${i + 2}/${totalParticipantes + 1}] Enviando correo a: ${participante.usuarios.correo_electronico}`);
        
        await enviarCorreoParticipantes(
          participante.usuarios,
          rifa,
          numeroFormateado,
          numerosUsuario,
          loteriaReferencia
        );
        
        correosEnviados++;
        console.log(`✅ [${i + 2}/${totalParticipantes + 1}] Correo enviado exitosamente`);
        
      } catch (error) {
        console.error(`❌ Error enviando correo a ${participante.usuarios.correo_electronico}:`, error.message);
        erroresEnvio++;
      }

      // ⏱️ DELAY de 1 segundo entre cada correo (excepto el último)
      if (i < participantes.length - 1) {
        await delay(DELAY_ENTRE_CORREOS);
      }
    }

    // 4️⃣ Resumen final
    console.log("\n📊 ═══════════════════════════════════════");
    console.log("   RESUMEN DE ENVÍO DE CORREOS");
    console.log("═══════════════════════════════════════");
    console.log(`✅ Correos enviados exitosamente: ${correosEnviados}`);
    console.log(`❌ Errores en envío: ${erroresEnvio}`);
    console.log(`📬 Total procesados: ${correosEnviados + erroresEnvio}`);
    console.log(`⏱️  Tiempo estimado: ~${Math.ceil((correosEnviados + erroresEnvio) * (DELAY_ENTRE_CORREOS / 1000))} segundos`);
    console.log("═══════════════════════════════════════\n");

  } catch (error) {
    console.error("❌ Error crítico en envío de correos:", error);
  }
};


/**
 * 🏆 OBTENER GANADOR DE UNA RIFA
 */
export const obtenerGanador = async (req, res) => {
  try {
    const { rifaId } = req.params;

    console.log(`🔍 Consultando ganador de rifa: ${rifaId}`);

    const { data: rifa, error } = await supabaseAdmin
      .from("rifas")
      .select("*")
      .eq("id", rifaId)
      .single();

    if (error || !rifa) {
      return res.status(404).json({
        success: false,
        message: "Rifa no encontrada"
      });
    }

    if (rifa.estado !== 'sorteada') {
      return res.status(400).json({
        success: false,
        message: "Esta rifa aún no ha sido sorteada"
      });
    }

    res.json({
      success: true,
      data: {
        rifa: {
          id: rifa.id,
          titulo: rifa.titulo,
          estado: rifa.estado,
          fecha_sorteo: rifa.fecha_sorteo
        },
        ganador: rifa.datos_ganador,
        numero_ganador: formatearNumero(rifa.numero_ganador, calcularDigitos(rifa.cantidad_numeros)),
        loteria_referencia: rifa.loteria_referencia
      }
    });

  } catch (error) {
    console.error("❌ Error en obtenerGanador:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};
