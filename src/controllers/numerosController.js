import { supabaseAdmin } from "../../supabaseAdminClient.js";

/**
 * Crear números para una rifa existente (opcional)
 */
export const generarNumeros = async (req, res) => {
  try {
    const { rifaId, cantidad_numeros } = req.body;

    if (!rifaId || !cantidad_numeros) {
      return res.status(400).json({ success: false, message: "Faltan datos." });
    }

    // ✅ VALIDAR QUE LA CANTIDAD SEA 10000 O 100000
    const cantidad = parseInt(cantidad_numeros, 10);
    if (cantidad !== 10000 && cantidad !== 100000) {
      return res.status(400).json({ 
        success: false, 
        message: "La cantidad de números debe ser 10,000 o 100,000." 
      });
    }

    // ✅ GENERAR NÚMEROS FORMATEADOS CORRECTAMENTE
    const numerosAGenerar = Array.from(
      { length: cantidad },
      (_, i) => {
        let numeroFormateado;
        if (cantidad === 10000) {
          // Para 10,000 números: 0000 a 9999 (4 dígitos)
          numeroFormateado = i.toString().padStart(4, '0');
        } else {
          // Para 100,000 números: 00000 a 99999 (5 dígitos)
          numeroFormateado = i.toString().padStart(5, '0');
        }
        
        return { 
          rifa_id: rifaId, 
          numero: numeroFormateado, // ← Guardar como string formateado
          comprado_por: null 
        };
      }
    );

    const { error } = await supabaseAdmin.from("numeros").insert(numerosAGenerar);
    if (error) throw error;

    res.json({ success: true, message: "Números generados con éxito" });
  } catch (err) {
    console.error("❌ Error al generar números:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};