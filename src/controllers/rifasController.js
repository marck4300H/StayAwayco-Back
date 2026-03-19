import { supabaseAdmin } from "../../supabaseAdminClient.js";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";

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
      fecha_sorteo // ← NUEVO
    } = req.body;
    
    const archivo = req.file;

    console.log("📝 Datos recibidos para crear rifa:", {
      titulo,
      descripcion,
      cantidad_numeros,
      precio_unitario,
      cantidad_minima,
      paquetes_promocion,
      fecha_sorteo,
      archivo: archivo ? `Sí (${archivo.originalname})` : 'No'
    });

    if (!titulo || !descripcion || !cantidad_numeros || !precio_unitario || !cantidad_minima) {
      return res.status(400).json({ 
        success: false, 
        message: "Faltan campos obligatorios: título, descripción, cantidad de números, precio unitario o cantidad mínima." 
      });
    }
    if (!archivo) {
      return res.status(400).json({ 
        success: false, 
        message: "Se requiere una imagen." 
      });
    }

    // ✅ VALIDAR QUE LA CANTIDAD SEA 10000 O 100000
    const cantidad = parseInt(cantidad_numeros, 10);
    if (cantidad !== 10000 && cantidad !== 100000) {
      return res.status(400).json({ 
        success: false, 
        message: "La cantidad de números debe ser 10,000 o 100,000." 
      });
    }

    // ✅ VALIDAR PRECIO UNITARIO Y CANTIDAD MÍNIMA
    const precio = parseInt(precio_unitario, 10);
    const minCantidad = parseInt(cantidad_minima, 10);
    
    if (precio < 100) {
      return res.status(400).json({ 
        success: false, 
        message: "El precio unitario debe ser al menos $100." 
      });
    }

    if (minCantidad < 1) {
      return res.status(400).json({ 
        success: false, 
        message: "La cantidad mínima debe ser al menos 1." 
      });
    }

    // ✅ VALIDAR FECHA DE SORTEO (OPCIONAL)
    let fechaSorteoValidada = null;
    if (fecha_sorteo) {
      const fecha = new Date(fecha_sorteo);
      if (isNaN(fecha.getTime())) {
        return res.status(400).json({ 
          success: false, 
          message: "La fecha de sorteo no es válida. Usa formato ISO 8601 (ej: 2026-04-15T20:00:00Z)." 
        });
      }
      if (fecha <= new Date()) {
        return res.status(400).json({ 
          success: false, 
          message: "La fecha de sorteo debe ser una fecha futura." 
        });
      }
      fechaSorteoValidada = fecha.toISOString();
      console.log("📅 Fecha de sorteo validada:", fechaSorteoValidada);
    }

    // ✅ VALIDAR PAQUETES DE PROMOCIÓN (SI SE PROPORCIONAN)
    let paquetesValidados = null;
    if (paquetes_promocion) {
      try {
        const paquetes = typeof paquetes_promocion === 'string' 
          ? JSON.parse(paquetes_promocion) 
          : paquetes_promocion;

        ['paquete1', 'paquete2', 'paquete3'].forEach((key, index) => {
          const paquete = paquetes[key];
          if (paquete) {
            if (!paquete.cantidad_compra || !Number.isInteger(paquete.cantidad_compra) || paquete.cantidad_compra < 1) {
              throw new Error(`Paquete ${index + 1}: cantidad_compra debe ser un número entero mayor a 0`);
            }
            if (paquete.numeros_gratis === undefined || !Number.isInteger(paquete.numeros_gratis) || paquete.numeros_gratis < 0) {
              throw new Error(`Paquete ${index + 1}: numeros_gratis debe ser un número entero mayor o igual a 0`);
            }
          }
        });

        paquetesValidados = paquetes;
        console.log("✅ Paquetes de promoción validados:", paquetesValidados);
      } catch (error) {
        return res.status(400).json({ 
          success: false, 
          message: `Error en paquetes_promocion: ${error.message}` 
        });
      }
    }

    const extension = path.extname(archivo.originalname);
    const filename = `${uuidv4()}${extension}`;

    console.log("📤 Subiendo imagen a Supabase Storage...");
    const { error: uploadError } = await supabaseAdmin.storage
      .from("rifas")
      .upload(filename, archivo.buffer, { 
        contentType: archivo.mimetype, 
        upsert: false 
      });
    
    if (uploadError) {
      console.error("❌ Error subiendo imagen:", uploadError);
      throw uploadError;
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("rifas")
      .getPublicUrl(filename);
    const publicUrl = publicUrlData.publicUrl;

    console.log("💾 Creando registro de rifa en la base de datos...");
    const { data: rifaData, error: rifaError } = await supabaseAdmin
      .from("rifas")
      .insert([{ 
        titulo, 
        descripcion, 
        cantidad_numeros: cantidad, 
        precio_unitario: precio,
        cantidad_minima: minCantidad,
        imagen_url: publicUrl,
        paquetes_promocion: paquetesValidados,
        fecha_sorteo: fechaSorteoValidada // ← NUEVO
      }])
      .select();

    if (rifaError) {
      console.error("❌ Error creando rifa:", rifaError);
      throw rifaError;
    }

    const rifaId = rifaData[0].id;
    console.log(`🎯 Rifa creada con ID: ${rifaId}. Generando ${cantidad} números...`);

    // ✅ GENERAR NÚMEROS
    const totalNumeros = cantidad;
    const batchSize = 10000;
    const batches = Math.ceil(totalNumeros / batchSize);

    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, totalNumeros);
      
      const numerosAGenerar = Array.from({ length: end - start }, (_, index) => {
        const numeroBase = start + index;
        const numeroFormateado = cantidad === 10000
          ? numeroBase.toString().padStart(4, '0')
          : numeroBase.toString().padStart(5, '0');
        
        return {
          rifa_id: rifaId,
          numero: numeroFormateado,
          comprado_por: null
        };
      });

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
    res.json({ 
      success: true, 
      message: "Rifa creada con éxito", 
      rifa: rifaData[0] 
    });
  } catch (err) {
    console.error("❌ Error en crearRifa:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Error interno del servidor" 
    });
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
      fecha_sorteo // ← NUEVO
    } = req.body;
    
    const archivo = req.file;

    console.log("✏️ Editando rifa:", { 
      id, titulo, descripcion, 
      cantidad_numeros, precio_unitario, 
      cantidad_minima, paquetes_promocion, fecha_sorteo
    });

    if (!titulo || !descripcion || !cantidad_numeros || !precio_unitario || !cantidad_minima) {
      return res.status(400).json({ 
        success: false, 
        message: "Faltan campos obligatorios." 
      });
    }

    // ✅ VALIDAR QUE LA CANTIDAD SEA 10000 O 100000
    const cantidad = parseInt(cantidad_numeros, 10);
    if (cantidad !== 10000 && cantidad !== 100000) {
      return res.status(400).json({ 
        success: false, 
        message: "La cantidad de números debe ser 10,000 o 100,000." 
      });
    }

    // ✅ VALIDAR PRECIO UNITARIO Y CANTIDAD MÍNIMA
    const precio = parseInt(precio_unitario, 10);
    const minCantidad = parseInt(cantidad_minima, 10);
    
    if (precio < 100) {
      return res.status(400).json({ 
        success: false, 
        message: "El precio unitario debe ser al menos $100." 
      });
    }

    if (minCantidad < 1) {
      return res.status(400).json({ 
        success: false, 
        message: "La cantidad mínima debe ser al menos 1." 
      });
    }

    // ✅ VALIDAR FECHA DE SORTEO (OPCIONAL)
    let fechaSorteoValidada = undefined; // undefined = no tocar el campo en BD
    if (fecha_sorteo !== undefined) {
      if (fecha_sorteo === null || fecha_sorteo === '') {
        // Permitir borrar la fecha enviando null o string vacío
        fechaSorteoValidada = null;
      } else {
        const fecha = new Date(fecha_sorteo);
        if (isNaN(fecha.getTime())) {
          return res.status(400).json({ 
            success: false, 
            message: "La fecha de sorteo no es válida. Usa formato ISO 8601 (ej: 2026-04-15T20:00:00Z)." 
          });
        }
        if (fecha <= new Date()) {
          return res.status(400).json({ 
            success: false, 
            message: "La fecha de sorteo debe ser una fecha futura." 
          });
        }
        fechaSorteoValidada = fecha.toISOString();
        console.log("📅 Fecha de sorteo validada:", fechaSorteoValidada);
      }
    }

    // ✅ VALIDAR PAQUETES DE PROMOCIÓN (SI SE PROPORCIONAN)
    let paquetesValidados = null;
    if (paquetes_promocion !== undefined) {
      if (paquetes_promocion === null || paquetes_promocion === '') {
        paquetesValidados = null;
      } else {
        try {
          const paquetes = typeof paquetes_promocion === 'string' 
            ? JSON.parse(paquetes_promocion) 
            : paquetes_promocion;

          ['paquete1', 'paquete2', 'paquete3'].forEach((key, index) => {
            const paquete = paquetes[key];
            if (paquete) {
              if (!paquete.cantidad_compra || !Number.isInteger(paquete.cantidad_compra) || paquete.cantidad_compra < 1) {
                throw new Error(`Paquete ${index + 1}: cantidad_compra debe ser un número entero mayor a 0`);
              }
              if (paquete.numeros_gratis === undefined || !Number.isInteger(paquete.numeros_gratis) || paquete.numeros_gratis < 0) {
                throw new Error(`Paquete ${index + 1}: numeros_gratis debe ser un número entero mayor o igual a 0`);
              }
            }
          });

          paquetesValidados = paquetes;
          console.log("✅ Paquetes de promoción validados:", paquetesValidados);
        } catch (error) {
          return res.status(400).json({ 
            success: false, 
            message: `Error en paquetes_promocion: ${error.message}` 
          });
        }
      }
    }

    let publicUrl;
    if (archivo) {
      console.log("📤 Nueva imagen proporcionada, subiendo...");
      const extension = path.extname(archivo.originalname);
      const filename = `${uuidv4()}${extension}`;
      
      const { error: uploadError } = await supabaseAdmin.storage
        .from("rifas")
        .upload(filename, archivo.buffer, { 
          contentType: archivo.mimetype, 
          upsert: true 
        });
      
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabaseAdmin.storage
        .from("rifas")
        .getPublicUrl(filename);
      publicUrl = publicUrlData.publicUrl;
    }

    const updateData = {
      titulo,
      descripcion,
      cantidad_numeros: cantidad,
      precio_unitario: precio,
      cantidad_minima: minCantidad,
      ...(publicUrl && { imagen_url: publicUrl }),
      ...(paquetes_promocion !== undefined && { paquetes_promocion: paquetesValidados }),
      ...(fechaSorteoValidada !== undefined && { fecha_sorteo: fechaSorteoValidada }) // ← NUEVO
    };

    console.log("💾 Actualizando rifa en la base de datos...");
    const { data, error } = await supabaseAdmin
      .from("rifas")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error) throw error;
    
    if (!data.length) {
      return res.status(404).json({ 
        success: false, 
        message: "Rifa no encontrada" 
      });
    }

    console.log("✅ Rifa actualizada exitosamente");
    res.json({ 
      success: true, 
      message: "Rifa actualizada con éxito", 
      rifa: data[0] 
    });
  } catch (err) {
    console.error("❌ Error en editarRifa:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Error interno del servidor" 
    });
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

    // 4. Eliminar números asociados de la tabla 'numeros_usuario'
    console.log("🗑️ Eliminando números comprados por usuarios...");
    const { error: numerosUsuarioError } = await supabaseAdmin
      .from("numeros_usuario")
      .delete()
      .eq("rifa_id", id);

    if (numerosUsuarioError) {
      console.error("❌ Error eliminando números_usuario:", numerosUsuarioError);
      throw numerosUsuarioError;
    }

    // 5. Finalmente eliminar la rifa
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