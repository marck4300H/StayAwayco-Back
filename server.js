import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import rifasRoutes from "./src/routes/rifas.js";
import numerosRoutes from "./src/routes/numeros.js";
import adminRoutes from "./src/routes/admin.js";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/rifas", rifasRoutes);
app.use("/api/numeros", numerosRoutes);
app.use("/api/admin", adminRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
