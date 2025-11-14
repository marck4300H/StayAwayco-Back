// controllers/comprasController.js
import { supabase } from "../../supabaseClient.js";

export const comprarNumeros = async (req, res) => {
  const { rifaId } = req.params;
  const { cantidad } = req.body;
  const usuario = req.usuario; // viene del middleware verifyUsuarioToken

  if (!usuario) {
    return res.status(401).json({ error: "Usuario no autenticado." });
  }

  if (!cantidad || cantidad < 5) {
    return res.status(400).json({ error: "La cantidad mínima es 5 números." });
  }

  try {
    // 1️⃣ Obtener arrays de la rifa
    const { data: arraysNumeros, error: errorArrays } = await supabase
      .from("numeros")
      .select("*")
      .eq("rifa_id", rifaId);

    if (errorArrays) throw errorArrays;
    if (!arraysNumeros || arraysNumeros.length === 0) {
      return res.status(400).json({ error: "No hay números disponibles." });
    }

    // 2️⃣ Obtener datos completos del usuario
    const { data: usuarioCompleto, error: errorUsuario } = await supabase
      .from("usuarios")
      .select("*")
      .eq("numero_documento", usuario.numero_documento)
      .single();

    if (errorUsuario || !usuarioCompleto) {
      return res.status(400).json({ error: "Usuario no encontrado." });
    }

    const numerosSeleccionados = [];
    const arraysMap = new Map();

    // Inicializar arraysMap con copia de numeros_array
    arraysNumeros.forEach(arr => arraysMap.set(arr.id, [...arr.numeros_array]));

    // 3️⃣ Selección de números aleatoria
    for (let i = 0; i < cantidad; i++) {
      // Filtrar arrays que aún tengan números
      const arraysDisponibles = Array.from(arraysMap.entries()).filter(
        ([id, numerosArr]) => numerosArr.length > 0
      );

      if (arraysDisponibles.length === 0) {
        return res.status(400).json({ error: "No hay suficientes números disponibles." });
      }

      // Elegir array al azar
      const randomArrayIdx = Math.floor(Math.random() * arraysDisponibles.length);
      const [arrayId, numerosArray] = arraysDisponibles[randomArrayIdx];

      // Elegir número al azar dentro del array
      const randomNumeroIdx = Math.floor(Math.random() * numerosArray.length);
      const numero = numerosArray[randomNumeroIdx];

      // Guardarlo en seleccionados
      numerosSeleccionados.push(numero);

      // Eliminar número del array
      numerosArray.splice(randomNumeroIdx, 1);

      // Actualizar mapa
      arraysMap.set(arrayId, numerosArray);
    }

    // 4️⃣ Actualizar DB una sola vez por cada array modificado
    for (const [id, numerosArray] of arraysMap.entries()) {
      await supabase
        .from("numeros")
        .update({ numeros_array: numerosArray })
        .eq("id", id);
    }

    // 5️⃣ Actualizar numeros_comprados del usuario correctamente
    const numerosCompradosUsuario = usuarioCompleto.numeros_comprados || [];

    // Agregar los números seleccionados uno a uno
    const numerosActualizados = [...numerosCompradosUsuario, ...numerosSeleccionados];

    // Guardar en la base de datos
    const { error: errorUser } = await supabase
      .from("usuarios")
      .update({ numeros_comprados: numerosActualizados })
      .eq("numero_documento", usuario.numero_documento);

    if (errorUser) throw errorUser;

    res.status(200).json({
      mensaje: "Compra exitosa",
      numeros: numerosSeleccionados,
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
