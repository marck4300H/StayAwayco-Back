import { supabaseAdmin } from "../../supabaseAdminClient.js";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { validarFechaSorteo } from "../utils/timezoneUtils.js";

const storage = multer.memoryStorage();
export const upload = multer({ storage });

export const crearRifa = async (req, res) => {
  try {
    const {
      titulo,
      descripcion,
      cantidad_numeros,
      precio_unitario,
      cantidad_minima,
      paquetes_promocion,
      fecha_sorteo,
      loteria_referencia,
      // ── Campos legales ──
      numero_resolucion,
      fecha_autorizacion,
      termino_caducidad,
      responsable_nombre,
      responsable_domicilio,
      responsable_id,
      descripcion_premios,
      valor_premios,
      es_pagadero_portador,
    } = req.body;

    // Soporte para multer con campos múltiples (upload.fields) o campo único (upload.single)
    const archivoPortada = req.files?.imagen_url?.[0]        ?? req.file ?? null;
    const archivoBoleta  = req.files?.imagen_boleta_url?.[0] ?? null;

    console.log("📝 Datos recibidos para crear rifa:", {
      titulo, descripcion, cantidad_numeros, precio_unitario, cantidad_minima,
      paquetes_promocion, fecha_sorteo, loteria_referencia,
      numero_resolucion, fecha_autorizacion, termino_caducidad,
      responsable_nombre, responsable_domicilio, responsable_id,
      descripcion_premios, valor_premios, es_pagadero_portador,
      archivoPortada: archivoPortada ? `Sí (${archivoPortada.originalname})` : "No",
      archivoBoleta:  archivoBoleta  ? `Sí (${archivoBoleta.originalname})`  : "No",
    });

    // ── Validaciones obligatorias ──
    if (!titulo || !descripcion || !cantidad_numeros || !precio_unitario || !cantidad_minima) {
      return res.status(400).json({
        success: false,
        message: "Faltan campos obligatorios: título, descripción, cantidad_numeros, precio_unitario, cantidad_minima.",
      });
    }
    if (!archivoPortada) {
      return res.status(400).json({ success: false, message: "Se requiere la imagen de portada (campo: imagen_url)." });
    }

    // ── Validaciones numéricas ──
    const cantidad    = parseInt(cantidad_numeros, 10);
    const precio      = parseInt(precio_unitario,  10);
    const minCantidad = parseInt(cantidad_minima,   10);

    if (cantidad !== 10000 && cantidad !== 100000)
      return res.status(400).json({ success: false, message: "La cantidad de números debe ser 10,000 o 100,000." });
    if (precio < 100)
      return res.status(400).json({ success: false, message: "El precio unitario debe ser al menos $100." });
    if (minCantidad < 1)
      return res.status(400).json({ success: false, message: "La cantidad mínima debe ser al menos 1." });

    // ── Validar valor_premios ──
    let valorPremiosNum = null;
    if (valor_premios !== undefined && valor_premios !== null && valor_premios !== "") {
      valorPremiosNum = parseFloat(valor_premios);
      if (isNaN(valorPremiosNum) || valorPremiosNum < 0)
        return res.status(400).json({ success: false, message: "valor_premios debe ser un número mayor o igual a 0." });
    }

    // ── Validar fecha_autorizacion (solo fecha YYYY-MM-DD) ──
    let fechaAutorizacionVal = null;
    if (fecha_autorizacion) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_autorizacion))
        return res.status(400).json({ success: false, message: "fecha_autorizacion debe tener formato YYYY-MM-DD." });
      fechaAutorizacionVal = fecha_autorizacion;
    }

    // ── Validar fecha_sorteo ──
    const { ok: okFecha, valor: fechaSorteoValidada, mensaje: mensajeFecha } = validarFechaSorteo(fecha_sorteo);
    if (!okFecha) return res.status(400).json({ success: false, message: mensajeFecha });

    // ── Validar paquetes ──
    const { ok: okPaquetes, valor: paquetesValidados, mensaje: mensajePaquetes } = validarPaquetes(paquetes_promocion);
    if (!okPaquetes) return res.status(400).json({ success: false, message: mensajePaquetes });

    // ── Subir imágenes ──
    console.log("📤 Subiendo imagen de portada a Supabase Storage...");
    const imagenUrl = await subirImagen(archivoPortada, "rifas");

    let imagenBoletaUrl = null;
    if (archivoBoleta) {
      console.log("📤 Subiendo imagen de boleta...");
      imagenBoletaUrl = await subirImagen(archivoBoleta, "rifas");
    }

    // ── Insertar rifa ──
    console.log("💾 Creando registro de rifa en la base de datos...");
    const { data: rifaData, error: rifaError } = await supabaseAdmin
      .from("rifas")
      .insert([{
        titulo,
        descripcion,
        cantidad_numeros:      cantidad,
        precio_unitario:       precio,
        cantidad_minima:       minCantidad,
        imagen_url:            imagenUrl,
        paquetes_promocion:    paquetesValidados,
        fecha_sorteo:          fechaSorteoValidada,
        loteria_referencia:    loteria_referencia    || null,
        // ── Campos legales ──
        numero_resolucion:     numero_resolucion     || null,
        fecha_autorizacion:    fechaAutorizacionVal,
        termino_caducidad:     termino_caducidad     || null,
        responsable_nombre:    responsable_nombre    || null,
        responsable_domicilio: responsable_domicilio || null,
        responsable_id:        responsable_id        || null,
        descripcion_premios:   descripcion_premios   || null,
        valor_premios:         valorPremiosNum,
        imagen_boleta_url:     imagenBoletaUrl,
        es_pagadero_portador:  es_pagadero_portador === true || es_pagadero_portador === "true",
      }])
      .select();

    if (rifaError) {
      console.error("❌ Error creando rifa:", rifaError);
      throw rifaError;
    }

    const rifaId = rifaData[0].id;
    console.log(`🎯 Rifa creada con ID: ${rifaId}. Generando ${cantidad} números...`);

    // ── Generar números en lotes de 10,000 ──
    const batchSize = 10000;
    const batches   = Math.ceil(cantidad / batchSize);

    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end   = Math.min(start + batchSize, cantidad);

      const numerosAGenerar = Array.from({ length: end - start }, (_, index) => ({
        rifa_id:      rifaId,
        numero:       start + index,
        comprado_por: null,
      }));

      const { error: numerosError } = await supabaseAdmin
        .from("numeros")
        .insert(numerosAGenerar);

      if (numerosError) {
        console.error(`❌ Error insertando lote ${i + 1}:`, numerosError);
        throw numerosError;
      }

      console.log(`📦 Lote ${i + 1}/${batches} completado: ${numerosAGenerar.length} números`);
    }

    console.log("✅ Rifa y números creados exitosamente");
    res.json({ success: true, message: "Rifa creada con éxito", rifa: rifaData[0] });

  } catch (err) {
    console.error("❌ Error en crearRifa:", err);
    res.status(500).json({ success: false, message: err.message || "Error interno del servidor" });
  }
};

