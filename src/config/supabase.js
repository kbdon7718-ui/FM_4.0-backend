import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

/* LOAD ENV VARIABLES */
dotenv.config();

/* READ ENV */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/* SAFETY CHECK */
if (!supabaseUrl || !supabaseKey) {
  throw new Error("❌ Supabase environment variables missing");
}

/* CREATE CLIENT */
export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
