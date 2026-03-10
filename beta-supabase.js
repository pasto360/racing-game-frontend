// ========================================
// BETA SIMULATOR - SUPABASE VERSION
// Sistema settim completo simulatore gare
// ========================================

const BetaModule = {
    _initialized: false,
    circuits: [],
    currentCircuit: null,
    hasRaced: false,
    result: null,
    leaderboard: [],
    
    // Setup default
    setup: {
        fuel: 100,
        tires: 'medium',
        tirePressure: 2.0,
        downforce: 50,
        gearRatio: 'medium',
        suspension: 0
    },
    
    // Inizializza modulo
    async init() {
        console.log('🏁 Inizializzazione BETA Simulator...');
        
        const container = document.getElementById('betaContainer');
        if (container) {
            container.innerHTML = '<p style="text-align:center; padding:40px;">⏳ Caricamento circuiti...</p>';
        }
        
        try {
            // Carica circuiti
            await this.loadCircuits();
            
            if (this.circuits.length === 0) {
                throw new Error('Nessun circuito caricato');
            }
            
            // Carica sfida settimanale
            await this.loadWeeklyChallenge();
            
            // Render interfaccia
            this.render();
            
            console.log('✅ BETA Simulator inizializzato');
            
        } catch (error) {
            console.error('❌ Errore inizializzazione BETA:', error);
            if (container) {
                container.innerHTML = `
                    <div style="text-align:center; padding:40px; color: var(--accent-red);">
                        <div style="font-size: 3rem; margin-bottom: 20px;">❌</div>
                        <h3>Errore caricamento BETA Simulator</h3>
                        <p style="color: var(--text-secondary); margin-top: 10px;">${error.message}</p>
                        <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 20px;">
                            Ricarica Pagina
                        </button>
                    </div>
                `;
            }
        }
    },
    
    // Carica circuiti da JSON
    async loadCircuits() {
        try {
            console.log('📥 Caricamento beta_circuits.json...');
            const response = await fetch('beta_circuits.json');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.circuits = data.circuits || [];
            
            console.log(`✅ Caricati ${this.circuits.length} circuiti:`, this.circuits.map(c => c.name));
            
            if (this.circuits.length === 0) {
                throw new Error('File beta_circuits.json vuoto o malformato');
            }
            
        } catch (error) {
            console.error('❌ Errore caricamento circuiti:', error);
            console.error('Dettagli:', error.message);
            this.circuits = [];
            throw error; // Rilancia per gestione in init()
        }
    },
    
    // Carica circuito settimanale + stato utente
    async loadWeeklyChallenge() {
        try {
            const session = getSession();
            if (!session) throw new Error('No session');
            
            const userId = session.user.id;
            
            // Calcola circuito settimanale
            const weekNumber = this.getWeekNumber();
            const circuitIndex = weekNumber % this.circuits.length;
            this.currentCircuit = this.circuits[circuitIndex];
            
            // Carica stato utente da Supabase
            const { data, error } = await supabase
                .from('beta_race_results')
                .select('*')
                .eq('user_id', userId)
                .eq('circuit_id', this.currentCircuit.id)
                .eq('week_number', weekNumber)
                .maybeSingle();
            
            if (error && error.code !== 'PGRST116') {
                console.warn('⚠️ Errore caricamento stato utente (tabella potrebbe non esistere):', error);
                // Non bloccare - procedi come se non avesse mai corso
                this.hasRaced = false;
                this.result = null;
            } else if (data) {
                this.hasRaced = true;
                this.result = {
                    totalTime: data.total_time,
                    bestLap: data.best_lap,
                    position: data.position,
                    dnf: data.dnf,
                    dnfLap: data.dnf_lap,
                    reward: data.reward
                };
            } else {
                this.hasRaced = false;
                this.result = null;
            }
            
            // Carica classifica settimanale
            await this.loadLeaderboard(weekNumber);
            
        } catch (error) {
            console.error('❌ Errore caricamento sfida:', error);
        }
    },
    
    // Carica classifica settimanale
    async loadLeaderboard(weekNumber) {
        try {
            const { data, error} = await supabase
                .from('beta_race_results')
                .select(`
                    user_id,
                    total_time,
                    best_lap,
                    position,
                    dnf,
                    users!inner(username)
                `)
                .eq('circuit_id', this.currentCircuit.id)
                .eq('week_number', weekNumber)
                .eq('dnf', false)
                .order('total_time', { ascending: true })
                .limit(50);
            
            if (error) {
                console.warn('⚠️ Errore caricamento classifica (tabella potrebbe non esistere):', error);
                this.leaderboard = [];
                return;
            }
            
            this.leaderboard = (data || []).map((entry, index) => ({
                position: index + 1,
                username: entry.users.username,
                totalTime: entry.total_time,
                bestLap: entry.best_lap
            }));
            
        } catch (error) {
            console.error('❌ Errore caricamento classifica:', error);
            this.leaderboard = [];
        }
    },
    
    // Calcola numero settimana
    getWeekNumber() {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        const diff = now - start;
        return Math.floor(diff / 604800000); // millisecondi in una settimana
    },
    
    // Esegui simulazione
    async runSimulation() {
        try {
            const session = getSession();
            if (!session) {
                alert('Devi essere loggato!');
                return;
            }
            
            const car = game.ownedCars[game.selectedCarIndex || 0];
            if (!car) {
                alert('Devi avere un\'auto!');
                return;
            }
            
            // Mostra loading
            const btn = document.getElementById('runSimBtn');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '⏳ Simulazione in corso...';
            }
            
            // Calcola risultato simulazione
            const result = this.calculateSimulation(car);
            
            // Salva su Supabase
            const weekNumber = this.getWeekNumber();
            const userId = session.user.id;
            
            const { error } = await supabase
                .from('beta_race_results')
                .upsert({
                    user_id: userId,
                    circuit_id: this.currentCircuit.id,
                    week_number: weekNumber,
                    total_time: result.dnf ? 0 : result.totalTime,
                    best_lap: result.bestLap,
                    position: result.position,
                    dnf: result.dnf,
                    dnf_lap: result.dnfLap || 0,
                    reward: result.reward,
                    setup: this.setup
                });
            
            if (error) throw error;
            
            // Assegna premi
            if (!result.dnf) {
                game.resources.money.value += result.reward.money;
                game.resources.parts.value += result.reward.parts;
                await saveGameToSupabase();
            }
            
            // Aggiorna stato
            this.hasRaced = true;
            this.result = result;
            
            // Ricarica classifica
            await this.loadLeaderboard(weekNumber);
            
            // Re-render
            this.render();
            
        } catch (error) {
            console.error('❌ Errore simulazione:', error);
            
            // Messaggio specifico in base al tipo di errore
            let errorMessage = 'Errore durante la simulazione!';
            
            if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
                errorMessage = '❌ Tabella beta_race_results non trovata!\n\nDevi eseguire lo script SQL su Supabase:\n\nVai su Supabase → SQL Editor → Esegui SCHEMA-BETA-SUPABASE.sql';
            } else if (error.code === 'PGRST116') {
                errorMessage = 'Nessun dato trovato (normale per prima volta)';
            } else if (error.message) {
                errorMessage = `Errore: ${error.message}`;
            }
            
            alert(errorMessage);
            
            const btn = document.getElementById('runSimBtn');
            if (btn) {
                btn.disabled = false;
                btn.textContent = '🏁 ESEGUI SIMULAZIONE';
            }
        }
    },
    
    // Calcola simulazione (logica dal server)
    calculateSimulation(car) {
        const power = (car.stats.engine + (car.upgrades?.engine || 0) * 5) * 3;
        const baseWeight = 1000 + (car.stats.body * 2);
        const totalWeight = baseWeight + this.setup.fuel;
        
        // Velocità max
        let maxSpeed = (power / totalWeight) * 200;
        maxSpeed -= this.setup.downforce * 0.5;
        if (this.setup.gearRatio === 'short') maxSpeed -= 10;
        if (this.setup.gearRatio === 'long') maxSpeed += 10;
        
        // Grip
        let grip = 1.0;
        if (this.setup.tires === 'soft') grip = 1.05;
        if (this.setup.tires === 'hard') grip = 0.98;
        grip += (2.2 - this.setup.tirePressure) * 0.05;
        
        // Consumo carburante/giro
        let fuelPerLap = 2.5;
        fuelPerLap += this.currentCircuit.tightCorners * 0.15;
        fuelPerLap += this.setup.downforce * 0.02;
        if (this.setup.tires === 'soft') fuelPerLap *= 1.1;
        
        // Degrado gomme/giro
        let tireWearPerLap = 0.003;
        if (this.setup.tires === 'soft') tireWearPerLap = 0.005;
        if (this.setup.tires === 'hard') tireWearPerLap = 0.002;
        tireWearPerLap += this.currentCircuit.tightCorners * 0.0005;
        
        // Simula gara
        let totalTime = 0;
        let bestLap = 999;
        let fuel = this.setup.fuel;
        let tireWear = 0;
        let dnf = false;
        let dnfLap = 0;
        
        for (let lap = 1; lap <= this.currentCircuit.laps; lap++) {
            // Check carburante
            if (fuel < fuelPerLap) {
                dnf = true;
                dnfLap = lap;
                break;
            }
            
            // Calcola tempo giro
            const currentGrip = grip * (1 - tireWear);
            const currentWeight = baseWeight + fuel;
            
            let lapTime = 60 + Math.random() * 5;
            lapTime *= (this.currentCircuit.length / 5000);
            lapTime *= (1200 / currentWeight);
            lapTime *= (1 / currentGrip);
            lapTime += (100 - this.setup.downforce) * 0.05;
            lapTime -= maxSpeed * 0.01;
            
            // Penalità dossi
            if (this.currentCircuit.bumps >= 3 && this.setup.suspension === -30) {
                lapTime += 0.5;
            }
            
            totalTime += lapTime;
            if (lapTime < bestLap) bestLap = lapTime;
            
            // Consuma
            fuel -= fuelPerLap;
            tireWear += tireWearPerLap;
        }
        
        // Calcola posizione (mock - basato su tempo totale)
        const position = Math.max(1, Math.floor(Math.random() * 30) + 1);
        
        // Premi
        let reward = { money: 0, parts: 0 };
        if (!dnf) {
            if (position === 1) reward = { money: 50000, parts: 1000 };
            else if (position === 2) reward = { money: 30000, parts: 600 };
            else if (position === 3) reward = { money: 15000, parts: 300 };
            else if (position <= 10) reward = { money: 5000, parts: 100 };
            else if (position <= 50) reward = { money: 1000, parts: 50 };
        }
        
        return {
            totalTime: dnf ? 0 : totalTime,
            bestLap,
            position,
            dnf,
            dnfLap,
            reward
        };
    },
    
    // Format tempo in mm:ss.sss
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(3);
        return `${mins}:${secs.padStart(6, '0')}`;
    },
    
    // Render interfaccia
    render() {
        const container = document.getElementById('betaContainer');
        if (!container) return;
        
        if (!this.currentCircuit) {
            container.innerHTML = '<p style="text-align:center; padding:40px;">Caricamento circuiti...</p>';
            return;
        }
        
        const circuit = this.currentCircuit;
        
        container.innerHTML = `
            <div style="max-width: 1200px; margin: 0 auto;">
                <h2 style="font-family: Orbitron; color: var(--accent-cyan); text-align: center; margin-bottom: 30px;">
                    🏎️ BETA SIMULATOR - Sfida Settimanale
                </h2>
                
                <!-- Info Circuito -->
                <div style="background: rgba(138,43,226,0.1); border: 2px solid rgba(138,43,226,0.3); border-radius: 12px; padding: 20px; margin-bottom: 30px;">
                    <h3 style="font-family: Orbitron; color: rgba(138,43,226,0.9); margin-bottom: 15px;">
                        ${circuit.name}
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px;">
                        <div><strong>Paese:</strong> ${circuit.country}</div>
                        <div><strong>Lunghezza:</strong> ${circuit.length}m</div>
                        <div><strong>Giri:</strong> ${circuit.laps}</div>
                        <div><strong>Curve strette:</strong> ${circuit.tightCorners}</div>
                        <div><strong>Rettilinei:</strong> ${circuit.longStraights}</div>
                        <div><strong>Dossi:</strong> ${circuit.bumps}</div>
                    </div>
                    <p style="font-style: italic; color: var(--text-secondary);">${circuit.description}</p>
                </div>
                
                ${this.hasRaced ? this.renderResult() : this.renderSetup()}
                
                ${this.renderLeaderboard()}
            </div>
        `;
        
        // Attach event listeners
        if (!this.hasRaced) {
            this.attachSetupListeners();
        }
    },
    
    // Render setup auto (prima della gara)
    renderSetup() {
        return `
            <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin-bottom: 30px;">
                <h3 style="font-family: Orbitron; color: var(--accent-yellow); margin-bottom: 20px;">
                    ⚙️ SETUP AUTO
                </h3>
                
                <div style="display: grid; gap: 20px;">
                    <!-- Carburante -->
                    <div>
                        <label style="display: block; margin-bottom: 8px;"><strong>Carburante:</strong> <span id="fuelValue">${this.setup.fuel}</span> litri</label>
                        <input type="range" id="fuelSlider" min="50" max="150" value="${this.setup.fuel}" style="width: 100%;">
                    </div>
                    
                    <!-- Gomme -->
                    <div>
                        <label style="display: block; margin-bottom: 8px;"><strong>Gomme:</strong></label>
                        <select id="tiresSelect" style="width: 100%; padding: 8px; background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;">
                            <option value="soft" ${this.setup.tires === 'soft' ? 'selected' : ''}>Soft (Grip alto, degrado veloce)</option>
                            <option value="medium" ${this.setup.tires === 'medium' ? 'selected' : ''}>Medium (Bilanciato)</option>
                            <option value="hard" ${this.setup.tires === 'hard' ? 'selected' : ''}>Hard (Grip basso, degrado lento)</option>
                        </select>
                    </div>
                    
                    <!-- Pressione gomme -->
                    <div>
                        <label style="display: block; margin-bottom: 8px;"><strong>Pressione gomme:</strong> <span id="pressureValue">${this.setup.tirePressure}</span> bar</label>
                        <input type="range" id="pressureSlider" min="1.8" max="2.5" step="0.1" value="${this.setup.tirePressure}" style="width: 100%;">
                    </div>
                    
                    <!-- Deportanza -->
                    <div>
                        <label style="display: block; margin-bottom: 8px;"><strong>Deportanza:</strong> <span id="downforceValue">${this.setup.downforce}</span></label>
                        <input type="range" id="downforceSlider" min="0" max="100" value="${this.setup.downforce}" style="width: 100%;">
                        <small style="color: var(--text-secondary);">0 = Velocità max, 100 = Grip max in curva</small>
                    </div>
                    
                    <!-- Rapporti -->
                    <div>
                        <label style="display: block; margin-bottom: 8px;"><strong>Rapporti cambio:</strong></label>
                        <select id="gearSelect" style="width: 100%; padding: 8px; background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;">
                            <option value="short" ${this.setup.gearRatio === 'short' ? 'selected' : ''}>Corti (Accelerazione)</option>
                            <option value="medium" ${this.setup.gearRatio === 'medium' ? 'selected' : ''}>Medi (Bilanciato)</option>
                            <option value="long" ${this.setup.gearRatio === 'long' ? 'selected' : ''}>Lunghi (Velocità max)</option>
                        </select>
                    </div>
                    
                    <!-- Sospensioni -->
                    <div>
                        <label style="display: block; margin-bottom: 8px;"><strong>Sospensioni:</strong> <span id="suspensionValue">${this.setup.suspension > 0 ? '+' : ''}${this.setup.suspension}mm</span></label>
                        <input type="range" id="suspensionSlider" min="-30" max="30" value="${this.setup.suspension}" style="width: 100%;">
                        <small style="color: var(--text-secondary);">-30 = Basse (veloce su liscio), +30 = Alte (migliore su dossi)</small>
                    </div>
                </div>
                
                <button id="runSimBtn" onclick="BetaModule.runSimulation()" class="btn btn-primary" style="width: 100%; margin-top: 30px; font-size: 1.2rem; padding: 15px;">
                    🏁 ESEGUI SIMULAZIONE
                </button>
            </div>
        `;
    },
    
    // Render risultato (dopo la gara)
    renderResult() {
        const r = this.result;
        return `
            <div style="background: ${r.dnf ? 'rgba(255,51,51,0.1)' : 'rgba(0,255,136,0.1)'}; border: 2px solid ${r.dnf ? 'var(--accent-red)' : 'var(--accent-green)'}; border-radius: 12px; padding: 20px; margin-bottom: 30px;">
                <h3 style="font-family: Orbitron; color: ${r.dnf ? 'var(--accent-red)' : 'var(--accent-green)'}; margin-bottom: 20px;">
                    ${r.dnf ? '❌ DNF (Ritirato)' : `🏁 Posizione: ${r.position}°`}
                </h3>
                
                ${r.dnf ? `
                    <p style="font-size: 1.1rem; margin-bottom: 15px;">
                        Ritirato al giro ${r.dnfLap} per mancanza di carburante!
                    </p>
                ` : `
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                        <div>
                            <strong>Tempo totale:</strong><br>
                            <span style="font-size: 1.3rem; color: var(--accent-cyan);">${this.formatTime(r.totalTime)}</span>
                        </div>
                        <div>
                            <strong>Giro veloce:</strong><br>
                            <span style="font-size: 1.3rem; color: var(--accent-yellow);">${this.formatTime(r.bestLap)}</span>
                        </div>
                    </div>
                    
                    <div style="background: rgba(0,255,136,0.1); border-radius: 8px; padding: 15px;">
                        <h4 style="color: var(--accent-yellow); margin-bottom: 10px;">🎁 Premi</h4>
                        <div style="display: flex; gap: 20px; justify-content: center;">
                            <div style="font-size: 1.2rem;">💰 +${r.reward.money}€</div>
                            <div style="font-size: 1.2rem;">🔩 +${r.reward.parts} Parti</div>
                        </div>
                    </div>
                `}
                
                <p style="margin-top: 20px; text-align: center; color: var(--text-secondary);">
                    Nuova sfida disponibile lunedì prossimo!
                </p>
            </div>
        `;
    },
    
    // Render classifica
    renderLeaderboard() {
        if (this.leaderboard.length === 0) {
            return '<p style="text-align:center; color: var(--text-secondary);">Nessun risultato ancora. Sii il primo!</p>';
        }
        
        let html = `
            <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 20px;">
                <h3 style="font-family: Orbitron; color: var(--accent-cyan); margin-bottom: 20px;">
                    🏆 CLASSIFICA SETTIMANALE
                </h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid rgba(255,255,255,0.1);">
                            <th style="padding: 10px; text-align: left;">Pos</th>
                            <th style="padding: 10px; text-align: left;">Pilota</th>
                            <th style="padding: 10px; text-align: right;">Tempo Totale</th>
                            <th style="padding: 10px; text-align: right;">Giro Veloce</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        const session = getSession();
        const currentUsername = session?.user?.username;
        
        this.leaderboard.forEach(entry => {
            const isCurrentUser = entry.username === currentUsername;
            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: ${isCurrentUser ? 'rgba(0,217,255,0.1)' : 'transparent'};">
                    <td style="padding: 10px;">
                        ${entry.position === 1 ? '🥇' : entry.position === 2 ? '🥈' : entry.position === 3 ? '🥉' : entry.position}
                    </td>
                    <td style="padding: 10px; font-weight: ${isCurrentUser ? '700' : '400'};">
                        ${entry.username}${isCurrentUser ? ' (Tu)' : ''}
                    </td>
                    <td style="padding: 10px; text-align: right; font-family: 'Courier New', monospace;">
                        ${this.formatTime(entry.totalTime)}
                    </td>
                    <td style="padding: 10px; text-align: right; font-family: 'Courier New', monospace;">
                        ${this.formatTime(entry.bestLap)}
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        return html;
    },
    
    // Attach listeners ai controlli setup
    attachSetupListeners() {
        const fuelSlider = document.getElementById('fuelSlider');
        const fuelValue = document.getElementById('fuelValue');
        if (fuelSlider) {
            fuelSlider.addEventListener('input', (e) => {
                this.setup.fuel = parseInt(e.target.value);
                if (fuelValue) fuelValue.textContent = this.setup.fuel;
            });
        }
        
        const tiresSelect = document.getElementById('tiresSelect');
        if (tiresSelect) {
            tiresSelect.addEventListener('change', (e) => {
                this.setup.tires = e.target.value;
            });
        }
        
        const pressureSlider = document.getElementById('pressureSlider');
        const pressureValue = document.getElementById('pressureValue');
        if (pressureSlider) {
            pressureSlider.addEventListener('input', (e) => {
                this.setup.tirePressure = parseFloat(e.target.value);
                if (pressureValue) pressureValue.textContent = this.setup.tirePressure.toFixed(1);
            });
        }
        
        const downforceSlider = document.getElementById('downforceSlider');
        const downforceValue = document.getElementById('downforceValue');
        if (downforceSlider) {
            downforceSlider.addEventListener('input', (e) => {
                this.setup.downforce = parseInt(e.target.value);
                if (downforceValue) downforceValue.textContent = this.setup.downforce;
            });
        }
        
        const gearSelect = document.getElementById('gearSelect');
        if (gearSelect) {
            gearSelect.addEventListener('change', (e) => {
                this.setup.gearRatio = e.target.value;
            });
        }
        
        const suspensionSlider = document.getElementById('suspensionSlider');
        const suspensionValue = document.getElementById('suspensionValue');
        if (suspensionSlider) {
            suspensionSlider.addEventListener('input', (e) => {
                this.setup.suspension = parseInt(e.target.value);
                if (suspensionValue) {
                    const val = this.setup.suspension;
                    suspensionValue.textContent = `${val > 0 ? '+' : ''}${val}mm`;
                }
            });
        }
    }
};

// Esponi globalmente
window.BetaModule = BetaModule;

console.log('✅ Beta Simulator Supabase caricato');
