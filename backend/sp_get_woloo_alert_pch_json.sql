
DECLARE
    v_template TEXT;
    v_final_json TEXT;
    v_status VARCHAR := 'Bad';
BEGIN
    SELECT jsontemplate INTO v_template FROM tbljsonformatter WHERE name = 'woloo_alert_pch_json' AND isdeleted = 0 LIMIT 1;
    
    IF p_is_resolved = 1 THEN
        v_status := 'Good';
    END IF;

    v_final_json := REPLACE(v_template, '$deviceid', p_deviceid);
    v_final_json := REPLACE(v_final_json, '$status', v_status);
    v_final_json := REPLACE(v_final_json, '$pch_delta', p_delta::TEXT);
    v_final_json := REPLACE(v_final_json, '$sequence', p_seq::TEXT);
    v_final_json := REPLACE(v_final_json, '$timestamp', TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'));
    v_final_json := REPLACE(v_final_json, '$continuous_bad_mins', p_cbad::TEXT);
    
    INSERT INTO "tblJsonQueue" ("SlNo", alert_type, q_json, status, insert_date, is_processed)
    VALUES (p_slno, 'PCH', v_final_json, 0, CURRENT_TIMESTAMP, 0);
END;
