// Public browser credentials. Never place a secret or service-role key here.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://grctrllynqgkbbijoozi.supabase.co'
const supabasePublishableKey = 'sb_publishable_rGyGRjKhuaEbpNS1J4obEQ_re3jnPVj'

export const supabase = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)
