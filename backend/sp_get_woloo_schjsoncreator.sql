
            DECLARE
                v_tvoc_param_tag VARCHAR := 'VOC';
                v_current_time TIMESTAMP := COALESCE(p_ref_time, CURRENT_TIMESTAMP);
                v_window_start TIMESTAMP;
                v_latest_timestamp TIMESTAMP;
                v_last_alert_time TIMESTAMP;
            BEGIN
                SELECT r.receivedOn INTO v_latest_timestamp
                FROM public.tbldatareceiver r
                WHERE r.deviceid = p_deviceid
                ORDER BY r.slno DESC
                LIMIT 1;

                IF v_latest_timestamp IS NULL THEN
                    RETURN;
                END IF;

                SELECT MAX(lastupdatedon) INTO v_last_alert_time FROM tblalertbucketpch WHERE deviceid = p_deviceid;
                IF v_last_alert_time IS NULL THEN
                    v_last_alert_time := '1970-01-01'::TIMESTAMP;
                END IF;

                -- STRICT 15-MINUTE ANCHORING
                -- Find the Start of the 15-minute bucket (0, 15, 30, 45)
                v_window_start := date_trunc('hour', v_current_time) + (DIV(EXTRACT(MINUTE FROM v_current_time)::INT, 15) * 15) * INTERVAL '1 minute';

                RETURN QUERY
                WITH tblminutedetails AS (
                    SELECT 
                        r.deviceid,
                        r.receivedOn AS created_at,
                        jsonb_build_object(
                            'VOC', NULLIF(SUBSTRING(r.revText FROM 'VOC:([-0-9.]+)'), ''),
                            'SH2S', NULLIF(SUBSTRING(r.revText FROM 'SH2S:([-0-9.]+)'), ''),
                            'HYGIENE', NULLIF(SUBSTRING(r.revText FROM 'HYGIENE:([-0-9.]+)'), ''),
                            'STATUS', NULLIF(SUBSTRING(r.revText FROM 'STATUS:([a-zA-Z]+)'), ''),
                            'HUM', NULLIF(SUBSTRING(r.revText FROM 'HUM:([-0-9.]+)'), ''),
                            'TMP', NULLIF(SUBSTRING(r.revText FROM 'TMP:([-0-9.]+)'), ''),
                            'IN', NULLIF(SUBSTRING(r.revText FROM 'IN:([-0-9.]+)'), ''),
                            'OUT', NULLIF(SUBSTRING(r.revText FROM 'OUT:([-0-9.]+)'), ''),
                            'OUT_RAW', COALESCE(NULLIF(SUBSTRING(r.revText FROM 'OUT_RAW:([-0-9.]+)'), ''), NULLIF(SUBSTRING(r.revText FROM 'OUT:([-0-9.]+)'), '')),
                            'IAQ', NULLIF(SUBSTRING(r.revText FROM 'IAQ:([-0-9.]+)'), '')
                        ) AS metrics
                    FROM public.tbldatareceiver r
                    WHERE r.deviceid = p_deviceid 
                      AND r.receivedOn >= date_trunc('day', v_latest_timestamp) - INTERVAL '2 days'
                ),
                device_info AS (
                    SELECT 
                        COALESCE(c.customerName, '') AS client,
                        d.deviceid,
                        d.alias,
                        d.location,
                        (d.working_hours_json->>'start')::TIME AS start_time,
                        (d.working_hours_json->>'end')::TIME AS end_time,
                        COALESCE(c.peoplelimit, 99999) AS plimit
                    FROM tblDeviceMaster d
                    LEFT JOIN tblCustomerMaster c ON d.customer_code = c.customer_code
                    WHERE d.deviceid = p_deviceid
                    LIMIT 1
                ),
                tvoc_metadata AS (
                    SELECT 
                        COALESCE(unit, '') AS unit,
                        status_conditions::JSONB AS conditions
                    FROM tblParameterMaster 
                    WHERE param_tag = v_tvoc_param_tag LIMIT 1
                ),
                pch_metrics AS (
                    SELECT 
                        -- Cycle Value (15 mins)
                        COALESCE((SELECT MAX((metrics->>'OUT_RAW')::NUMERIC) - MIN((metrics->>'OUT_RAW')::NUMERIC) 
                                  FROM tblminutedetails 
                                  WHERE deviceid = p_deviceid 
                                    AND created_at >= v_window_start 
                                    AND created_at <= v_window_start + INTERVAL '14 minutes'), 0) AS cycle_value,
                        
                        -- Hourly Cumulative (Top of hour to end of cycle)
                        COALESCE((SELECT MAX((metrics->>'OUT_RAW')::NUMERIC) - MIN((metrics->>'OUT_RAW')::NUMERIC) 
                                  FROM tblminutedetails 
                                  WHERE deviceid = p_deviceid 
                                    AND created_at >= date_trunc('hour', v_window_start) 
                                    AND created_at <= v_window_start + INTERVAL '14 minutes'), 0) AS pch_max,
                        
                        -- Rolling 1-Hour with Alert & Midnight Reset
                        COALESCE((SELECT MAX((metrics->>'OUT_RAW')::NUMERIC) - MIN((metrics->>'OUT_RAW')::NUMERIC) 
                                  FROM tblminutedetails 
                                  WHERE deviceid = p_deviceid 
                                    AND created_at >= GREATEST(
                                        date_trunc('day', v_window_start), 
                                        v_window_start + INTERVAL '14 minutes' - INTERVAL '1 hour',
                                        v_last_alert_time
                                    ) 
                                    AND created_at <= v_window_start + INTERVAL '14 minutes'), 0) AS pch_breach_count
                ),
                hourly_aggregations AS (
                    SELECT 
                        LEAST(15.00, ROUND(COALESCE(AVG(COALESCE((metrics->>'VOC')::NUMERIC, 0) + COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2)) AS tvoc_avg,
                        LEAST(15.00, ROUND(COALESCE(MAX(COALESCE((metrics->>'VOC')::NUMERIC, 0) + COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2)) AS tvoc_max,
                        LEAST(15.00, ROUND(COALESCE(MIN(COALESCE((metrics->>'VOC')::NUMERIC, 0) + COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2)) AS tvoc_min,
                        COALESCE(MAX((metrics->>'OUT_RAW')::NUMERIC), 0) - COALESCE(MIN((metrics->>'OUT_RAW')::NUMERIC), 0) AS out_delta
                    FROM tblminutedetails
                    WHERE tblminutedetails.deviceid = p_deviceid 
                      AND created_at >= v_window_start 
                      AND created_at <= v_current_time
                ),
                daily_pcd AS (
                    SELECT 
                        COALESCE((SELECT (metrics->>'OUT_RAW')::NUMERIC 
                         FROM tblminutedetails 
                         WHERE tblminutedetails.deviceid = p_deviceid AND date(created_at) = date(v_current_time) 
                         ORDER BY created_at ASC LIMIT 1), 0) AS start_out,
                        COALESCE((SELECT (metrics->>'OUT_RAW')::NUMERIC 
                         FROM tblminutedetails 
                         WHERE tblminutedetails.deviceid = p_deviceid AND date(created_at) = date(v_current_time) 
                         ORDER BY created_at DESC LIMIT 1), 0) AS current_out
                ),
                tvoc_evaluations AS (
                    SELECT 
                        m.created_at,
                        CASE 
                            WHEN (COALESCE((m.metrics->>'VOC')::NUMERIC, 0) + COALESCE((m.metrics->>'SH2S')::NUMERIC, 0)) > 12.00 AND COALESCE((m.metrics->>'IAQ')::NUMERIC, 0) >= 250 THEN 'BAD'
                            WHEN (COALESCE((m.metrics->>'VOC')::NUMERIC, 0) + COALESCE((m.metrics->>'SH2S')::NUMERIC, 0)) <= 5.00 THEN 'GOOD'
                            ELSE 'MODERATE'
                        END AS status
                    FROM tblminutedetails m
                    CROSS JOIN tvoc_metadata tm
                    WHERE m.deviceid = p_deviceid 
                      AND m.created_at <= v_latest_timestamp
                      AND m.created_at >= date_trunc('day', v_latest_timestamp)
                ),
                continuous_tvoc_bad AS (
                    SELECT 
                        CASE 
                            WHEN (SELECT status FROM tvoc_evaluations ORDER BY created_at DESC LIMIT 1) = 'BAD' THEN 
                                EXTRACT(EPOCH FROM (
                                    v_latest_timestamp - COALESCE(
                                        (SELECT MIN(created_at) 
                                         FROM tvoc_evaluations 
                                         WHERE created_at > COALESCE((SELECT created_at FROM tvoc_evaluations WHERE status != 'BAD' ORDER BY created_at DESC LIMIT 1), '1970-01-01'::TIMESTAMP)
                                        ), 
                                        v_latest_timestamp
                                    )
                                )) / 60
                            ELSE 0
                        END AS consecutive_bad_mins
                ),
                pch_evaluations AS (
                    SELECT 
                        m.created_at,
                        CASE 
                           WHEN (MAX(COALESCE((m.metrics->>'OUT_RAW')::NUMERIC, 0)) OVER w - MIN(COALESCE((m.metrics->>'OUT_RAW')::NUMERIC, 0)) OVER w) > (SELECT plimit FROM device_info) THEN 'BAD' 
                           ELSE 'GOOD' 
                        END AS status
                    FROM tblminutedetails m
                    WHERE m.deviceid = p_deviceid 
                      AND m.created_at <= v_latest_timestamp
                      AND m.created_at >= date_trunc('day', v_latest_timestamp)
                    WINDOW w AS (
                        PARTITION BY date_trunc('hour', m.created_at) + (DIV(EXTRACT(MINUTE FROM m.created_at)::INT, 15) * 15) * INTERVAL '1 minute'
                        ORDER BY m.created_at ASC
                    )
                ),
                continuous_pch_bad AS (
                    SELECT 
                        CASE 
                            WHEN (SELECT status FROM pch_evaluations WHERE created_at >= date_trunc('hour', v_latest_timestamp) ORDER BY created_at DESC LIMIT 1) = 'BAD' THEN 
                                EXTRACT(EPOCH FROM (
                                    v_latest_timestamp - COALESCE(
                                        (SELECT MIN(created_at) 
                                         FROM pch_evaluations 
                                         WHERE created_at >= date_trunc('hour', v_latest_timestamp)
                                           AND created_at > COALESCE(
                                               (SELECT created_at FROM pch_evaluations WHERE created_at >= date_trunc('hour', v_latest_timestamp) AND status != 'BAD' ORDER BY created_at DESC LIMIT 1), 
                                               date_trunc('hour', v_latest_timestamp) - INTERVAL '1 minute'
                                           )
                                        ), 
                                        v_latest_timestamp
                                    )
                                )) / 60
                            ELSE 0
                        END AS consecutive_bad_mins
                ),
                continuous_pcd_bad AS (
                    SELECT 
                        CASE 
                            WHEN (SELECT status FROM pch_evaluations ORDER BY created_at DESC LIMIT 1) = 'BAD' THEN 
                                EXTRACT(EPOCH FROM (
                                    v_latest_timestamp - COALESCE(
                                        (SELECT MIN(created_at) 
                                         FROM pch_evaluations 
                                         WHERE created_at > COALESCE(
                                             (SELECT created_at FROM pch_evaluations WHERE status != 'BAD' ORDER BY created_at DESC LIMIT 1), 
                                             date_trunc('day', v_latest_timestamp) - INTERVAL '1 minute'
                                         )
                                        ), 
                                        v_latest_timestamp
                                    )
                                )) / 60
                            ELSE 0
                        END AS consecutive_bad_mins
                )
                SELECT 
                    di.client::VARCHAR,
                    di.deviceid::VARCHAR,
                    di.alias::VARCHAR,
                    di.location::VARCHAR,
                    to_char(v_window_start + INTERVAL '14 minutes', 'YYYY-MM-DD HH24:MI:SS')::VARCHAR AS datetime,
                    to_char(v_window_start, 'YYYY-MM-DD HH24:MI:SS')::VARCHAR AS startdtime,
                    'scheduled'::VARCHAR AS triggered_by,
                    'tvoc,pcd,pch'::VARCHAR AS parameters,
                    COALESCE(
                        CASE 
                            WHEN di.start_time <= di.end_time THEN 
                                v_latest_timestamp::time >= di.start_time AND v_latest_timestamp::time <= di.end_time
                            ELSE 
                                v_latest_timestamp::time >= di.start_time OR v_latest_timestamp::time <= di.end_time
                        END, 
                        false
                    )::BOOLEAN AS hours,
                    0::INTEGER AS alert_sequence,
                    
                    json_build_object(
                         'value', ha.tvoc_max,
                         'unit', 'ppm',
                         'condition', 'good'
                    )::JSON AS tvoc,
                    
                    ha.tvoc_avg::NUMERIC,
                    ha.tvoc_max::NUMERIC,
                    ha.tvoc_min::NUMERIC,
                    0 AS tvoc_bad,
                    
                    dp.current_out - dp.start_out::NUMERIC AS pcd,
                    dp.current_out - dp.start_out::NUMERIC AS pcd_max,
                    0 AS pcd_bad,
                    
                    json_build_object(
                         'value', pm.cycle_value,
                         'pch_max', pm.pch_max,
                         'pch_breach_count', pm.pch_breach_count,
                         'condition', CASE WHEN pm.pch_breach_count >= di.plimit THEN 'bad' ELSE 'good' END,
                         'threshold_breach_time', CASE WHEN pm.pch_breach_count >= di.plimit THEN to_char(v_window_start + INTERVAL '14 minutes', 'YYYY-MM-DD HH24:MI:SS') ELSE '' END,
                         'unit', 'count'
                    )::JSON AS pch,
                    pm.cycle_value::NUMERIC AS pch_Avg,
                    pm.pch_max::NUMERIC AS pch_max,
                    0 AS pch_bad,
                    
                    to_char(v_latest_timestamp, 'HH24')::VARCHAR AS "time",
                    0::NUMERIC AS hum,
                    0::NUMERIC AS temp,
                    COALESCE((SELECT unit FROM tblParameterMaster WHERE param_tag='TMP' LIMIT 1), '')::VARCHAR AS temp_unit

                FROM device_info di
                CROSS JOIN hourly_aggregations ha
                CROSS JOIN pch_metrics pm
                CROSS JOIN daily_pcd dp;
            END;
            