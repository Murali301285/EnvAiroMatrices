CREATE OR REPLACE FUNCTION public.sp_get_woloo_schjsoncreator(p_deviceid character varying)
 RETURNS TABLE(client character varying, deviceid character varying, alias character varying, location character varying, datetime character varying, startdtime character varying, triggered_by character varying, parameters character varying, hours boolean, alert_sequence integer, tvoc json, tvoc_avg numeric, tvoc_max numeric, tvoc_min numeric, tvoc_bad numeric, pcd numeric, pcd_max numeric, pcd_bad numeric, pch json, pch_avg numeric, pch_max numeric, pch_bad numeric, "time" character varying, hum numeric, temp numeric, temp_unit character varying)
 LANGUAGE plpgsql
AS $function$
            DECLARE
                v_tvoc_param_tag VARCHAR := 'VOC';
                v_current_time TIMESTAMP := CURRENT_TIMESTAMP;
                v_window_start TIMESTAMP;
                v_latest_timestamp TIMESTAMP;
            BEGIN
                SELECT r.receivedOn INTO v_latest_timestamp
                FROM public.tbldatareceiver r
                WHERE r.deviceid = p_deviceid
                ORDER BY r.slno DESC
                LIMIT 1;

                IF v_latest_timestamp IS NULL THEN
                    RETURN;
                END IF;

                v_window_start := date_trunc('hour', v_current_time);

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
                            'OUT_RAW', COALESCE(NULLIF(SUBSTRING(r.revText FROM 'OUT_RAW:([-0-9.]+)'), ''), NULLIF(SUBSTRING(r.revText FROM 'OUT:([-0-9.]+)'), ''))
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
                latest_metrics AS (
                    SELECT 
                        (metrics->>'VOC')::NUMERIC AS voc_val,
                        (metrics->>'SH2S')::NUMERIC AS sh2s_val,
                        (metrics->>'HYGIENE')::NUMERIC AS hygiene_val,
                        (metrics->>'STATUS')::VARCHAR AS status_val,
                        (metrics->>'HUM')::NUMERIC AS hum_val,
                        (metrics->>'TMP')::NUMERIC AS temp_val
                    FROM tblminutedetails 
                    WHERE tblminutedetails.deviceid = p_deviceid AND created_at = v_latest_timestamp
                    LIMIT 1
                ),
                hourly_aggregations AS (
                    SELECT 
                        ROUND(COALESCE(AVG(COALESCE((metrics->>'VOC')::NUMERIC, 0) + COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2) AS tvoc_avg,
                        ROUND(COALESCE(MAX(COALESCE((metrics->>'VOC')::NUMERIC, 0) + COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2) AS tvoc_max,
                        ROUND(COALESCE(MIN(COALESCE((metrics->>'VOC')::NUMERIC, 0) + COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2) AS tvoc_min,
                        COALESCE(MAX((metrics->>'IN')::NUMERIC), 0) AS in_max,
                        COALESCE(MIN((metrics->>'IN')::NUMERIC), 0) AS in_min,
                        COALESCE(MAX((metrics->>'OUT')::NUMERIC), 0) AS out_max,
                        COALESCE(MIN((metrics->>'OUT')::NUMERIC), 0) AS out_min,
                        ROUND(COALESCE(AVG((metrics->>'OUT')::NUMERIC), 0), 0) AS out_avg,
                        COALESCE((
                            SELECT (m2.metrics->>'OUT')::NUMERIC 
                            FROM tblminutedetails m2 
                            WHERE m2.deviceid = p_deviceid 
                              AND m2.created_at >= v_window_start
                              AND m2.created_at <= v_current_time
                            ORDER BY m2.created_at ASC 
                            LIMIT 1
                        ), 0) AS out_start
                    FROM tblminutedetails
                    WHERE tblminutedetails.deviceid = p_deviceid 
                      AND created_at >= v_window_start 
                      AND created_at <= v_current_time
                ),
                pch_cycles AS (
                    SELECT 
                        date_trunc('hour', m.created_at) + (DIV(EXTRACT(MINUTE FROM m.created_at)::INT, 15) * 15) * INTERVAL '1 minute' AS bucket_start,
                        COALESCE(MAX((m.metrics->>'OUT')::NUMERIC), 0) - COALESCE(MIN((m.metrics->>'OUT')::NUMERIC), 0) AS out_delta,
                        COALESCE(MAX((m.metrics->>'IN')::NUMERIC), 0) - COALESCE(MIN((m.metrics->>'IN')::NUMERIC), 0) AS in_delta
                    FROM tblminutedetails m
                    WHERE m.deviceid = p_deviceid 
                      AND m.created_at >= v_window_start 
                      AND m.created_at <= v_current_time
                    GROUP BY bucket_start
                ),
                pch_cycle_aggregations AS (
                    SELECT 
                        ROUND(COALESCE(AVG(out_delta), 0), 0) AS pch_avg,
                        COALESCE(MAX(out_delta), 0) AS pch_max,
                        COALESCE((SELECT out_delta FROM pch_cycles ORDER BY bucket_start DESC LIMIT 1), 0) AS latest_out_delta,
                        COALESCE((SELECT in_delta FROM pch_cycles ORDER BY bucket_start DESC LIMIT 1), 0) AS latest_in_delta
                    FROM pch_cycles
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
                daily_aggregations AS (
                    SELECT 
                        GREATEST(0, dp.current_out - dp.start_out) AS pcd,
                        GREATEST(0, dp.current_out - dp.start_out) AS pcd_max
                    FROM daily_pcd dp
                ),
                tvoc_evaluations AS (
                    SELECT 
                        m.created_at,
                        CASE 
                            WHEN (COALESCE((m.metrics->>'VOC')::NUMERIC, 0) + COALESCE((m.metrics->>'SH2S')::NUMERIC, 0)) <= 5.00 THEN 'GOOD'
                            WHEN (COALESCE((m.metrics->>'VOC')::NUMERIC, 0) + COALESCE((m.metrics->>'SH2S')::NUMERIC, 0)) <= 12.00 THEN 'MODERATE'
                            ELSE 'BAD'
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
                           WHEN (MAX(COALESCE((m.metrics->>'OUT')::NUMERIC, 0)) OVER w - MIN(COALESCE((m.metrics->>'OUT')::NUMERIC, 0)) OVER w) > (SELECT plimit FROM device_info) THEN 'BAD' 
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
                    to_char(v_latest_timestamp, 'YYYY-MM-DD HH24:MI:SS')::VARCHAR AS datetime,
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
                         'value', ROUND(LEAST(15.00, COALESCE(lm.voc_val, 0)::NUMERIC + COALESCE(lm.sh2s_val, 0)::NUMERIC), 2),
                         'unit', 'ppm',
                         'condition', CASE 
                                        WHEN (COALESCE(lm.voc_val, 0)::NUMERIC + COALESCE(lm.sh2s_val, 0)::NUMERIC) <= 5.00 THEN 'GOOD'
                                        WHEN (COALESCE(lm.voc_val, 0)::NUMERIC + COALESCE(lm.sh2s_val, 0)::NUMERIC) <= 12.00 THEN 'MODERATE'
                                        ELSE 'BAD'
                                      END
                    )::JSON AS tvoc,
                    
                    ha.tvoc_avg::NUMERIC,
                    ha.tvoc_max::NUMERIC,
                    ha.tvoc_min::NUMERIC,
                    ROUND(ctb.consecutive_bad_mins::NUMERIC, 0) AS tvoc_bad,
                    
                    да.pcd::NUMERIC,
                    да.pcd_max::NUMERIC,
                    ROUND(cpcd.consecutive_bad_mins::NUMERIC, 0) AS pcd_bad,
                    
                    json_build_object(
                         'value', pca.latest_out_delta,
                         'unit', '',
                         'pch_in', pca.latest_in_delta,
                         'condition', COALESCE((SELECT status FROM pch_evaluations ORDER BY created_at DESC LIMIT 1), 'GOOD')
                    )::JSON AS pch,
                    pca.pch_avg::NUMERIC AS pch_Avg,
                    pca.pch_max::NUMERIC AS pch_max,
                    ROUND(cpch.consecutive_bad_mins::NUMERIC, 0) AS pch_bad,
                    
                    to_char(v_latest_timestamp, 'HH24')::VARCHAR AS "time",
                    COALESCE(lm.hum_val, 0)::NUMERIC AS hum,
                    COALESCE(lm.temp_val, 0)::NUMERIC AS temp,
                    COALESCE((SELECT unit FROM tblParameterMaster WHERE param_tag='TMP' LIMIT 1), '')::VARCHAR AS temp_unit

                FROM device_info di
                CROSS JOIN tvoc_metadata tm
                CROSS JOIN latest_metrics lm
                CROSS JOIN hourly_aggregations ha
                CROSS JOIN daily_aggregations да
                CROSS JOIN pch_cycle_aggregations pca
                CROSS JOIN continuous_tvoc_bad ctb
                CROSS JOIN continuous_pch_bad cpch
                CROSS JOIN continuous_pcd_bad cpcd;
            END;
            $function$
