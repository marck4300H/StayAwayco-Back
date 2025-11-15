import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import rifasRoutes from "./src/routes/rifas.js";
import numerosRoutes from "./src/routes/numeros.js";
import adminRoutes from "./src/routes/admin.js";
import usuariosRoutes from "./src/routes/usuarios.js";
import comprasRoutes from "./src/routes/compras.js"
import pagosRoutes from "./src/routes/pagos.js";

dotenv.config();
const app = express();

const allowedOrigins = [
  "http://localhost:5173", // Vite dev
  "http://localhost:3000", // otro posible dev
  "https://stayaway.com.co", // tu dominio del frontend
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Permite llamadas sin "origin" (como Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("CORS no permitido para este dominio"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

// ✅ AGREGAR RUTA DE PRUEBA DE EPAYCO
app.get("/api/test-epayco", (req, res) => {
  res.json({
    success: true,
    message: "Servidor funcionando",
    epayco: {
      publicKey: process.env.EPAYCO_PUBLIC_KEY ? "✅ Configurada" : "❌ Faltante",
      privateKey: process.env.EPAYCO_PRIVATE_KEY ? "✅ Configurada" : "❌ Faltante",
      environment: process.env.EPAYCO_ENV || "No configurado"
    }
  });
});

app.use("/api/rifas", rifasRoutes);
app.use("/api/numeros", numerosRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/comprar", comprasRoutes);
app.use("/api/pagos", pagosRoutes);
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));