export const listarRifas = async (req, res) => {
  try {
    console.log("📋 Listando todas las rifas...");
    const { data: rifas, error } = await supabaseAdmin
      .from("rifas")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    console.log(`🎯 ${rifas.length} rifas encontradas`);

    const rifasConEstado = await Promise.all(
      rifas.map(async (rifa) => {
        try {
          const { count: disponiblesCount, error: disponiblesError } = await supabaseAdmin
            .from("numeros")
            .select("*", { count: "exact", head: true })
            .eq("rifa_id", rifa.id)
            .is("comprado_por", null);

          if (disponiblesError) {
            console.error(`❌ Error contando disponibles para rifa ${rifa.id}:`, disponiblesError);
            return { 
              ...rifa, 
              disponibles: 0, 
              vendidos: rifa.cantidad_numeros, 
              porcentaje: 100 
            };
          }

          const vendidos = rifa.cantidad_numeros - disponiblesCount;
          const porcentaje = rifa.cantidad_numeros === 0 ? 0 : (vendidos / rifa.cantidad_numeros) * 100;
          
          // ✅ CONSTRUIR RESPUESTA BASE
          const rifaConDatos = { 
            ...rifa, 
            disponibles: disponiblesCount, 
            vendidos, 
            porcentaje: Number(porcentaje.toFixed(2))
          };

          // ✅ INCLUIR paquetes_promocion SOLO SI EXISTEN
          if (rifa.paquetes_promocion && Object.keys(rifa.paquetes_promocion).length > 0) {
            rifaConDatos.paquetes_promocion = rifa.paquetes_promocion;
          } else {
            delete rifaConDatos.paquetes_promocion;
          }

          // ✅ INCLUIR fecha_sorteo SOLO SI EXISTE
          if (rifa.fecha_sorteo) {
            rifaConDatos.fecha_sorteo = rifa.fecha_sorteo;
          } else {
            delete rifaConDatos.fecha_sorteo;
          }

          // ✅ INCLUIR DATOS DEL GANADOR SI LA RIFA ESTÁ SORTEADA
          if (rifa.estado === 'sorteada' && rifa.datos_ganador) {
            rifaConDatos.ganador = {
              nombre_completo: rifa.datos_ganador.nombre_completo,
              numero: rifa.datos_ganador.numero
            };
          }

          return rifaConDatos;
        } catch (err) {
          console.error(`❌ Error procesando rifa ${rifa.id}:`, err);
          return { 
            ...rifa, 
            disponibles: 0, 
            vendidos: rifa.cantidad_numeros, 
            porcentaje: 100 
          };
        }
      })
    );

    res.json({ 
      success: true, 
      rifas: rifasConEstado 
    });
  } catch (err) {
    console.error("❌ Error al listar rifas:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Error interno del servidor" 
    });
  }
};

