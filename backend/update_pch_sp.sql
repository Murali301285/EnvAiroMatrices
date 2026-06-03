CREATE OR REPLACE FUNCTION public.sp_get_woloo_schjsoncreator(p_deviceid character varying, p_ref_time timestamp without time zone DEFAULT NULL::timestamp without time zone)
 RETURNS TABLE(
    client character varying, 
    deviceid character varying, 
    alias character varying, 
    location character varying, 
    datetime character varying, 
    startdtime character varying, 
    triggered_by character varying, 
    parameters character varying, 
    hours boolean, 
    alert_sequence integer, 
    is_pch_alert character varying, 
    tvoc json, 
    tvoc_avg numeric, 
    tvoc_max numeric, 
    tvoc_min numeric, 
    tvoc_bad numeric, 
    pcd numeric, 
    pcd_max numeric, 
    pcd_bad numeric, 
    pch json, 
    pch_avg numeric, 
    pch_max numeric, 
    pch_bad numeric, 
    "time" character varying, 
    hum numeric, 
    temp numeric, 
    temp_unit character varying,
    -- EXPANDED DIAGNOSTIC COLUMNS
    diag_pch_cycle_min numeric,
    diag_pch_cycle_max numeric,
    diag_pch_cycle_start timestamp,
    diag_pch_cycle_end timestamp,
    diag_pch_cycle_count bigint,

    diag_pch_max_min numeric,
    diag_pch_max_max numeric,
    diag_pch_max_start timestamp,
    diag_pch_max_end timestamp,
    diag_pch_max_count bigint,

    diag_pch_breach_min numeric,
    diag_pch_breach_max numeric,
    diag_pch_breach_start timestamp,
    diag_pch_breach_end timestamp,
    diag_pch_breach_count_rows bigint,

    diag_pcd_min numeric,
    diag_pcd_max numeric,
    diag_pcd_start timestamp,
    diag_pcd_end timestamp,
    diag_pcd_count bigint
 )
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_tvoc_param_tag   VARCHAR := 'VOC';
    v_current_time     TIMESTAMP := COALESCE(p_ref_time, CURRENT_TIMESTAMP);
    v_window_start     TIMESTAMP;
    v_window_end       TIMESTAMP;
    v_hour_start       TIMESTAMP;
    v_latest_timestamp TIMESTAMP;
    v_last_alert_time  TIMESTAMP;
    v_rolling_start    TIMESTAMP;
    
    v_pch_cycle_val    NUMERIC;
    v_pch_cycle_min    NUMERIC;
    v_pch_cycle_max    NUMERIC;
    v_pch_cycle_count  BIGINT;

    v_pch_max_val      NUMERIC;
    v_pch_max_min      NUMERIC;
    v_pch_max_max      NUMERIC;
    v_pch_max_count    BIGINT;

    v_pch_breach_count NUMERIC;
    v_pch_breach_min   NUMERIC;
    v_pch_breach_max   NUMERIC;
    v_pch_breach_count_rows BIGINT;

    v_pch_threshold    NUMERIC;
    
    v_is_pch_alert     VARCHAR := 'false';
    v_pch_condition    VARCHAR := 'good';
    v_pch_breach_time_str VARCHAR := '';
    
    -- New loop variables for PCH Max Hour sum
    v_current_interval_start TIMESTAMP;
    v_interval_min      NUMERIC;
    v_interval_max      NUMERIC;
    v_interval_pch      NUMERIC;
    v_prev_interval_max NUMERIC;
    
