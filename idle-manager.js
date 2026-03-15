/**
 * IDLE SCUDERIA MANAGER
 * Sistema idle game per Garage Racing Manager
 */

const IdleManager = {
    // Configurazione
    TICK_INTERVAL: 1000, // 1 secondo
    MAX_OFFLINE_HOURS: 24,
    STARTING_BALANCE: 5000,
    MAX_LEVEL: 100,
    
    // Requisiti unlock auto finale
    UNLOCK_REQUIREMENTS: {
        allLevels: 100,
        minBalance: 1000000 // 1 milione
    },
    
    // State
    balance: 5000,
    lastUpdate: null,
    tickTimer: null,
    
    // Livelli
    levels: {
        pilot: 1,
        sponsor: 1,
        merch: 1,
        techSponsor: 1,
        tv: 1,
        team: 1,
        car: 1,
        structures: 1
    },
    
    // Stats
    stats: {
        totalWins: 0,
        totalEarned: 0,
        maxBalance: 5000,
        playTimeSeconds: 0
    },
    
    // Formule upgrade cost
    upgradeCost(category, level) {
        const baseCosts = {
            pilot: 150,
            sponsor: 100,
            merch: 80,
            techSponsor: 90,
            tv: 70,
            team: 100,
            car: 150,
            structures: 110
        };
        
        const base = baseCosts[category];
        const multiplier = category === 'pilot' ? 1.13 : 1.12;
        return Math.floor(base * Math.pow(multiplier, level));
    },
    
    // Formule entrate/uscite
    pilotIncome(level) {
        // Vittorie automatiche
        const base = 0.05 * Math.pow(1.09, level);
        
        // Bonus da team e auto
        const teamBonus = this.levels.team * 0.005; // +0.5% per livello
        const carBonus = this.levels.car * 0.008; // +0.8% per livello
        const totalBonus = 1 + teamBonus + carBonus;
        
        return base * totalBonus;
    },
    
    sponsorIncome(level) {
        return 0.04 * Math.pow(1.08, level);
    },
    
    merchIncome(level) {
        return 0.025 * Math.pow(1.08, level);
    },
    
    techSponsorIncome(level) {
        return 0.03 * Math.pow(1.08, level);
    },
    
    tvIncome(level) {
        return 0.02 * Math.pow(1.08, level);
    },
    
    teamCost(level) {
        return -0.025 * Math.pow(1.08, level);
    },
    
    carCost(level) {
        return -0.04 * Math.pow(1.08, level);
    },
    
    structuresCost(level) {
        const base = -0.03 * Math.pow(1.08, level);
        
        // Bonus riduzione costi
        const reduction = this.levels.structures * 0.003; // -0.3% per livello
        return base * (1 - reduction);
    },
    
    // Calcola bilancio totale al secondo
    calculateBalancePerSecond() {
        const income = 
            this.pilotIncome(this.levels.pilot) +
            this.sponsorIncome(this.levels.sponsor) +
            this.merchIncome(this.levels.merch) +
            this.techSponsorIncome(this.levels.techSponsor) +
            this.tvIncome(this.levels.tv);
        
        const expenses = 
            this.teamCost(this.levels.team) +
            this.carCost(this.levels.car) +
            this.structuresCost(this.levels.structures);
        
        return income + expenses; // expenses è già negativo
    },
    
    // Inizializza dal database
    async init() {
        console.log('🏎️ Inizializzazione IDLE Manager...');
        
        try {
            const userId = await getUserId();
            
            // Carica progresso da Supabase
            const { data, error } = await supabase
                .from('idle_progress')
                .select('*')
                .eq('user_id', userId)
                .single();
            
            if (error && error.code !== 'PGRST116') {
                throw error;
            }
            
            if (data) {
                // Carica dati esistenti
                this.balance = parseFloat(data.balance);
                this.lastUpdate = new Date(data.last_update);
                
                this.levels = {
                    pilot: data.pilot_level,
                    sponsor: data.sponsor_level,
                    merch: data.merch_level,
                    techSponsor: data.tech_sponsor_level,
                    tv: data.tv_level,
                    team: data.team_level,
                    car: data.car_level,
                    structures: data.structures_level
                };
                
                this.stats = {
                    totalWins: data.total_race_wins,
                    totalEarned: parseFloat(data.total_money_earned),
                    maxBalance: parseFloat(data.max_balance),
                    playTimeSeconds: data.play_time_seconds
                };
                
                // Calcola offline progress
                await this.calculateOfflineProgress();
            } else {
                // Nuovo utente - crea record
                await this.createNewProgress(userId);
            }
            
            // Avvia tick
            this.startTick();
            this.render();
            
            console.log('✅ IDLE Manager inizializzato');
        } catch (error) {
            console.error('❌ Errore init IDLE:', error);
            showNotification('Errore caricamento IDLE', 'error');
        }
    },
    
    // Crea nuovo progresso
    async createNewProgress(userId) {
        const { error } = await supabase
            .from('idle_progress')
            .insert({
                user_id: userId,
                balance: this.STARTING_BALANCE,
                last_update: new Date().toISOString(),
                pilot_level: 1,
                sponsor_level: 1,
                merch_level: 1,
                tech_sponsor_level: 1,
                tv_level: 1,
                team_level: 1,
                car_level: 1,
                structures_level: 1
            });
        
        if (error) throw error;
        
        this.balance = this.STARTING_BALANCE;
        this.lastUpdate = new Date();
    },
    
    // Calcola guadagno offline
    async calculateOfflineProgress() {
        const now = new Date();
        const offlineSeconds = Math.floor((now - this.lastUpdate) / 1000);
        
        if (offlineSeconds < 60) return; // Meno di 1 minuto, ignora
        
        // Max 24 ore
        const maxOfflineSeconds = this.MAX_OFFLINE_HOURS * 3600;
        const actualSeconds = Math.min(offlineSeconds, maxOfflineSeconds);
        
        const balancePerSec = this.calculateBalancePerSecond();
        
        if (balancePerSec > 0) {
            const offlineGain = balancePerSec * actualSeconds;
            this.balance += offlineGain;
            
            // Aggiorna max balance
            if (this.balance > this.stats.maxBalance) {
                this.stats.maxBalance = this.balance;
            }
            
            // Mostra popup
            this.showOfflinePopup(offlineSeconds, offlineGain);
        }
    },
    
    // Popup offline progress
    showOfflinePopup(seconds, gain) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        let timeText = '';
        if (hours > 0) {
            timeText = `${hours}h ${minutes}min`;
        } else {
            timeText = `${minutes} minuti`;
        }
        
        const popup = document.createElement('div');
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, rgba(138,43,226,0.95), rgba(0,217,255,0.95));
            border: 3px solid var(--accent-cyan);
            border-radius: 20px;
            padding: 40px;
            z-index: 10000;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            min-width: 400px;
        `;
        
        popup.innerHTML = `
            <h2 style="font-family: Orbitron; color: white; margin-bottom: 20px; font-size: 2rem;">
                🌙 BEN TORNATO!
            </h2>
            <p style="color: white; font-size: 1.2rem; margin-bottom: 15px;">
                Sei stato via <strong>${timeText}</strong>
            </p>
            <p style="color: var(--accent-yellow); font-size: 2.5rem; font-weight: bold; margin: 20px 0;">
                +${this.formatMoney(gain)}
            </p>
            <p style="color: rgba(255,255,255,0.8); font-size: 0.9rem;">
                Guadagno offline
            </p>
            <button onclick="this.parentElement.remove()" style="
                margin-top: 30px;
                padding: 15px 40px;
                background: var(--accent-cyan);
                color: white;
                border: none;
                border-radius: 10px;
                font-family: Orbitron;
                font-size: 1.1rem;
                cursor: pointer;
                transition: all 0.3s;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                CONTINUA
            </button>
        `;
        
        document.body.appendChild(popup);
    },
    
    // Avvia tick ogni secondo
    startTick() {
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
        }
        
        this.tickTimer = setInterval(() => {
            this.tick();
        }, this.TICK_INTERVAL);
    },
    
    // Tick singolo
    tick() {
        const balancePerSec = this.calculateBalancePerSecond();
        this.balance += balancePerSec;
        
        // Aggiorna max balance
        if (this.balance > this.stats.maxBalance) {
            this.stats.maxBalance = this.balance;
        }
        
        // Aggiorna play time
        this.stats.playTimeSeconds++;
        
        // Salva ogni 10 secondi
        if (this.stats.playTimeSeconds % 10 === 0) {
            this.save();
        }
        
        // Aggiorna UI
        this.updateBalanceDisplay();
        
        // Check unlock auto
        this.checkUnlockCar();
    },
    
    // Check sblocco auto finale
    checkUnlockCar() {
        const allMaxLevel = Object.values(this.levels).every(lv => lv >= this.MAX_LEVEL);
        const hasBalance = this.balance >= this.UNLOCK_REQUIREMENTS.minBalance;
        
        if (allMaxLevel && hasBalance) {
            // Sblocca auto!
            this.unlockSpecialCar();
        }
    },
    
    // Sblocca auto speciale
    async unlockSpecialCar() {
        // Previeni doppi unlock
        if (this.carUnlocked) return;
        this.carUnlocked = true;
        
        try {
            const userId = await getUserId();
            
            // Sblocca auto nel game
            if (window.game && window.game.availableCars) {
                const ultimateCar = window.game.availableCars.find(c => c.special && c.name === 'ULTIMATE EDITION');
                if (ultimateCar) {
                    ultimateCar.unlocked = true;
                    
                    // Aggiorna anche idleCompleted nel game
                    window.game.idleCompleted = true;
                    
                    // Salva stato
                    if (window.saveGameToServer) {
                        await saveGameToServer(true);
                    }
                }
            }
            
            const popup = document.createElement('div');
            popup.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.9);
                z-index: 20000;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            
            popup.innerHTML = `
                <div style="
                    background: linear-gradient(135deg, #8a2be2, #00d9ff);
                    border: 5px solid gold;
                    border-radius: 30px;
                    padding: 60px;
                    text-align: center;
                    max-width: 600px;
                    animation: pulse 2s infinite;
                ">
                    <h1 style="
                        font-family: Orbitron;
                        color: gold;
                        font-size: 3rem;
                        margin-bottom: 30px;
                        text-shadow: 0 0 20px rgba(255,215,0,0.8);
                    ">
                        🏆 CONGRATULAZIONI! 🏆
                    </h1>
                    
                    <h2 style="
                        font-family: Orbitron;
                        color: white;
                        font-size: 1.8rem;
                        margin-bottom: 20px;
                    ">
                        HAI COMPLETATO L'IDLE!
                    </h2>
                    
                    <p style="color: white; font-size: 1.2rem; margin-bottom: 30px;">
                        Hai raggiunto il livello 100 in tutte le categorie<br>
                        e accumulato oltre 1 milione di euro!
                    </p>
                    
                    <div style="
                        background: rgba(0,0,0,0.3);
                        padding: 30px;
                        border-radius: 15px;
                        margin: 30px 0;
                    ">
                        <h3 style="color: gold; font-family: Orbitron; font-size: 1.5rem; margin-bottom: 15px;">
                            🏎️ ULTIMATE EDITION SBLOCCATA!
                        </h3>
                        <p style="color: white; font-size: 1.1rem;">
                            Una nuova auto leggendaria è stata aggiunta<br>
                            al Concessionario!
                        </p>
                        <p style="color: var(--accent-cyan); margin-top: 15px; font-size: 1rem;">
                            ⚡ Stats massime: 100/100 su tutto!
                        </p>
                    </div>
                    
                    <button onclick="this.parentElement.parentElement.remove(); if(window.game) game.changePage('dealer');" style="
                        padding: 20px 50px;
                        background: gold;
                        color: #1a0033;
                        border: none;
                        border-radius: 15px;
                        font-family: Orbitron;
                        font-size: 1.3rem;
                        font-weight: bold;
                        cursor: pointer;
                        transition: all 0.3s;
                        box-shadow: 0 10px 30px rgba(255,215,0,0.4);
                    " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                        VAI AL CONCESSIONARIO!
                    </button>
                </div>
                
                <style>
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.02); }
                    }
                </style>
            `;
            
            document.body.appendChild(popup);
            
        } catch (error) {
            console.error('❌ Errore unlock auto:', error);
        }
    },
    
    // Upgrade categoria
    async upgrade(category) {
        const currentLevel = this.levels[category];
        
        if (currentLevel >= this.MAX_LEVEL) {
            showNotification('Livello massimo raggiunto!', 'info');
            return;
        }
        
        const cost = this.upgradeCost(category, currentLevel);
        
        if (this.balance < cost) {
            showNotification('Saldo insufficiente!', 'error');
            return;
        }
        
        // Esegui upgrade
        this.balance -= cost;
        this.levels[category]++;
        
        // Salva e renderizza
        await this.save();
        this.render();
        
        showNotification(`✅ Upgrade ${category} → Liv ${this.levels[category]}`, 'success');
    },
    
    // Salva su database
    async save() {
        try {
            const userId = await getUserId();
            
            const { error } = await supabase
                .from('idle_progress')
                .update({
                    balance: this.balance,
                    last_update: new Date().toISOString(),
                    pilot_level: this.levels.pilot,
                    sponsor_level: this.levels.sponsor,
                    merch_level: this.levels.merch,
                    tech_sponsor_level: this.levels.techSponsor,
                    tv_level: this.levels.tv,
                    team_level: this.levels.team,
                    car_level: this.levels.car,
                    structures_level: this.levels.structures,
                    total_race_wins: this.stats.totalWins,
                    total_money_earned: this.stats.totalEarned,
                    max_balance: this.stats.maxBalance,
                    play_time_seconds: this.stats.playTimeSeconds
                })
                .eq('user_id', userId);
            
            if (error) throw error;
            
        } catch (error) {
            console.error('❌ Errore save IDLE:', error);
        }
    },
    
    // Formatta denaro
    formatMoney(amount) {
        if (amount >= 1000000) {
            return (amount / 1000000).toFixed(2) + 'M€';
        } else if (amount >= 1000) {
            return (amount / 1000).toFixed(1) + 'k€';
        } else {
            return amount.toFixed(2) + '€';
        }
    },
    
    // Formatta per secondo
    formatPerSecond(amount) {
        if (Math.abs(amount) >= 100) {
            return amount.toFixed(0) + '€/sec';
        } else if (Math.abs(amount) >= 1) {
            return amount.toFixed(2) + '€/sec';
        } else {
            return amount.toFixed(3) + '€/sec';
        }
    },
    
    // Aggiorna solo display saldo (chiamato ogni secondo)
    updateBalanceDisplay() {
        const balanceEl = document.getElementById('idleBalance');
        const incomeEl = document.getElementById('idleIncome');
        const expensesEl = document.getElementById('idleExpenses');
        const netEl = document.getElementById('idleNet');
        const perHourEl = document.getElementById('idlePerHour');
        
        if (!balanceEl) return;
        
        const balancePerSec = this.calculateBalancePerSecond();
        
        // Calcola entrate e uscite separate
        const income = 
            this.pilotIncome(this.levels.pilot) +
            this.sponsorIncome(this.levels.sponsor) +
            this.merchIncome(this.levels.merch) +
            this.techSponsorIncome(this.levels.techSponsor) +
            this.tvIncome(this.levels.tv);
        
        const expenses = 
            this.teamCost(this.levels.team) +
            this.carCost(this.levels.car) +
            this.structuresCost(this.levels.structures);
        
        balanceEl.textContent = this.formatMoney(this.balance);
        incomeEl.textContent = this.formatPerSecond(income);
        expensesEl.textContent = this.formatPerSecond(expenses);
        netEl.textContent = this.formatPerSecond(balancePerSec);
        perHourEl.textContent = this.formatMoney(balancePerSec * 3600);
        
        // Colora net in base a positivo/negativo
        netEl.style.color = balancePerSec >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    },
    
    // Render completo UI
    render() {
        const container = document.getElementById('idleContainer');
        if (!container) return;
        
        const balancePerSec = this.calculateBalancePerSecond();
        
        // Calcola entrate e uscite
        const income = 
            this.pilotIncome(this.levels.pilot) +
            this.sponsorIncome(this.levels.sponsor) +
            this.merchIncome(this.levels.merch) +
            this.techSponsorIncome(this.levels.techSponsor) +
            this.tvIncome(this.levels.tv);
        
        const expenses = 
            this.teamCost(this.levels.team) +
            this.carCost(this.levels.car) +
            this.structuresCost(this.levels.structures);
        
        container.innerHTML = `
            <div style="max-width: 1200px; margin: 0 auto; padding: 20px;">
                <h2 style="font-family: Orbitron; color: var(--accent-cyan); text-align: center; margin-bottom: 30px;">
                    🏎️ IDLE SCUDERIA
                </h2>
                
                <!-- Dashboard -->
                <div style="background: rgba(138,43,226,0.1); border: 2px solid rgba(138,43,226,0.3); border-radius: 12px; padding: 30px; margin-bottom: 30px;">
                    <div style="text-align: center;">
                        <h3 style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 10px;">SALDO</h3>
                        <div id="idleBalance" style="font-family: Orbitron; font-size: 3rem; color: var(--accent-yellow); margin-bottom: 30px;">
                            ${this.formatMoney(this.balance)}
                        </div>
                        
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px;">
                            <div>
                                <div style="color: rgba(255,255,255,0.6); font-size: 0.8rem; margin-bottom: 5px;">📈 ENTRATE</div>
                                <div id="idleIncome" style="font-size: 1.3rem; color: var(--accent-green);">${this.formatPerSecond(income)}</div>
                            </div>
                            <div>
                                <div style="color: rgba(255,255,255,0.6); font-size: 0.8rem; margin-bottom: 5px;">📉 USCITE</div>
                                <div id="idleExpenses" style="font-size: 1.3rem; color: var(--accent-red);">${this.formatPerSecond(expenses)}</div>
                            </div>
                            <div>
                                <div style="color: rgba(255,255,255,0.6); font-size: 0.8rem; margin-bottom: 5px;">⚖️ BILANCIO</div>
                                <div id="idleNet" style="font-size: 1.3rem; color: ${balancePerSec >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">${this.formatPerSecond(balancePerSec)}</div>
                            </div>
                            <div>
                                <div style="color: rgba(255,255,255,0.6); font-size: 0.8rem; margin-bottom: 5px;">⏱️ PER ORA</div>
                                <div id="idlePerHour" style="font-size: 1.3rem; color: var(--accent-cyan);">${this.formatMoney(balancePerSec * 3600)}</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Tabs -->
                <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                    <button onclick="IdleManager.showTab('income')" id="tabIncome" class="idle-tab active">
                        📈 ENTRATE
                    </button>
                    <button onclick="IdleManager.showTab('expenses')" id="tabExpenses" class="idle-tab">
                        📉 USCITE
                    </button>
                    <button onclick="IdleManager.showTab('stats')" id="tabStats" class="idle-tab">
                        📊 STATS
                    </button>
                </div>
                
                <!-- Content -->
                <div id="idleTabContent"></div>
            </div>
            
            <style>
                .idle-tab {
                    flex: 1;
                    padding: 15px;
                    background: rgba(255,255,255,0.05);
                    border: 2px solid rgba(255,255,255,0.1);
                    border-radius: 10px;
                    color: white;
                    font-family: Orbitron;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                
                .idle-tab:hover {
                    background: rgba(255,255,255,0.1);
                    border-color: var(--accent-cyan);
                }
                
                .idle-tab.active {
                    background: var(--accent-cyan);
                    border-color: var(--accent-cyan);
                    color: #1a0033;
                }
                
                .upgrade-card {
                    background: rgba(0,217,255,0.05);
                    border: 2px solid rgba(0,217,255,0.2);
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 15px;
                    transition: all 0.3s;
                }
                
                .upgrade-card:hover {
                    border-color: var(--accent-cyan);
                    transform: translateX(5px);
                }
                
                .upgrade-btn {
                    padding: 12px 30px;
                    background: var(--accent-cyan);
                    color: #1a0033;
                    border: none;
                    border-radius: 8px;
                    font-family: Orbitron;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                
                .upgrade-btn:hover:not(:disabled) {
                    transform: scale(1.05);
                    box-shadow: 0 5px 15px rgba(0,217,255,0.4);
                }
                
                .upgrade-btn:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                }
            </style>
        `;
        
        // Mostra tab di default
        this.showTab('income');
    },
    
    // Mostra tab
    showTab(tab) {
        // Aggiorna pulsanti
        document.querySelectorAll('.idle-tab').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
        
        const content = document.getElementById('idleTabContent');
        
        if (tab === 'income') {
            content.innerHTML = this.renderIncomeTab();
        } else if (tab === 'expenses') {
            content.innerHTML = this.renderExpensesTab();
        } else if (tab === 'stats') {
            content.innerHTML = this.renderStatsTab();
        }
    },
    
    // Render tab entrate
    renderIncomeTab() {
        const categories = [
            { 
                id: 'pilot', 
                icon: '🏁', 
                name: 'PILOTA (Vittorie)', 
                desc: 'Più è bravo, più vince gare',
                getValue: (lv) => this.pilotIncome(lv),
                getBonus: () => {
                    const teamBonus = this.levels.team * 0.5;
                    const carBonus = this.levels.car * 0.8;
                    if (teamBonus + carBonus > 0) {
                        return `+${(teamBonus + carBonus).toFixed(1)}% da Team/Auto`;
                    }
                    return null;
                }
            },
            { id: 'sponsor', icon: '💼', name: 'SPONSOR PRINCIPALE', desc: 'Contratti sponsor lungo termine', getValue: (lv) => this.sponsorIncome(lv) },
            { id: 'merch', icon: '👕', name: 'MERCHANDISING', desc: 'Vendita magliette, gadget', getValue: (lv) => this.merchIncome(lv) },
            { id: 'techSponsor', icon: '🔧', name: 'SPONSOR TECNICI', desc: 'Partnership fornitori', getValue: (lv) => this.techSponsorIncome(lv) },
            { id: 'tv', icon: '📺', name: 'DIRITTI TV', desc: 'Contratti broadcasting', getValue: (lv) => this.tvIncome(lv) }
        ];
        
        return categories.map(cat => {
            const level = this.levels[cat.id];
            const current = cat.getValue(level);
            const next = cat.getValue(level + 1);
            const cost = this.upgradeCost(cat.id, level);
            const canAfford = this.balance >= cost;
            const isMax = level >= this.MAX_LEVEL;
            const bonus = cat.getBonus ? cat.getBonus() : null;
            
            return `
                <div class="upgrade-card">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                        <div>
                            <h3 style="color: var(--accent-cyan); margin-bottom: 5px;">
                                ${cat.icon} ${cat.name}
                            </h3>
                            <p style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 10px;">
                                ${cat.desc}
                            </p>
                            ${bonus ? `<p style="color: var(--accent-green); font-size: 0.85rem;">✨ ${bonus}</p>` : ''}
                        </div>
                        <div style="text-align: right;">
                            <div style="color: var(--accent-yellow); font-size: 1.1rem; font-weight: bold;">
                                Liv ${level}/100
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        <div>
                            <div style="color: rgba(255,255,255,0.6); font-size: 0.8rem;">Guadagno attuale</div>
                            <div style="color: var(--accent-green); font-size: 1.2rem; font-weight: bold;">
                                +${this.formatPerSecond(current)}
                            </div>
                        </div>
                        ${!isMax ? `
                        <div>
                            <div style="color: rgba(255,255,255,0.6); font-size: 0.8rem;">Prossimo livello</div>
                            <div style="color: white; font-size: 1.2rem;">
                                +${this.formatPerSecond(next)}
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <button 
                                class="upgrade-btn" 
                                onclick="IdleManager.upgrade('${cat.id}')"
                                ${!canAfford || isMax ? 'disabled' : ''}
                            >
                                ${this.formatMoney(cost)}
                            </button>
                        </div>
                        ` : `
                        <div colspan="2" style="text-align: center; color: gold; font-weight: bold; grid-column: 2 / 4;">
                            ⭐ LIVELLO MASSIMO ⭐
                        </div>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // Render tab uscite
    renderExpensesTab() {
        const categories = [
            { 
                id: 'team', 
                icon: '👥', 
                name: 'TEAM TECNICO', 
                desc: 'Stipendi meccanici e ingegneri',
                getValue: (lv) => this.teamCost(lv),
                getBonus: (lv) => `+${(lv * 0.5).toFixed(1)}% vittorie pilota`
            },
            { 
                id: 'car', 
                icon: '🏎️', 
                name: 'AUTO', 
                desc: 'Manutenzione e sviluppo',
                getValue: (lv) => this.carCost(lv),
                getBonus: (lv) => `+${(lv * 0.8).toFixed(1)}% vittorie pilota`
            },
            { 
                id: 'structures', 
                icon: '🏢', 
                name: 'STRUTTURE', 
                desc: 'Garage, simulatore, uffici',
                getValue: (lv) => this.structuresCost(lv),
                getBonus: (lv) => `-${(lv * 0.3).toFixed(1)}% tutte uscite`
            }
        ];
        
        return categories.map(cat => {
            const level = this.levels[cat.id];
            const current = cat.getValue(level);
            const next = cat.getValue(level + 1);
            const cost = this.upgradeCost(cat.id, level);
            const canAfford = this.balance >= cost;
            const isMax = level >= this.MAX_LEVEL;
            
            return `
                <div class="upgrade-card">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                        <div>
                            <h3 style="color: var(--accent-red); margin-bottom: 5px;">
                                ${cat.icon} ${cat.name}
                            </h3>
                            <p style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 10px;">
                                ${cat.desc}
                            </p>
                            <p style="color: var(--accent-green); font-size: 0.85rem;">
                                ✨ Benefit: ${cat.getBonus(level)}
                            </p>
                        </div>
                        <div style="text-align: right;">
                            <div style="color: var(--accent-yellow); font-size: 1.1rem; font-weight: bold;">
                                Liv ${level}/100
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        <div>
                            <div style="color: rgba(255,255,255,0.6); font-size: 0.8rem;">Costo attuale</div>
                            <div style="color: var(--accent-red); font-size: 1.2rem; font-weight: bold;">
                                ${this.formatPerSecond(current)}
                            </div>
                        </div>
                        ${!isMax ? `
                        <div>
                            <div style="color: rgba(255,255,255,0.6); font-size: 0.8rem;">Prossimo livello</div>
                            <div style="color: white; font-size: 1.2rem;">
                                ${this.formatPerSecond(next)}
                            </div>
                            <div style="color: var(--accent-green); font-size: 0.85rem; margin-top: 5px;">
                                ${cat.getBonus(level + 1)}
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <button 
                                class="upgrade-btn" 
                                onclick="IdleManager.upgrade('${cat.id}')"
                                ${!canAfford || isMax ? 'disabled' : ''}
                            >
                                ${this.formatMoney(cost)}
                            </button>
                        </div>
                        ` : `
                        <div colspan="2" style="text-align: center; color: gold; font-weight: bold; grid-column: 2 / 4;">
                            ⭐ LIVELLO MASSIMO ⭐
                        </div>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // Render tab stats
    renderStatsTab() {
        const avgLevel = Object.values(this.levels).reduce((a, b) => a + b, 0) / 8;
        const hours = Math.floor(this.stats.playTimeSeconds / 3600);
        const minutes = Math.floor((this.stats.playTimeSeconds % 3600) / 60);
        
        // Check progresso unlock
        const allMaxLevel = Object.values(this.levels).every(lv => lv >= this.MAX_LEVEL);
        const progressLevel = allMaxLevel ? 100 : (avgLevel / this.MAX_LEVEL) * 100;
        const progressBalance = Math.min(100, (this.balance / this.UNLOCK_REQUIREMENTS.minBalance) * 100);
        
        return `
            <div style="background: rgba(0,217,255,0.05); border: 2px solid rgba(0,217,255,0.2); border-radius: 12px; padding: 30px;">
                <h3 style="color: var(--accent-cyan); margin-bottom: 25px; font-size: 1.5rem;">📊 STATISTICHE</h3>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 25px; margin-bottom: 40px;">
                    <div>
                        <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 8px;">💰 Denaro totale guadagnato</div>
                        <div style="font-size: 1.8rem; color: var(--accent-yellow); font-weight: bold;">
                            ${this.formatMoney(this.stats.totalEarned)}
                        </div>
                    </div>
                    
                    <div>
                        <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 8px;">🎯 Saldo massimo raggiunto</div>
                        <div style="font-size: 1.8rem; color: var(--accent-green); font-weight: bold;">
                            ${this.formatMoney(this.stats.maxBalance)}
                        </div>
                    </div>
                    
                    <div>
                        <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 8px;">⏰ Tempo di gioco</div>
                        <div style="font-size: 1.8rem; color: white; font-weight: bold;">
                            ${hours}h ${minutes}min
                        </div>
                    </div>
                    
                    <div>
                        <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 8px;">📈 Livello medio</div>
                        <div style="font-size: 1.8rem; color: var(--accent-cyan); font-weight: bold;">
                            ${avgLevel.toFixed(1)}
                        </div>
                    </div>
                </div>
                
                <hr style="border: 1px solid rgba(255,255,255,0.1); margin: 40px 0;">
                
                <h3 style="color: gold; margin-bottom: 25px; font-size: 1.5rem;">🏆 PROGRESSO UNLOCK AUTO SPECIALE</h3>
                
                <div style="margin-bottom: 30px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span style="color: rgba(255,255,255,0.8);">Tutti i livelli a 100</span>
                        <span style="color: ${allMaxLevel ? 'var(--accent-green)' : 'var(--accent-yellow)'}; font-weight: bold;">
                            ${allMaxLevel ? '✅ COMPLETATO' : Math.floor(progressLevel) + '%'}
                        </span>
                    </div>
                    <div style="background: rgba(0,0,0,0.3); height: 30px; border-radius: 15px; overflow: hidden;">
                        <div style="
                            width: ${progressLevel}%;
                            height: 100%;
                            background: ${allMaxLevel ? 'var(--accent-green)' : 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple))'};
                            transition: width 0.5s;
                        "></div>
                    </div>
                </div>
                
                <div style="margin-bottom: 30px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span style="color: rgba(255,255,255,0.8);">Saldo minimo 1.000.000€</span>
                        <span style="color: ${this.balance >= this.UNLOCK_REQUIREMENTS.minBalance ? 'var(--accent-green)' : 'var(--accent-yellow)'}; font-weight: bold;">
                            ${this.balance >= this.UNLOCK_REQUIREMENTS.minBalance ? '✅ COMPLETATO' : Math.floor(progressBalance) + '%'}
                        </span>
                    </div>
                    <div style="background: rgba(0,0,0,0.3); height: 30px; border-radius: 15px; overflow: hidden;">
                        <div style="
                            width: ${progressBalance}%;
                            height: 100%;
                            background: ${this.balance >= this.UNLOCK_REQUIREMENTS.minBalance ? 'var(--accent-green)' : 'linear-gradient(90deg, var(--accent-yellow), gold)'};
                            transition: width 0.5s;
                        "></div>
                    </div>
                </div>
                
                ${allMaxLevel && this.balance >= this.UNLOCK_REQUIREMENTS.minBalance ? `
                    <div style="
                        background: linear-gradient(135deg, gold, #ffd700);
                        color: #1a0033;
                        padding: 30px;
                        border-radius: 15px;
                        text-align: center;
                        font-family: Orbitron;
                        font-size: 1.5rem;
                        font-weight: bold;
                        animation: pulse 2s infinite;
                    ">
                        🏆 AUTO SPECIALE SBLOCCATA! 🏆
                    </div>
                ` : `
                    <div style="
                        background: rgba(255,215,0,0.1);
                        border: 2px solid rgba(255,215,0,0.3);
                        padding: 20px;
                        border-radius: 10px;
                        text-align: center;
                        color: rgba(255,255,255,0.8);
                    ">
                        Completa entrambi i requisiti per sbloccare l'auto speciale!
                    </div>
                `}
            </div>
        `;
    },
    
    // Cleanup
    destroy() {
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
        }
        this.save();
    }
};

// Esponi globalmente
window.IdleManager = IdleManager;

console.log('✅ Idle Manager caricato');
