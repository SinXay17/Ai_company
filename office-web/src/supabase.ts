import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// ຖ້າຂາດຄ່າ ໃຫ້ແຈ້ງຊັດເຈນ ແທນທີ່ຈະໃຫ້ເວັບພັງແບບງຽບໆ
if (!url || !key) {
  throw new Error("ຂາດ VITE_SUPABASE_URL ຫຼື VITE_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(url, key);