// ========================================
// CARICAMENTO E SALVATAGGIO GIOCO - SUPABASE DIRECT
// Usa sessione localStorage invece di Supabase Auth
// ========================================

// CARICA STATO GIOCO
async function loadGameFromSupabase() {
    try {
        console.log('📥 Caricamento da Supabase...')
        
        // Ottieni user ID dalla sessione LOCALE (non Supabase Auth)
        const session = getSession();
        if (!session || !session.user || !session.user.id) {
            throw new Error('Sessione non valida - rieffettua login');
        }
        
        const userId = session.user.id;
        console.log('👤 User ID:', userId);
        
        // Carica game_state con header corretto per JSONB
        const { data, error } = await supabase
            .from('game_state')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle(); // Usa maybeSingle() invece di single() per evitare errori
        
        if (error) {
            console.error('❌ Errore query:', error);
            throw error;
        }
        
        if (!data) {
            // Nessun record trovato - crea nuovo stato
            console.log('📝 Primo accesso - creo nuovo stato')
            await createInitialGameState(userId)
            return await loadGameFromSupabase() // Richiama ricorsivamente
        }
        
        console.log('✅ Stato caricato da Supabase')
        
        // Merge con game object
        if (data.resources) {
            Object.keys(data.resources).forEach(key => {
                if (game.resources[key]) {
                    game.resources[key].value = data.resources[key].value
                    if (data.resources[key].max) {
                        game.resources[key].max = data.resources[key].max
                    }
                }
            })
        }
        
        if (data.workshop) game.workshop = data.workshop
        if (data.owned_cars) game.ownedCars = data.owned_cars
        
        // Driver
        if (data.driver && typeof data.driver === 'object' && !Array.isArray(data.driver)) {
            game.driver.level = data.driver.level || 0
            game.driver.upgrading = data.driver.upgrading || false
            game.driver.upgradeEndTime = data.driver.upgradeEndTime || 0
        }
        
        if (data.sponsors) {
            data.sponsors.forEach((serverSponsor, index) => {
                if (game.sponsors[index]) {
                    game.sponsors[index].unlocked = serverSponsor.unlocked
                }
            })
        }
        
        if (data.current_sponsor) game.currentSponsor = data.current_sponsor
        
        if (data.technologies) {
            data.technologies.forEach((serverTech, index) => {
                if (game.technologies[index]) {
                    game.technologies[index].researched = serverTech.researched
                }
            })
        }
        
        if (data.races) game.races = data.races
        if (data.championship) game.championship = data.championship
        if (data.race_history) game.raceHistory = data.race_history
        if (data.track_training) game.trackTraining = data.track_training
        if (data.track_queue) game.trackQueue = data.track_queue
        if (data.missions) game.missions = data.missions
        if (data.pvp_stats) game.pvpStats = data.pvp_stats
        if (data.upgrades_count !== undefined) game.upgradesCount = data.upgrades_count
        if (data.championships_won !== undefined) game.championshipsWon = data.championships_won
        if (data.event_progress) game.eventProgress = data.event_progress
        
        return true
        
    } catch (error) {
        console.error('❌ Errore caricamento:', error)
        throw error
    }
}

// SALVA STATO GIOCO
let lastSaveTime = 0;
const SAVE_COOLDOWN = 2000; // 2 secondi tra un salvataggio e l'altro

async function saveGameToSupabase(showIndicator = true) {
    try {
        // Rate limiting
        const now = Date.now();
        if (now - lastSaveTime < SAVE_COOLDOWN) {
            console.log('⏳ Salvataggio troppo frequente, attendi...');
            return false;
        }
        lastSaveTime = now;
        
        if (showIndicator) {
            const indicator = document.getElementById('saveIndicator');
            if (indicator) {
                indicator.style.display = 'block';
                setTimeout(() => indicator.style.display = 'none', 1500);
            }
        }
        
        // Ottieni user ID dalla sessione LOCALE
        const session = getSession();
        if (!session || !session.user || !session.user.id) {
            throw new Error('Sessione non valida');
        }
        
        const userId = session.user.id;
        
        // Prepara dati
        const gameState = {
            user_id: userId,
            resources: game.resources,
            workshop: game.workshop,
            owned_cars: game.ownedCars,
            driver: game.driver,
            sponsors: game.sponsors,
            current_sponsor: game.currentSponsor,
            technologies: game.technologies,
            races: game.races,
            championship: game.championship,
            race_history: game.raceHistory,
            track_training: game.trackTraining,
            track_queue: game.trackQueue,
            missions: game.missions,
            pvp_stats: game.pvpStats,
            upgrades_count: game.upgradesCount,
            championships_won: game.championshipsWon,
            event_progress: game.eventProgress
            // last_save_time aggiornato automaticamente da trigger DB
        };
        
        // Upsert (insert or update)
        const { error } = await supabase
            .from('game_state')
            .upsert(gameState, {
                onConflict: 'user_id'
            });
        
        if (error) throw error;
        
        console.log('💾 Stato salvato su Supabase');
        return true;
        
    } catch (error) {
        console.error('❌ Errore salvataggio:', error);
        return false;
    }
}

// CREA STATO INIZIALE
async function createInitialGameState(userId) {
    const initialState = {
        user_id: userId,
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
        owned_cars: [],
        driver: { level: 0, upgrading: false, upgradeEndTime: 0 },
        sponsors: [],
        current_sponsor: null,
        technologies: [],
        races: { completed: 0, wins: 0, lastRaceTime: 0 },
        championship: { active: false, currentRace: 0, wins: 0, results: [] },
        track_training: {},
        track_queue: null,
        missions: {},
        pvp_stats: { wins: 0, losses: 0, total: 0 },
        upgrades_count: 0,
        championships_won: 0,
        event_progress: {},
        race_history: []
        // last_save_time gestito automaticamente da DEFAULT NOW() nel DB
    };
    
    const { error } = await supabase
        .from('game_state')
        .insert([initialState]);
    
    if (error) throw error;
    
    console.log('✅ Stato iniziale creato');
}

console.log('✅ Gioco Direct caricato');
