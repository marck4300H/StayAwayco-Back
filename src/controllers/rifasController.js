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

    const { titulo, descripcion } = req.body;
    const archivo = req.file;

    // Validar campos requeridos
    if (!titulo || !descripcion) {
      return res
        .status(400)
        .json({ success: false, message: "Faltan campos obligatorios (título o descripción)." });
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
      console.error("❌ Error al subir imagen a Supabase Storage:", uploadError.message);
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
    const { data, error } = await supabaseAdmin
      .from("rifas")
      .insert([
        {
          titulo, // ✅ ya no usamos "nombre"
          descripcion,
          imagen_url: publicUrl,
        },
      ])
      .select();

    if (error) {
      console.error("❌ Error al insertar rifa en DB:", error.message);
      return res.status(500).json({ success: false, message: error.message });
    }

    console.log("✅ Rifa creada correctamente:", data[0]);
    res.json({
      success: true,
      message: "Rifa creada con éxito",
      rifa: data[0],
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
