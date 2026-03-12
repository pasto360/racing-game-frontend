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
            console.log('📥 Caricamento beta_circuits_fantasy.json...');
            const response = await fetch('beta_circuits_fantasy.json');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.circuits = data.circuits || [];
            
            console.log(`✅ Caricati ${this.circuits.length} circuiti:`, this.circuits.map(c => c.name));
            
            if (this.circuits.length === 0) {
                throw new Error('File beta_circuits_fantasy.json vuoto o malformato');
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
            
            // Calcola giorno corrente (per check limite giornaliero)
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            
            // Carica ultima corsa dell'utente per questo circuito/settimana
            const { data, error } = await supabase
                .from('beta_race_results')
                .select('*')
                .eq('user_id', userId)
                .eq('circuit_id', this.currentCircuit.id)
                .eq('week_number', weekNumber)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (error && error.code !== 'PGRST116') {
                console.warn('⚠️ Errore caricamento stato utente:', error);
                this.hasRaced = false;
                this.lastRaceDate = null;
                this.result = null;
            } else if (data) {
                // Controlla se ha già corso oggi
                const raceDate = new Date(data.created_at).toISOString().split('T')[0];
                this.hasRaced = (raceDate === today);
                this.lastRaceDate = raceDate;
                
                // Mostra sempre il miglior risultato (senza posizione - si vede in classifica)
                this.result = {
                    totalTime: data.total_time,
                    bestLap: data.best_lap,
                    dnf: data.dnf,
                    dnfLap: data.dnf_lap
                };
            } else {
                this.hasRaced = false;
                this.lastRaceDate = null;
                this.result = null;
            }
            
            // Carica classifica settimanale (migliori tempi)
            await this.loadLeaderboard(weekNumber);
            
        } catch (error) {
            console.error('❌ Errore caricamento sfida:', error);
        }
    },
    
    // Carica classifica settimanale (miglior tempo per utente)
    async loadLeaderboard(weekNumber) {
        try {
            // Query per ottenere solo il MIGLIOR tempo di ogni utente
            const { data, error} = await supabase
                .from('beta_race_results')
                .select(`
                    user_id,
                    total_time,
                    best_lap,
                    users!inner(username)
                `)
                .eq('circuit_id', this.currentCircuit.id)
                .eq('week_number', weekNumber)
                .eq('dnf', false)
                .order('total_time', { ascending: true });
            
            if (error) {
                console.warn('⚠️ Errore caricamento classifica:', error);
                this.leaderboard = [];
                return;
            }
            
            // Raggruppa per utente e prendi solo il miglior tempo
            const bestTimes = new Map();
            (data || []).forEach(entry => {
                const existing = bestTimes.get(entry.user_id);
                if (!existing || entry.total_time < existing.total_time) {
                    bestTimes.set(entry.user_id, {
                        username: entry.users.username,
                        totalTime: entry.total_time,
                        bestLap: entry.best_lap
                    });
                }
            });
            
            // Converti in array e ordina
            this.leaderboard = Array.from(bestTimes.values())
                .sort((a, b) => a.totalTime - b.totalTime)
                .slice(0, 50) // Top 50
                .map((entry, index) => ({
                    position: index + 1,
                    username: entry.username,
                    totalTime: entry.totalTime,
                    bestLap: entry.bestLap
                }));
            
        } catch (error) {
            console.error('❌ Errore caricamento classifica:', error);
            this.leaderboard = [];
        }
    },
    
    // Calcola numero settimana
    // Calcola numero settimana (reset ogni LUNEDÌ)
    getWeekNumber() {
        const now = new Date();
        
        // Trova il lunedì di questa settimana
        const dayOfWeek = now.getDay(); // 0=domenica, 1=lunedì, ..., 6=sabato
        const daysFromMonday = (dayOfWeek === 0) ? 6 : dayOfWeek - 1; // Domenica conta come 6 giorni dal lunedì
        
        // Calcola lunedì corrente
        const monday = new Date(now);
        monday.setDate(now.getDate() - daysFromMonday);
        monday.setHours(0, 0, 0, 0);
        
        // Primo lunedì dell'anno
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const firstMonday = new Date(yearStart);
        const firstDayOfWeek = yearStart.getDay();
        const daysToMonday = (firstDayOfWeek === 0) ? 1 : (8 - firstDayOfWeek);
        firstMonday.setDate(yearStart.getDate() + daysToMonday);
        firstMonday.setHours(0, 0, 0, 0);
        
        // Calcola differenza in settimane
        const diffTime = monday - firstMonday;
        const weekNumber = Math.floor(diffTime / 604800000) + 1; // +1 perché iniziamo da settimana 1
        
        console.log(`📅 Settimana corrente: ${weekNumber} (Lunedì: ${monday.toLocaleDateString()})`);
        
        return weekNumber;
    },
    
    // Esegui simulazione
    async runSimulation() {
        try {
            const session = getSession();
            if (!session) {
                alert('Devi essere loggato!');
                return;
            }
            
            // Check se ha già corso oggi
            if (this.hasRaced) {
                alert('⏳ Hai già corso oggi!\n\nPotrai fare una nuova simulazione domani.\n\nOgni giorno hai 1 tentativo per migliorare il tuo tempo.');
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
            
            // Calcola risultato simulazione (solo tempi, no posizione/premi)
            const result = this.calculateSimulation(car);
            
            // Salva su Supabase
            const weekNumber = this.getWeekNumber();
            const userId = session.user.id;
            
            // Inserisci nuovo record (non upsert - vogliamo storico giornaliero)
            const { error } = await supabase
                .from('beta_race_results')
                .insert({
                    user_id: userId,
                    circuit_id: this.currentCircuit.id,
                    week_number: weekNumber,
                    total_time: result.dnf ? 999999 : result.totalTime,
                    best_lap: result.bestLap,
                    position: 0,
                    dnf: result.dnf,
                    dnf_lap: result.dnfLap || 0,
                    reward: { money: 0, parts: 0 },
                    setup: this.setup
                });
            
            if (error) throw error;
            
            // Ricarica classifica (la posizione verrà mostrata lì)
            await this.loadLeaderboard(weekNumber);
            
            // Aggiorna stato (NO posizione qui - solo nella classifica)
            this.hasRaced = true;
            this.lastRaceDate = new Date().toISOString().split('T')[0];
            this.result = {
                totalTime: result.totalTime,
                bestLap: result.bestLap,
                dnf: result.dnf,
                dnfLap: result.dnfLap
            };
            
            // Re-render
            this.render();
            
        } catch (error) {
            console.error('❌ Errore simulazione:', error);
            console.error('Dettagli errore completi:', JSON.stringify(error, null, 2));
            
            let errorMessage = 'Errore durante la simulazione!';
            
            if (error.message?.includes('relation') || error.message?.includes('does not exist') || error.code === '42P01') {
                errorMessage = '❌ TABELLA beta_race_results NON TROVATA!\n\n' +
                               'Devi creare la tabella su Supabase:\n\n' +
                               '1. Vai su Supabase.com\n' +
                               '2. SQL Editor\n' +
                               '3. Esegui SQL-BETA-RAPIDO.sql\n\n' +
                               'Vedi file ISTRUZIONI-SQL-BETA.md per dettagli';
            } else if (error.code === 'PGRST116') {
                errorMessage = 'Nessun dato trovato (normale per prima volta)';
            } else if (error.hint) {
                errorMessage = `Errore DB: ${error.message}\n\nSuggerimento: ${error.hint}`;
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
        
        return {
            totalTime: dnf ? 0 : totalTime,
            bestLap,
            dnf,
            dnfLap
        };
    },
    
    // Tracciati circuiti SVG - Realistici (ispirati a circuiti famosi)
    CIRCUIT_PATHS: {
        'dragon_peak': {
            path: 'M 40 160 L 80 160 Q 100 140, 120 120 Q 140 100, 180 90 L 240 90 Q 260 95, 270 120 L 270 150 Q 265 170, 240 175 L 160 175 Q 130 180, 110 165 Q 90 150, 70 140 L 50 135 Q 42 145, 40 160 Z',
            startX: 40, startY: 160
        },
        'harbor_street': {
            path: 'M 50 100 L 80 100 L 90 80 L 110 80 L 120 60 L 140 60 L 150 80 L 170 80 L 180 100 L 200 100 L 210 120 L 230 120 L 240 140 L 240 160 L 220 160 L 210 140 L 190 140 L 180 160 L 160 160 L 150 140 L 130 140 L 120 160 L 100 160 L 90 140 L 70 140 L 60 120 L 50 120 Z',
            startX: 50, startY: 100
        },
        'royal_speedway': {
            path: 'M 40 100 L 180 100 L 190 90 L 200 90 L 210 100 L 260 100 Q 280 110, 280 140 Q 280 170, 260 180 L 110 180 L 100 170 L 90 170 L 80 180 L 40 180 Q 20 170, 20 140 Q 20 110, 40 100 Z',
            startX: 40, startY: 100
        },
        'crystal_valley': {
            path: 'M 50 140 Q 70 120, 100 115 Q 130 110, 160 120 Q 180 130, 190 150 Q 200 170, 220 175 L 250 175 Q 270 165, 275 140 Q 270 115, 250 105 L 180 105 Q 160 100, 140 95 Q 110 90, 80 100 Q 60 110, 50 130 Z',
            startX: 50, startY: 140
        },
        'phoenix_circuit': {
            path: 'M 50 60 Q 80 50, 110 55 Q 140 60, 160 80 Q 180 100, 160 120 Q 140 140, 110 135 L 90 130 Q 70 140, 60 160 Q 50 180, 70 190 Q 100 200, 130 185 Q 160 170, 180 150 Q 200 130, 220 120 Q 240 110, 250 130 Q 260 150, 240 165 Q 210 180, 180 175 L 120 175 Q 90 170, 70 150 Q 50 130, 40 100 Q 35 75, 50 60 Z',
            startX: 50, startY: 60
        },
        'forest_ring': {
            path: 'M 30 140 Q 40 120, 60 110 Q 80 100, 100 110 L 120 120 Q 140 110, 160 105 Q 180 100, 200 110 Q 220 120, 230 140 Q 240 160, 225 175 Q 210 185, 190 180 L 170 175 Q 150 180, 140 170 Q 130 160, 120 150 L 110 160 Q 100 170, 85 175 Q 70 180, 55 170 Q 40 160, 35 145 L 30 140 Z',
            startX: 30, startY: 140
        },
        'sunset_canyon': {
            path: 'M 50 170 L 90 170 Q 110 165, 130 150 Q 150 135, 170 115 Q 190 95, 210 80 L 240 80 Q 255 85, 260 100 Q 265 120, 250 135 Q 230 155, 210 165 L 170 165 Q 150 170, 130 180 Q 110 185, 90 185 L 60 185 Q 45 180, 42 165 Q 42 155, 50 150 Z',
            startX: 50, startY: 170
        },
        'thunder_valley': {
            path: 'M 60 140 Q 80 120, 110 115 L 150 115 Q 180 110, 210 115 Q 240 120, 255 140 Q 265 160, 245 175 L 200 175 Q 180 180, 160 175 L 140 170 Q 120 175, 100 170 L 80 165 Q 65 160, 60 145 Z',
            startX: 60, startY: 140
        }
    },
    
    // Genera tracciato del circuito (ora usa path predefiniti)
    generateCircuitPath(circuit) {
        const width = 300;
        const height = 200;
        
        // Usa path predefinito se esiste, altrimenti fallback a cerchio
        const circuitData = this.CIRCUIT_PATHS[circuit.id];
        
        if (!circuitData) {
            console.warn(`⚠️ Nessun path per circuito ${circuit.id}, uso fallback`);
            // Fallback: cerchio semplice
            return {
                path: 'M 150 50 Q 250 50, 250 150 Q 250 250, 150 250 Q 50 250, 50 150 Q 50 50, 150 50 Z',
                width,
                height
            };
        }
        
        return {
            path: circuitData.path,
            width,
            height
        };
    },
    
    // Render mappa animata del circuito
    renderCircuitMap(circuit) {
        const { path, width, height } = this.generateCircuitPath(circuit);
        
        return `
            <div style="margin: 20px 0; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 15px; display: flex; justify-content: center;">
                <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="max-width: 100%;">
                    <!-- Sfondo griglia -->
                    <defs>
                        <pattern id="grid-${circuit.id}" width="20" height="20" patternUnits="userSpaceOnUse">
                            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>
                        </pattern>
                    </defs>
                    <rect width="${width}" height="${height}" fill="url(#grid-${circuit.id})"/>
                    
                    <!-- Tracciato circuito (ombra) -->
                    <path d="${path}" 
                          fill="none" 
                          stroke="rgba(0,0,0,0.5)" 
                          stroke-width="12" 
                          stroke-linecap="round" 
                          stroke-linejoin="round"/>
                    
                    <!-- Tracciato circuito -->
                    <path d="${path}" 
                          fill="none" 
                          stroke="rgba(0,217,255,0.3)" 
                          stroke-width="10" 
                          stroke-linecap="round" 
                          stroke-linejoin="round"/>
                    
                    <!-- Linea centrale -->
                    <path d="${path}" 
                          fill="none" 
                          stroke="rgba(0,217,255,0.6)" 
                          stroke-width="2" 
                          stroke-linecap="round" 
                          stroke-linejoin="round" 
                          stroke-dasharray="5,5">
                        <animate attributeName="stroke-dashoffset" 
                                 from="0" 
                                 to="10" 
                                 dur="0.5s" 
                                 repeatCount="indefinite"/>
                    </path>
                    
                    <!-- Auto che gira (pallino animato) -->
                    <circle r="4" fill="#00d9ff" stroke="#ffffff" stroke-width="1.5">
                        <animateMotion dur="8s" repeatCount="indefinite" rotate="auto">
                            <mpath href="#circuit-path-${circuit.id}"/>
                        </animateMotion>
                        
                        <!-- Pulsazione -->
                        <animate attributeName="r" 
                                 values="4;5;4" 
                                 dur="1s" 
                                 repeatCount="indefinite"/>
                    </circle>
                    
                    <!-- Path nascosto per animateMotion -->
                    <path id="circuit-path-${circuit.id}" d="${path}" fill="none" stroke="none"/>
                    
                    <!-- Traguardo -->
                    <g transform="translate(${width/2 - 10}, ${height - 30})">
                        <rect x="0" y="0" width="20" height="15" fill="#ffffff" opacity="0.9"/>
                        <rect x="0" y="0" width="10" height="7.5" fill="#000000"/>
                        <rect x="10" y="7.5" width="10" height="7.5" fill="#000000"/>
                        <text x="10" y="25" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="10" font-weight="bold">START</text>
                    </g>
                </svg>
            </div>
        `;
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
                    <p style="font-style: italic; color: var(--text-secondary); margin-bottom: 15px;">${circuit.description}</p>
                    
                    ${this.renderCircuitMap(circuit)}
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
        const canRaceAgainTomorrow = this.hasRaced;
        
        return `
            <div style="background: ${r.dnf ? 'rgba(255,51,51,0.1)' : 'rgba(0,255,136,0.1)'}; border: 2px solid ${r.dnf ? 'var(--accent-red)' : 'var(--accent-green)'}; border-radius: 12px; padding: 20px; margin-bottom: 30px;">
                <h3 style="font-family: Orbitron; color: ${r.dnf ? 'var(--accent-red)' : 'var(--accent-green)'}; margin-bottom: 20px;">
                    ${r.dnf ? '❌ DNF (Ritirato)' : `✅ Tempo Registrato!`}
                </h3>
                
                ${r.dnf ? `
                    <p style="font-size: 1.1rem; margin-bottom: 15px;">
                        Ritirato al giro ${r.dnfLap} per mancanza di carburante!
                    </p>
                    <p style="color: var(--text-secondary);">
                        ${canRaceAgainTomorrow ? 'Potrai riprovare domani con più carburante.' : 'Riprova con un setup più efficiente.'}
                    </p>
                ` : `
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                        <div>
                            <strong>⏱️ Tempo totale:</strong><br>
                            <span style="font-size: 1.5rem; font-weight: 700; color: var(--accent-cyan);">${this.formatTime(r.totalTime)}</span>
                        </div>
                        <div>
                            <strong>🏁 Giro veloce:</strong><br>
                            <span style="font-size: 1.5rem; font-weight: 700; color: var(--accent-yellow);">${this.formatTime(r.bestLap)}</span>
                        </div>
                    </div>
                    
                    <div style="background: rgba(0,217,255,0.1); border: 1px solid var(--accent-cyan); border-radius: 8px; padding: 15px; margin-top: 20px;">
                        <h4 style="color: var(--accent-cyan); margin-bottom: 10px;">📊 Controlla la Classifica!</h4>
                        <p style="margin-bottom: 0;">Scorri qui sotto per vedere la tua <strong>posizione attuale</strong> tra tutti i piloti della settimana.</p>
                    </div>
                    
                    <div style="background: rgba(255,140,0,0.1); border: 1px solid var(--accent-yellow); border-radius: 8px; padding: 15px; margin-top: 15px;">
                        <h4 style="color: var(--accent-yellow); margin-bottom: 10px;">📅 Prossimi Passi</h4>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li>🔄 <strong>Domani</strong> avrai un altro tentativo per migliorare</li>
                            <li>🏆 Solo il tuo <strong>miglior tempo</strong> conta per la classifica</li>
                            <li>💰 <strong>Lunedì prossimo</strong> i premi verranno assegnati ai top 50</li>
                        </ul>
                        
                        <div style="background: rgba(0,0,0,0.2); border-radius: 6px; padding: 10px; margin-top: 10px;">
                            <strong>💰 Premi Fine Settimana:</strong>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; font-size: 0.85rem; margin-top: 8px;">
                                <div>🥇 1°: 50.000€</div>
                                <div>🥈 2°: 30.000€</div>
                                <div>🥉 3°: 15.000€</div>
                                <div>4-10°: 5.000€</div>
                                <div>11-50°: 1.000€</div>
                            </div>
                        </div>
                    </div>
                `}
                
                <p style="margin-top: 20px; text-align: center; color: var(--text-secondary); font-size: 0.9rem;">
                    ${canRaceAgainTomorrow 
                        ? '⏳ Hai già corso oggi. Prossimo tentativo disponibile domani!' 
                        : ''}
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
