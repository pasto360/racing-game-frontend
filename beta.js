// =====================================================
// BETA.JS - Simulatore Gara (MVP)
// =====================================================

const BetaModule = (() => {

    const getApiUrl = () => {
        // Usa API_URL globale dal gioco principale (già configurato in index.html)
        return window.API_URL || 'http://localhost:3000';
    };

    const api = async (endpoint, options = {}) => {
        const token = window.authToken || localStorage.getItem('authToken');
        const response = await fetch(`${getApiUrl()}/api/beta/${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {})
            }
        });
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        return response.json();
    };

    let state = {
        circuit: null,
        hasRacedToday: false,
        attemptsThisWeek: 0,
        attempts: [],
        bestResult: null,
        setup: {
            tires: 'medium',
            downforce: 50,
            fuel: 50,
            tirePressure: 2.2,
            suspension: 0,
            gearRatio: 'medium',
            brakeBias: 55,
            engineMap: 'balanced'
        },
        leaderboard: []
    };

    const render = async (container, gameInstance, skipAPICall = false) => {
        try {
            // ✅ Ricarica da API solo se non skipAPICall
            if (!skipAPICall) {
                const data = await api('weekly-challenge');
                
                state.circuit = data.circuit;
                state.hasRacedToday = data.hasRacedToday;
                state.attempts = data.attempts || [];
                state.bestResult = data.bestResult || null;
                state.attemptsThisWeek = data.attemptsThisWeek || 0;
                state.leaderboard = data.leaderboard;
            }

            container.innerHTML = `
                ${renderCircuit()}
                ${state.attempts.length > 0 ? renderAttempts() : ''}
                ${!state.hasRacedToday ? renderSetup(gameInstance) : ''}
                ${renderLeaderboard()}
            `;
            
            console.log('📊 Stato - hasRacedToday:', state.hasRacedToday, 'tentativi settimana:', state.attemptsThisWeek);

            attachListeners(gameInstance);

        } catch (error) {
            console.error('Errore:', error);
            container.innerHTML = `
                <div class="beta-empty">
                    <span class="beta-icon">❌</span>
                    <h3>Errore Caricamento</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    };

    const renderCircuit = () => {
        const c = state.circuit;
        if (!c) return '';

        return `
            <div class="circuit-header">
                <div class="circuit-name">🏁 ${c.name}</div>
                <div class="circuit-country">${c.country}</div>
                <p style="color: rgba(255,255,255,0.7); font-style: italic;">${c.description}</p>
                
                <!-- BOX AUTO -->
                <div style="background: rgba(255,165,0,0.1); border: 2px solid rgba(255,165,0,0.3); border-radius: 10px; padding: 15px; margin: 15px 0;">
                    <div style="font-family: Orbitron; font-size: 1.1rem; color: #ffa500; margin-bottom: 10px; text-align: center;">
                        🏎️ THUNDERBOLT R-9
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; text-align: center;">
                        <div>
                            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">Potenza</div>
                            <div style="font-family: Orbitron; font-size: 1rem; color: #00d9ff;">380 HP</div>
                        </div>
                        <div>
                            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">Peso</div>
                            <div style="font-family: Orbitron; font-size: 1rem; color: #00d9ff;">1250 kg</div>
                        </div>
                        <div>
                            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">Consumo Base</div>
                            <div style="font-family: Orbitron; font-size: 1rem; color: #00d9ff;">3.4 L/giro</div>
                        </div>
                        <div>
                            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">Rapporto P/P</div>
                            <div style="font-family: Orbitron; font-size: 1rem; color: #ffa500;">0.304</div>
                        </div>
                    </div>
                    <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4); text-align: center; margin-top: 8px;">
                        ⚠️ Consumo e prestazioni variano in base al setup
                    </div>
                </div>
                
                <div class="circuit-stats">
                    <div class="circuit-stat">
                        <div class="circuit-stat-label">Lunghezza</div>
                        <div class="circuit-stat-value">${(c.length / 1000).toFixed(1)} km</div>
                    </div>
                    <div class="circuit-stat">
                        <div class="circuit-stat-label">Giri</div>
                        <div class="circuit-stat-value">${c.laps}</div>
                    </div>
                    <div class="circuit-stat">
                        <div class="circuit-stat-label">Curve Strette</div>
                        <div class="circuit-stat-value">${c.tightCorners} 🔴</div>
                    </div>
                    <div class="circuit-stat">
                        <div class="circuit-stat-label">Curve Medie</div>
                        <div class="circuit-stat-value">${c.mediumCorners} 🟡</div>
                    </div>
                    <div class="circuit-stat">
                        <div class="circuit-stat-label">Curve Veloci</div>
                        <div class="circuit-stat-value">${c.fastCorners} 🟢</div>
                    </div>
                    <div class="circuit-stat">
                        <div class="circuit-stat-label">Rettilinei</div>
                        <div class="circuit-stat-value">${c.longStraights + c.shortStraights}</div>
                    </div>
                </div>

                ${!state.hasRacedToday ? `
                    <div style="margin-top: 20px; padding: 15px; background: rgba(0,217,255,0.1); border-radius: 8px; border-left: 4px solid #00d9ff;">
                        <strong style="color: #00d9ff;">🏁 Tentativo Disponibile Oggi</strong><br>
                        <span style="color: rgba(255,255,255,0.7); font-size: 0.9rem;">
                            1 tentativo al giorno. Migliora il tuo miglior tempo settimanale!
                        </span>
                        ${state.attemptsThisWeek > 0 ? `<br><span style="color: rgba(255,255,255,0.5); font-size: 0.85rem; margin-top: 5px; display: inline-block;">📊 Tentativi questa settimana: ${state.attemptsThisWeek}</span>` : ''}
                    </div>
                ` : `
                    <div style="margin-top: 20px; padding: 15px; background: rgba(255,69,0,0.1); border-radius: 8px; border-left: 4px solid #ff4500;">
                        <strong style="color: #ff4500;">✅ Hai già corso oggi</strong><br>
                        <span style="color: rgba(255,255,255,0.7); font-size: 0.9rem;">
                            Nuovo tentativo disponibile domani alle 00:00
                        </span>
                        ${state.attemptsThisWeek > 0 ? `<br><span style="color: rgba(255,255,255,0.5); font-size: 0.85rem; margin-top: 5px; display: inline-block;">📊 Tentativi questa settimana: ${state.attemptsThisWeek}</span>` : ''}
                    </div>
                `}
            </div>
        `;
    };

    const renderSetup = (game) => {
        return `
            <div class="setup-section">
                <div class="setup-title">⚙️ Setup Auto</div>

                <div class="setup-param">
                    <div class="setup-param-label">
                        <span>🏁 Gomme</span>
                    </div>
                    <div class="setup-radio-group">
                        <div class="setup-radio">
                            <input type="radio" name="tires" id="tires-hard" value="hard" ${state.setup.tires === 'hard' ? 'checked' : ''}>
                            <label for="tires-hard">Dure</label>
                        </div>
                        <div class="setup-radio">
                            <input type="radio" name="tires" id="tires-medium" value="medium" ${state.setup.tires === 'medium' ? 'checked' : ''}>
                            <label for="tires-medium">Medie</label>
                        </div>
                        <div class="setup-radio">
                            <input type="radio" name="tires" id="tires-soft" value="soft" ${state.setup.tires === 'soft' ? 'checked' : ''}>
                            <label for="tires-soft">Morbide</label>
                        </div>
                    </div>
                </div>

                <div class="setup-param">
                    <div class="setup-param-label">
                        <span>✈️ Deportanza</span>
                        <span id="downforce-val">${state.setup.downforce}%</span>
                    </div>
                    <input type="range" class="setup-slider" id="downforce" min="0" max="100" value="${state.setup.downforce}">
                </div>

                <div class="setup-param">
                    <div class="setup-param-label">
                        <span>⛽ Carburante</span>
                        <span id="fuel-val">${state.setup.fuel} L</span>
                    </div>
                    <input type="range" class="setup-slider" id="fuel" min="20" max="110" value="${state.setup.fuel}" step="5">
                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 5px;">
                        Serbatoio max: 110L • ~70L per 20 giri • Più fuel = più peso
                    </div>
                </div>

                <div class="setup-param">
                    <div class="setup-param-label">
                        <span>💨 Pressione</span>
                        <span id="pressure-val">${state.setup.tirePressure} bar</span>
                    </div>
                    <input type="range" class="setup-slider" id="pressure" min="1.8" max="2.5" step="0.1" value="${state.setup.tirePressure}">
                </div>

                <div class="setup-param">
                    <div class="setup-param-label">
                        <span>🔧 Sospensioni</span>
                        <span id="suspension-val">${state.setup.suspension > 0 ? '+' : ''}${state.setup.suspension} mm</span>
                    </div>
                    <input type="range" class="setup-slider" id="suspension" min="-30" max="30" step="10" value="${state.setup.suspension}">
                </div>

                <div class="setup-param">
                    <div class="setup-param-label">
                        <span>⚙️ Rapporto</span>
                    </div>
                    <div class="setup-radio-group">
                        <div class="setup-radio">
                            <input type="radio" name="gear" id="gear-short" value="short" ${state.setup.gearRatio === 'short' ? 'checked' : ''}>
                            <label for="gear-short">Corto</label>
                        </div>
                        <div class="setup-radio">
                            <input type="radio" name="gear" id="gear-medium" value="medium" ${state.setup.gearRatio === 'medium' ? 'checked' : ''}>
                            <label for="gear-medium">Medio</label>
                        </div>
                        <div class="setup-radio">
                            <input type="radio" name="gear" id="gear-long" value="long" ${state.setup.gearRatio === 'long' ? 'checked' : ''}>
                            <label for="gear-long">Lungo</label>
                        </div>
                    </div>
                </div>

                <!-- PREVIEW CALCOLI -->
                <div style="background: rgba(0,217,255,0.05); border: 2px solid rgba(0,217,255,0.2); border-radius: 10px; padding: 15px; margin-top: 20px;">
                    <div style="font-family: Orbitron; color: #00d9ff; margin-bottom: 10px; text-align: center;">📊 Previsione Gara</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center;">
                        <div>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5);">Consumo/Giro</div>
                            <div id="preview-consumption" style="font-family: Orbitron; font-size: 1rem; color: #ffa500;">3.4 L</div>
                        </div>
                        <div>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5);">Giri Possibili</div>
                            <div id="preview-laps" style="font-family: Orbitron; font-size: 1rem; color: #00d9ff;">14</div>
                        </div>
                        <div>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5);">Peso Totale</div>
                            <div id="preview-weight" style="font-family: Orbitron; font-size: 1rem; color: #fff;">1300 kg</div>
                        </div>
                    </div>
                    <div id="preview-warning" style="font-size: 0.75rem; text-align: center; margin-top: 10px;"></div>
                </div>

                <button class="simulate-btn" id="run-btn">🏁 AVVIA SIMULAZIONE</button>
            </div>
        `;
    };

    const renderAttempts = () => {
        if (!state.attempts || state.attempts.length === 0) return '';

        const formatTime = (s) => {
            const m = Math.floor(s / 60);
            const sec = (s % 60).toFixed(3);
            return `${m}:${sec.padStart(6, '0')}`;
        };
        
        const formatDate = (dateStr) => {
            const d = new Date(dateStr);
            return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        };
        
        // Trova miglior tentativo (non-DNF con tempo minore)
        const validAttempts = state.attempts.filter(a => !a.dnf && a.totalTime > 0);
        const best = validAttempts.length > 0 
            ? validAttempts.reduce((min, a) => a.totalTime < min.totalTime ? a : min)
            : null;

        return `
            <div class="results-container" style="margin-bottom: 30px;">
                <div class="results-title">📊 I TUOI TENTATIVI (${state.attempts.length})</div>
                
                ${state.attempts.map((a, i) => {
                    const isBest = best && a === best;
                    return `
                        <div style="
                            background: ${isBest ? 'rgba(0,217,255,0.1)' : 'rgba(0,0,0,0.3)'};
                            border: 2px solid ${isBest ? '#00d9ff' : 'rgba(255,255,255,0.1)'};
                            border-radius: 10px;
                            padding: 15px;
                            margin-bottom: 10px;
                        ">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <span style="font-size: 0.85rem; color: rgba(255,255,255,0.5);">
                                    ${formatDate(a.date)}
                                </span>
                                ${isBest ? '<span style="color: #00d9ff; font-family: Orbitron;">⭐ MIGLIORE</span>' : ''}
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px;">
                                <div>
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">Tempo</div>
                                    <div style="font-family: Orbitron; font-size: 1.1rem; color: ${a.dnf ? '#ff4500' : '#ffa500'};">
                                        ${a.dnf ? 'DNF' : formatTime(a.totalTime)}
                                    </div>
                                </div>
                                <div>
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">Miglior Giro</div>
                                    <div style="font-family: Orbitron; font-size: 1.1rem;">${formatTime(a.bestLap)}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">Posizione</div>
                                    <div style="font-family: Orbitron; font-size: 1.1rem;">${a.position}°</div>
                                </div>
                            </div>
                            ${a.dnf ? `<div style="color: #ff4500; font-size: 0.85rem; margin-top: 8px;">⛽ Carburante esaurito al giro ${a.dnfLap}</div>` : ''}
                        </div>
                    `;
                }).join('')}
                
                ${best ? `
                    <div style="background: rgba(0,255,0,0.05); border: 2px solid rgba(0,255,0,0.3); border-radius: 10px; padding: 15px; text-align: center; margin-top: 15px;">
                        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.6); margin-bottom: 5px;">In Classifica</div>
                        <div style="font-family: Orbitron; font-size: 1.3rem; color: #0f0;">
                            ${formatTime(best.totalTime)}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    };

    const renderResults = () => {
        const r = state.result;
        if (!r) return '';

        const formatTime = (s) => {
            const m = Math.floor(s / 60);
            const sec = (s % 60).toFixed(3);
            return `${m}:${sec.padStart(6, '0')}`;
        };

        return `
            <div class="results-container">
                <div class="results-title">⭐ TUO MIGLIOR TEMPO QUESTA SETTIMANA</div>
                <div class="results-main">
                    <div class="result-stat">
                        <div class="result-stat-label">Tempo Totale</div>
                        <div class="result-stat-value">${r.dnf ? 'DNF' : formatTime(r.totalTime)}</div>
                    </div>
                    <div class="result-stat">
                        <div class="result-stat-label">Miglior Giro</div>
                        <div class="result-stat-value">${formatTime(r.bestLap)}</div>
                    </div>
                    <div class="result-stat">
                        <div class="result-stat-label">Posizione</div>
                        <div class="result-stat-value">${r.position}°</div>
                    </div>
                </div>
                ${r.dnf ? `
                    <div style="background: rgba(255,69,0,0.2); border: 2px solid #ff4500; border-radius: 8px; padding: 20px; text-align: center; margin-top: 20px;">
                        <div style="font-size: 2rem; margin-bottom: 10px;">❌</div>
                        <div style="font-family: Orbitron; font-size: 1.3rem; color: #ff4500; margin-bottom: 5px;">DNF - NON CLASSIFICATO</div>
                        <div style="color: rgba(255,255,255,0.7);">Carburante esaurito al giro ${r.dnfLap}/${state.circuit.laps}</div>
                    </div>
                ` : ''}
            </div>
        `;
    };

    const renderLeaderboard = () => {
        if (!state.leaderboard || state.leaderboard.length === 0) {
            return '<div class="leaderboard"><div class="leaderboard-title">🏆 Classifica</div><p style="text-align:center;color:rgba(255,255,255,0.5);padding:40px;">Nessun risultato</p></div>';
        }

        const formatTime = (s) => {
            const m = Math.floor(s / 60);
            const sec = (s % 60).toFixed(3);
            return `${m}:${sec.padStart(6, '0')}`;
        };

        const userId = window.game?.userId;

        return `
            <div class="leaderboard">
                <div class="leaderboard-title">🏆 Classifica Mondiale</div>
                ${state.leaderboard.slice(0, 20).map((e, i) => {
                    const pos = i + 1;
                    const isCurrent = e.userId === userId;
                    let icon = pos;
                    if (pos === 1) icon = '🥇';
                    else if (pos === 2) icon = '🥈';
                    else if (pos === 3) icon = '🥉';

                    return `
                        <div class="leaderboard-entry ${isCurrent ? 'current-user' : ''}">
                            <div class="leaderboard-position">${icon}</div>
                            <div class="leaderboard-username">${e.username} ${isCurrent ? '(Tu)' : ''}</div>
                            <div class="leaderboard-time">${formatTime(e.totalTime)}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    };

    const attachListeners = (game) => {
        // Funzione calcolo preview
        const updatePreview = () => {
            const circuit = state.circuit;
            if (!circuit) return;
            
            const setup = state.setup;
            const baseWeight = 1250;
            const totalWeight = baseWeight + setup.fuel;
            
            // Calcola consumo stimato
            let fuelPerLap = 3.4;
            fuelPerLap += circuit.tightCorners * 0.08;
            fuelPerLap += setup.downforce * 0.015;
            if (setup.tires === 'soft') fuelPerLap *= 1.08;
            if (setup.engineMap === 'power') fuelPerLap *= 1.12;
            if (setup.engineMap === 'eco') fuelPerLap *= 0.92;
            
            const possibleLaps = Math.floor(setup.fuel / fuelPerLap);
            
            // Aggiorna UI
            const consEl = document.getElementById('preview-consumption');
            const lapsEl = document.getElementById('preview-laps');
            const weightEl = document.getElementById('preview-weight');
            const warnEl = document.getElementById('preview-warning');
            
            if (consEl) consEl.textContent = fuelPerLap.toFixed(1) + ' L';
            if (lapsEl) lapsEl.textContent = possibleLaps;
            if (weightEl) weightEl.textContent = totalWeight + ' kg';
            
            if (warnEl) {
                if (possibleLaps < circuit.laps) {
                    warnEl.textContent = `⚠️ DNF al giro ${possibleLaps}! Serve ${(fuelPerLap * circuit.laps).toFixed(0)}L per finire`;
                    warnEl.style.color = '#ff4500';
                } else if (possibleLaps === circuit.laps) {
                    warnEl.textContent = '⚠️ Carburante al limite! Rischio DNF se consumi aumentano';
                    warnEl.style.color = '#ffa500';
                } else if (possibleLaps > circuit.laps + 3) {
                    warnEl.textContent = '💡 Carburante in eccesso → Peso extra inutile';
                    warnEl.style.color = '#00d9ff';
                } else {
                    warnEl.textContent = '✅ Carburante ottimale';
                    warnEl.style.color = '#0f0';
                }
            }
        };
        
        // Sliders
        const downforce = document.getElementById('downforce');
        if (downforce) {
            downforce.addEventListener('input', (e) => {
                state.setup.downforce = parseInt(e.target.value);
                document.getElementById('downforce-val').textContent = `${state.setup.downforce}%`;
                updatePreview();
            });
        }

        const fuel = document.getElementById('fuel');
        if (fuel) {
            fuel.addEventListener('input', (e) => {
                state.setup.fuel = parseInt(e.target.value);
                document.getElementById('fuel-val').textContent = `${state.setup.fuel} L`;
                updatePreview();
            });
        }

        const pressure = document.getElementById('pressure');
        if (pressure) {
            pressure.addEventListener('input', (e) => {
                state.setup.tirePressure = parseFloat(e.target.value);
                document.getElementById('pressure-val').textContent = `${state.setup.tirePressure} bar`;
            });
        }

        const suspension = document.getElementById('suspension');
        if (suspension) {
            suspension.addEventListener('input', (e) => {
                state.setup.suspension = parseInt(e.target.value);
                const sign = state.setup.suspension > 0 ? '+' : '';
                document.getElementById('suspension-val').textContent = `${sign}${state.setup.suspension} mm`;
            });
        }

        // Radio
        document.querySelectorAll('input[name="tires"]').forEach(r => {
            r.addEventListener('change', (e) => {
                state.setup.tires = e.target.value;
                updatePreview();
            });
        });

        document.querySelectorAll('input[name="gear"]').forEach(r => {
            r.addEventListener('change', (e) => state.setup.gearRatio = e.target.value);
        });
        
        document.querySelectorAll('input[name="engine"]').forEach(r => {
            r.addEventListener('change', (e) => {
                state.setup.engineMap = e.target.value;
                updatePreview();
            });
        });
        
        // Inizializza preview
        updatePreview();

        // Run button
        const btn = document.getElementById('run-btn');
        if (btn) {
            console.log('✅ Pulsante simulazione trovato, attacco listener');
            btn.addEventListener('click', () => {
                console.log('🏁 Click su AVVIA SIMULAZIONE');
                runSimulation(game);
            });
        } else {
            console.error('❌ Pulsante run-btn non trovato!');
        }
    };

    const runSimulation = async (game) => {
        console.log('🚀 runSimulation chiamata!');
        const btn = document.getElementById('run-btn');
        if (!btn) {
            console.error('❌ Pulsante non trovato in runSimulation');
            return;
        }

        console.log('✅ Avvio simulazione...');
        console.log('Setup:', state.setup);
        
        btn.disabled = true;
        btn.textContent = '⏳ SIMULAZIONE...';

        try {
            console.log('📤 Invio richiesta simulazione');
            console.log('🔧 Setup:', state.setup);
            
            const result = await api('run-simulation', {
                method: 'POST',
                body: JSON.stringify({ setup: state.setup }) // ✅ Solo setup
            });

            console.log('📥 Risultato ricevuto:', result);

            state.hasRacedToday = true;
            state.attempts.unshift(result.result); // Aggiungi in cima
            state.attemptsThisWeek++;
            state.leaderboard = result.leaderboard;
            
            // Aggiorna bestResult
            const validAttempts = state.attempts.filter(a => !a.dnf && a.totalTime > 0);
            state.bestResult = validAttempts.length > 0 
                ? validAttempts.reduce((min, a) => a.totalTime < min.totalTime ? a : min)
                : null;

            // ⚠️ Premi assegnati solo lunedì al top 3 dal reset settimanale
            game.render();
            
            console.log('💾 Salvo stato...');
            await window.saveGameToServer(true);

            // Re-render (senza ricaricare da API)
            console.log('🎨 Re-render pagina beta con risultato');
            await render(document.getElementById('betaContainer'), game, true);

        } catch (error) {
            console.error('❌ Errore simulazione:', error);
            console.error('Stack:', error.stack);
            alert('❌ Errore: ' + error.message);
            btn.disabled = false;
            btn.textContent = '🏁 AVVIA SIMULAZIONE';
        }
    };

    return { render, api, runSimulation };

})();
