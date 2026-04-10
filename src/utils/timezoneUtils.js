export const parseToColombiaTime = (fechaStr) => {
  if (!fechaStr) return null;
  // Si la fecha ya incluye offset (Z o -05:00 o +...), la respetamos
  if (fechaStr.includes('Z') || /[-+]\d{2}:\d{2}$/.test(fechaStr)) {
    return new Date(fechaStr);
  }
  // Si viene limpia por ejemplo "2026-05-15T15:00", le clavamos el -05:00 de Colombia
  return new Date(`${fechaStr}-05:00`);
};

export const validarFechaSorteo = (fechaStr) => {
  if (!fechaStr) {
    return { ok: false, mensaje: "La fecha del sorteo es requerida" };
  }
  
  const fecha = parseToColombiaTime(fechaStr);
  
  if (isNaN(fecha.getTime())) {
    return { ok: false, mensaje: "La fecha ingresada no es válida" };
  }

  const ahora = new Date(); // En el server esto se basará en process.env.TZ = 'America/Bogota'
  
  if (fecha <= ahora) {
    return { ok: false, mensaje: "La fecha del sorteo debe ser en el futuro" };
  }
  
  return { ok: true, valor: fecha.toISOString() };
};
