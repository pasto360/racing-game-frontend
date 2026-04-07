// ========================================
// BETA MANAGER - SIMULATORE GESTIONALE
// Gestione economica scuderia racing
// ========================================

const BetaManager = {
    _initialized: false,
    
    // ECONOMIA
    budget: 30000, // Budget iniziale dal proprietario
    
    // PILOTA ATTUALE
    currentDriver: null,
    
    // SPONSOR ATTIVI
    activeSponsors: [],
    
    // STATISTICHE
    stats: {
        races: 0,
        wins: 0,
        podiums: 0,
        totalEarnings: 0
    },
    
    // DATABASE PILOTI
    drivers: [
        { id: 1, name: 'Marco Rossi', skill: 45, salary: 500, nationality: '🇮🇹', status: 'available' },
        { id: 2, name: 'Luca Bianchi', skill: 52, salary: 800, nationality: '🇮🇹', status: 'available' },
        { id: 3, name: 'Giovanni Ferrari', skill: 38, salary: 300, nationality: '🇮🇹', status: 'available' },
        { id: 4, name: 'Alessandro Verdi', skill: 60, salary: 1200, nationality: '🇮🇹', status: 'available' },
        { id: 5, name: 'Pierre Dupont', skill: 68, salary: 1800, nationality: '🇫🇷', status: 'available' },
        { id: 6, name: 'Hans Mueller', skill: 55, salary: 1000, nationality: '🇩🇪', status: 'available' },
        { id: 7, name: 'Carlos Sanchez', skill: 48, salary: 650, nationality: '🇪🇸', status: 'available' },
        { id: 8, name: 'Michael Smith', skill: 72, salary: 2500, nationality: '🇬🇧', status: 'available' },
        { id: 9, name: 'Takumi Sato', skill: 65, salary: 1500, nationality: '🇯🇵', status: 'available' },
        { id: 10, name: 'Max Verstappen Jr.', skill: 85, salary: 5000, nationality: '🇳🇱', status: 'available' }
    ],
    
    // DATABASE SPONSOR
    sponsors: [
        // TIER 1 - Disponibili subito
        { id: 1, name: 'Local Garage', tier: 1, payout: 200, requirement: 0, type: 'base' },
        { id: 2, name: 'Pizza Al Taglio', tier: 1, payout: 150, requirement: 0, type: 'base' },
        { id: 3, name: 'Bar Sport', tier: 1, payout: 180, requirement: 0, type: 'base' },
        
        // TIER 2 - Serve 1 vittoria
        { id: 4, name: 'Autofficina Meccanica', tier: 2, payout: 400, requirement: 1, type: 'wins' },
        { id: 5, name: 'Pneumatici ProRace', tier: 2, payout: 500, requirement: 1, type: 'wins' },
        
        // TIER 3 - Serve 3 vittorie
        { id: 6, name: 'TechMotors', tier: 3, payout: 800, requirement: 3, type: 'wins' },
        { id: 7, name: 'Racing Fuel', tier: 3, payout: 1000, requirement: 3, type: 'wins' },
        
        // TIER 4 - Serve 5 vittorie
        { id: 8, name: 'Red Bull Racing', tier: 4, payout: 2000, requirement: 5, type: 'wins' },
        { id: 9, name: 'Shell V-Power', tier: 4, payout: 2500, requirement: 5, type: 'wins' },
        
        // TIER 5 - Serve 10 vittorie
        { id: 10, name: 'Ferrari Sponsorship', tier: 5, payout: 5000, requirement: 10, type: 'wins' }
    ],
    
    // DATABASE GARE
    races: [
        // AMATORIALI
        { 
            id: 1, 
            name: 'Gara Locale di Quartiere', 
            tier: 'amateur',
            entryFee: 100,
            logistics: { hotel: 50, camper: 20 },
            prizePool: [500, 300, 200, 100, 50],
            unlockCost: 0,
            competitors: 8,
            avgSkill: 40
        },
        { 
            id: 2, 
            name: 'Trofeo Cittadino', 
            tier: 'amateur',
            entryFee: 200,
            logistics: { hotel: 80, camper: 30 },
            prizePool: [800, 500, 300, 150, 80],
            unlockCost: 0,
            competitors: 12,
            avgSkill: 45
        },
        
        // REGIONALI
        { 
            id: 3, 
            name: 'Campionato Regionale', 
            tier: 'regional',
            entryFee: 500,
            logistics: { hotel: 150, camper: 60 },
            prizePool: [2000, 1200, 800, 400, 200],
            unlockCost: 5000,
            competitors: 15,
            avgSkill: 55
        },
        { 
            id: 4, 
            name: 'Gran Premio Regione', 
            tier: 'regional',
            entryFee: 800,
            logistics: { hotel: 200, camper: 80 },
            prizePool: [3500, 2000, 1200, 600, 300],
            unlockCost: 10000,
            competitors: 18,
            avgSkill: 60
        },
        
        // NAZIONALI
        { 
            id: 5, 
            name: 'Campionato Nazionale', 
            tier: 'national',
            entryFee: 1500,
            logistics: { hotel: 400, camper: 150 },
            prizePool: [8000, 5000, 3000, 1500, 800],
            unlockCost: 25000,
            competitors: 20,
            avgSkill: 70
        },
        { 
            id: 6, 
            name: 'Gran Premio d\'Italia', 
            tier: 'national',
            entryFee: 2500,
            logistics: { hotel: 600, camper: 250 },
            prizePool: [15000, 10000, 6000, 3000, 1500],
            unlockCost: 50000,
            competitors: 24,
            avgSkill: 75
        },
        
        // INTERNAZIONALI
        { 
            id: 7, 
            name: 'European Championship', 
            tier: 'international',
            entryFee: 5000,
            logistics: { hotel: 1000, camper: 400 },
            prizePool: [30000, 20000, 12000, 6000, 3000],
            unlockCost: 100000,
            competitors: 30,
            avgSkill: 85
        }
    ],
    
    // ===== LOGICA GIOCO =====
    
    // Assumi pilota
    hireDriver(driverId) {
        const driver = this.drivers.find(d => d.id === driverId);
        
        if (!driver) {
            alert('❌ Pilota non trovato!');
            return;
        }
        
        if (this.currentDriver) {
            alert('❌ Hai già un pilota! Licenzialo prima.');
            return;
        }
        
        this.currentDriver = { ...driver };
        driver.status = 'hired';
        
        this.render();
    },
    
    // Licenzia pilota
    fireDriver() {
        if (!this.currentDriver) return;
        
        const driver = this.drivers.find(d => d.id === this.currentDriver.id);
        if (driver) {
            driver.status = 'available';
        }
        
        this.currentDriver = null;
        this.render();
    },
    
    // Firma sponsor
    signSponsor(sponsorId) {
        const sponsor = this.sponsors.find(s => s.id === sponsorId);
        
        if (!sponsor) {
            alert('❌ Sponsor non trovato!');
            return;
        }
        
        // Check requisiti
        if (sponsor.requirement > this.stats.wins) {
            alert(`❌ Serve ${sponsor.requirement} vittorie! (Hai: ${this.stats.wins})`);
            return;
        }
        
        // Check già attivo
        if (this.activeSponsors.find(s => s.id === sponsorId)) {
            alert('❌ Sponsor già attivo!');
            return;
        }
        
        this.activeSponsors.push({ ...sponsor });
        this.render();
    },
    
    // Rimuovi sponsor
    removeSponsor(sponsorId) {
        this.activeSponsors = this.activeSponsors.filter(s => s.id !== sponsorId);
        this.render();
    },
    
    // Partecipa a gara
    enterRace(raceId, useHotel) {
        const race = this.races.find(r => r.id === raceId);
        
        if (!race) {
            alert('❌ Gara non trovata!');
            return;
        }
        
        // Verifica pilota
        if (!this.currentDriver) {
            alert('❌ Assumi un pilota prima!');
            return;
        }
        
        // Verifica budget unlock
        if (race.unlockCost > this.budget) {
            alert(`❌ Budget insufficiente! Serve €${race.unlockCost.toLocaleString()}`);
            return;
        }
        
        // Calcola costi totali
        const totalCost = race.entryFee + 
                         this.currentDriver.salary + 
                         (useHotel ? race.logistics.hotel : race.logistics.camper);
        
        if (this.budget < totalCost) {
            alert(`❌ Budget insufficiente! Serve €${totalCost.toLocaleString()}\n\nDettaglio:\nIscrizione: €${race.entryFee}\nPilota: €${this.currentDriver.salary}\nLogistica: €${useHotel ? race.logistics.hotel : race.logistics.camper}\n\nBudget: €${this.budget.toLocaleString()}`);
            return;
        }
        
        // Conferma
        if (!confirm(`Partecipare a "${race.name}"?\n\nCosti:\n- Iscrizione: €${race.entryFee}\n- Pilota: €${this.currentDriver.salary}\n- ${useHotel ? 'Hotel' : 'Camper'}: €${useHotel ? race.logistics.hotel : race.logistics.camper}\n\nTOTALE: €${totalCost}\n\nBudget dopo: €${(this.budget - totalCost).toLocaleString()}`)) {
            return;
        }
        
        // Sottrai costi
        this.budget -= totalCost;
        
        // Simula gara
        const result = this.simulateRace(race, useHotel);
        
        // Mostra risultato
        this.showRaceResult(race, result, useHotel);
    },
    
    // Simula gara
    simulateRace(race, useHotel) {
        // Skill effettivo pilota (bonus hotel)
        const driverSkill = this.currentDriver.skill + (useHotel ? 10 : 0);
        
        // Genera avversari
        const competitors = [];
        for (let i = 0; i < race.competitors - 1; i++) {
            const variance = Math.random() * 20 - 10; // ±10
            competitors.push({
                name: `Pilota ${i + 1}`,
                skill: race.avgSkill + variance
            });
        }
        
        // Aggiungi il nostro pilota
        competitors.push({
            name: this.currentDriver.name + ' (TU)',
            skill: driverSkill,
            isPlayer: true
        });
        
        // Ordina per skill (con randomness)
        competitors.sort((a, b) => {
            const aPerf = a.skill + Math.random() * 15;
            const bPerf = b.skill + Math.random() * 15;
            return bPerf - aPerf;
        });
        
        // Trova posizione giocatore
        const position = competitors.findIndex(c => c.isPlayer) + 1;
        
        // Calcola prize money
        const prizeMoney = race.prizePool[position - 1] || 0;
        
        // Calcola sponsor money
        let sponsorMoney = 0;
        this.activeSponsors.forEach(sponsor => {
            // Percentuale basata su posizione
            const percentage = Math.max(5, 100 - (position - 1) * 15) / 100;
            sponsorMoney += sponsor.payout * percentage;
        });
        
        const totalEarnings = prizeMoney + sponsorMoney;
        
        // Aggiorna budget
        this.budget += totalEarnings;
        
        // Aggiorna stats
        this.stats.races++;
        this.stats.totalEarnings += totalEarnings;
        
        if (position === 1) {
            this.stats.wins++;
            // Aumenta skill pilota
            this.currentDriver.skill = Math.min(100, this.currentDriver.skill + 2);
        }
        
        if (position <= 3) {
            this.stats.podiums++;
            // Piccolo aumento skill
            this.currentDriver.skill = Math.min(100, this.currentDriver.skill + 1);
        }
        
        return {
            position,
            totalCompetitors: race.competitors,
            prizeMoney,
            sponsorMoney,
            totalEarnings,
            standings: competitors.map((c, i) => ({
                position: i + 1,
                name: c.name,
                isPlayer: c.isPlayer
            }))
        };
    },
    
    // Mostra risultato gara
    showRaceResult(race, result, useHotel) {
        const medal = result.position === 1 ? '🥇' : result.position === 2 ? '🥈' : result.position === 3 ? '🥉' : '🏁';
        
        alert(`${medal} RISULTATO: ${result.position}° / ${result.totalCompetitors}\n\n💰 GUADAGNO:\n- Prize: €${result.prizeMoney}\n- Sponsor: €${Math.round(result.sponsorMoney)}\n━━━━━━━━━━━━━━━━\nTOTALE: €${Math.round(result.totalEarnings)}\n\n💵 Budget: €${this.budget.toLocaleString()}\n\n${result.position === 1 ? '🎉 VITTORIA! Skill pilota +2!' : result.position <= 3 ? '🎊 PODIO! Skill pilota +1!' : ''}`);
        
        this.render();
    },
    
    // ===== RENDERING UI =====
    
    async init() {
        console.log('🏁 Inizializzazione BETA Manager...');
        this._initialized = true;
        this.render();
    },
    
    render() {
        const container = document.getElementById('betaContainer');
        if (!container) return;
        
        container.innerHTML = `
            <div style="max-width: 1200px; margin: 0 auto; padding: 20px;">
                <!-- HEADER CON BUDGET -->
                <div style="background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple)); padding: 20px; border-radius: 10px; margin-bottom: 20px; text-align: center;">
                    <h2 style="margin: 0; font-family: Orbitron; color: white;">🏎️ RACING TEAM MANAGER</h2>
                    <div style="font-size: 2rem; font-weight: bold; color: var(--accent-yellow); margin-top: 10px;">
                        💰 €${this.budget.toLocaleString()}
                    </div>
                    <div style="color: rgba(255,255,255,0.8); font-size: 0.9rem;">
                        Gare: ${this.stats.races} | Vittorie: ${this.stats.wins} | Podi: ${this.stats.podiums}
                    </div>
                </div>
                
                <!-- TAB NAVIGATION -->
                <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                    <button onclick="BetaManager.showTab('drivers')" id="tab-drivers" class="tab-btn active">
                        👨‍✈️ PILOTI
                    </button>
                    <button onclick="BetaManager.showTab('sponsors')" id="tab-sponsors" class="tab-btn">
                        🏢 SPONSOR
                    </button>
                    <button onclick="BetaManager.showTab('races')" id="tab-races" class="tab-btn">
                        🏁 GARE
                    </button>
                </div>
                
                <!-- CONTENT -->
                <div id="manager-content"></div>
            </div>
        `;
        
        this.showTab('drivers');
    },
    
    showTab(tab) {
        // Aggiorna tab attivi
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        
        const content = document.getElementById('manager-content');
        
        if (tab === 'drivers') {
            content.innerHTML = this.renderDrivers();
        } else if (tab === 'sponsors') {
            content.innerHTML = this.renderSponsors();
        } else if (tab === 'races') {
            content.innerHTML = this.renderRaces();
        }
    },
    
    renderDrivers() {
        return `
            <!-- PILOTA ATTUALE -->
            ${this.currentDriver ? `
                <div style="background: rgba(0,255,136,0.1); border: 2px solid var(--accent-green); border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: var(--accent-green); margin-bottom: 15px;">✅ PILOTA ATTUALE</h3>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: white;">
                                ${this.currentDriver.nationality} ${this.currentDriver.name}
                            </div>
                            <div style="color: var(--text-secondary); margin-top: 5px;">
                                Skill: ${this.currentDriver.skill}/100 | Stipendio: €${this.currentDriver.salary}/gara
                            </div>
                        </div>
                        <button onclick="if(confirm('Licenziare ${this.currentDriver.name}?')) BetaManager.fireDriver()" 
                                style="padding: 10px 20px; background: var(--accent-red); color: white; border: none; border-radius: 5px; cursor: pointer;">
                            ❌ LICENZIA
                        </button>
                    </div>
                </div>
            ` : `
                <div style="background: rgba(255,215,0,0.1); border: 2px solid var(--accent-yellow); border-radius: 10px; padding: 20px; margin-bottom: 20px; text-align: center;">
                    <p style="color: var(--accent-yellow); margin: 0;">⚠️ Nessun pilota assunto. Assumi un pilota dal mercato!</p>
                </div>
            `}
            
            <!-- MERCATO PILOTI -->
            <div style="background: rgba(255,255,255,0.05); border: 2px solid var(--accent-cyan); border-radius: 10px; padding: 20px;">
                <h3 style="color: var(--accent-cyan); margin-bottom: 15px;">🏪 MERCATO PILOTI</h3>
                
                <div style="display: grid; gap: 15px;">
                    ${this.drivers.filter(d => d.status === 'available').map(driver => `
                        <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-size: 1.2rem; font-weight: bold; color: white;">
                                    ${driver.nationality} ${driver.name}
                                </div>
                                <div style="color: var(--text-secondary); margin-top: 5px;">
                                    Skill: <span style="color: ${driver.skill >= 70 ? 'var(--accent-green)' : driver.skill >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)'}">${driver.skill}/100</span> | 
                                    Stipendio: €${driver.salary}/gara
                                </div>
                            </div>
                            <button onclick="BetaManager.hireDriver(${driver.id})" 
                                    ${this.currentDriver ? 'disabled' : ''}
                                    style="padding: 10px 20px; background: var(--accent-green); color: white; border: none; border-radius: 5px; cursor: pointer;">
                                ✅ ASSUMI
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },
    
    renderSponsors() {
        const available = this.sponsors.filter(s => s.requirement <= this.stats.wins && !this.activeSponsors.find(a => a.id === s.id));
        const locked = this.sponsors.filter(s => s.requirement > this.stats.wins);
        
        return `
            <!-- SPONSOR ATTIVI -->
            <div style="background: rgba(0,255,136,0.1); border: 2px solid var(--accent-green); border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                <h3 style="color: var(--accent-green); margin-bottom: 15px;">✅ SPONSOR ATTIVI (${this.activeSponsors.length})</h3>
                
                ${this.activeSponsors.length > 0 ? `
                    <div style="display: grid; gap: 10px;">
                        ${this.activeSponsors.map(sponsor => `
                            <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong style="color: white;">${sponsor.name}</strong>
                                    <span style="color: var(--text-secondary); margin-left: 15px;">
                                        Paga: €${sponsor.payout} (100% se 1°, scala con posizione)
                                    </span>
                                </div>
                                <button onclick="if(confirm('Terminare contratto con ${sponsor.name}?')) BetaManager.removeSponsor(${sponsor.id})" 
                                        style="padding: 5px 15px; background: var(--accent-red); color: white; border: none; border-radius: 5px; cursor: pointer;">
                                    ❌
                                </button>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <p style="color: var(--text-secondary); text-align: center; margin: 0;">Nessuno sponsor attivo</p>
                `}
            </div>
            
            <!-- SPONSOR DISPONIBILI -->
            ${available.length > 0 ? `
                <div style="background: rgba(255,255,255,0.05); border: 2px solid var(--accent-cyan); border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: var(--accent-cyan); margin-bottom: 15px;">🏪 SPONSOR DISPONIBILI</h3>
                    
                    <div style="display: grid; gap: 10px;">
                        ${available.map(sponsor => `
                            <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong style="color: white;">${sponsor.name}</strong>
                                    <span style="color: var(--text-secondary); margin-left: 15px;">
                                        Paga: €${sponsor.payout}
                                    </span>
                                </div>
                                <button onclick="BetaManager.signSponsor(${sponsor.id})" 
                                        style="padding: 10px 20px; background: var(--accent-green); color: white; border: none; border-radius: 5px; cursor: pointer;">
                                    ✍️ FIRMA
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- SPONSOR BLOCCATI -->
            ${locked.length > 0 ? `
                <div style="background: rgba(255,255,255,0.02); border: 2px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 20px;">
                    <h3 style="color: var(--text-secondary); margin-bottom: 15px;">🔒 SPONSOR BLOCCATI</h3>
                    
                    <div style="display: grid; gap: 10px;">
                        ${locked.map(sponsor => `
                            <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; opacity: 0.5;">
                                <div>
                                    <strong style="color: var(--text-secondary);">${sponsor.name}</strong>
                                    <span style="color: var(--text-secondary); margin-left: 15px;">
                                        Paga: €${sponsor.payout}
                                    </span>
                                    <span style="color: var(--accent-red); margin-left: 15px;">
                                        🔒 Serve ${sponsor.requirement} ${sponsor.requirement === 1 ? 'vittoria' : 'vittorie'}
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    },
    
    renderRaces() {
        const amateur = this.races.filter(r => r.tier === 'amateur');
        const regional = this.races.filter(r => r.tier === 'regional');
        const national = this.races.filter(r => r.tier === 'national');
        const international = this.races.filter(r => r.tier === 'international');
        
        const renderRaceCard = (race) => {
            const unlocked = this.budget >= race.unlockCost;
            const canAfford = this.currentDriver && this.budget >= (race.entryFee + this.currentDriver.salary + race.logistics.camper);
            
            return `
                <div style="background: rgba(0,0,0,0.3); border: 2px solid ${unlocked ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)'}; border-radius: 8px; padding: 15px; ${!unlocked ? 'opacity: 0.5;' : ''}">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <div>
                            <div style="font-size: 1.2rem; font-weight: bold; color: ${unlocked ? 'white' : 'var(--text-secondary)'};">
                                ${race.name}
                            </div>
                            <div style="color: var(--text-secondary); margin-top: 5px;">
                                Partecipanti: ${race.competitors} | Skill medio: ${race.avgSkill}
                            </div>
                        </div>
                        ${!unlocked ? `
                            <div style="text-align: right;">
                                <div style="color: var(--accent-red); font-weight: bold;">🔒 BLOCCATA</div>
                                <div style="color: var(--text-secondary); font-size: 0.85rem;">Budget: €${race.unlockCost.toLocaleString()}</div>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${unlocked ? `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; font-size: 0.9rem;">
                            <div>
                                <strong>Costi:</strong><br>
                                Iscrizione: €${race.entryFee}<br>
                                ${this.currentDriver ? `Pilota: €${this.currentDriver.salary}` : 'Pilota: -'}
                            </div>
                            <div>
                                <strong>Logistica:</strong><br>
                                Hotel (+10 skill): €${race.logistics.hotel}<br>
                                Camper: €${race.logistics.camper}
                            </div>
                        </div>
                        
                        <div style="background: rgba(0,255,136,0.1); padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                            <strong style="color: var(--accent-green);">💰 Prize Pool:</strong><br>
                            ${race.prizePool.slice(0, 5).map((prize, i) => `${i + 1}°: €${prize}`).join(' | ')}
                        </div>
                        
                        <div style="display: flex; gap: 10px;">
                            <button onclick="BetaManager.enterRace(${race.id}, false)" 
                                    ${!canAfford ? 'disabled' : ''}
                                    style="flex: 1; padding: 10px; background: var(--accent-yellow); color: #1a0033; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">
                                🚐 CAMPER
                            </button>
                            <button onclick="BetaManager.enterRace(${race.id}, true)" 
                                    ${!canAfford ? 'disabled' : ''}
                                    style="flex: 1; padding: 10px; background: var(--accent-green); color: white; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">
                                🏨 HOTEL
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        };
        
        return `
            ${!this.currentDriver ? `
                <div style="background: rgba(255,51,51,0.1); border: 2px solid var(--accent-red); border-radius: 10px; padding: 20px; margin-bottom: 20px; text-align: center;">
                    <p style="color: var(--accent-red); margin: 0; font-size: 1.1rem;">⚠️ Assumi un pilota prima di partecipare alle gare!</p>
                </div>
            ` : ''}
            
            <!-- AMATORIALI -->
            <h3 style="color: var(--accent-cyan); margin-bottom: 15px;">🏁 GARE AMATORIALI</h3>
            <div style="display: grid; gap: 15px; margin-bottom: 30px;">
                ${amateur.map(renderRaceCard).join('')}
            </div>
            
            <!-- REGIONALI -->
            <h3 style="color: var(--accent-yellow); margin-bottom: 15px;">🏆 GARE REGIONALI</h3>
            <div style="display: grid; gap: 15px; margin-bottom: 30px;">
                ${regional.map(renderRaceCard).join('')}
            </div>
            
            <!-- NAZIONALI -->
            <h3 style="color: var(--accent-green); margin-bottom: 15px;">🥇 CAMPIONATI NAZIONALI</h3>
            <div style="display: grid; gap: 15px; margin-bottom: 30px;">
                ${national.map(renderRaceCard).join('')}
            </div>
            
            <!-- INTERNAZIONALI -->
            <h3 style="color: var(--accent-purple); margin-bottom: 15px;">🌍 GARE INTERNAZIONALI</h3>
            <div style="display: grid; gap: 15px;">
                ${international.map(renderRaceCard).join('')}
            </div>
        `;
    }
};

// Esponi globalmente
window.BetaManager = BetaManager;

console.log('✅ Beta Manager caricato');
