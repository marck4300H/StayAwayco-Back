import { supabase } from "../../supabaseClient.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Iniciar sesión
export const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Forzar email en minúsculas
    const { data: admin, error } = await supabase
      .from("admins")
      .select("*")
      .eq("email", email.toLowerCase())
      .single();

    console.log("Body recibido:", req.body);
    console.log("Admin de DB:", admin);

    if (error || !admin) {
      return res.status(401).json({ success: false, message: "Credenciales inválidas" });
    }

    // Comparar password con bcrypt
    const validPassword = await bcrypt.compare(password, admin.password);
    console.log("Comparación bcrypt:", validPassword);

    if (!validPassword) {
      return res.status(401).json({ success: false, message: "Credenciales inválidas" });
    }

    console.log("🔑 JWT_SECRET usado en login:", process.env.JWT_SECRET);
    // Generar token JWT
    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    console.log("✅ Token generado:", token);


    res.json({ success: true, token });
  } catch (err) {
    console.error("Error loginAdmin:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Middleware para verificar token
export const verificarAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(403).json({ success: false, message: "Acceso denegado: token faltante" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Token inválido o expirado" });
  }
};
