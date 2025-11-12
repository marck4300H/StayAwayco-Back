import jwt from "jsonwebtoken";

export const verificarAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  console.log("🧾 Token recibido:", token);
  console.log("🔑 JWT_SECRET usado en verificación:", process.env.JWT_SECRET);

  if (!token) {
    return res.status(403).json({ success: false, message: "Acceso denegado: token faltante" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    console.log("✅ Token verificado correctamente:", decoded);
    next();
  } catch (err) {
    console.error("❌ Error verificando token:", err.message);
    return res.status(401).json({ success: false, message: "Token inválido o expirado" });
  }
};
