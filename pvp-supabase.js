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

// Mostra risultato PvP in modal
function showPvPResult(result, opponentUsername, myCar, opponentCar, won, rewards, remaining) {
    const modal = document.getElementById('pvpResultModal');
    const content = document.getElementById('pvpResultContent');
    
    if (!modal || !content) {
        // Fallback ad alert se modal non esiste
        const message = won 
            ? `🏆 VITTORIA!\n\nHai sconfitto ${opponentUsername}!\n\nTuo punteggio: ${result.challengerScore}\nAvversario: ${result.opponentScore}\n\nPremi:\n+${rewards.reputation} ⭐\n+${rewards.money}€\n\nSfide rimanenti: ${remaining}/2`
            : `😔 SCONFITTA\n\nHai perso contro ${opponentUsername}\n\nTuo punteggio: ${result.challengerScore}\nAvversario: ${result.opponentScore}\n\nPremio:\n+${rewards.reputation} ⭐\n+${rewards.money}€\n\nSfide rimanenti: ${remaining}/2`;
        alert(message);
        return;
    }
    
    // Calcola stats totali
    const myTotal = myCar.stats.engine + myCar.stats.body + myCar.stats.electronics + myCar.stats.aero;
    const myUpgrades = ((myCar.upgrades?.engine || 0) + (myCar.upgrades?.body || 0) + 
                        (myCar.upgrades?.electronics || 0) + (myCar.upgrades?.aero || 0)) * 5;
    const myBase = myTotal + myUpgrades;
    const myVariance = result.challengerScore - myBase; // Variabile casuale
    
    const oppTotal = opponentCar.stats.engine + opponentCar.stats.body + opponentCar.stats.electronics + opponentCar.stats.aero;
    const oppUpgrades = ((opponentCar.upgrades?.engine || 0) + (opponentCar.upgrades?.body || 0) + 
                         (opponentCar.upgrades?.electronics || 0) + (opponentCar.upgrades?.aero || 0)) * 5;
    const oppBase = oppTotal + oppUpgrades;
    const oppVariance = result.opponentScore - oppBase; // Variabile casuale
    
    // Funzione per formattare varianza
    const formatVariance = (v) => {
        if (v > 0) return `+${v}`;
        return `${v}`; // Negativo già ha il segno -
    };
    
    const session = getSession();
    const currentUsername = session?.user?.username || 'Tu';
    
    content.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <h2 style="font-family: Orbitron; font-size: 2.5rem; color: ${won ? 'var(--accent-green)' : 'var(--accent-red)'}; margin-bottom: 20px;">
                ${won ? '🏆 VITTORIA!' : '😔 SCONFITTA'}
            </h2>
            
            <div style="font-size: 1.2rem; margin-bottom: 30px; color: var(--text-secondary);">
                ${won ? `Hai sconfitto <strong style="color: var(--accent-yellow);">${opponentUsername}</strong>!` : `Hai perso contro <strong style="color: var(--accent-yellow);">${opponentUsername}</strong>`}
            </div>
            
            <!-- Confronto Auto -->
            <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 20px; margin: 30px 0; background: rgba(255,255,255,0.03); padding: 20px; border-radius: 12px;">
                <!-- Tua Auto -->
                <div style="text-align: right;">
                    <div style="font-weight: 700; font-size: 1.1rem; color: var(--accent-cyan); margin-bottom: 10px;">
                        ${currentUsername}
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 3px;">
                        Potenza auto: ${myTotal}
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 3px;">
                        Upgrade: +${myUpgrades}
                    </div>
                    <div style="font-size: 0.85rem; color: ${myVariance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}; margin-bottom: 10px;">
                        Variabile: ${formatVariance(myVariance)}
                    </div>
                    <div style="font-size: 1.5rem; font-weight: 900; color: ${won ? 'var(--accent-green)' : 'var(--accent-red)'}; margin-top: 10px;">
                        ${result.challengerScore}
                    </div>
                </div>
                
                <!-- VS -->
                <div style="display: flex; align-items: center;">
                    <div style="font-size: 2rem; font-weight: 900; color: var(--accent-yellow); padding: 0 20px;">
                        VS
                    </div>
                </div>
                
                <!-- Auto Avversario -->
                <div style="text-align: left;">
                    <div style="font-weight: 700; font-size: 1.1rem; color: var(--accent-yellow); margin-bottom: 10px;">
                        ${opponentUsername}
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 3px;">
                        Potenza auto: ${oppTotal}
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 3px;">
                        Upgrade: +${oppUpgrades}
                    </div>
                    <div style="font-size: 0.85rem; color: ${oppVariance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}; margin-bottom: 10px;">
                        Variabile: ${formatVariance(oppVariance)}
                    </div>
                    <div style="font-size: 1.5rem; font-weight: 900; color: ${won ? 'var(--accent-red)' : 'var(--accent-green)'}; margin-top: 10px;">
                        ${result.opponentScore}
                    </div>
                </div>
            </div>
            
            <!-- Premi/Penalità -->
            <div style="background: linear-gradient(135deg, ${won ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,51,0.1)'}); border: 2px solid ${won ? 'var(--accent-green)' : 'var(--accent-red)'}; border-radius: 12px; padding: 20px; margin: 20px 0;">
                <h3 style="font-family: Orbitron; color: var(--accent-yellow); margin-bottom: 15px;">
                    ${won ? '🎁 PREMI VITTORIA' : '💸 PENALITÀ SCONFITTA'}
                </h3>
                <div style="display: flex; justify-content: center; gap: 30px;">
                    ${won ? `
                        <div>
                            <div style="font-size: 1.5rem; font-weight: 900; color: var(--accent-yellow);">
                                +${rewards.reputation} ⭐
                            </div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary);">Reputazione</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: 900; color: var(--accent-green);">
                                +${rewards.money}€
                            </div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary);">Denaro</div>
                        </div>
                    ` : `
                        <div>
                            <div style="font-size: 1.5rem; font-weight: 900; color: var(--accent-red);">
                                ${rewards.money}€
                            </div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary);">Denaro perso (-10%)</div>
                        </div>
                    `}
                </div>
            </div>
            
            <!-- Sfide rimanenti -->
            <div style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                <div style="font-size: 1rem; color: var(--accent-cyan);">
                    ⚔️ Sfide rimanenti oggi: <strong>${remaining}/2</strong>
                </div>
            </div>
            
            <button onclick="closePvPResultModal()" class="btn btn-primary" style="margin-top: 20px; font-size: 1.1rem; padding: 12px 40px;">
                OK
            </button>
        </div>
    `;
    
    modal.classList.add('active');
}

// Chiudi modal risultato
function closePvPResultModal() {
    const modal = document.getElementById('pvpResultModal');
    if (modal) {
        modal.classList.remove('active');
    }
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
            showPvPMessageModal('Sfide Esaurite', 'Hai esaurito le sfide giornaliere (2/2)!\n\nTorna domani per nuove sfide.', 'error');
            return;
        }
        
        // Controlla se hai auto
        if (game.ownedCars.length === 0) {
            showPvPMessageModal('Nessuna Auto', 'Devi avere almeno un\'auto per sfidare!', 'error');
            return;
        }
        
        // Mostra modal conferma sfida
        showPvPConfirmModal(opponentId, opponentUsername, remaining);
        
    } catch (error) {
        console.error('Errore sfida PvP:', error);
        showPvPMessageModal('Errore', 'Errore durante la sfida. Riprova!', 'error');
    }
}

// Esegue la sfida PvP (chiamata dal modal di conferma)
async function executePvPChallenge(opponentId, opponentUsername, remaining) {
    try {
        const session = getSession();
        const userId = session?.user?.id;
        
        // Carica dati avversario
        console.log('🔍 Carico dati avversario, user_id:', opponentId);
        
        const { data: opponentData, error: opponentError } = await supabase
            .from('game_state')
            .select('owned_cars')
            .eq('user_id', opponentId)
            .single();
        
        if (opponentError) {
            console.error('Errore caricamento avversario:', opponentError);
            showPvPMessageModal('Errore', 'Errore nel caricare i dati dell\'avversario!', 'error');
            return;
        }
        
        if (!opponentData?.owned_cars?.[0]) {
            console.warn('Avversario senza auto:', opponentData);
            showPvPMessageModal('Errore', 'Avversario non ha auto disponibili!', 'error');
            return;
        }
        
        // Simula gara
        const myCar = game.ownedCars[game.selectedCarIndex || 0];
        const opponentCar = opponentData.owned_cars[0];
        
        const result = simulatePvPRace(myCar, opponentCar);
        const won = result.winner === 'challenger';
        
        // Calcola premi/penalità
        let rewardReputation, rewardMoney;
        
        if (won) {
            // VITTORIA: +50⭐ +2000€
            rewardReputation = 50;
            rewardMoney = 2000;
        } else {
            // SCONFITTA: +0⭐ -10% denaro
            rewardReputation = 0;
            const moneyLost = Math.floor(game.resources.money.value * 0.10);
            rewardMoney = -moneyLost; // Negativo = perdita
        }
        
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
        
        // Assegna premi/penalità
        game.resources.reputation.value += rewardReputation;
        game.resources.money.value += rewardMoney;
        
        // Assicura che il denaro non vada sotto zero
        if (game.resources.money.value < 0) {
            game.resources.money.value = 0;
        }
        
        // Aggiorna statistiche PvP
        if (won) {
            game.pvpStats.wins++;
        } else {
            game.pvpStats.losses++;
        }
        game.pvpStats.total++;
        
        // Salva stato
        await saveGameToSupabase();
        
        // Mostra risultato in modal
        showPvPResult(
            result,
            opponentUsername,
            myCar,
            opponentCar,
            won,
            { reputation: rewardReputation, money: rewardMoney },
            remaining - 1
        );
        
        // Ricarica classifica
        game.renderLeaderboard();
        
    } catch (error) {
        console.error('Errore sfida PvP:', error);
        showPvPMessageModal('Errore', 'Errore durante la sfida. Riprova!', 'error');
    }
}

// Inizializza modal PvP (crea se non esiste)
function initPvPModal() {
    if (!document.getElementById('pvpResultModal')) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'pvpResultModal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div id="pvpResultContent"></div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Chiusura con click fuori
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closePvPResultModal();
            }
        });
    }
}

// Modal conferma sfida
function showPvPConfirmModal(opponentId, opponentUsername, remaining) {
    let modal = document.getElementById('pvpConfirmModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'pvpConfirmModal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div id="pvpConfirmContent"></div>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    }
    
    const content = document.getElementById('pvpConfirmContent');
    content.innerHTML = `
        <div style="text-align: center; padding: 30px 20px;">
            <h2 style="font-family: Orbitron; font-size: 2rem; color: var(--accent-yellow); margin-bottom: 20px;">
                ⚔️ SFIDA PVP
            </h2>
            
            <div style="font-size: 1.3rem; margin-bottom: 30px; color: var(--text-primary);">
                Vuoi sfidare <strong style="color: var(--accent-cyan);">${opponentUsername}</strong>?
            </div>
            
            <div style="background: rgba(255,255,255,0.05); border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div style="text-align: center; padding: 15px; background: rgba(0,255,136,0.1); border: 2px solid var(--accent-green); border-radius: 8px;">
                        <div style="font-size: 0.85rem; color: #a0a0a0; margin-bottom: 5px;">SE VINCI</div>
                        <div style="font-size: 1.1rem; font-weight: 700; color: var(--accent-green);">+2000€</div>
                        <div style="font-size: 1.1rem; font-weight: 700; color: var(--accent-yellow);">+50⭐</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: rgba(255,51,51,0.1); border: 2px solid var(--accent-red); border-radius: 8px;">
                        <div style="font-size: 0.85rem; color: #a0a0a0; margin-bottom: 5px;">SE PERDI</div>
                        <div style="font-size: 1.1rem; font-weight: 700; color: var(--accent-red);">-10% €</div>
                        <div style="font-size: 0.8rem; margin-top: 5px;">del tuo denaro</div>
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom: 25px; padding: 15px; background: rgba(0,217,255,0.1); border-radius: 8px;">
                <div style="font-size: 0.9rem; color: var(--accent-cyan);">
                    ⚔️ Sfide rimanenti dopo questa: <strong>${remaining - 1}/2</strong>
                </div>
            </div>
            
            <div style="display: flex; gap: 15px; justify-content: center;">
                <button onclick="document.getElementById('pvpConfirmModal').classList.remove('active')" class="btn" style="padding: 12px 30px; background: rgba(255,255,255,0.1);">
                    Annulla
                </button>
                <button onclick="confirmPvPChallenge(${opponentId}, '${opponentUsername}', ${remaining})" class="btn btn-primary" style="padding: 12px 30px;">
                    Sfida!
                </button>
            </div>
        </div>
    `;
    
    modal.classList.add('active');
}

// Conferma e esegui sfida
async function confirmPvPChallenge(opponentId, opponentUsername, remaining) {
    // Chiudi modal conferma
    document.getElementById('pvpConfirmModal').classList.remove('active');
    
    // Esegui sfida
    await executePvPChallenge(opponentId, opponentUsername, remaining);
}

// Modal messaggi generici (errori, info)
function showPvPMessageModal(title, message, type = 'info') {
    let modal = document.getElementById('pvpMessageModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'pvpMessageModal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div id="pvpMessageContent"></div>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    }
    
    const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    const color = type === 'error' ? 'var(--accent-red)' : type === 'success' ? 'var(--accent-green)' : 'var(--accent-cyan)';
    
    const content = document.getElementById('pvpMessageContent');
    content.innerHTML = `
        <div style="text-align: center; padding: 30px 20px;">
            <div style="font-size: 3rem; margin-bottom: 20px;">${icon}</div>
            <h2 style="font-family: Orbitron; font-size: 1.8rem; color: ${color}; margin-bottom: 20px;">
                ${title}
            </h2>
            <div style="font-size: 1.1rem; color: var(--text-secondary); margin-bottom: 30px; white-space: pre-line;">
                ${message}
            </div>
            <button onclick="document.getElementById('pvpMessageModal').classList.remove('active')" class="btn btn-primary" style="padding: 12px 40px;">
                OK
            </button>
        </div>
    `;
    
    modal.classList.add('active');
}

// Inizializza modal PvP (crea se non esiste)
// Inizializza al caricamento
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPvPModal);
} else {
    initPvPModal();
}

console.log('✅ Sistema PvP Supabase caricato');