export const editarRifa = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      titulo,
      descripcion,
      cantidad_numeros,
      precio_unitario,
      cantidad_minima,
      paquetes_promocion,
      fecha_sorteo,
      loteria_referencia,
      // ── Campos legales ──
      numero_resolucion,
      fecha_autorizacion,
      termino_caducidad,
      responsable_nombre,
      responsable_domicilio,
      responsable_id,
      descripcion_premios,
      valor_premios,
      es_pagadero_portador,
    } = req.body;

    const archivoPortada = req.files?.imagen_url?.[0]        ?? req.file ?? null;
    const archivoBoleta  = req.files?.imagen_boleta_url?.[0] ?? null;

    console.log("✏️ Editando rifa:", {
      id, titulo, descripcion, cantidad_numeros, precio_unitario, cantidad_minima,
      paquetes_promocion, fecha_sorteo, loteria_referencia,
      numero_resolucion, fecha_autorizacion, termino_caducidad,
      responsable_nombre, responsable_domicilio, responsable_id,
      descripcion_premios, valor_premios, es_pagadero_portador,
    });

    // ── Validaciones obligatorias ──
    if (!titulo || !descripcion || !cantidad_numeros || !precio_unitario || !cantidad_minima)
      return res.status(400).json({ success: false, message: "Faltan campos obligatorios." });

    const cantidad    = parseInt(cantidad_numeros, 10);
    const precio      = parseInt(precio_unitario,  10);
    const minCantidad = parseInt(cantidad_minima,   10);

    if (cantidad !== 10000 && cantidad !== 100000)
      return res.status(400).json({ success: false, message: "La cantidad de números debe ser 10,000 o 100,000." });
    if (precio < 100)
      return res.status(400).json({ success: false, message: "El precio unitario debe ser al menos $100." });
    if (minCantidad < 1)
      return res.status(400).json({ success: false, message: "La cantidad mínima debe ser al menos 1." });

    // ── Validar valor_premios (undefined = no tocar) ──
    let valorPremiosNum = undefined;
    if (valor_premios !== undefined) {
      if (valor_premios === null || valor_premios === "") {
        valorPremiosNum = null;
      } else {
        valorPremiosNum = parseFloat(valor_premios);
        if (isNaN(valorPremiosNum) || valorPremiosNum < 0)
          return res.status(400).json({ success: false, message: "valor_premios debe ser un número >= 0." });
      }
    }

    // ── Validar fecha_autorizacion ──
    let fechaAutorizacionVal = undefined;
    if (fecha_autorizacion !== undefined) {
      if (!fecha_autorizacion || fecha_autorizacion === "") {
        fechaAutorizacionVal = null;
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_autorizacion))
          return res.status(400).json({ success: false, message: "fecha_autorizacion debe tener formato YYYY-MM-DD." });
        fechaAutorizacionVal = fecha_autorizacion;
      }
    }

    // ── Validar fecha_sorteo ──
    let fechaSorteoValidada = undefined;
    if (fecha_sorteo !== undefined) {
      if (!fecha_sorteo || fecha_sorteo === "") {
        fechaSorteoValidada = null;
      } else {
        const { ok, valor, mensaje } = validarFechaSorteo(fecha_sorteo);
        if (!ok) return res.status(400).json({ success: false, message: mensaje });
        fechaSorteoValidada = valor;
      }
    }

    // ── Validar paquetes ──
    let paquetesValidados = undefined;
    if (paquetes_promocion !== undefined) {
      if (!paquetes_promocion || paquetes_promocion === "") {
        paquetesValidados = null;
      } else {
        const { ok, valor, mensaje } = validarPaquetes(paquetes_promocion);
        if (!ok) return res.status(400).json({ success: false, message: mensaje });
        paquetesValidados = valor;
      }
    }

    // ── Subir nuevas imágenes si se proporcionaron ──
    let nuevaImagenUrl = undefined;
    let nuevaBoletaUrl = undefined;

    if (archivoPortada) {
      console.log("📤 Nueva imagen de portada, subiendo...");
      nuevaImagenUrl = await subirImagen(archivoPortada, "rifas");
    }
    if (archivoBoleta) {
      console.log("📤 Nueva imagen de boleta, subiendo...");
      nuevaBoletaUrl = await subirImagen(archivoBoleta, "rifas");
    }

    // ── Construir objeto de actualización (solo campos presentes en el body) ──
    const updateData = {
      titulo,
      descripcion,
      cantidad_numeros: cantidad,
      precio_unitario:  precio,
      cantidad_minima:  minCantidad,
      // Imágenes (solo si se envió archivo nuevo)
      ...(nuevaImagenUrl !== undefined && { imagen_url:        nuevaImagenUrl }),
      ...(nuevaBoletaUrl !== undefined && { imagen_boleta_url: nuevaBoletaUrl }),
      // Opcionales
      ...(paquetes_promocion  !== undefined && { paquetes_promocion:   paquetesValidados }),
      ...(fechaSorteoValidada !== undefined && { fecha_sorteo:         fechaSorteoValidada }),
      ...(loteria_referencia  !== undefined && { loteria_referencia:   loteria_referencia   || null }),
      // ── Campos legales ──
      ...(numero_resolucion     !== undefined && { numero_resolucion:     numero_resolucion     || null }),
      ...(fechaAutorizacionVal  !== undefined && { fecha_autorizacion:    fechaAutorizacionVal }),
      ...(termino_caducidad     !== undefined && { termino_caducidad:     termino_caducidad     || null }),
      ...(responsable_nombre    !== undefined && { responsable_nombre:    responsable_nombre    || null }),
      ...(responsable_domicilio !== undefined && { responsable_domicilio: responsable_domicilio || null }),
      ...(responsable_id        !== undefined && { responsable_id:        responsable_id        || null }),
      ...(descripcion_premios   !== undefined && { descripcion_premios:   descripcion_premios   || null }),
      ...(valorPremiosNum       !== undefined && { valor_premios:         valorPremiosNum }),
      ...(es_pagadero_portador  !== undefined && { es_pagadero_portador:  es_pagadero_portador === true || es_pagadero_portador === "true" }),
    };

    console.log("💾 Actualizando rifa en la base de datos...");
    const { data, error } = await supabaseAdmin
      .from("rifas")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error) throw error;

    if (!data.length)
      return res.status(404).json({ success: false, message: "Rifa no encontrada" });

    console.log("✅ Rifa actualizada exitosamente");
    res.json({ success: true, message: "Rifa actualizada con éxito", rifa: data[0] });

  } catch (err) {
    console.error("❌ Error en editarRifa:", err);
    res.status(500).json({ success: false, message: err.message || "Error interno del servidor" });
  }
};

