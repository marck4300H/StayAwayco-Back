import { supabaseAdmin } from "../../supabaseAdminClient.js";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const storage = multer.memoryStorage();
export const upload = multer({ storage });

export const crearRifa = async (req, res) => {
  try {
    const { titulo, descripcion, cantidad_numeros } = req.body;
    const archivo = req.file;

    if (!titulo || !descripcion || !cantidad_numeros) return res.status(400).json({ success: false, message: "Faltan campos obligatorios." });
    if (!archivo) return res.status(400).json({ success: false, message: "Se requiere una imagen." });

    const extension = path.extname(archivo.originalname);
    const filename = `${uuidv4()}${extension}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("rifas")
      .upload(filename, archivo.buffer, { contentType: archivo.mimetype, upsert: false });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("rifas")
      .getPublicUrl(filename);
    const publicUrl = publicUrlData.publicUrl;

    const { data: rifaData, error: rifaError } = await supabaseAdmin
      .from("rifas")
      .insert([{ titulo, descripcion, cantidad_numeros: parseInt(cantidad_numeros, 10), imagen_url: publicUrl }])
      .select();

    if (rifaError) throw rifaError;

    // Crear números para la rifa
    const numerosAGenerar = Array.from({ length: parseInt(cantidad_numeros, 10) }, (_, i) => ({ rifa_id: rifaData[0].id, numero: i, comprado_por: null }));
    await supabaseAdmin.from("numeros").insert(numerosAGenerar);

    res.json({ success: true, message: "Rifa creada con éxito", rifa: rifaData[0] });
  } catch (err) {
    console.error("❌ Error en crearRifa:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listarRifas = async (req, res) => {
  try {
    const { data: rifas, error } = await supabaseAdmin.from("rifas").select("*").order("created_at", { ascending: false });
    if (error) throw error;

    const rifasConEstado = await Promise.all(rifas.map(async rifa => {
      const { count: disponiblesCount, error: disponiblesError } = await supabaseAdmin
        .from("numeros")
        .select("*", { count: "exact", head: true })
        .eq("rifa_id", rifa.id)
        .is("comprado_por", null);

      if (disponiblesError) return { ...rifa, disponibles: 0, vendidos: rifa.cantidad_numeros, porcentaje: 100 };

      const vendidos = rifa.cantidad_numeros - disponiblesCount;
      const porcentaje = rifa.cantidad_numeros === 0 ? 0 : (vendidos / rifa.cantidad_numeros) * 100;
      return { ...rifa, disponibles: disponiblesCount, vendidos, porcentaje: Number(porcentaje.toFixed(2)) };
    }));

    res.json({ success: true, rifas: rifasConEstado });
  } catch (err) {
    console.error("❌ Error al listar rifas:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Aquí también van editarRifa, eliminarRifa y getRifaById como antes, sin tocar compras.


// Editar rifa
export const editarRifa = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, cantidad_numeros } = req.body;
    const archivo = req.file;

    if (!titulo || !descripcion || !cantidad_numeros) {
      return res.status(400).json({ success: false, message: "Faltan campos obligatorios." });
    }

    let publicUrl;
    if (archivo) {
      const extension = path.extname(archivo.originalname);
      const filename = `${uuidv4()}${extension}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("rifas")
        .upload(filename, archivo.buffer, { contentType: archivo.mimetype, upsert: true });
      if (uploadError) throw uploadError;

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
        ...(publicUrl && { imagen_url: publicUrl })
      })
      .eq("id", id)
      .select();

    if (error) throw error;
    if (!data.length) return res.status(404).json({ success: false, message: "Rifa no encontrada" });

    res.json({ success: true, message: "Rifa actualizada con éxito", rifa: data[0] });
  } catch (err) {
    console.error("❌ Error en editarRifa:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Eliminar rifa + imagen del storage
export const eliminarRifa = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: rifaData, error: selectError } = await supabaseAdmin.from("rifas").select("*").eq("id", id).single();
    if (selectError) throw selectError;

    const urlParts = rifaData.imagen_url.split("/");
    const filename = urlParts[urlParts.length - 1];

    const { error: deleteError } = await supabaseAdmin.storage.from("rifas").remove([filename]);
    if (deleteError) console.warn("⚠️ No se pudo eliminar la imagen del storage:", deleteError.message);

    const { error } = await supabaseAdmin.from("rifas").delete().eq("id", id);
    if (error) throw error;

    res.json({ success: true, message: "Rifa y su imagen eliminadas con éxito" });
  } catch (err) {
    console.error("❌ Error en eliminarRifa:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Obtener rifa por id (opcional)
export const getRifaById = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: rifa, error: rifaError } = await supabaseAdmin.from("rifas").select("*").eq("id", id).single();
    if (rifaError || !rifa) return res.status(404).json({ error: "Rifa no encontrada" });

    const { count: disponiblesCount } = await supabaseAdmin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("rifa_id", id)
      .is("comprado_por", null);

    const vendidos = rifa.cantidad_numeros - disponiblesCount;
    const porcentaje = rifa.cantidad_numeros === 0 ? 0 : (vendidos / rifa.cantidad_numeros) * 100;

    res.json({ ...rifa, disponibles: disponiblesCount, vendidos, porcentaje: Number(porcentaje.toFixed(2)) });
  } catch (err) {
    console.error("🔥 Error interno:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
