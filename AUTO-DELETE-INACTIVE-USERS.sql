-- ========================================
-- CANCELLAZIONE AUTOMATICA UTENTI INATTIVI 6 MESI
-- ========================================

-- Funzione che elimina utenti inattivi da più di 6 mesi
CREATE OR REPLACE FUNCTION delete_inactive_users()
RETURNS void AS $$
DECLARE
    deleted_count INTEGER;
    six_months_ago BIGINT;
BEGIN
    -- Calcola timestamp 6 mesi fa (in millisecondi)
    six_months_ago := EXTRACT(EPOCH FROM (NOW() - INTERVAL '6 months'))::BIGINT * 1000;
    
    -- Elimina utenti con last_login più vecchio di 6 mesi
    WITH deleted AS (
        DELETE FROM users
        WHERE id IN (
            SELECT u.id
            FROM users u
            LEFT JOIN game_state gs ON u.id = gs.user_id
            WHERE gs.last_login < six_months_ago
               OR gs.last_login IS NULL -- Utenti senza last_login
        )
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    -- Log risultato
    RAISE NOTICE 'Eliminati % utenti inattivi da più di 6 mesi', deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Verifica utenti che verrebbero eliminati (DRY RUN)
-- Esegui questa query per vedere chi verrebbe eliminato SENZA eliminarli
CREATE OR REPLACE FUNCTION preview_inactive_users()
RETURNS TABLE(
    user_id INTEGER,
    username VARCHAR,
    last_login_timestamp BIGINT,
    last_login_readable TIMESTAMP,
    days_inactive INTEGER
) AS $$
DECLARE
    six_months_ago BIGINT;
BEGIN
    six_months_ago := EXTRACT(EPOCH FROM (NOW() - INTERVAL '6 months'))::BIGINT * 1000;
    
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        gs.last_login,
        TO_TIMESTAMP(gs.last_login / 1000) as last_login_readable,
        EXTRACT(DAY FROM (NOW() - TO_TIMESTAMP(gs.last_login / 1000)))::INTEGER as days_inactive
    FROM users u
    LEFT JOIN game_state gs ON u.id = gs.user_id
    WHERE gs.last_login < six_months_ago
       OR gs.last_login IS NULL
    ORDER BY gs.last_login ASC NULLS FIRST;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- OPZIONE A: Esecuzione Manuale (più sicura)
-- ========================================
-- Esegui questo comando manualmente quando vuoi:
-- SELECT delete_inactive_users();

-- Per vedere ANTEPRIMA prima di eliminare:
-- SELECT * FROM preview_inactive_users();

-- ========================================
-- OPZIONE B: Trigger Automatico (avanzato)
-- ========================================
-- ATTENZIONE: Questo elimina automaticamente utenti ogni volta che qualcuno fa login!
-- Usa solo se sei SICURO che vuoi eliminazioni automatiche.

/*
-- Funzione trigger che esegue pulizia a ogni login
CREATE OR REPLACE FUNCTION trigger_cleanup_inactive()
RETURNS TRIGGER AS $$
BEGIN
    -- Esegui pulizia solo se sono passati almeno 7 giorni dall'ultima pulizia
    -- (evita di eseguire troppo spesso)
    IF NOT EXISTS (
        SELECT 1 FROM pg_stat_user_tables 
        WHERE schemaname = 'public' 
        AND relname = 'last_cleanup'
    ) THEN
        -- Crea tabella tracking ultima pulizia
        CREATE TABLE IF NOT EXISTS last_cleanup (
            id SERIAL PRIMARY KEY,
            cleaned_at TIMESTAMP DEFAULT NOW()
        );
        INSERT INTO last_cleanup (cleaned_at) VALUES (NOW());
    END IF;
    
    -- Controlla ultima pulizia
    IF (SELECT cleaned_at FROM last_cleanup ORDER BY id DESC LIMIT 1) < (NOW() - INTERVAL '7 days') THEN
        PERFORM delete_inactive_users();
        INSERT INTO last_cleanup (cleaned_at) VALUES (NOW());
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crea trigger che si attiva a ogni UPDATE di game_state (login)
CREATE TRIGGER cleanup_inactive_users_trigger
AFTER UPDATE ON game_state
FOR EACH ROW
WHEN (OLD.last_login IS DISTINCT FROM NEW.last_login)
EXECUTE FUNCTION trigger_cleanup_inactive();
*/

-- ========================================
-- OPZIONE C: Scheduled Job con pg_cron (richiede estensione)
-- ========================================
/*
-- Installa estensione pg_cron (se disponibile su Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Esegui pulizia ogni settimana (Domenica alle 3:00 AM)
SELECT cron.schedule(
    'cleanup-inactive-users',
    '0 3 * * 0',
    'SELECT delete_inactive_users();'
);
*/

-- ========================================
-- RACCOMANDAZIONE
-- ========================================
-- Per Supabase, usa OPZIONE A (manuale) o configura Edge Function
-- che esegue delete_inactive_users() periodicamente (es. ogni settimana)

-- Test: Vedi anteprima utenti inattivi
SELECT * FROM preview_inactive_users();

-- Se ok, esegui pulizia:
-- SELECT delete_inactive_users();

SELECT '✅ Funzioni pulizia utenti inattivi create!' as status;
