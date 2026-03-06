// SUPABASE CLIENT CONFIGURATION
// Sostituisci con i tuoi valori da Supabase Dashboard

const SUPABASE_URL = 'https://silbdhelkqeclweswznu.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpbGJkaGVsa3FlY2x3ZXN3em51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDM1NzQsImV4cCI6MjA4NTI3OTU3NH0.pJLp7t5laTJ0qUGv2PmUe0AvIUtrccmDpCUqinG7YVo'

// Crea client Supabase (usa la libreria caricata da CDN)
const { createClient } = supabase
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Export per usarlo in tutto il progetto
window.supabase = supabaseClient

console.log('✅ Supabase client inizializzato')
