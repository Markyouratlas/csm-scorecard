import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file or Vercel project settings.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Implicit flow puts the session in the URL hash, so password-reset / magic
    // links are self-contained and work even when opened on a different device
    // or browser (PKCE would require the original tab's code_verifier).
    flowType: 'implicit',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})
