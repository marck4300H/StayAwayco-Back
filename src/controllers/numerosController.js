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

    const numerosAGenerar = Array.from(
      { length: parseInt(cantidad_numeros, 10) },
      (_, i) => ({ rifa_id: rifaId, numero: i, comprado_por: null })
    );

    const { error } = await supabaseAdmin.from("numeros").insert(numerosAGenerar);
    if (error) throw error;

    res.json({ success: true, message: "Números generados con éxito" });
  } catch (err) {
    console.error("❌ Error al generar números:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
