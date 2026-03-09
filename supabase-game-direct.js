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
            
            // Ripristina energia minima al login (almeno 50)
            if (game.resources.energy.value < 50) {
                game.resources.energy.value = 50
                console.log('⚡ Energia ripristinata a 50')
            }
        }
        
        // ⚡ CALCOLO ENERGIA OFFLINE
        const now = Date.now();
        const lastLogin = data.last_login || now;
        const offlineSeconds = Math.floor((now - lastLogin) / 1000);
        
        if (offlineSeconds > 60) { // Solo se offline più di 1 minuto
            // +1 energia al minuto = +1 ogni 60 secondi
            const offlineEnergy = Math.floor(offlineSeconds / 60);
            
            if (offlineEnergy > 0) {
                const oldEnergy = game.resources.energy.value;
                game.resources.energy.value = Math.min(
                    game.resources.energy.value + offlineEnergy,
                    game.resources.energy.max
                );
                
                const gained = game.resources.energy.value - oldEnergy;
                if (gained > 0) {
                    console.log(`⚡ Energia offline: +${gained} (offline ${Math.floor(offlineSeconds / 60)} min)`);
                    
                    // Mostra modal energia offline
                    if (gained >= 5) {
                        const hours = Math.floor(offlineSeconds / 3600);
                        const minutes = Math.floor((offlineSeconds % 3600) / 60);
                        let timeStr = '';
                        if (hours > 0) timeStr += `${hours}h `;
                        if (minutes > 0) timeStr += `${minutes}min`;
                        
                        // Mostra dopo che il gioco è inizializzato
                        setTimeout(() => {
                            showOfflineEnergyModal(gained, timeStr);
                        }, 1500);
                    }
                }
            }
        }
        
        // Aggiorna lastLogin a ora
        game.lastLogin = now;
        
        // Workshop - Merge dati Supabase con metadati statici
        if (data.workshop) {
            Object.keys(data.workshop).forEach(key => {
                if (game.workshop[key]) {
                    // Mantieni metadati statici, aggiorna solo level e unlocked
                    game.workshop[key].level = data.workshop[key].level || 0;
                    game.workshop[key].unlocked = data.workshop[key].unlocked !== undefined 
                        ? data.workshop[key].unlocked 
                        : game.workshop[key].unlocked;
                }
            });
        }
        
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
        
        // Races - Merge dati dinamici (preserva cooldown statico)
        if (data.races) {
            game.races.completed = data.races.completed || 0;
            game.races.wins = data.races.wins || 0;
            game.races.lastRaceTime = data.races.lastRaceTime || 0;
            // Mantiene: cooldown (30000)
        }
        
        // Championship - Merge dati dinamici (preserva entryFee, totalRaces, prizePool)
        if (data.championship) {
            game.championship.active = data.championship.active || false;
            game.championship.currentRace = data.championship.currentRace || 0;
            game.championship.wins = data.championship.wins || 0;
            game.championship.results = data.championship.results || [];
            // Mantiene: totalRaces (5), entryFee (3500), prizePool (7000)
        }
        
        if (data.race_history) game.raceHistory = data.race_history
        
        // Track Training - Merge solo level (mantieni metadati statici)
        if (data.track_training) {
            Object.keys(data.track_training).forEach(key => {
                if (game.trackTraining[key]) {
                    game.trackTraining[key].level = data.track_training[key].level || 0;
                }
            });
        }
        
        if (data.track_queue) game.trackQueue = data.track_queue
        
        // Missions - Merge solo progress e completed (mantieni metadati statici)
        if (data.missions) {
            Object.keys(data.missions).forEach(key => {
                if (game.missions[key]) {
                    game.missions[key].progress = data.missions[key].progress || 0;
                    game.missions[key].completed = data.missions[key].completed || false;
                }
            });
        }
        
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
            event_progress: game.eventProgress,
            last_login: game.lastLogin || Date.now() // Per energia offline
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
    
    if (error) {
        // Se il record esiste già (409 Conflict), prova a caricarlo
        if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('already exists')) {
            console.log('⚠️ Record già esistente, carico stato esistente...');
            return; // La funzione chiamante riproverà a caricare
        }
        throw error;
    }
    
    console.log('✅ Stato iniziale creato');
}

// Mostra modal energia offline
function showOfflineEnergyModal(gained, timeStr) {
    // Crea modal se non esiste
    let modal = document.getElementById('offlineEnergyModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'offlineEnergyModal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div id="offlineEnergyContent"></div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Chiusura con click fuori
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    }
    
    const content = document.getElementById('offlineEnergyContent');
    content.innerHTML = `
        <div style="text-align: center; padding: 30px 20px;">
            <div style="font-size: 4rem; margin-bottom: 20px;">⚡</div>
            <h2 style="font-family: Orbitron; font-size: 2rem; color: var(--accent-cyan); margin-bottom: 20px;">
                Bentornato!
            </h2>
            
            <div style="background: linear-gradient(135deg, rgba(0,217,255,0.1), rgba(0,255,136,0.1)); border: 2px solid var(--accent-green); border-radius: 12px; padding: 25px; margin: 20px 0;">
                <div style="font-size: 1.2rem; color: var(--text-secondary); margin-bottom: 10px;">
                    Hai recuperato energia mentre eri offline
                </div>
                <div style="font-size: 3rem; font-weight: 900; color: var(--accent-green); margin: 15px 0;">
                    +${gained} ⚡
                </div>
                <div style="font-size: 1rem; color: var(--accent-cyan);">
                    Tempo offline: ${timeStr}
                </div>
            </div>
            
            <button onclick="document.getElementById('offlineEnergyModal').classList.remove('active')" class="btn btn-primary" style="margin-top: 20px; font-size: 1.1rem; padding: 12px 40px;">
                Inizia a Giocare!
            </button>
        </div>
    `;
    
    modal.classList.add('active');
}

console.log('✅ Gioco Direct caricato');
