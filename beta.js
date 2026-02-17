// =====================================================
// BETA.JS - Modulo pagina Beta
// Separato da index.html per non toccare i file originali
//
// COME FUNZIONA:
// - Espone un oggetto globale `BetaModule`
// - index.html chiama BetaModule.render(container, game)
// - Tutte le feature beta stanno qui
//
// API CALLS:
// - Usa `BetaModule.api(endpoint, options)` per chiamate al server
// - Il server beta è in server_beta.js (montato su /api/beta/...)
// =====================================================

const BetaModule = (() => {

    // URL base API (stessa del gioco principale)
    const getApiUrl = () => {
        return window.API_URL || 
               (window.location.hostname === 'localhost' ? 'http://localhost:3000' : '');
    };

    // Helper per chiamate API beta (include token auth automaticamente)
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

    // =====================================================
    // RENDER PRINCIPALE
    // Chiamato da index.html quando si apre la pagina Beta
    // =====================================================
    const render = (container, gameInstance) => {
        container.innerHTML = `
            <div class="beta-empty">
                <span class="beta-icon">🧪</span>
                <h3>AREA BETA <span class="beta-badge">IN SVILUPPO</span></h3>
                <p>Questa sezione è riservata alle funzionalità in sviluppo.<br>Torna presto per scoprire le novità!</p>
            </div>
        `;

        // =====================================================
        // AGGIUNGI QUI LE FUTURE FEATURE BETA
        // Esempio:
        //
        // renderFeatureX(container, gameInstance);
        // renderFeatureY(container, gameInstance);
        // =====================================================
    };

    // =====================================================
    // TEMPLATE FEATURE - Copia e rinomina per aggiungere feature
    // =====================================================
    // const renderFeatureX = (container, game) => {
    //     const section = document.createElement('div');
    //     section.className = 'beta-card';
    //     section.innerHTML = `<h3>🚀 Feature X</h3><p>Contenuto...</p>`;
    //     container.appendChild(section);
    // };

    // API pubblica del modulo
    return { render, api };

})();
