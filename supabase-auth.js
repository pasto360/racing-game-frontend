// ========================================
// AUTENTICAZIONE CON SUPABASE
// ========================================

// REGISTRAZIONE
async function registerWithSupabase(username, email, password) {
    try {
        console.log('📝 Registrazione con Supabase...')
        
        // 1. Crea utente in Supabase Auth
        const { data: authData, error: authError } = await window.supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    username: username
                }
            }
        })
        
        if (authError) throw authError
        
        console.log('✅ Utente creato:', authData.user.id)
        
        // 2. Crea record in tabella users
        const { error: userError } = await window.supabase
            .from('users')
            .insert({
                id: authData.user.id,
                username: username,
                email: email,
                created_at: new Date().toISOString()
            })
        
        if (userError) throw userError
        
        // 3. Crea game_state iniziale
        const { error: gameError } = await window.supabase
            .from('game_state')
            .insert({
                user_id: authData.user.id,
                resources: {
                    money: { value: 5000, icon: '💰' },
                    parts: { value: 100, icon: '🔩' },
                    reputation: { value: 0, icon: '⭐' },
                    energy: { value: 100, max: 100, icon: '⚡' }
                },
                workshop: { engine: 0, electronics: 0, body: 0, aerodynamics: 0 },
                owned_cars: [],
                driver: { level: 0, upgrading: false, upgradeEndTime: 0 },
                sponsors: [],
                current_sponsor: null,
                technologies: [],
                races: { completed: 0, wins: 0, lastRaceTime: 0, cooldown: 30000 },
                championship: { active: false, currentRace: 0, totalRaces: 5, wins: 0, results: [] },
                race_history: [],
                track_training: {},
                track_queue: null,
                missions: {},
                pvp_stats: { wins: 0, losses: 0, total: 0 },
                upgrades_count: 0,
                championships_won: 0,
                event_progress: {}
            })
        
        if (gameError) throw gameError
        
        alert('✅ Registrazione completata! Effettua il login.')
        return true
        
    } catch (error) {
        console.error('❌ Errore registrazione:', error)
        alert('❌ Errore: ' + error.message)
        return false
    }
}

// LOGIN
async function loginWithSupabase(email, password) {
    try {
        console.log('🔐 Login con Supabase...')
        
        const { data, error } = await window.supabase.auth.signInWithPassword({
            email: email,
            password: password
        })
        
        if (error) throw error
        
        console.log('✅ Login effettuato:', data.user.id)
        
        // Ottieni username
        const { data: userData, error: userError } = await window.supabase
            .from('users')
            .select('username')
            .eq('id', data.user.id)
            .single()
        
        if (userError) throw userError
        
        // Salva in localStorage
        localStorage.setItem('authToken', data.session.access_token)
        localStorage.setItem('user', JSON.stringify({
            id: data.user.id,
            username: userData.username,
            email: data.user.email
        }))
        
        return {
            token: data.session.access_token,
            user: {
                id: data.user.id,
                username: userData.username,
                email: data.user.email
            }
        }
        
    } catch (error) {
        console.error('❌ Errore login:', error)
        alert('❌ Login fallito: ' + error.message)
        return null
    }
}

// LOGOUT
async function logoutFromSupabase() {
    const { error } = await window.supabase.auth.signOut()
    if (error) console.error('Errore logout:', error)
    
    localStorage.removeItem('authToken')
    localStorage.removeItem('user')
    
    window.location.href = 'login.html'
}

console.log('✅ Funzioni autenticazione Supabase caricate')
