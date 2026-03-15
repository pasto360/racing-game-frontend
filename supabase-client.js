// ===== SUPABASE CLIENT CONFIGURATION =====
// Configurazione client Supabase per browser

const SUPABASE_URL = 'https://okzbbfbsmacwjynlrbbn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9remJiZmJzbWFjd2p5bmxyYmJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTMyNDUsImV4cCI6MjA1NDE2OTI0NX0.KZvnIjcb0lUYkVN6SHj10rXnzzWPzJTjLx9NxXlSgTs';

// Crea client Supabase (usando la libreria caricata da CDN)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Supabase client inizializzato');

