// ===== SISTEMA AUTENTICAZIONE DIRETTA SUPABASE =====
// Sistema di login/registrazione che bypassa Supabase Auth
// e usa direttamente la tabella `users` con username/password

// Login diretto (username + password)
async function loginDirect(username, password) {
    try {
        console.log('🔐 Login diretto su Supabase...');
        
        // 1. Cerca utente per USERNAME (non email)
        const { data: users, error: fetchError } = await supabase
            .from('users')
            .select('id, username, email, password_hash')
            .eq('username', username) // ← CAMBIATO DA email A username
            .single();

        if (fetchError || !users) {
            console.error('❌ Errore ricerca utente:', fetchError);
            throw new Error('Username non trovato');
        }

        console.log('✅ Utente trovato:', users.username);

        // 2. Verifica password con bcrypt
        const passwordMatch = bcrypt.compareSync(password, users.password_hash);

        if (!passwordMatch) {
            throw new Error('Password errata');
        }

        console.log('✅ Password corretta');

        // 3. Crea sessione locale (salva in localStorage)
        const session = {
            user: {
                id: users.id,
                username: users.username,
                email: users.email
            },
            access_token: generateToken(users.id),
            expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 giorni
        };

        localStorage.setItem('supabase_session', JSON.stringify(session));
        console.log('✅ Sessione creata');

        return { success: true, user: session.user };

    } catch (error) {
        console.error('❌ Errore login:', error);
        return { success: false, error: error.message };
    }
}

// Registrazione diretta (username + password)
async function registerDirect(username, password) {
    try {
        console.log('📝 Registrazione diretta su Supabase...');

        // 1. Verifica che username non esista già
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .single();

        if (existing) {
            throw new Error('Username già esistente');
        }

        // 2. Hash password con bcrypt
        const salt = bcrypt.genSaltSync(10);
        const passwordHash = bcrypt.hashSync(password, salt);

        console.log('✅ Password hashata');

        // 3. Crea utente (email fittizia per soddisfare NOT NULL)
        const email = `${username}@racing-game.local`;
        
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{
                username: username,
                email: email,
                password_hash: passwordHash,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (insertError) {
            console.error('❌ Errore inserimento utente:', insertError);
            throw new Error(insertError.message);
        }

        console.log('✅ Utente creato:', newUser);

        // 4. Crea game_state iniziale
        const initialGameState = {
            user_id: newUser.id,
            resources: {
                money: { value: 15000 },
                parts: { value: 150 },
                reputation: { value: 0 },
                energy: { value: 100 }
            },
            workshop: {
                engine: { level: 0, unlocked: true },
                electronics: { level: 0, unlocked: false },
                body: { level: 0, unlocked: false },
                aerodynamics: { level: 0, unlocked: false }
            },
            ownedCars: [],
            driver: { level: 0, upgrading: false, upgradeEndTime: 0 },
            sponsors: [],
            technologies: [],
            races: { completed: 0, wins: 0, lastRaceTime: 0 },
            championship: { active: false, currentRace: 0, wins: 0, results: [] },
            trackTraining: {},
            trackQueue: null,
            missions: {},
            pvpStats: { wins: 0, losses: 0, total: 0 },
            upgradesCount: 0,
            championshipsWon: 0,
            eventProgress: {},
            raceHistory: []
        };

        const { error: stateError } = await supabase
            .from('game_state')
            .insert([{
                user_id: newUser.id,
                resources: initialGameState.resources,
                workshop: initialGameState.workshop,
                owned_cars: initialGameState.ownedCars,
                driver: initialGameState.driver,
                sponsors: initialGameState.sponsors,
                technologies: initialGameState.technologies,
                races: initialGameState.races,
                championship: initialGameState.championship,
                track_training: initialGameState.trackTraining,
                track_queue: initialGameState.trackQueue,
                missions: initialGameState.missions,
                pvp_stats: initialGameState.pvpStats,
                upgrades_count: initialGameState.upgradesCount,
                championships_won: initialGameState.championshipsWon,
                event_progress: initialGameState.eventProgress,
                race_history: initialGameState.raceHistory,
                last_save_time: new Date().toISOString()
            }]);

        if (stateError) {
            console.warn('⚠️ Errore creazione game_state iniziale:', stateError);
        } else {
            console.log('✅ Game state iniziale creato');
        }

        return { success: true, user: newUser };

    } catch (error) {
        console.error('❌ Errore registrazione:', error);
        return { success: false, error: error.message };
    }
}

// Logout
function logoutDirect() {
    localStorage.removeItem('supabase_session');
    console.log('✅ Logout effettuato');
}

// Ottieni sessione corrente
function getSession() {
    const sessionStr = localStorage.getItem('supabase_session');
    if (!sessionStr) return null;

    try {
        const session = JSON.parse(sessionStr);
        
        // Verifica scadenza
        if (session.expires_at && Date.now() > session.expires_at) {
            console.log('⚠️ Sessione scaduta');
            logoutDirect();
            return null;
        }

        return session;
    } catch (error) {
        console.error('❌ Errore parsing sessione:', error);
        logoutDirect();
        return null;
    }
}

// Genera token semplice (per compatibilità)
function generateToken(userId) {
    return btoa(JSON.stringify({
        user_id: userId,
        issued_at: Date.now(),
        random: Math.random().toString(36)
    }));
}

console.log('✅ Sistema Supabase Direct caricato');
