// ========================================
// SISTEMA PVP SUPABASE
// ========================================

// Controlla quante sfide ha fatto oggi l'utente
async function checkDailyChallenges() {
    const session = getSession();
    const userId = session?.user?.id;
    
    if (!userId) return { canChallenge: false, remaining: 0 };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data, error } = await supabase
        .from('pvp_challenges_v2')
        .select('id')
        .eq('challenger_id', userId)
        .gte('created_at', today.toISOString());
    
    if (error) {
        console.error('Errore check sfide:', error);
        return { canChallenge: false, remaining: 0 };
    }
    
    const challengesToday = data.length;
    const remaining = Math.max(0, 2 - challengesToday);
    
    return {
        canChallenge: challengesToday < 2,
        remaining: remaining,
        challengesToday: challengesToday
    };
}

// Simula gara PvP
function simulatePvPRace(challengerCar, opponentCar) {
    // Calcola punteggio totale auto
    const challengerScore = 
        challengerCar.stats.engine + 
        challengerCar.stats.body + 
        challengerCar.stats.electronics + 
        challengerCar.stats.aero +
        (challengerCar.upgrades?.engine || 0) * 5 +
        (challengerCar.upgrades?.body || 0) * 5 +
        (challengerCar.upgrades?.electronics || 0) * 5 +
        (challengerCar.upgrades?.aero || 0) * 5;
    
    const opponentScore = 
        opponentCar.stats.engine + 
        opponentCar.stats.body + 
        opponentCar.stats.electronics + 
        opponentCar.stats.aero +
        (opponentCar.upgrades?.engine || 0) * 5 +
        (opponentCar.upgrades?.body || 0) * 5 +
        (opponentCar.upgrades?.electronics || 0) * 5 +
        (opponentCar.upgrades?.aero || 0) * 5;
    
    // Aggiungi fattore casuale (±20%)
    const challengerFinal = challengerScore * (0.8 + Math.random() * 0.4);
    const opponentFinal = opponentScore * (0.8 + Math.random() * 0.4);
    
    return {
        challengerScore: Math.round(challengerFinal),
        opponentScore: Math.round(opponentFinal),
        winner: challengerFinal > opponentFinal ? 'challenger' : 'opponent'
    };
}

// Sfida un giocatore
async function challengePlayer(opponentId, opponentUsername) {
    try {
        const session = getSession();
        const userId = session?.user?.id;
        const username = session?.user?.username;
        
        if (!userId) {
            alert('Devi fare login per sfidare altri giocatori!');
            return;
        }
        
        // Controlla sfide giornaliere
        const { canChallenge, remaining } = await checkDailyChallenges();
        
        if (!canChallenge) {
            alert('Hai esaurito le sfide giornaliere (2/2)!\nTorna domani per nuove sfide.');
            return;
        }
        
        // Controlla se hai auto
        if (game.ownedCars.length === 0) {
            alert('Devi avere almeno un\'auto per sfidare!');
            return;
        }
        
        // Conferma sfida
        if (!confirm(`Vuoi sfidare ${opponentUsername}?\nSfide rimanenti oggi: ${remaining - 1}/2`)) {
            return;
        }
        
        // Carica dati avversario
        console.log('🔍 Carico dati avversario, user_id:', opponentId);
        
        const { data: opponentData, error: opponentError } = await supabase
            .from('game_state')
            .select('owned_cars')
            .eq('user_id', opponentId)
            .single();
        
        if (opponentError) {
            console.error('Errore caricamento avversario:', opponentError);
            alert('Errore nel caricare i dati dell\'avversario!');
            return;
        }
        
        if (!opponentData?.owned_cars?.[0]) {
            console.warn('Avversario senza auto:', opponentData);
            alert('Avversario non ha auto disponibili!');
            return;
        }
        
        // Simula gara
        const myCar = game.ownedCars[game.selectedCarIndex || 0];
        const opponentCar = opponentData.owned_cars[0];
        
        const result = simulatePvPRace(myCar, opponentCar);
        const won = result.winner === 'challenger';
        
        // Calcola premi
        const rewardReputation = won ? 50 : 10;
        const rewardMoney = won ? 2000 : 500;
        
        // Salva sfida nel database
        const { error: insertError } = await supabase
            .from('pvp_challenges_v2')
            .insert([{
                challenger_id: userId,
                opponent_id: opponentId,
                winner_id: won ? userId : opponentId,
                challenger_score: result.challengerScore,
                opponent_score: result.opponentScore,
                reward_reputation: rewardReputation,
                reward_money: rewardMoney
            }]);
        
        if (insertError) {
            console.error('Errore salvataggio sfida:', insertError);
            alert('Errore durante la sfida. Riprova!');
            return;
        }
        
        // Assegna premi
        game.resources.reputation.value += rewardReputation;
        game.resources.money.value += rewardMoney;
        
        // Aggiorna statistiche PvP
        if (won) {
            game.pvpStats.wins++;
        } else {
            game.pvpStats.losses++;
        }
        game.pvpStats.total++;
        
        // Salva stato
        await saveGameToSupabase();
        
        // Mostra risultato
        const message = won 
            ? `🏆 VITTORIA! 🏆\n\nHai sconfitto ${opponentUsername}!\n\nTuo punteggio: ${result.challengerScore}\nAvversario: ${result.opponentScore}\n\nPremi:\n+${rewardReputation} ⭐ Reputazione\n+${rewardMoney}€\n\nSfide rimanenti oggi: ${remaining - 1}/2`
            : `😔 SCONFITTA\n\nHai perso contro ${opponentUsername}\n\nTuo punteggio: ${result.challengerScore}\nAvversario: ${result.opponentScore}\n\nPremio consolazione:\n+${rewardReputation} ⭐ Reputazione\n+${rewardMoney}€\n\nSfide rimanenti oggi: ${remaining - 1}/2`;
        
        alert(message);
        
        // Ricarica classifica
        game.renderLeaderboard();
        
    } catch (error) {
        console.error('Errore sfida PvP:', error);
        alert('Errore durante la sfida. Riprova!');
    }
}

console.log('✅ Sistema PvP Supabase caricato');
