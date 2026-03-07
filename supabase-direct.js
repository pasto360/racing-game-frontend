// ========================================
// SUPABASE DIRECT - SENZA AUTH
// Sistema semplificato per integer user_id
// ========================================

// LOGIN
async function loginDirect(email, password) {
    try {
        console.log('🔐 Login diretto su Supabase...')
        
        // Query diretta su tabella users
        const { data, error } = await window.supabase
            .from('users')
            .select('id, username, email, password_hash')
            .eq('email', email)
            .single()
        
        if (error || !data) {
            throw new Error('Email non trovata')
        }
        
        // Verifica password (hash SHA-256 semplice)
        const hashedPassword = await hashPassword(password)
        
        if (data.password_hash !== hashedPassword) {
            throw new Error('Password errata')
        }
        
        console.log('✅ Login OK:', data.id)
        
        // Crea sessione locale (senza JWT per ora)
        const session = {
            userId: data.id,
            username: data.username,
            email: data.email,
            timestamp: Date.now()
        }
        
        // Salva in localStorage
        localStorage.setItem('supabase_session', JSON.stringify(session))
        localStorage.setItem('authToken', 'supabase_' + data.id) // Compatibilità
        localStorage.setItem('user', JSON.stringify({
            id: data.id,
            username: data.username,
            email: data.email
        }))
        
        // Aggiorna last_login
        await window.supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', data.id)
        
        return {
            userId: data.id,
            username: data.username,
            email: data.email
        }
        
    } catch (error) {
        console.error('❌ Errore login:', error)
        throw error
    }
}

// REGISTRAZIONE
async function registerDirect(username, email, password) {
    try {
        console.log('📝 Registrazione su Supabase...')
        
        // Verifica se email esiste già
        const { data: existing } = await window.supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single()
        
        if (existing) {
            throw new Error('Email già registrata')
        }
        
        // Hash password
        const hashedPassword = await hashPassword(password)
        
        // Inserisci utente
        const { data: newUser, error: userError } = await window.supabase
            .from('users')
            .insert({
                username: username,
                email: email,
                password_hash: hashedPassword,
                created_at: new Date().toISOString()
            })
            .select()
            .single()
        
        if (userError) throw userError
        
        console.log('✅ Utente creato:', newUser.id)
        
        // Crea game_state iniziale
        const { error: gameError } = await window.supabase
            .from('game_state')
            .insert({
                user_id: newUser.id,
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
        
        return true
        
    } catch (error) {
        console.error('❌ Errore registrazione:', error)
        throw error
    }
}

// HASH PASSWORD (SHA-256 semplice)
async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// LOGOUT
function logoutDirect() {
    localStorage.removeItem('supabase_session')
    localStorage.removeItem('authToken')
    localStorage.removeItem('user')
    window.location.href = 'login.html'
}

// GET SESSION
function getSession() {
    const sessionStr = localStorage.getItem('supabase_session')
    if (!sessionStr) return null
    
    try {
        const session = JSON.parse(sessionStr)
        
        // Verifica se non è scaduta (24 ore)
        const now = Date.now()
        const age = now - session.timestamp
        const maxAge = 24 * 60 * 60 * 1000 // 24 ore
        
        if (age > maxAge) {
            localStorage.removeItem('supabase_session')
            return null
        }
        
        return session
    } catch {
        return null
    }
}

console.log('✅ Sistema Supabase Direct caricato')
