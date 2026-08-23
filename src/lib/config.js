export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
export const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
