// CARICA GIOCO
async function loadGameFromSupabase() {
    try {
        const session = getSession()
        if (!session) {
            window.location.href = 'login.html'
            return false
        }
        
        const { data, error } = await window.supabase
            .from('game_state')
            .select('*')
            .eq('user_id', session.userId)
            .single()
        
        if (error) {
            if (error.code === 'PGRST116') {
                await createInitialGameState(session.userId)
                return await loadGameFromSupabase()
            }
            throw error
        }
        
        // Merge dati (come prima)
        if (data.resources) {
            Object.keys(data.resources).forEach(key => {
                if (game.resources[key]) {
                    game.resources[key].value = data.resources[key].value
                    if (data.resources[key].max) game.resources[key].max = data.resources[key].max
                }
            })
        }
        
        if (data.workshop) game.workshop = data.workshop
        if (data.owned_cars) game.ownedCars = data.owned_cars
        
        if (data.driver && typeof data.driver === 'object') {
            game.driver.level = data.driver.level || 0
            game.driver.upgrading = data.driver.upgrading || false
            game.driver.upgradeEndTime = data.driver.upgradeEndTime || 0
        }
        
        if (data.sponsors) {
            data.sponsors.forEach((s, i) => {
                if (game.sponsors[i]) game.sponsors[i].unlocked = s.unlocked
            })
        }
        
        if (data.current_sponsor) game.currentSponsor = data.current_sponsor
        if (data.technologies) {
            data.technologies.forEach((t, i) => {
                if (game.technologies[i]) game.technologies[i].researched = t.researched
            })
        }
        
        if (data.races) game.races = data.races
        if (data.championship) game.championship = data.championship
        if (data.race_history) game.raceHistory = data.race_history
        if (data.track_training) game.trackTraining = data.track_training
        if (data.track_queue) game.trackQueue = data.track_queue
        if (data.missions) game.missions = data.missions
        if (data.pvp_stats) game.pvpStats = data.pvp_stats
        if (data.upgrades_count) game.upgradesCount = data.upgrades_count
        if (data.championships_won) game.championshipsWon = data.championships_won
        if (data.event_progress) game.eventProgress = data.event_progress
        
        console.log('✅ Gioco caricato')
        return true
        
    } catch (error) {
        console.error('❌ Errore caricamento:', error)
        return false
    }
}

// SALVA GIOCO
let lastSaveTime = 0
async function saveGameToSupabase(showIndicator = true) {
    try {
        const now = Date.now()
        if (now - lastSaveTime < 3000) {
            console.log('⏳ Save troppo frequente')
            return
        }
        
        const session = getSession()
        if (!session) return false
        
        const saveIndicator = document.getElementById('saveIndicator')
        if (showIndicator && saveIndicator) saveIndicator.classList.add('show')
        
        const gameState = {
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
            last_save: new Date().toISOString()
        }
        
        const { error } = await window.supabase
            .from('game_state')
            .update(gameState)
            .eq('user_id', session.userId)
        
        if (error) throw error
        
        lastSaveTime = Date.now()
        console.log('💾 Salvato')
        
        if (showIndicator && saveIndicator) {
            setTimeout(() => saveIndicator.classList.remove('show'), 1500)
        }
        
        return true
        
    } catch (error) {
        console.error('❌ Errore save:', error)
        return false
    }
}

// CREA STATO INIZIALE
async function createInitialGameState(userId) {
    const initial = {
        user_id: userId,
        resources: { money: { value: 5000, icon: '💰' }, parts: { value: 100, icon: '🔩' }, reputation: { value: 0, icon: '⭐' }, energy: { value: 100, max: 100, icon: '⚡' } },
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
    }
    
    await window.supabase.from('game_state').insert(initial)
}

console.log('✅ Gioco Direct caricato')
