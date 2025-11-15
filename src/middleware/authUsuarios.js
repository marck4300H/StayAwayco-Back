import jwt from "jsonwebtoken";

export const verifyUsuarioToken = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  
  console.log("🔐 Verificando token...");
  console.log("📨 Token recibido:", token ? "Sí" : "No");
  console.log("📨 Headers recibidos:", req.headers);

  if (!token) {
    console.error("❌ No se recibió token");
    return res.status(401).json({ 
      error: "Acceso denegado. Token no proporcionado." 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    console.log("✅ Token decodificado correctamente:", decoded);
    
    // ✅ VERIFICACIÓN MÁS FLEXIBLE
    if (!decoded.id && !decoded.numero_documento) {
      console.error("❌ Token no contiene identificador válido");
      return res.status(401).json({ 
        error: "Token inválido: falta identificador de usuario." 
      });
    }
    
    console.log("✅ Usuario autenticado:", decoded.id || decoded.numero_documento);
    req.usuario = decoded;
    next();
  } catch (error) {
    console.error("❌ Error verificando token:", error.message);
    res.status(401).json({ error: "Token inválido o expirado." });
  }
};