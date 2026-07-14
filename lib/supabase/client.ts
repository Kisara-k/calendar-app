import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
let client:SupabaseClient|null=null

export const isSupabaseConfigured=Boolean(url&&key)

export function getSupabase(){
  if(!url||!key)throw new Error('Supabase is not configured')
  if(!client)client=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}})
  return client
}