// ... (el resto del código permanece igual)
export const eliminarRifa = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🗑️ Eliminando rifa con ID: ${id}`);

    // 1. Obtener información de la rifa
    const { data: rifaData, error: selectError } = await supabaseAdmin
      .from("rifas")
      .select("*")
      .eq("id", id)
      .single();

    if (selectError) throw selectError;

    if (!rifaData) {
      return res.status(404).json({ 
        success: false, 
        message: "Rifa no encontrada" 
      });
    }

    // 2. Eliminar imagen del storage si existe
    if (rifaData.imagen_url) {
      try {
        const urlParts = rifaData.imagen_url.split("/");
        const filename = urlParts[urlParts.length - 1];
        
        console.log("🗑️ Eliminando imagen del storage...");
        const { error: deleteError } = await supabaseAdmin.storage
          .from("rifas")
          .remove([filename]);
        
        if (deleteError) {
          console.warn("⚠️ No se pudo eliminar la imagen del storage:", deleteError.message);
        }
      } catch (storageError) {
        console.warn("⚠️ Error eliminando imagen:", storageError);
      }
    }

    // 3. Eliminar números asociados de la tabla 'numeros'
    console.log("🗑️ Eliminando números asociados...");
    const { error: numerosError } = await supabaseAdmin
      .from("numeros")
      .delete()
      .eq("rifa_id", id);

    if (numerosError) {
      console.error("❌ Error eliminando números:", numerosError);
      throw numerosError;
    }

    // 4. Finalmente eliminar la rifa
    console.log("🗑️ Eliminando registro de la rifa...");
    const { error: deleteRifaError } = await supabaseAdmin
      .from("rifas")
      .delete()
      .eq("id", id);

    if (deleteRifaError) throw deleteRifaError;

    console.log("✅ Rifa y todos sus datos asociados eliminados exitosamente");
    res.json({ 
      success: true, 
      message: "Rifa y todos sus datos asociados eliminados con éxito" 
    });
  } catch (err) {
    console.error("❌ Error en eliminarRifa:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Error interno del servidor" 
    });
  }
};

export const getRifaById = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🔍 Obteniendo rifa por ID: ${id}`);
    const { data: rifa, error: rifaError } = await supabaseAdmin
      .from("rifas")
      .select("*")
      .eq("id", id)
      .single();

    if (rifaError || !rifa) {
      return res.status(404).json({ 
        success: false,
        message: "Rifa no encontrada" 
      });
    }

    const { count: disponiblesCount } = await supabaseAdmin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("rifa_id", id)
      .is("comprado_por", null);

    const vendidos = rifa.cantidad_numeros - disponiblesCount;
    const porcentaje = rifa.cantidad_numeros === 0 ? 0 : (vendidos / rifa.cantidad_numeros) * 100;

    const respuesta = { 
      success: true,
      ...rifa, 
      disponibles: disponiblesCount, 
      vendidos, 
      porcentaje: Number(porcentaje.toFixed(2))
    };

    // ✅ INCLUIR paquetes_promocion SOLO SI EXISTEN
    if (rifa.paquetes_promocion && Object.keys(rifa.paquetes_promocion).length > 0) {
      respuesta.paquetes_promocion = rifa.paquetes_promocion;
    } else {
      delete respuesta.paquetes_promocion;
    }

    // ✅ INCLUIR INFO DEL GANADOR SI ESTÁ SORTEADA
    if (rifa.estado === 'sorteada' && rifa.datos_ganador) {
      respuesta.ganador = rifa.datos_ganador;
      respuesta.loteria_referencia = rifa.loteria_referencia;
      respuesta.fecha_sorteo = rifa.fecha_sorteo;
    }

    res.json(respuesta);
  } catch (err) {
    console.error("🔥 Error interno:", err);
    res.status(500).json({ 
      success: false,
      message: "Error interno del servidor" 
    });
  }
};

