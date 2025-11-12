import { supabase } from "./supabaseClient.js";
import bcrypt from "bcryptjs";

const email = "admin@stayaway.com";
const password = "admin112233"; // Contraseña deseada

const run = async () => {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("admins")
      .insert([{ email, password: hashedPassword }]);

    if (error) {
      console.error("Error al crear admin:", error);
    } else {
      console.log("Admin creado exitosamente:", data);
    }
  } catch (err) {
    console.error(err);
  }
};

run();
