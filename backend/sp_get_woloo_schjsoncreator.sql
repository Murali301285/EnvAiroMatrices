
            DECLARE
                v_tvoc_param_tag VARCHAR := 'VOC';
                v_current_time TIMESTAMP := COALESCE(p_ref_time, CURRENT_TIMESTAMP);
                v_window_start TIMESTAMP;
                v_latest_timestamp TIMESTAMP;
                v_last_alert_time TIMESTAMP;
                v_breach_time TIMESTAMP;
            BEGIN
                -- 1. Get the latest data point to anchor calculations
                SELECT r.receivedOn INTO v_latest_timestamp
                FROM public.tbldatareceiver r
                WHERE r.deviceid = p_deviceid
                ORDER BY r.slno DESC
                LIMIT 1;

                IF v_latest_timestamp IS NULL THEN
                    RETURN;
                END IF;

                -- 2. Find the last alert to handle reset logic
                SELECT MAX(lastupdatedon) INTO v_last_alert_time FROM tblalertbucketpch WHERE deviceid = p_deviceid;
                IF v_last_alert_time IS NULL THEN
                    v_last_alert_time := '1970-01-01'::TIMESTAMP;
                END IF;

                -- 3. STRICT 15-MINUTE ANCHORING (e.g. 12:00:00, 12:15:00)
                v_window_start := date_trunc('hour', v_current_time) + (DIV(EXTRACT(MINUTE FROM v_current_time)::INT, 15) * 15) * INTERVAL '1 minute';
                v_window_start := date_trunc('minute', v_window_start); -- Force 00 seconds

                RETURN QUERY
                WITH tblminutedetails AS (
                    SELECT 
                        r.deviceid,
                        r.receivedOn AS created_at,
                        jsonb_build_object(
                            'VOC', NULLIF(SUBSTRING(r.revText FROM 'VOC:([-0-9.]+)'), ''),
                            'SH2S', NULLIF(SUBSTRING(r.revText FROM 'SH2S:([-0-9.]+)'), ''),
                            'OUT_RAW', COALESCE(NULLIF(SUBSTRING(r.revText FROM 'OUT_RAW:([-0-9.]+)'), ''), NULLIF(SUBSTRING(r.revText FROM 'OUT:([-0-9.]+)'), '')),
                            'IN_RAW', COALESCE(NULLIF(SUBSTRING(r.revText FROM 'IN_RAW:([-0-9.]+)'), ''), NULLIF(SUBSTRING(r.revText FROM 'IN:([-0-9.]+)'), ''))
                        ) AS metrics
                    FROM public.tbldatareceiver r
                    WHERE r.deviceid = p_deviceid 
                      AND r.receivedOn >= date_trunc('day', v_latest_timestamp) - INTERVAL '1 day'
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
                pch_metrics AS (
                    SELECT 
                        -- Current 15-min Cycle Delta (Max - Min)
                        COALESCE((SELECT MAX((metrics->>'OUT_RAW')::NUMERIC) - MIN((metrics->>'OUT_RAW')::NUMERIC) 
                                  FROM tblminutedetails 
                                  WHERE deviceid = p_deviceid 
                                    AND created_at >= v_window_start 
                                    AND created_at < v_window_start + INTERVAL '15 minutes'), 0) AS cycle_value,
                        
                        -- Current 15-min Cycle IN Delta
                        COALESCE((SELECT MAX((metrics->>'IN_RAW')::NUMERIC) - MIN((metrics->>'IN_RAW')::NUMERIC) 
                                  FROM tblminutedetails 
                                  WHERE deviceid = p_deviceid 
                                    AND created_at >= v_window_start 
                                    AND created_at < v_window_start + INTERVAL '15 minutes'), 0) AS pch_in,

                        -- Hourly Cumulative (Top of hour to end of cycle)
                        COALESCE((SELECT MAX((metrics->>'OUT_RAW')::NUMERIC) - MIN((metrics->>'OUT_RAW')::NUMERIC) 
                                  FROM tblminutedetails 
                                  WHERE deviceid = p_deviceid 
                                    AND created_at >= date_trunc('hour', v_window_start) 
                                    AND created_at < v_window_start + INTERVAL '15 minutes'), 0) AS pch_max,
                        
                        -- Breach Count: How many times has delta exceeded plimit in the last 60 minutes
                        COALESCE((SELECT COUNT(*) FROM (
                            SELECT 1 FROM tblminutedetails 
                            WHERE deviceid = p_deviceid 
                              AND created_at >= v_window_start - INTERVAL '45 minutes'
                              AND created_at < v_window_start + INTERVAL '15 minutes'
                              GROUP BY date_trunc('hour', created_at) + (DIV(EXTRACT(MINUTE FROM created_at)::INT, 15) * 15) * INTERVAL '1 minute'
                              HAVING (MAX((metrics->>'OUT_RAW')::NUMERIC) - MIN((metrics->>'OUT_RAW')::NUMERIC)) > (SELECT plimit FROM device_info)
                        ) t), 0) AS pch_breach_count,

                        -- First Breach Time: Find the window start that first crossed the limit
                        (SELECT MIN(date_trunc('hour', created_at) + (DIV(EXTRACT(MINUTE FROM created_at)::INT, 15) * 15) * INTERVAL '1 minute')
                         FROM tblminutedetails 
                         WHERE deviceid = p_deviceid 
                           AND created_at >= v_window_start - INTERVAL '45 minutes'
                           AND created_at < v_window_start + INTERVAL '15 minutes'
                         GROUP BY date_trunc('hour', created_at) + (DIV(EXTRACT(MINUTE FROM created_at)::INT, 15) * 15) * INTERVAL '1 minute'
                         HAVING (MAX((metrics->>'OUT_RAW')::NUMERIC) - MIN((metrics->>'OUT_RAW')::NUMERIC)) > (SELECT plimit FROM device_info)
                         LIMIT 1
                        ) AS first_breach_time
                ),
                hourly_aggregations AS (
                    SELECT 
                        LEAST(15.00, ROUND(COALESCE(AVG(COALESCE((metrics->>'VOC')::NUMERIC, 0) + COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2)) AS tvoc_avg,
                        LEAST(15.00, ROUND(COALESCE(MAX(COALESCE((metrics->>'VOC')::NUMERIC, 0) + COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2)) AS tvoc_max,
                        LEAST(15.00, ROUND(COALESCE(MIN(COALESCE((metrics->>'VOC')::NUMERIC, 0) + COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2)) AS tvoc_min,
                        ROUND(COALESCE(MAX(COALESCE((metrics->>'VOC')::NUMERIC, 0)), 0), 2) AS voc_max,
                        ROUND(COALESCE(MAX(COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2) AS sh2s_max
                    FROM tblminutedetails
                    WHERE tblminutedetails.deviceid = p_deviceid 
                      AND created_at >= v_window_start 
                      AND created_at < v_window_start + INTERVAL '15 minutes'
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
                )
                SELECT 
                    di.client::VARCHAR,
                    di.deviceid::VARCHAR,
                    di.alias::VARCHAR,
                    di.location::VARCHAR,
                    to_char(v_window_start + INTERVAL '14 minutes' + INTERVAL '59 seconds', 'YYYY-MM-DD HH24:MI:SS')::VARCHAR AS datetime,
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
                         'voc', ha.voc_max,
                         'sh2s', ha.sh2s_max,
                         'condition', CASE WHEN ha.tvoc_max > 12.0 THEN 'bad' ELSE 'good' END
                    )::JSON AS tvoc,
                    
                    ha.tvoc_avg::NUMERIC,
                    ha.tvoc_max::NUMERIC,
                    ha.tvoc_min::NUMERIC,
                    CASE WHEN ha.tvoc_max > 12.0 THEN 1 ELSE 0 END AS tvoc_bad,
                    
                    dp.current_out - dp.start_out::NUMERIC AS pcd,
                    dp.current_out - dp.start_out::NUMERIC AS pcd_max,
                    0 AS pcd_bad,
                    
                    json_build_object(
                         'value', pm.cycle_value,
                         'unit', 'count',
                         'pch_in', pm.pch_in,
                         'pch_max', pm.pch_max,
                         'pch_breach_count', pm.pch_breach_count,
                         'condition', CASE WHEN pm.pch_breach_count > 0 THEN 'bad' ELSE 'good' END,
                         'threshold_breach_time', COALESCE(to_char(pm.first_breach_time, 'YYYY-MM-DD HH24:MI:SS'), '')
                    )::JSON AS pch,
                    pm.cycle_value::NUMERIC AS pch_Avg,
                    pm.pch_max::NUMERIC AS pch_max,
                    0 AS pch_bad,
                    
                    to_char(v_latest_timestamp, 'HH24')::VARCHAR AS "time",
                    0::NUMERIC AS hum,
                    0::NUMERIC AS temp,
                    COALESCE((SELECT unit FROM tblParameterMaster WHERE param_tag='TMP' LIMIT 1), '')::VARCHAR AS temp_unit,

                    -- JSON Monitor Diagnostics
                    jsonb_build_object(
                        'window_start', v_window_start,
                        'window_end', v_window_start + INTERVAL '14 minutes' + INTERVAL '59 seconds',
                        'record_count', (SELECT COUNT(*) FROM tblminutedetails WHERE deviceid = p_deviceid AND created_at >= v_window_start AND created_at < v_window_start + INTERVAL '15 minutes'),
                        'pch_max', (SELECT MAX((metrics->>'OUT_RAW')::NUMERIC) FROM tblminutedetails WHERE deviceid = p_deviceid AND created_at >= v_window_start AND created_at < v_window_start + INTERVAL '15 minutes'),
                        'pch_min', (SELECT MIN((metrics->>'OUT_RAW')::NUMERIC) FROM tblminutedetails WHERE deviceid = p_deviceid AND created_at >= v_window_start AND created_at < v_window_start + INTERVAL '15 minutes')
                    ) AS diagnostics

                FROM device_info di
                CROSS JOIN hourly_aggregations ha
                CROSS JOIN pch_metrics pm
                CROSS JOIN daily_pcd dp;
            END;
            