// ========================================
// TRACCIATI CIRCUITI SVG - REALISTICI
// Ispirati a circuiti famosi, modificati
// ========================================

const CIRCUIT_PATHS = {
    // 1. DRAGON PEAK - Ispirato a Spa-Francorchamps
    // Caratteristiche: Montagna, curve veloci, Eau Rouge-style
    'dragon_peak': {
        path: 'M 40 160 L 80 160 Q 100 140, 120 120 Q 140 100, 180 90 L 240 90 Q 260 95, 270 120 L 270 150 Q 265 170, 240 175 L 160 175 Q 130 180, 110 165 Q 90 150, 70 140 L 50 135 Q 42 145, 40 160 Z',
        width: 300,
        height: 200,
        startX: 40,
        startY: 160
    },

    // 2. HARBOR STREET - Ispirato a Monaco
    // Caratteristiche: Strettissimo, tornanti, cittadino
    'harbor_street': {
        path: 'M 50 100 L 80 100 L 90 80 L 110 80 L 120 60 L 140 60 L 150 80 L 170 80 L 180 100 L 200 100 L 210 120 L 230 120 L 240 140 L 240 160 L 220 160 L 210 140 L 190 140 L 180 160 L 160 160 L 150 140 L 130 140 L 120 160 L 100 160 L 90 140 L 70 140 L 60 120 L 50 120 Z',
        width: 300,
        height: 200,
        startX: 50,
        startY: 100
    },

    // 3. ROYAL SPEEDWAY - Ispirato a Monza
    // Caratteristiche: Ovale veloce + 2 chicane
    'royal_speedway': {
        path: 'M 40 100 L 180 100 L 190 90 L 200 90 L 210 100 L 260 100 Q 280 110, 280 140 Q 280 170, 260 180 L 110 180 L 100 170 L 90 170 L 80 180 L 40 180 Q 20 170, 20 140 Q 20 110, 40 100 Z',
        width: 300,
        height: 200,
        startX: 40,
        startY: 100
    },

    // 4. CRYSTAL VALLEY - Ispirato a Silverstone
    // Caratteristiche: Mix curve veloci (Maggots-Becketts-style)
    'crystal_valley': {
        path: 'M 50 140 Q 70 120, 100 115 Q 130 110, 160 120 Q 180 130, 190 150 Q 200 170, 220 175 L 250 175 Q 270 165, 275 140 Q 270 115, 250 105 L 180 105 Q 160 100, 140 95 Q 110 90, 80 100 Q 60 110, 50 130 Z',
        width: 300,
        height: 200,
        startX: 50,
        startY: 140
    },

    // 5. PHOENIX CIRCUIT - Ispirato a Suzuka
    // Caratteristiche: Figura 8 con crossover
    'phoenix_circuit': {
        path: 'M 50 60 Q 80 50, 110 55 Q 140 60, 160 80 Q 180 100, 160 120 Q 140 140, 110 135 L 90 130 Q 70 140, 60 160 Q 50 180, 70 190 Q 100 200, 130 185 Q 160 170, 180 150 Q 200 130, 220 120 Q 240 110, 250 130 Q 260 150, 240 165 Q 210 180, 180 175 L 120 175 Q 90 170, 70 150 Q 50 130, 40 100 Q 35 75, 50 60 Z',
        width: 300,
        height: 200,
        startX: 50,
        startY: 60
    },

    // 6. FOREST RING - Ispirato a Nürburgring Nordschleife
    // Caratteristiche: Lunghissimo, serpeggiante, complesso
    'forest_ring': {
        path: 'M 30 140 Q 40 120, 60 110 Q 80 100, 100 110 L 120 120 Q 140 110, 160 105 Q 180 100, 200 110 Q 220 120, 230 140 Q 240 160, 225 175 Q 210 185, 190 180 L 170 175 Q 150 180, 140 170 Q 130 160, 120 150 L 110 160 Q 100 170, 85 175 Q 70 180, 55 170 Q 40 160, 35 145 L 30 140 Z',
        width: 300,
        height: 200,
        startX: 30,
        startY: 140
    },

    // 7. SUNSET CANYON - Ispirato a Laguna Seca
    // Caratteristiche: Corkscrew famoso (salita e discesa ripida)
    'sunset_canyon': {
        path: 'M 50 170 L 90 170 Q 110 165, 130 150 Q 150 135, 170 115 Q 190 95, 210 80 L 240 80 Q 255 85, 260 100 Q 265 120, 250 135 Q 230 155, 210 165 L 170 165 Q 150 170, 130 180 Q 110 185, 90 185 L 60 185 Q 45 180, 42 165 Q 42 155, 50 150 Z',
        width: 300,
        height: 200,
        startX: 50,
        startY: 170
    },

    // 8. THUNDER VALLEY - Ispirato a Imola
    // Caratteristiche: Tecnico, Tamburello + Variante Alta
    'thunder_valley': {
        path: 'M 60 140 Q 80 120, 110 115 L 150 115 Q 180 110, 210 115 Q 240 120, 255 140 Q 265 160, 245 175 L 200 175 Q 180 180, 160 175 L 140 170 Q 120 175, 100 170 L 80 165 Q 65 160, 60 145 Z',
        width: 300,
        height: 200,
        startX: 60,
        startY: 140
    }
};
