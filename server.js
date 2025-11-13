import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import rifasRoutes from "./src/routes/rifas.js";
import numerosRoutes from "./src/routes/numeros.js";
import adminRoutes from "./src/routes/admin.js";
import usuariosRoutes from "./src/routes/usuarios.js";


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

app.use("/api/rifas", rifasRoutes);
app.use("/api/numeros", numerosRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/usuarios", usuariosRoutes);



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
