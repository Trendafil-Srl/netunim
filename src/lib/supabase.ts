/**
 * Client Supabase per il browser. Usa esclusivamente la anon key:
 * la service_role non deve mai comparire in un bundle frontend.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY sono obbligatorie. Esegui npm run env:check.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
