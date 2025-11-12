// controllers/numerosController.js
import { supabase } from "../../supabaseClient.js";

// Generar 100,000 números para una rifa
export const generarNumeros = async (req, res) => {
  const { rifaId } = req.params;
  const totalNumeros = 100000;

  try {
    const numeros = Array.from({ length: totalNumeros }, (_, i) => ({
      numero: i + 1,
      estado: "disponible",
      rifa_id: rifaId,
    }));

    const { error } = await supabase.from("numeros").insert(numeros);
    if (error) throw error;

    res.status(201).json({ mensaje: `Se generaron ${totalNumeros} números para la rifa ${rifaId}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obtener todos los números de una rifa
export const obtenerNumerosPorRifa = async (req, res) => {
  const { rifaId } = req.params;

  try {
    const { data, error } = await supabase
      .from("numeros")
      .select("*")
      .eq("rifa_id", rifaId)
      .limit(1000); // límite para no sobrecargar

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
