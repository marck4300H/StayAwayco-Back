import { supabaseAdmin } from "../../supabaseAdminClient.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Iniciar sesión de administrador
export const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  console.log("🔐 Intentando login de administrador:", { email });

  if (!email || !password) {
    return res.status(400).json({ 
      success: false, 
      message: "Email y contraseña son requeridos" 
    });
  }

  try {
    // Forzar email en minúsculas
    const emailLower = email.toLowerCase();
    
    const { data: admin, error } = await supabaseAdmin
      .from("admins")
      .select("*")
      .eq("email", emailLower)
      .single();

    console.log("📊 Admin encontrado en BD:", admin ? "Sí" : "No");

    if (error || !admin) {
      console.log("❌ Admin no encontrado o error:", error);
      return res.status(401).json({ 
        success: false, 
        message: "Credenciales inválidas" 
      });
    }

    // Comparar password con bcrypt
    const validPassword = await bcrypt.compare(password, admin.password);
    console.log("🔑 Comparación de contraseña:", validPassword);

    if (!validPassword) {
      console.log("❌ Contraseña incorrecta");
      return res.status(401).json({ 
        success: false, 
        message: "Credenciales inválidas" 
      });
    }

    console.log("🔑 JWT_SECRET usado en login:", process.env.JWT_SECRET);
    
    // Generar token JWT para administrador
    const token = jwt.sign(
      { 
        id: admin.id, 
        email: admin.email,
        userType: "admin" // ✅ Identificar como administrador
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    
    console.log("✅ Token de administrador generado");

    res.json({ 
      success: true, 
      token,
      userType: "admin",
      message: "Login de administrador exitoso"
    });
  } catch (err) {
    console.error("❌ Error en loginAdmin:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error interno del servidor" 
    });
  }
};

// Middleware para verificar token de administrador
export const verificarAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  console.log("🧾 Verificando token de administrador...");

  if (!token) {
    return res.status(403).json({ 
      success: false, 
      message: "Acceso denegado: token faltante" 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ✅ Verificar que sea un administrador
    if (decoded.userType !== "admin") {
      return res.status(403).json({ 
        success: false, 
        message: "Acceso denegado: se requiere permisos de administrador" 
      });
    }
    
    req.admin = decoded;
    console.log("✅ Token de administrador verificado correctamente:", decoded.email);
    next();
  } catch (err) {
    console.error("❌ Error verificando token de admin:", err.message);
    return res.status(401).json({ 
      success: false, 
      message: "Token inválido o expirado" 
    });
  }
};