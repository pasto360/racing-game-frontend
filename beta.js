// BETA MODULE - PULITO
const BetaModule = (() => {
    const API_URL = window.API_URL || 'https://racing-game-backend-production-a5dd.up.railway.app';
    
    const api = async (endpoint, options = {}) => {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/beta/${endpoint}`, {
            ...options,
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        return response.json();
    };

    let state = {
        circuit: null,
        hasRacedToday: false,
        attempts: [],
        setup: {
            tires: 'medium',
            downforce: 50,
            fuel: 70,
            tirePressure: 2.2,
            suspension: 0,
            gearRatio: 'medium',
            brakeBias: 55,
            engineMap: 'balanced'
        },
        leaderboard: []
    };

    const render = async (container, gameInstance) => {
        try {
            // ✅ SEMPRE carica da API
            const data = await api('weekly-challenge');
            
            state.circuit = data.circuit;
            state.hasRacedToday = data.hasRacedToday;
            state.attempts = data.attempts || [];
            state.leaderboard = data.leaderboard || [];

            console.log('━━━ BETA STATE ━━━');
            console.log('hasRacedToday:', state.hasRacedToday);
            console.log('attempts:', state.attempts.length);
            console.log('━━━━━━━━━━━━━━━━━━');

            // 🚫 SE HA GIÀ CORSO OGGI - BANNER ROSSO
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

            // ✅ SETUP DISPONIBILE
            container.innerHTML = `
                ${renderCircuit()}
                ${state.attempts.length > 0 ? renderAttempts() : ''}
                ${renderSetup(gameInstance)}
                ${renderLeaderboard()}
            `;

            attachListeners(gameInstance);

        } catch (error) {
            console.error('❌ Errore render:', error);
            container.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-secondary);">❌ Errore caricamento</div>`;
        }
    };

    const renderCircuit = () => {
        const c = state.circuit;
        if (!c) return '';
        return `
            <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h3 style="font-family: Orbitron; color: var(--accent-yellow); margin-bottom: 10px;">🏁 ${c.name}</h3>
                <p style="color: rgba(255,255,255,0.7);">${c.country} • ${(c.length/1000).toFixed(1)} km • ${c.laps} giri</p>
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
                                ${isBest ? '<span style="color: #00d9ff;">⭐ MIGLIORE</span>' : ''}
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
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">🏎️ Gomme</label>
                    <div style="display: flex; gap: 10px;">
                        <label><input type="radio" name="tires" value="hard" ${state.setup.tires === 'hard' ? 'checked' : ''}> Dure</label>
                        <label><input type="radio" name="tires" value="medium" ${state.setup.tires === 'medium' ? 'checked' : ''}> Medie</label>
                        <label><input type="radio" name="tires" value="soft" ${state.setup.tires === 'soft' ? 'checked' : ''}> Morbide</label>
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label>🌪️ Deportanza: <span id="downforce-val">${state.setup.downforce}%</span></label>
                    <input type="range" id="downforce" min="0" max="100" value="${state.setup.downforce}" style="width: 100%;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label>⛽ Carburante: <span id="fuel-val">${state.setup.fuel}L</span></label>
                    <input type="range" id="fuel" min="20" max="110" value="${state.setup.fuel}" step="5" style="width: 100%;">
                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">Serbatoio max: 110L • ~70L per 20 giri</div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">🗺️ Mappatura Motore</label>
                    <div style="display: flex; gap: 10px;">
                        <label><input type="radio" name="engine" value="eco" ${state.setup.engineMap === 'eco' ? 'checked' : ''}> Eco</label>
                        <label><input type="radio" name="engine" value="balanced" ${state.setup.engineMap === 'balanced' ? 'checked' : ''}> Bilanciata</label>
                        <label><input type="radio" name="engine" value="power" ${state.setup.engineMap === 'power' ? 'checked' : ''}> Potenza</label>
                    </div>
                </div>
                
                <button id="run-btn" style="width: 100%; padding: 15px; background: linear-gradient(135deg, #00d9ff 0%, #0099cc 100%); border: none; border-radius: 10px; color: white; font-family: Orbitron; font-size: 1.2rem; cursor: pointer; margin-top: 20px;">
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
                <h3 style="font-family: Orbitron; color: var(--accent-purple); margin-bottom: 15px;">🏆 Classifica Mondiale</h3>
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
        document.querySelectorAll('input[name="tires"]').forEach(r => {
            r.addEventListener('change', (e) => state.setup.tires = e.target.value);
        });
        
        document.querySelectorAll('input[name="engine"]').forEach(r => {
            r.addEventListener('change', (e) => state.setup.engineMap = e.target.value);
        });
        
        const downforce = document.getElementById('downforce');
        if (downforce) {
            downforce.addEventListener('input', (e) => {
                state.setup.downforce = parseInt(e.target.value);
                document.getElementById('downforce-val').textContent = state.setup.downforce + '%';
            });
        }
        
        const fuel = document.getElementById('fuel');
        if (fuel) {
            fuel.addEventListener('input', (e) => {
                state.setup.fuel = parseInt(e.target.value);
                document.getElementById('fuel-val').textContent = state.setup.fuel + 'L';
            });
        }
        
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
