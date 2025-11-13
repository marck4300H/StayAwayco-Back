import { supabaseAdmin } from "../../supabaseAdminClient.js";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// ⚙️ Configuración de multer (almacenar en memoria)
const storage = multer.memoryStorage();
export const upload = multer({ storage });

// 🧱 Crear rifa
export const crearRifa = async (req, res) => {
  try {
    console.log("📩 Body recibido:", req.body);
    console.log("🖼️ Archivo recibido:", req.file);

    const { titulo, descripcion, cantidad_numeros } = req.body;
    const archivo = req.file;

    // Validar campos requeridos
    if (!titulo || !descripcion || !cantidad_numeros) {
      return res.status(400).json({
        success: false,
        message:
          "Faltan campos obligatorios (título, descripción o cantidad de números).",
      });
    }

    if (!archivo) {
      return res
        .status(400)
        .json({ success: false, message: "Se requiere una imagen." });
    }

    // 🔑 Generar nombre único para la imagen
    const extension = path.extname(archivo.originalname);
    const filename = `${uuidv4()}${extension}`;

    // 🪣 Subir imagen a Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("rifas")
      .upload(filename, archivo.buffer, {
        contentType: archivo.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error(
        "❌ Error al subir imagen a Supabase Storage:",
        uploadError.message
      );
      return res
        .status(500)
        .json({ success: false, message: uploadError.message });
    }

    console.log("✅ Imagen subida correctamente:", uploadData);

    // 🌐 Obtener URL pública de la imagen
    const { data: publicUrlData } = supabaseAdmin.storage
      .from("rifas")
      .getPublicUrl(filename);

    const publicUrl = publicUrlData.publicUrl;

    // 💾 Guardar la rifa en la base de datos
    const { data: rifaData, error: rifaError } = await supabaseAdmin
      .from("rifas")
      .insert([
        {
          titulo,
          descripcion,
          cantidad_numeros: parseInt(cantidad_numeros, 10),
          imagen_url: publicUrl,
        },
      ])
      .select();

    if (rifaError) {
      console.error("❌ Error al insertar rifa en DB:", rifaError.message);
      return res.status(500).json({ success: false, message: rifaError.message });
    }

    const nuevaRifa = rifaData[0];
    console.log("✅ Rifa creada correctamente:", nuevaRifa);

    // 🧮 Generar arrays de números y guardarlos
    const totalNumeros = parseInt(nuevaRifa.cantidad_numeros);
    const cantidadArrays = 10;
    const numerosPorArray = Math.floor(totalNumeros / cantidadArrays);
    const digitos = totalNumeros <= 9999 ? 4 : 5;

    for (let i = 0; i < cantidadArrays; i++) {
      const inicio = i * numerosPorArray;
      const fin = i === cantidadArrays - 1 ? totalNumeros : inicio + numerosPorArray;

      const bloque = [];
      for (let j = inicio; j < fin; j++) {
        bloque.push(j.toString().padStart(digitos, "0"));
      }

      const { error: insertError } = await supabaseAdmin
        .from("numeros")
        .insert([
          {
            numeros_array: bloque,
            indice_array: i,
            rifa_id: nuevaRifa.id,
          },
        ]);

      if (insertError) {
        console.error(`❌ Error insertando bloque ${i}:`, insertError.message);
      } else {
        console.log(`✅ Bloque ${i + 1} insertado (${bloque.length} números)`);
      }
    }

    res.json({
      success: true,
      message: "Rifa creada con éxito y números generados automáticamente.",
      rifa: nuevaRifa,
    });
  } catch (err) {
    console.error("⚠️ Error inesperado en crearRifa:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 📋 Listar todas las rifas
export const listarRifas = async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("rifas")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ success: true, rifas: data });
  } catch (err) {
    console.error("❌ Error al listar rifas:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✏️ Editar rifa
export const editarRifa = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, cantidad_numeros } = req.body;
    const archivo = req.file;

    if (!titulo || !descripcion || !cantidad_numeros) {
      return res
        .status(400)
        .json({ success: false, message: "Faltan campos obligatorios." });
    }

    let publicUrl;
    if (archivo) {
      const extension = path.extname(archivo.originalname);
      const filename = `${uuidv4()}${extension}`;
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from("rifas")
        .upload(filename, archivo.buffer, {
          contentType: archivo.mimetype,
          upsert: true,
        });

      if (uploadError)
        return res
          .status(500)
          .json({ success: false, message: uploadError.message });

      const { data: publicUrlData } = supabaseAdmin.storage
        .from("rifas")
        .getPublicUrl(filename);

      publicUrl = publicUrlData.publicUrl;
    }

    const { data, error } = await supabaseAdmin
      .from("rifas")
      .update({
        titulo,
        descripcion,
        cantidad_numeros: parseInt(cantidad_numeros, 10),
        ...(publicUrl && { imagen_url: publicUrl }),
      })
      .eq("id", id)
      .select();

    if (error)
      return res.status(500).json({ success: false, message: error.message });

    if (!data.length)
      return res
        .status(404)
        .json({ success: false, message: "Rifa no encontrada" });

    res.json({
      success: true,
      message: "Rifa actualizada con éxito",
      rifa: data[0],
    });
  } catch (err) {
    console.error("❌ Error en editarRifa:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 🗑️ Eliminar rifa + imagen del storage
export const eliminarRifa = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: rifaData, error: selectError } = await supabaseAdmin
      .from("rifas")
      .select("*")
      .eq("id", id)
      .single();

    if (selectError)
      return res
        .status(500)
        .json({ success: false, message: selectError.message });

    if (!rifaData)
      return res
        .status(404)
        .json({ success: false, message: "Rifa no encontrada" });

    const urlParts = rifaData.imagen_url.split("/");
    const filename = urlParts[urlParts.length - 1];

    const { error: deleteError } = await supabaseAdmin.storage
      .from("rifas")
      .remove([filename]);

    if (deleteError)
      console.warn(
        "⚠️ No se pudo eliminar la imagen del storage:",
        deleteError.message
      );

    const { error } = await supabaseAdmin.from("rifas").delete().eq("id", id);

    if (error)
      return res.status(500).json({ success: false, message: error.message });

    res.json({
      success: true,
      message: "Rifa y su imagen eliminadas con éxito",
    });
  } catch (err) {
    console.error("❌ Error en eliminarRifa:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 🧮 Obtener porcentaje, disponibles y vendidos
export const getRifaById = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Obtener rifa
    const { data: rifa, error: rifaError } = await supabaseAdmin
      .from("rifas")
      .select("*")
      .eq("id", id)
      .single();

    if (rifaError || !rifa) {
      return res.status(404).json({ error: "Rifa no encontrada" });
    }

    // 2️⃣ Obtener bloques SIN mover la variable (aquí estaba tu error)
    const { data: bloques, error: bloquesError } = await supabaseAdmin
      .from("numeros")
      .select("numeros_array")
      .eq("rifa_id", id);

    if (bloquesError) {
      console.log("📛 Error obteniendo bloques:", bloquesError);
      return res.status(500).json({ error: "Error obteniendo bloques" });
    }

    if (!bloques || bloques.length === 0) {
      return res.json({
        ...rifa,
        disponibles: 0,
        vendidos: rifa.cantidad_numeros,
        porcentaje: 100
      });
    }

    // 3️⃣ Calcular TOTAL disponibles (sumar longitudes)
    let disponibles = 0;

    for (const bloque of bloques) {
      if (Array.isArray(bloque.numeros_array)) {
        disponibles += bloque.numeros_array.length;
      }
    }

    // 4️⃣ Cálculo de vendidos
    const total = rifa.cantidad_numeros;
    const vendidos = total - disponibles;

    // 5️⃣ Porcentaje
    const porcentaje = total === 0 ? 0 : (vendidos / total) * 100;

    // 6️⃣ Respuesta final
    return res.json({
      ...rifa,
      disponibles,
      vendidos,
      porcentaje: Number(porcentaje.toFixed(2)),
    });

  } catch (err) {
    console.error("🔥 Error interno:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};
