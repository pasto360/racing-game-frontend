// BETA MODULE - VERSIONE FINALE v2
const BetaModule = (() => {
    const API_URL = window.API_URL || 'https://racing-game-backend-production-a5dd.up.railway.app';
    
    const api = async (endpoint, options = {}) => {
        const token = localStorage.getItem('authToken');
        
        if (!token) {
            throw new Error('Non sei autenticato. Fai login.');
        }
        
        const response = await fetch(`${API_URL}/api/beta/${endpoint}`, {
            ...options,
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API Error:', response.status, errorText);
            throw new Error(`API Error: ${response.status}`);
        }
        return response.json();
    };

    let state = {
        circuit: null,
        hasRacedToday: false,
        attempts: [],
        weekNumber: 0,
        setup: {
            tires: 'medium',
            downforce: 50,
            fuel: 70,
            engineMap: 5,      // 1-10
            aggression: 5      // 1-10
        },
        leaderboard: []
    };

    const render = async (container, gameInstance) => {
        try {
            const data = await api('weekly-challenge');
            
            state.circuit = data.circuit;
            state.hasRacedToday = data.hasRacedToday;
            state.attempts = data.attempts || [];
            state.weekNumber = data.weekNumber;
            state.leaderboard = data.leaderboard || [];

            console.log('━━━ BETA STATE ━━━');
            console.log('hasRacedToday:', state.hasRacedToday);
            console.log('attempts:', state.attempts.length);
            console.log('weekNumber:', state.weekNumber);
            console.log('━━━━━━━━━━━━━━━━━━');

            // Banner rosso se ha già corso oggi
            if (state.hasRacedToday) {
                container.innerHTML = `
                    <div style="max-width: 600px; margin: 40px auto; text-align: center;">
                        <div style="background: linear-gradient(135deg, #ff4500 0%, #ff6347 100%); padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(255,69,0,0.3);">
                            <div style="font-size: 5rem; margin-bottom: 20px;">🔒</div>
                            <h2 style="font-family: Orbitron; font-size: 2rem; color: white; margin-bottom: 15px;">
                                Gara Completata!
                            </h2>
                            <p style="color: rgba(255,255,255,0.9); font-size: 1.1rem; margin-bottom: 25px;">
                                Hai già corso oggi.<br>
                                Nuovo tentativo disponibile <strong>domani</strong>.
                            </p>
                            <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 10px;">
                                <div style="color: rgba(255,255,255,0.8);">Tentativi questa settimana</div>
                                <div style="font-family: Orbitron; font-size: 2rem; color: white; margin-top: 5px;">
                                    ${state.attempts.length}
                                </div>
                            </div>
                        </div>
                        
                        ${renderAttempts()}
                        ${renderLeaderboard()}
                    </div>
                `;
                return;
            }

            // Setup disponibile
            container.innerHTML = `
                ${renderCircuit()}
                ${state.attempts.length > 0 ? renderAttempts() : ''}
                ${renderSetup(gameInstance)}
                ${renderLeaderboard()}
            `;

            attachListeners(gameInstance);

        } catch (error) {
            console.error('❌ Errore render:', error);
            container.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-secondary);">❌ ${error.message}</div>`;
        }
    };

    const renderCircuit = () => {
        const c = state.circuit;
        if (!c) return '';
        
        const getNextMonday = () => {
            const now = new Date();
            const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
            const nextMonday = new Date(now);
            nextMonday.setDate(now.getDate() + daysUntilMonday);
            return nextMonday.toLocaleDateString('it-IT', { day: '2-digit', month: 'long' });
        };
        
        return `
            <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h3 style="font-family: Orbitron; color: var(--accent-yellow); margin-bottom: 10px;">
                    🏁 ${c.name}
                </h3>
                <p style="color: rgba(255,255,255,0.7); margin-bottom: 10px;">
                    ${c.country} • ${(c.length/1000).toFixed(1)} km • ${c.laps} giri
                </p>
                <div style="background: rgba(0,217,255,0.1); padding: 10px; border-radius: 5px; font-size: 0.85rem; color: rgba(255,255,255,0.7);">
                    📅 Circuito cambia ogni <strong>Lunedì 00:00</strong> • Prossimo: ${getNextMonday()}
                </div>
            </div>
        `;
    };

    const renderAttempts = () => {
        if (state.attempts.length === 0) return '';
        
        const formatTime = (s) => {
            const m = Math.floor(s / 60);
            const sec = (s % 60).toFixed(3);
            return `${m}:${sec.padStart(6, '0')}`;
        };
        
        const formatDate = (d) => {
            const date = new Date(d);
            return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        };
        
        const valid = state.attempts.filter(a => !a.dnf && a.totalTime > 0);
        const best = valid.length > 0 ? valid.reduce((min, a) => a.totalTime < min.totalTime ? a : min) : null;

        return `
            <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px; margin: 20px 0;">
                <h3 style="font-family: Orbitron; color: var(--accent-cyan); margin-bottom: 15px;">📊 I Tuoi Tentativi (${state.attempts.length})</h3>
                ${state.attempts.map(a => {
                    const isBest = best && a === best;
                    return `
                        <div style="background: ${isBest ? 'rgba(0,217,255,0.1)' : 'rgba(0,0,0,0.3)'}; border: 2px solid ${isBest ? '#00d9ff' : 'rgba(255,255,255,0.1)'}; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                                <span style="font-size: 0.85rem; color: rgba(255,255,255,0.5);">${formatDate(a.date)}</span>
                                ${isBest ? '<span style="color: #00d9ff;">⭐ MIGLIORE → IN CLASSIFICA</span>' : ''}
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                                <div>
                                    <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5);">Tempo</div>
                                    <div style="font-family: Orbitron; color: ${a.dnf ? '#ff4500' : '#ffa500'};">${a.dnf ? 'DNF' : formatTime(a.totalTime)}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5);">Miglior Giro</div>
                                    <div style="font-family: Orbitron;">${formatTime(a.bestLap)}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5);">Posizione</div>
                                    <div style="font-family: Orbitron;">${a.position}°</div>
                                </div>
                            </div>
                            ${a.dnf ? `<div style="color: #ff4500; font-size: 0.85rem; margin-top: 8px;">⛽ Carburante esaurito al giro ${a.dnfLap}</div>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    };

    const renderSetup = (game) => {
        return `
            <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h3 style="font-family: Orbitron; color: var(--accent-yellow); margin-bottom: 15px;">⚙️ Setup Auto</h3>
                
                <!-- Gomme -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: rgba(255,255,255,0.9);">🏎️ Gomme</label>
                    <div style="display: flex; gap: 10px;">
                        <label style="flex: 1; padding: 10px; background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.1); border-radius: 5px; cursor: pointer; text-align: center;">
                            <input type="radio" name="tires" value="hard" ${state.setup.tires === 'hard' ? 'checked' : ''} style="margin-right: 5px;"> Dure
                        </label>
                        <label style="flex: 1; padding: 10px; background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.1); border-radius: 5px; cursor: pointer; text-align: center;">
                            <input type="radio" name="tires" value="medium" ${state.setup.tires === 'medium' ? 'checked' : ''} style="margin-right: 5px;"> Medie
                        </label>
                        <label style="flex: 1; padding: 10px; background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.1); border-radius: 5px; cursor: pointer; text-align: center;">
                            <input type="radio" name="tires" value="soft" ${state.setup.tires === 'soft' ? 'checked' : ''} style="margin-right: 5px;"> Morbide
                        </label>
                    </div>
                </div>
                
                <!-- Deportanza -->
                <div style="margin-bottom: 20px;">
                    <label style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>🌪️ Deportanza</span>
                        <span id="downforce-val" style="font-family: Orbitron; color: #00d9ff;">${state.setup.downforce}%</span>
                    </label>
                    <input type="range" id="downforce" min="0" max="100" value="${state.setup.downforce}" style="width: 100%;">
                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5); margin-top: 5px;">Più deportanza = più grip ma meno velocità massima</div>
                </div>
                
                <!-- Carburante -->
                <div style="margin-bottom: 20px;">
                    <label style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>⛽ Carburante</span>
                        <span id="fuel-val" style="font-family: Orbitron; color: #00d9ff;">${state.setup.fuel}L</span>
                    </label>
                    <input type="range" id="fuel" min="20" max="110" value="${state.setup.fuel}" step="5" style="width: 100%;">
                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5); margin-top: 5px;">Serbatoio max: 110L • ~70L per 20 giri • Più fuel = più peso</div>
                </div>
                
                <!-- Mappatura Motore 1-10 -->
                <div style="margin-bottom: 20px;">
                    <label style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>🗺️ Mappatura Motore</span>
                        <span id="engine-val" style="font-family: Orbitron; color: #00d9ff;">${state.setup.engineMap}/10</span>
                    </label>
                    <input type="range" id="engine" min="1" max="10" value="${state.setup.engineMap}" style="width: 100%;">
                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5); margin-top: 5px;">1 = Eco (meno consumo) • 10 = Potenza (più consumo)</div>
                </div>
                
                <!-- Aggressività Pilota 1-10 -->
                <div style="margin-bottom: 20px;">
                    <label style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>🎯 Aggressività Pilota</span>
                        <span id="aggression-val" style="font-family: Orbitron; color: #00d9ff;">${state.setup.aggression}/10</span>
                    </label>
                    <input type="range" id="aggression" min="1" max="10" value="${state.setup.aggression}" style="width: 100%;">
                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5); margin-top: 5px;">1 = Conservativo (0% errori) • 10 = Aggressivo (80% errori, più veloce)</div>
                </div>
                
                <button id="run-btn" style="width: 100%; padding: 15px; background: linear-gradient(135deg, #00d9ff 0%, #0099cc 100%); border: none; border-radius: 10px; color: white; font-family: Orbitron; font-size: 1.2rem; cursor: pointer; margin-top: 10px;">
                    🏁 AVVIA SIMULAZIONE
                </button>
            </div>
        `;
    };

    const renderLeaderboard = () => {
        if (state.leaderboard.length === 0) return '';
        
        const formatTime = (s) => {
            const m = Math.floor(s / 60);
            const sec = (s % 60).toFixed(3);
            return `${m}:${sec.padStart(6, '0')}`;
        };
        
        return `
            <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px; margin-top: 20px;">
                <h3 style="font-family: Orbitron; color: var(--accent-purple); margin-bottom: 10px;">🏆 Classifica Mondiale</h3>
                <div style="font-size: 0.85rem; color: rgba(255,255,255,0.5); margin-bottom: 15px;">
                    📅 Reset ogni Lunedì 00:00 con nuovo circuito
                </div>
                ${state.leaderboard.slice(0, 10).map((e, i) => {
                    const pos = i + 1;
                    const icon = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos;
                    return `
                        <div style="display: flex; justify-content: space-between; padding: 10px; background: rgba(0,0,0,0.2); margin-bottom: 5px; border-radius: 5px;">
                            <div>${icon} ${e.username}</div>
                            <div style="font-family: Orbitron; color: #00d9ff;">${formatTime(e.totalTime)}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    };

    const attachListeners = (game) => {
        // Gomme
        document.querySelectorAll('input[name="tires"]').forEach(r => {
            r.addEventListener('change', (e) => state.setup.tires = e.target.value);
        });
        
        // Deportanza
        const downforce = document.getElementById('downforce');
        if (downforce) {
            downforce.addEventListener('input', (e) => {
                state.setup.downforce = parseInt(e.target.value);
                document.getElementById('downforce-val').textContent = state.setup.downforce + '%';
            });
        }
        
        // Carburante
        const fuel = document.getElementById('fuel');
        if (fuel) {
            fuel.addEventListener('input', (e) => {
                state.setup.fuel = parseInt(e.target.value);
                document.getElementById('fuel-val').textContent = state.setup.fuel + 'L';
            });
        }
        
        // Mappatura 1-10
        const engine = document.getElementById('engine');
        if (engine) {
            engine.addEventListener('input', (e) => {
                state.setup.engineMap = parseInt(e.target.value);
                document.getElementById('engine-val').textContent = state.setup.engineMap + '/10';
            });
        }
        
        // Aggressività 1-10
        const aggression = document.getElementById('aggression');
        if (aggression) {
            aggression.addEventListener('input', (e) => {
                state.setup.aggression = parseInt(e.target.value);
                document.getElementById('aggression-val').textContent = state.setup.aggression + '/10';
            });
        }
        
        // Pulsante
        const btn = document.getElementById('run-btn');
        if (btn) {
            btn.addEventListener('click', () => runSimulation(game));
        }
    };

    const runSimulation = async (game) => {
        const btn = document.getElementById('run-btn');
        if (!btn) return;
        
        btn.disabled = true;
        btn.textContent = '⏳ SIMULAZIONE...';
        
        try {
            const result = await api('run-simulation', {
                method: 'POST',
                body: JSON.stringify({ setup: state.setup })
            });
            
            console.log('✅ Simulazione completata!', result);
            
            game.render();
            await window.saveGameToServer(true);
            
            // Ricarica tutto
            await render(document.getElementById('betaContainer'), game);
            
        } catch (error) {
            console.error('❌ Errore:', error);
            alert('❌ Errore: ' + error.message);
            btn.disabled = false;
            btn.textContent = '🏁 AVVIA SIMULAZIONE';
        }
    };

    return { render };
})();

if (typeof window !== 'undefined') {
    window.BetaModule = BetaModule;
}
