// ===== SUPABASE CLIENT CONFIGURATION =====
// Configurazione client Supabase per browser

(function() {
    const SUPABASE_URL = 'https://okzbbfbsmacwjynlrbbn.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9remJiZmJzbWFjd2p5bmxyYmJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTMyNDUsImV4cCI6MjA1NDE2OTI0NX0.KZvnIjcb0lUYkVN6SHj10rXnzzWPzJTjLx9NxXlSgTs';

    // window.supabase è la libreria caricata da CDN
    // Usiamo .createClient() per creare il nostro client
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Sovrascrivi window.supabase con il client (non la libreria)
    window.supabase = supabaseClient;
    
    console.log('✅ Supabase client inizializzato');
})();

