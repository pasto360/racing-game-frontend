// ========================================
// BETA TELEMETRY SIMULATOR - V2.0
// Sistema qualifica con telemetria reale
// ========================================

const BetaTelemetry = {
    _initialized: false,
    
    // Circuito F1 - 17 Curve
    circuit: {
        name: "F1 Circuit - 17 Curve",
        length: 5200, // metri
        sectors: [
            // SETTORE 1
            { type: 'corner', id: 1, name: 'Curva 1 (ampia)', radius: 190, angle: 90, gripLevel: 1.0 },
            { type: 'corner', id: 2, name: 'Curva 2', radius: 185, angle: 45, gripLevel: 1.0 },
            { type: 'corner', id: 3, name: 'Curva 3 (veloce, piega)', radius: 126, angle: 60, gripLevel: 0.95 },
            
            // SETTORE 2
            { type: 'straight', id: 'main', name: 'Rettilineo principale', length: 1000 },
            { type: 'corner', id: 4, name: 'Curva 4 (stretta)', radius: 210, angle: 80, gripLevel: 1.0 },
            { type: 'corner', id: 5, name: 'Curva 5 (tornantino)', radius: 158, angle: 75, gripLevel: 1.0 },
            { type: 'corner', id: 6, name: 'Curva 6 (media)', radius: 348, angle: 50, gripLevel: 1.0 },
            
            // SETTORE 3
            { type: 'corner', id: 7, name: 'Curva 7 (media)', radius: 157, angle: 70, gripLevel: 1.0 },
            { type: 'corner', id: 8, name: 'Curva 8 (ampia)', radius: 231, angle: 85, gripLevel: 1.0 },
            { type: 'corner', id: 9, name: 'Curva 9 (veloce)', radius: 120, angle: 90, gripLevel: 0.95 },
            { type: 'corner', id: 10, name: 'Curva 10', radius: 156, angle: 65, gripLevel: 1.0 }
        ]
    },
    
    // Setup auto (SEMPLIFICATO - MVP)
    setup: {
        // GOMME
        tireCompound: 'soft', // soft, medium, hard
        tirePressure: 21.5, // psi (19-24)
        
        // AERODINAMICA
        downforce: 60, // % (0-100) - più alto = più grip curve, meno velocità
        
        // BILANCIAMENTO
        brakeBias: 56 // % anteriore (50-60)
    },
    
    // Input utente (velocità target per ogni curva)
    userSpeeds: {},
    
    // Telemetria ideale (calcolata)
    idealTelemetry: null,
    
    // Risultato ultimo giro
    lastResult: null,
    
    // ===== FISICA SEMPLIFICATA =====
    
    // Calcola velocità massima in curva
    calculateMaxCornerSpeed(radius, gripLevel, downforce, tireCompound) {
        // Grip base dalla gomma
        const tireGrip = {
            'soft': 1.1,
            'medium': 1.0,
            'hard': 0.9
        }[tireCompound];
        
        // Coefficiente di aderenza laterale
        const lateralG = gripLevel * tireGrip * (1 + downforce / 100 * 0.4);
        
        // Formula fisica: v = sqrt(μ * g * r)
        const vMps = Math.sqrt(lateralG * 9.81 * radius);
        const vKmh = vMps * 3.6;
        
        return vKmh;
    },
    
    // Calcola tempo attraversamento curva
    calculateCornerTime(radius, angle, userSpeed, maxSpeed) {
        // Lunghezza arco di cerchio
        const arcLength = (radius * angle * Math.PI) / 180;
        
        // Se troppo veloce, penalità tempo (simulazione correzione)
        let effectiveSpeed = userSpeed;
        if (userSpeed > maxSpeed * 1.05) {
            // Troppo veloce - deve correggere (perde tempo)
            const overspeedFactor = userSpeed / maxSpeed;
            effectiveSpeed = maxSpeed / overspeedFactor; // Rallenta drasticamente
        } else if (userSpeed > maxSpeed) {
            // Leggermente sopra il limite - piccola correzione
            effectiveSpeed = maxSpeed * 0.98;
        }
        
        // Converti km/h → m/s
        const speedMps = effectiveSpeed / 3.6;
        
        // Tempo = distanza / velocità
        return arcLength / speedMps;
    },
    
    // Calcola tempo su rettilineo
    calculateStraightTime(length, downforce) {
        // Velocità massima influenzata da deportanza
        // Meno carico = più velocità
        const maxSpeed = 320 - (downforce / 100 * 30); // 320 km/h base
        
        // Accelerazione media (semplificata)
        const avgAccel = 8.5; // m/s²
        const timeToMax = (maxSpeed / 3.6) / avgAccel;
        const distToMax = 0.5 * avgAccel * timeToMax * timeToMax;
        
        if (distToMax >= length) {
            // Non raggiunge max speed
            const time = Math.sqrt((2 * length) / avgAccel);
            return time;
        } else {
            // Raggiunge max e mantiene
            const timeAccel = timeToMax;
            const distConstant = length - distToMax;
            const timeConstant = distConstant / (maxSpeed / 3.6);
            return timeAccel + timeConstant;
        }
    },
    
    // ===== CALCOLO TELEMETRIA IDEALE =====
    
    calculateIdealLap() {
        const telemetry = {
            sectors: [],
            totalTime: 0,
            speeds: {}
        };
        
        let time = 0;
        
        this.circuit.sectors.forEach(sector => {
            if (sector.type === 'corner') {
                const maxSpeed = this.calculateMaxCornerSpeed(
                    sector.radius,
                    sector.gripLevel,
                    this.setup.downforce,
                    this.setup.tireCompound
                );
                
                const cornerTime = this.calculateCornerTime(
                    sector.radius,
                    sector.angle,
                    maxSpeed,
                    maxSpeed
                );
                
                telemetry.speeds[sector.id] = Math.round(maxSpeed);
                telemetry.sectors.push({
                    id: sector.id,
                    name: sector.name,
                    type: 'corner',
                    idealSpeed: Math.round(maxSpeed),
                    time: cornerTime
                });
                
                time += cornerTime;
            } else {
                const straightTime = this.calculateStraightTime(
                    sector.length,
                    this.setup.downforce
                );
                
                telemetry.sectors.push({
                    id: sector.id,
                    name: sector.name,
                    type: 'straight',
                    time: straightTime
                });
                
                time += straightTime;
            }
        });
        
        telemetry.totalTime = time;
        this.idealTelemetry = telemetry;
        
        return telemetry;
    },
    
    // ===== VALIDAZIONE GIRO UTENTE =====
    
    validateLap() {
        if (!this.idealTelemetry) {
            this.calculateIdealLap();
        }
        
        const result = {
            valid: true,
            totalTime: 0,
            sectors: [],
            deltas: [],
            invalidReason: null
        };
        
        let time = 0;
        
        this.circuit.sectors.forEach(sector => {
            if (sector.type === 'corner') {
                const userSpeed = this.userSpeeds[sector.id] || this.idealTelemetry.speeds[sector.id];
                const maxSpeed = this.calculateMaxCornerSpeed(
                    sector.radius,
                    sector.gripLevel,
                    this.setup.downforce,
                    this.setup.tireCompound
                );
                
                // Validazione: troppo veloce = giro annullato
                if (userSpeed > maxSpeed * 1.1) {
                    result.valid = false;
                    result.invalidReason = `Curva ${sector.id} (${sector.name}): velocità troppo alta! ${userSpeed} km/h > max ${Math.round(maxSpeed * 1.1)} km/h`;
                    return;
                }
                
                const cornerTime = this.calculateCornerTime(
                    sector.radius,
                    sector.angle,
                    userSpeed,
                    maxSpeed
                );
                
                const idealSector = this.idealTelemetry.sectors.find(s => s.id === sector.id);
                const delta = cornerTime - idealSector.time;
                
                result.sectors.push({
                    id: sector.id,
                    name: sector.name,
                    type: 'corner',
                    userSpeed,
                    idealSpeed: idealSector.idealSpeed,
                    time: cornerTime,
                    delta
                });
                
                result.deltas.push(delta);
                time += cornerTime;
            } else {
                const straightTime = this.calculateStraightTime(
                    sector.length,
                    this.setup.downforce
                );
                
                const idealSector = this.idealTelemetry.sectors.find(s => s.id === sector.id);
                const delta = 0; // Rettilineo automatico
                
                result.sectors.push({
                    id: sector.id,
                    name: sector.name,
                    type: 'straight',
                    time: straightTime,
                    delta
                });
                
                time += straightTime;
            }
        });
        
        if (result.valid) {
            result.totalTime = time;
            result.totalDelta = time - this.idealTelemetry.totalTime;
        }
        
        this.lastResult = result;
        return result;
    },
    
    // ===== FORMATTAZIONE TEMPO =====
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(3);
        return `${mins}:${secs.padStart(6, '0')}`;
    },
    
    formatDelta(delta) {
        const sign = delta >= 0 ? '+' : '';
        return `${sign}${delta.toFixed(3)}s`;
    },
    
    // ===== RENDERING UI =====
    
    async init() {
        console.log('🏁 Inizializzazione BETA Telemetry Simulator...');
        
        this._initialized = true;
        
        // Calcola telemetria ideale
        this.calculateIdealLap();
        
        // Inizializza velocità utente con ideali
        this.circuit.sectors.forEach(sector => {
            if (sector.type === 'corner') {
                this.userSpeeds[sector.id] = this.idealTelemetry.speeds[sector.id];
            }
        });
        
        this.render();
    },
    
    render() {
        const container = document.getElementById('betaContainer');
        if (!container) return;
        
        container.innerHTML = `
            <div style="max-width: 900px; margin: 0 auto; padding: 20px;">
                <h2 style="color: var(--accent-cyan); font-family: Orbitron; margin-bottom: 20px;">
                    🏎️ SIMULATORE TELEMETRICO - QUALIFICA
                </h2>
                
                ${this.renderSetup()}
                ${this.renderSpeedInputs()}
                ${this.renderResults()}
            </div>
        `;
        
        this.attachListeners();
    },
    
    renderSetup() {
        return `
            <div style="background: rgba(255,255,255,0.05); border: 2px solid var(--accent-cyan); border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                <h3 style="color: var(--accent-yellow); margin-bottom: 15px;">⚙️ SETUP AUTO</h3>
                
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                    <!-- GOMME -->
                    <div>
                        <label style="display: block; color: var(--text-secondary); margin-bottom: 5px;">🏁 Mescola gomme</label>
                        <select id="tireCompound" style="width: 100%; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid var(--accent-cyan); border-radius: 5px; color: white;">
                            <option value="soft" ${this.setup.tireCompound === 'soft' ? 'selected' : ''}>Soft (grip +10%)</option>
                            <option value="medium" ${this.setup.tireCompound === 'medium' ? 'selected' : ''}>Medium (bilanciato)</option>
                            <option value="hard" ${this.setup.tireCompound === 'hard' ? 'selected' : ''}>Hard (grip -10%)</option>
                        </select>
                    </div>
                    
                    <!-- AERODINAMICA -->
                    <div>
                        <label style="display: block; color: var(--text-secondary); margin-bottom: 5px;">✈️ Deportanza: ${this.setup.downforce}%</label>
                        <input type="range" id="downforce" min="0" max="100" value="${this.setup.downforce}" 
                               style="width: 100%;">
                        <small style="color: var(--text-secondary);">Alto = +curve -velocità</small>
                    </div>
                    
                    <!-- FRENI -->
                    <div>
                        <label style="display: block; color: var(--text-secondary); margin-bottom: 5px;">🔴 Bilanciamento freni: ${this.setup.brakeBias}%</label>
                        <input type="range" id="brakeBias" min="50" max="60" value="${this.setup.brakeBias}" 
                               style="width: 100%;">
                        <small style="color: var(--text-secondary);">% anteriore</small>
                    </div>
                </div>
                
                <div style="margin-top: 15px; text-align: center;">
                    <button onclick="BetaTelemetry.updateSetup()" 
                            style="padding: 10px 30px; background: var(--accent-cyan); color: #1a0033; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">
                        ♻️ RICALCOLA TELEMETRIA IDEALE
                    </button>
                </div>
            </div>
        `;
    },
    
    renderSpeedInputs() {
        if (!this.idealTelemetry) return '';
        
        const corners = this.circuit.sectors.filter(s => s.type === 'corner');
        
        return `
            <div style="background: rgba(255,255,255,0.05); border: 2px solid var(--accent-yellow); border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                <h3 style="color: var(--accent-yellow); margin-bottom: 15px;">🎯 IMPOSTA VELOCITÀ CURVE</h3>
                <p style="color: var(--text-secondary); margin-bottom: 20px;">
                    Clicca "Auto" per usare velocità ideale, oppure modifica manualmente.
                </p>
                
                <div style="display: grid; gap: 15px;">
                    ${corners.map(corner => {
                        const idealSpeed = this.idealTelemetry.speeds[corner.id];
                        const userSpeed = this.userSpeeds[corner.id] || idealSpeed;
                        const maxSpeed = this.calculateMaxCornerSpeed(
                            corner.radius,
                            corner.gripLevel,
                            this.setup.downforce,
                            this.setup.tireCompound
                        );
                        const minSpeed = Math.round(maxSpeed * 0.7);
                        
                        return `
                            <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                    <div>
                                        <strong style="color: var(--accent-cyan);">Curva ${corner.id}</strong>
                                        <span style="color: var(--text-secondary); margin-left: 10px;">${corner.name}</span>
                                    </div>
                                    <div style="text-align: right;">
                                        <div style="font-size: 1.2rem; color: white; font-weight: bold;">${userSpeed} km/h</div>
                                        <small style="color: var(--text-secondary);">Ideale: ${idealSpeed} km/h</small>
                                    </div>
                                </div>
                                
                                <div style="display: flex; gap: 10px; align-items: center;">
                                    <input type="range" 
                                           id="speed-${corner.id}" 
                                           min="${minSpeed}" 
                                           max="${Math.round(maxSpeed * 1.15)}" 
                                           value="${userSpeed}"
                                           oninput="BetaTelemetry.updateSpeed(${corner.id}, this.value)"
                                           style="flex: 1;">
                                    <button onclick="BetaTelemetry.resetSpeed(${corner.id})" 
                                            style="padding: 5px 15px; background: rgba(255,255,255,0.1); border: 1px solid var(--accent-cyan); border-radius: 5px; color: white; cursor: pointer;">
                                        Auto
                                    </button>
                                </div>
                                
                                <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 0.85rem;">
                                    <span style="color: var(--accent-red);">Min: ${minSpeed}</span>
                                    <span style="color: var(--accent-yellow);">Max: ${Math.round(maxSpeed)}</span>
                                    <span style="color: var(--accent-green);">Sicuro: ${Math.round(maxSpeed * 1.1)}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <div style="margin-top: 20px; text-align: center;">
                    <button onclick="BetaTelemetry.runQualifying()" 
                            style="padding: 15px 50px; background: var(--accent-green); color: #1a0033; border: none; border-radius: 8px; font-size: 1.2rem; font-weight: bold; cursor: pointer;">
                        🏁 ESEGUI GIRO DI QUALIFICA
                    </button>
                </div>
            </div>
        `;
    },
    
    renderResults() {
        if (!this.lastResult) return '';
        
        const result = this.lastResult;
        
        if (!result.valid) {
            return `
                <div style="background: rgba(255,51,51,0.1); border: 2px solid var(--accent-red); border-radius: 10px; padding: 30px; text-align: center;">
                    <div style="font-size: 4rem; margin-bottom: 20px;">❌</div>
                    <h3 style="color: var(--accent-red); font-size: 1.5rem; margin-bottom: 15px;">GIRO ANNULLATO</h3>
                    <p style="color: white; font-size: 1.1rem;">${result.invalidReason}</p>
                </div>
            `;
        }
        
        return `
            <div style="background: rgba(0,255,136,0.1); border: 2px solid var(--accent-green); border-radius: 10px; padding: 20px;">
                <h3 style="color: var(--accent-green); margin-bottom: 20px;">📊 RISULTATO QUALIFICA</h3>
                
                <!-- TEMPO FINALE -->
                <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                    <div style="color: var(--text-secondary); margin-bottom: 5px;">TEMPO GIRO</div>
                    <div style="font-size: 2.5rem; font-family: 'Courier New', monospace; color: ${result.totalDelta < 0 ? 'var(--accent-green)' : 'var(--accent-yellow)'}; font-weight: bold;">
                        ${this.formatTime(result.totalTime)}
                    </div>
                    <div style="font-size: 1.2rem; color: ${result.totalDelta < 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
                        ${this.formatDelta(result.totalDelta)}
                    </div>
                    <div style="color: var(--text-secondary); margin-top: 10px;">
                        Ideale: ${this.formatTime(this.idealTelemetry.totalTime)}
                    </div>
                </div>
                
                <!-- DETTAGLIO SETTORI -->
                <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px;">
                    <pre style="color: white; font-family: 'Courier New', monospace; margin: 0; overflow-x: auto;">
══════════════════════════════════════════════════════
DETTAGLIO TELEMETRIA
══════════════════════════════════════════════════════
${result.sectors.map(s => {
    if (s.type === 'corner') {
        const speedDiff = s.userSpeed - s.idealSpeed;
        const speedColor = Math.abs(speedDiff) < 5 ? '✓' : (speedDiff > 0 ? '⚠️' : '🔴');
        return `Curva ${s.id.toString().padStart(2)}: ${s.userSpeed.toString().padStart(3)} km/h (ideale: ${s.idealSpeed.toString().padStart(3)}) ${speedColor} | ${this.formatDelta(s.delta)}`;
    } else {
        return `Rettilineo: AUTO | ${s.time.toFixed(3)}s`;
    }
}).join('\n')}
══════════════════════════════════════════════════════
TOTALE: ${this.formatTime(result.totalTime)} (${this.formatDelta(result.totalDelta)})
══════════════════════════════════════════════════════
                    </pre>
                </div>
            </div>
        `;
    },
    
    // ===== INTERAZIONI =====
    
    attachListeners() {
        // Nessun listener necessario - tutto gestito inline con onclick/oninput
    },
    
    updateSetup() {
        const tireCompound = document.getElementById('tireCompound').value;
        const downforce = parseInt(document.getElementById('downforce').value);
        const brakeBias = parseInt(document.getElementById('brakeBias').value);
        
        this.setup.tireCompound = tireCompound;
        this.setup.downforce = downforce;
        this.setup.brakeBias = brakeBias;
        
        // Ricalcola telemetria ideale
        this.calculateIdealLap();
        
        // Reset velocità utente
        this.circuit.sectors.forEach(sector => {
            if (sector.type === 'corner') {
                this.userSpeeds[sector.id] = this.idealTelemetry.speeds[sector.id];
            }
        });
        
        // Re-render
        this.render();
    },
    
    updateSpeed(cornerId, speed) {
        this.userSpeeds[cornerId] = parseInt(speed);
        
        // Aggiorna solo il valore visualizzato (no re-render completo)
        const display = document.querySelector(`#speed-${cornerId}`).parentElement.previousElementSibling.querySelector('.font-weight-bold');
        if (display) {
            display.textContent = `${speed} km/h`;
        }
    },
    
    resetSpeed(cornerId) {
        this.userSpeeds[cornerId] = this.idealTelemetry.speeds[cornerId];
        
        // Aggiorna slider
        const slider = document.getElementById(`speed-${cornerId}`);
        if (slider) {
            slider.value = this.idealTelemetry.speeds[cornerId];
        }
        
        // Re-render per aggiornare visualizzazione
        this.render();
    },
    
    runQualifying() {
        const result = this.validateLap();
        this.render();
        
        // Scroll a risultati
        setTimeout(() => {
            const results = document.querySelector('[style*="RISULTATO QUALIFICA"]');
            if (results) {
                results.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
};

// Esponi globalmente
window.BetaTelemetry = BetaTelemetry;

console.log('✅ Beta Telemetry Simulator caricato');