BEGIN
    SELECT r.receivedOn INTO v_latest_timestamp
    FROM public.tbldatareceiver r
    WHERE r.deviceid = p_deviceid
    ORDER BY r.slno DESC
    LIMIT 1;

    IF v_latest_timestamp IS NULL THEN
        RETURN;
    END IF;

    -- 15-MINUTE ANCHORING
    v_window_start := date_trunc('hour', v_current_time)
                    + (DIV(EXTRACT(MINUTE FROM v_current_time)::INT, 15) * 15) * INTERVAL '1 minute';
    v_window_end := v_window_start + INTERVAL '14 minutes';
    
    -- HOUR START FOR PCH MAX
    v_hour_start := date_trunc('hour', v_current_time);

    -- PCH THRESHOLD
    SELECT COALESCE(
        NULLIF(d.working_hours_json->>'pch_threshold', '')::NUMERIC,
        c.peoplelimit
    ) INTO v_pch_threshold
    FROM tblDeviceMaster d
    LEFT JOIN tblCustomerMaster c ON d.customer_code = c.customer_code
    WHERE d.deviceid = p_deviceid LIMIT 1;
    
    -- PCH.VALUE Components
    SELECT 
        MIN((metrics->>'OUT_RAW')::NUMERIC),
        MAX((metrics->>'OUT_RAW')::NUMERIC),
        COUNT(*)
    INTO v_pch_cycle_min, v_pch_cycle_max, v_pch_cycle_count
    FROM public.tblminutedetails tmd
    WHERE tmd.deviceid = p_deviceid
      AND (tmd.minute_date + tmd.minute_time) >= v_window_start
      AND (tmd.minute_date + tmd.minute_time) <= v_window_end;
    
    -- Get the previous cycle's MAX value using the last posted pcd_max from history (robust against commit lag)
    IF v_window_start > date_trunc('day', v_window_start) THEN
        SELECT (json_payload->>'pcd_max')::NUMERIC INTO v_prev_interval_max
        FROM public.tblscheduledjsonhistory tsh
        WHERE tsh.deviceid = p_deviceid 
          AND payload_type = 'Scheduled'
          AND created_at >= (v_window_start - INTERVAL '20 minutes')
          AND created_at < v_window_start
        ORDER BY slno DESC LIMIT 1;
        
        -- Fallback to database query if history is not available
        IF v_prev_interval_max IS NULL THEN
            SELECT MAX((metrics->>'OUT_RAW')::NUMERIC)
            INTO v_prev_interval_max
            FROM public.tblminutedetails tmd
            WHERE tmd.deviceid = p_deviceid
              AND (tmd.minute_date + tmd.minute_time) >= (v_window_start - INTERVAL '15 minutes')
              AND (tmd.minute_date + tmd.minute_time) <= (v_window_start - INTERVAL '1 minute');
        END IF;
    ELSE
        v_prev_interval_max := NULL;
    END IF;

    IF v_prev_interval_max IS NOT NULL AND v_pch_cycle_max IS NOT NULL THEN
        v_pch_cycle_val := ROUND(COALESCE(v_pch_cycle_max - v_prev_interval_max, 0), 0);
    ELSE
        v_pch_cycle_val := ROUND(COALESCE(v_pch_cycle_max - v_pch_cycle_min, 0), 0);
    END IF;
    v_pch_cycle_val := GREATEST(0, v_pch_cycle_val);
      
    -- PCH_MAX Components
    SELECT 
        MIN((metrics->>'OUT_RAW')::NUMERIC),
        MAX((metrics->>'OUT_RAW')::NUMERIC),
        COUNT(*)
    INTO v_pch_max_min, v_pch_max_max, v_pch_max_count
    FROM public.tblminutedetails tmd
    WHERE tmd.deviceid = p_deviceid
      AND (tmd.minute_date + tmd.minute_time) >= v_hour_start
      AND (tmd.minute_date + tmd.minute_time) <= v_window_end;

    -- New PCH MAX logic: Sum of individual 15-minute PCH cycles in this calendar hour using previous max with cross-hour continuity
    v_pch_max_val := 0;
    v_current_interval_start := v_hour_start;
    
    -- Initialize the previous max value (looks up history first to capture cross-hour transitions cleanly)
    IF v_hour_start > date_trunc('day', v_window_start) THEN
        SELECT (json_payload->>'pcd_max')::NUMERIC INTO v_prev_interval_max
        FROM public.tblscheduledjsonhistory tsh
        WHERE tsh.deviceid = p_deviceid 
          AND payload_type = 'Scheduled'
          AND created_at >= (v_hour_start - INTERVAL '20 minutes')
          AND created_at < v_hour_start
        ORDER BY slno DESC LIMIT 1;
        
        -- Fallback to database query if history is not available
        IF v_prev_interval_max IS NULL THEN
            SELECT MAX((metrics->>'OUT_RAW')::NUMERIC)
            INTO v_prev_interval_max
            FROM public.tblminutedetails tmd
            WHERE tmd.deviceid = p_deviceid
              AND (tmd.minute_date + tmd.minute_time) >= (v_hour_start - INTERVAL '15 minutes')
              AND (tmd.minute_date + tmd.minute_time) <= (v_hour_start - INTERVAL '1 minute');
        END IF;
    ELSE
        v_prev_interval_max := NULL;
    END IF;
    
    WHILE v_current_interval_start <= v_window_start LOOP
        SELECT 
            MIN((metrics->>'OUT_RAW')::NUMERIC),
            MAX((metrics->>'OUT_RAW')::NUMERIC)
        INTO v_interval_min, v_interval_max
        FROM public.tblminutedetails tmd
        WHERE tmd.deviceid = p_deviceid
          AND (tmd.minute_date + tmd.minute_time) >= v_current_interval_start
          AND (tmd.minute_date + tmd.minute_time) <= v_current_interval_start + INTERVAL '14 minutes';
          
        IF v_interval_max IS NOT NULL THEN
            IF v_prev_interval_max IS NULL THEN
                v_interval_pch := ROUND(COALESCE(v_interval_max - v_interval_min, 0), 0);
            ELSE
                v_interval_pch := ROUND(COALESCE(v_interval_max - v_prev_interval_max, 0), 0);
            END IF;
            v_interval_pch := GREATEST(0, v_interval_pch);
            v_pch_max_val := v_pch_max_val + v_interval_pch;
            v_prev_interval_max := v_interval_max;
        END IF;
        
        v_current_interval_start := v_current_interval_start + INTERVAL '15 minutes';
    END LOOP;

    -- ALERT RESET RULE: Get last alert time robustly from tbl_pch_alert (strictly before current cycle)
    SELECT MAX(tpa.created_on) INTO v_last_alert_time
    FROM tbl_pch_alert tpa
    WHERE tpa.deviceid = p_deviceid 
      AND tpa.isalertrequired = true
      AND tpa.created_on < v_window_start;

    -- Fallback to tblalertbucketpch
    IF v_last_alert_time IS NULL THEN
        SELECT MAX(COALESCE(tap.lastupdatedon, tap.cdatetime)) INTO v_last_alert_time
        FROM tblalertbucketpch tap
        WHERE tap.deviceid = p_deviceid
          AND COALESCE(tap.lastupdatedon, tap.cdatetime) < v_window_start;
    END IF;

    IF v_last_alert_time IS NULL THEN
        v_last_alert_time := '1970-01-01'::TIMESTAMP;
    END IF;
    
    -- ROLLING WINDOW START (Check previous hours and when last breach alert was raised, choosing whichever is later)
    IF v_last_alert_time > '1970-01-01'::TIMESTAMP THEN
        v_rolling_start := GREATEST(
            v_window_end - INTERVAL '1 hour',
            v_last_alert_time
        );
    ELSE
        v_rolling_start := v_window_end - INTERVAL '1 hour';
    END IF;

    -- Clamp to midnight (Midnight Reset)
    v_rolling_start := GREATEST(date_trunc('day', v_window_start), v_rolling_start);


    -- PCH.PCH_BREACH_COUNT Components
    SELECT 
        MIN((metrics->>'OUT_RAW')::NUMERIC),
        MAX((metrics->>'OUT_RAW')::NUMERIC),
        COUNT(*)
    INTO v_pch_breach_min, v_pch_breach_max, v_pch_breach_count_rows
    FROM public.tblminutedetails tmd
    WHERE tmd.deviceid = p_deviceid
      AND (tmd.minute_date + tmd.minute_time) >= v_rolling_start
      AND (tmd.minute_date + tmd.minute_time) <= v_window_end;

    -- New PCH Breach (Rolling) sum logic: Sum of 15-minute PCH cycles inside the dynamic rolling window using previous max with continuous transitions
    v_pch_breach_count := 0;
    v_current_interval_start := v_rolling_start;
    
    -- Initialize the previous max value for rolling window loop (looks up history first for rolling transitions)
    IF v_rolling_start > date_trunc('day', v_window_start) THEN
        SELECT (json_payload->>'pcd_max')::NUMERIC INTO v_prev_interval_max
        FROM public.tblscheduledjsonhistory tsh
        WHERE tsh.deviceid = p_deviceid 
          AND payload_type = 'Scheduled'
          AND created_at >= (v_rolling_start - INTERVAL '20 minutes')
          AND created_at < v_rolling_start
        ORDER BY slno DESC LIMIT 1;
        
        -- Fallback to database query if history is not available
        IF v_prev_interval_max IS NULL THEN
            SELECT MAX((metrics->>'OUT_RAW')::NUMERIC)
            INTO v_prev_interval_max
            FROM public.tblminutedetails tmd
            WHERE tmd.deviceid = p_deviceid
              AND (tmd.minute_date + tmd.minute_time) >= (v_rolling_start - INTERVAL '15 minutes')
              AND (tmd.minute_date + tmd.minute_time) <= (v_rolling_start - INTERVAL '1 minute');
        END IF;
    ELSE
        v_prev_interval_max := NULL;
    END IF;
    
    WHILE v_current_interval_start <= v_window_start LOOP
        SELECT 
            MIN((metrics->>'OUT_RAW')::NUMERIC),
            MAX((metrics->>'OUT_RAW')::NUMERIC)
        INTO v_interval_min, v_interval_max
        FROM public.tblminutedetails tmd
        WHERE tmd.deviceid = p_deviceid
          AND (tmd.minute_date + tmd.minute_time) >= v_current_interval_start
          AND (tmd.minute_date + tmd.minute_time) <= v_current_interval_start + INTERVAL '14 minutes';
          
        IF v_interval_max IS NOT NULL THEN
            IF v_prev_interval_max IS NULL THEN
                v_interval_pch := ROUND(COALESCE(v_interval_max - v_interval_min, 0), 0);
            ELSE
                v_interval_pch := ROUND(COALESCE(v_interval_max - v_prev_interval_max, 0), 0);
            END IF;
            v_interval_pch := GREATEST(0, v_interval_pch);
            v_pch_breach_count := v_pch_breach_count + v_interval_pch;
            v_prev_interval_max := v_interval_max;
        END IF;
        
        v_current_interval_start := v_current_interval_start + INTERVAL '15 minutes';
    END LOOP;

    -- PCH.CONDITION & THRESHOLD BREACH TIME
    IF v_pch_threshold IS NOT NULL AND v_pch_breach_count >= v_pch_threshold THEN
        v_pch_condition := 'bad';
        v_pch_breach_time_str := to_char(v_window_end, 'YYYY-MM-DD HH24:MI:SS');
        v_is_pch_alert := 'true';
    ELSIF v_pch_threshold IS NULL THEN
        v_pch_condition := 'NA';
    END IF;

    RETURN QUERY
    WITH tblminutedetails_view AS (
        SELECT
            r.deviceid,
            r.receivedOn AS created_at,
            jsonb_build_object(
                'VOC',     NULLIF(SUBSTRING(r.revText FROM 'VOC:([-0-9.]+)'), ''),
                'SH2S',    NULLIF(SUBSTRING(r.revText FROM 'SH2S:([-0-9.]+)'), ''),
                'HYGIENE', NULLIF(SUBSTRING(r.revText FROM 'HYGIENE:([-0-9.]+)'), ''),
                'STATUS',  NULLIF(SUBSTRING(r.revText FROM 'STATUS:([a-zA-Z]+)'), ''),
                'HUM',     NULLIF(SUBSTRING(r.revText FROM 'HUM:([-0-9.]+)'),  ''),
                'TMP',     NULLIF(SUBSTRING(r.revText FROM 'TMP:([-0-9.]+)'),  ''),
                'IN',      NULLIF(SUBSTRING(r.revText FROM 'IN:([-0-9.]+)'),   ''),
                'OUT',     NULLIF(SUBSTRING(r.revText FROM 'OUT:([-0-9.]+)'),  ''),
                'IAQ',     NULLIF(SUBSTRING(r.revText FROM 'IAQ:([-0-9.]+)'), '')
            ) AS metrics
        FROM public.tbldatareceiver r
        WHERE r.deviceid = p_deviceid
          AND r.receivedOn >= date_trunc('day', v_latest_timestamp) - INTERVAL '2 days'
    ),
    device_info AS (
        SELECT
            COALESCE(c.customerName, '')                  AS client,
            d.deviceid,
            d.alias,
            d.location,
            (d.working_hours_json->>'start')::TIME        AS start_time,
            (d.working_hours_json->>'end')::TIME          AS end_time,
            COALESCE(c.peoplelimit, 99999)                AS plimit
        FROM tblDeviceMaster d
        LEFT JOIN tblCustomerMaster c ON d.customer_code = c.customer_code
        WHERE d.deviceid = p_deviceid
        LIMIT 1
    ),
    hourly_aggregations AS (
        SELECT
            ROUND(COALESCE(AVG(COALESCE((tmd.metrics->>'VOC')::NUMERIC,0) + COALESCE((tmd.metrics->>'SH2S')::NUMERIC,0)), 0), 2) AS tvoc_avg,
            ROUND(COALESCE(MAX(COALESCE((tmd.metrics->>'VOC')::NUMERIC,0) + COALESCE((tmd.metrics->>'SH2S')::NUMERIC,0)), 0), 2) AS tvoc_max,
            ROUND(COALESCE(MIN(COALESCE((tmd.metrics->>'VOC')::NUMERIC,0) + COALESCE((tmd.metrics->>'SH2S')::NUMERIC,0)), 0), 2) AS tvoc_min,
            ROUND(COALESCE(MAX((tmd.metrics->>'IN')::NUMERIC) - MIN((tmd.metrics->>'IN')::NUMERIC), 0), 2) AS pch_in_value,
            ROUND(COALESCE(AVG((tmd.metrics->>'HUM')::NUMERIC), 0), 2) AS hum_avg,
            ROUND(COALESCE(AVG((tmd.metrics->>'TMP')::NUMERIC), 0), 2) AS tmp_avg
        FROM public.tblminutedetails tmd
        WHERE tmd.deviceid = p_deviceid
          AND (tmd.minute_date + tmd.minute_time) >= v_window_start
          AND (tmd.minute_date + tmd.minute_time) <= v_window_end
    ),
    daily_pcd AS (
        SELECT
            MIN((tmd.metrics->>'OUT_RAW')::NUMERIC) as pcd_min,
            MAX((tmd.metrics->>'OUT_RAW')::NUMERIC) as pcd_max,
            COUNT(*) as pcd_count
        FROM public.tblminutedetails tmd
        WHERE tmd.deviceid = p_deviceid
          AND (tmd.minute_date + tmd.minute_time) >= date_trunc('day', v_current_time)
          AND (tmd.minute_date + tmd.minute_time) <= v_window_end
    )

    SELECT
        di.client::VARCHAR,
        di.deviceid::VARCHAR,
        di.alias::VARCHAR,
        di.location::VARCHAR,
        to_char(v_window_end, 'YYYY-MM-DD HH24:MI:SS')::VARCHAR AS datetime,
        to_char(v_window_start, 'YYYY-MM-DD HH24:MI:SS')::VARCHAR     AS startdtime,
        'scheduled'::VARCHAR                                                              AS triggered_by,
        'tvoc,pcd,pch'::VARCHAR                                                           AS parameters,
        COALESCE(
            CASE
                WHEN di.start_time <= di.end_time THEN
                    v_latest_timestamp::time >= di.start_time AND v_latest_timestamp::time <= di.end_time
                ELSE
                    v_latest_timestamp::time >= di.start_time OR  v_latest_timestamp::time <= di.end_time
            END, false
        )::BOOLEAN                                                                        AS hours,
        0::INTEGER                                                                        AS alert_sequence,
        v_is_pch_alert::VARCHAR                                                           AS is_pch_alert,
        json_build_object('value', ha.tvoc_max, 'unit', 'ppm', 'condition', 'good')::JSON AS tvoc,
        ha.tvoc_avg::NUMERIC,
        ha.tvoc_max::NUMERIC,
        ha.tvoc_min::NUMERIC,
        0::NUMERIC                                                                        AS tvoc_bad,
        ROUND(COALESCE(dp.pcd_max - dp.pcd_min, 0), 0)::NUMERIC                           AS pcd,
        ROUND(COALESCE(dp.pcd_max - dp.pcd_min, 0), 0)::NUMERIC                           AS pcd_max,
        0::NUMERIC                                                                        AS pcd_bad,
        json_build_object(
            'value',     v_pch_cycle_val,
            'unit',      'count',
            'condition', v_pch_condition,
            'pch_in',    ROUND(COALESCE(ha.pch_in_value, 0), 0),
            'pch_max',   v_pch_max_val,
            'pch_breach_count', v_pch_breach_count,
            'threshold_breach_time', v_pch_breach_time_str
        )::JSON                                                                           AS pch,
        v_pch_cycle_val::NUMERIC                                                          AS pch_avg,
        v_pch_max_val::NUMERIC                                                            AS pch_max,
        0::NUMERIC                                                                        AS pch_bad,
        to_char(v_latest_timestamp, 'HH24')::VARCHAR                                      AS "time",
        ha.hum_avg::NUMERIC                                                               AS hum,
        ha.tmp_avg::NUMERIC                                                               AS temp,
        COALESCE((SELECT unit FROM tblParameterMaster WHERE param_tag='TMP' LIMIT 1), '')::VARCHAR AS temp_unit,
        -- DIAGNOSTIC OUTPUTS
        COALESCE(v_pch_cycle_min, 0)::NUMERIC,
        COALESCE(v_pch_cycle_max, 0)::NUMERIC,
        v_window_start::TIMESTAMP,
        v_window_end::TIMESTAMP,
        COALESCE(v_pch_cycle_count, 0)::BIGINT,

        COALESCE(v_pch_max_min, 0)::NUMERIC,
        COALESCE(v_pch_max_max, 0)::NUMERIC,
        v_hour_start::TIMESTAMP,
        v_window_end::TIMESTAMP,
        COALESCE(v_pch_max_count, 0)::BIGINT,

        COALESCE(v_pch_breach_min, 0)::NUMERIC,
        COALESCE(v_pch_breach_max, 0)::NUMERIC,
        v_rolling_start::TIMESTAMP,
        v_window_end::TIMESTAMP,
        COALESCE(v_pch_breach_count_rows, 0)::BIGINT,

        COALESCE(dp.pcd_min, 0)::NUMERIC,
        COALESCE(dp.pcd_max, 0)::NUMERIC,
        date_trunc('day', v_current_time)::TIMESTAMP,
        v_window_end::TIMESTAMP,
        COALESCE(dp.pcd_count, 0)::BIGINT
    FROM device_info di
    CROSS JOIN hourly_aggregations ha
    CROSS JOIN daily_pcd dp;
END;
$function$
