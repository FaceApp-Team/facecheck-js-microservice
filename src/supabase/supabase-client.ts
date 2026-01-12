import { createClient } from '@supabase/supabase-js';
import { configDotenv } from 'dotenv';

configDotenv();
// Prefer env vars; fall back to known project URL for local dev
const urlCandidate =
  process.env.SUPABASE_PROJECT_URL ||
  process.env.SUPABASE_URL ||
  'https://fzfknwytqumdcgnymjoj.supabase.co';

const keyCandidate =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  '';

const supabaseUrl =
  typeof urlCandidate === 'string' ? urlCandidate.trim() : urlCandidate;
const supabaseKey =
  typeof keyCandidate === 'string' ? keyCandidate.trim() : keyCandidate;

if (!supabaseKey) {
  throw new Error(
    'Supabase key missing. Set SUPABASE_SERVICE_ROLE_KEY (server) or SUPABASE_ANON_KEY (client) in .env.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
