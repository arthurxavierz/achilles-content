import { createClient } from '@supabase/supabase-js'
import { DEMO_MODE, SUPABASE_KEY, SUPABASE_URL } from './config'

export const supabase = DEMO_MODE ? null : createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})