/**
 * Validar estructura de los paquetes de promoción
 */
export const validarPaquetes = (paquetes_promocion) => {
  if (!paquetes_promocion || paquetes_promocion === 'null' || paquetes_promocion === 'undefined') {
    return { ok: true, valor: null };
  }
  try {
    const paquetes = typeof paquetes_promocion === 'string' ? JSON.parse(paquetes_promocion) : paquetes_promocion;
    return { ok: true, valor: paquetes };
  } catch(e) {
    return { ok: false, mensaje: "Formato de paquetes de promoción inválido" };
  }
};

/**
 * Subir imagen al bucket público de Supabase
 */
export const subirImagen = async (fileObj, bucketName) => {
  const extension = path.extname(fileObj.originalname);
  const hash = uuidv4();
  const filePath = `${hash}${extension}`;
  
  const { data, error } = await supabaseAdmin.storage
    .from(bucketName)
    .upload(filePath, fileObj.buffer, {
      contentType: fileObj.mimetype,
      upsert: false
    });
    
  if (error) {
    console.error("❌ Error subiendo imagen", error);
    throw new Error("No se pudo subir la imagen al sistema");
  }
  
  const { data: publicUrlData } = supabaseAdmin.storage
    .from(bucketName)
    .getPublicUrl(filePath);
    
  return publicUrlData.publicUrl;
};