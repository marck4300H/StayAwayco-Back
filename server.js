import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import rifasRoutes from "./src/routes/rifas.js";
import numerosRoutes from "./src/routes/numeros.js";
import adminRoutes from "./src/routes/admin.js";
import usuariosRoutes from "./src/routes/usuarios.js";
import comprasRoutes from "./src/routes/compras.js";
import pagosRoutes from "./src/routes/pagos.js"; // ✅ NUEVA RUTA

dotenv.config();
const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000", 
  "https://stayaway.com.co",
  "https://www.stayaway.com.co",
  "https://stayaway-front.loca.lt"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.warn("⚠️ CORS bloqueado para:", origin);
        return callback(new Error("CORS no permitido para este dominio"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // ✅ Para webhooks

// ✅ RUTAS
app.use("/api/rifas", rifasRoutes);
app.use("/api/numeros", numerosRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/comprar", comprasRoutes);
app.use("/api/pagos", pagosRoutes); // ✅ NUEVA RUTA

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));