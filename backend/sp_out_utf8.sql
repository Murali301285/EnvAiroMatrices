CREATE OR REPLACE FUNCTION public.sp_get_woloo_schjsoncreator(p_deviceid character varying)
 RETURNS TABLE(client character varying, deviceid character varying, alias character varying, location character varying, datetime character varying, startdtime character varying, triggered_by character varying, parameters character varying, hours boolean, alert_sequence integer, tvoc_value numeric, tvoc_unit character varying, tvoc_con character varying, tvoc_avg numeric, tvoc_max numeric, tvoc_min numeric, tvoc_bad numeric, pcd numeric, pcd_max numeric, pcd_bad numeric, pch json, pch_avg numeric, pch_max numeric, pch_bad numeric, "time" character varying, hum numeric, temp numeric, temp_unit character varying)
 LANGUAGE plpgsql
AS $function$
            DECLARE
                v_tvoc_param_tag VARCHAR := 'SH2S';
                v_current_time TIMESTAMP := CURRENT_TIMESTAMP;
                v_window_start TIMESTAMP;
                v_latest_timestamp TIMESTAMP;
            BEGIN
                SELECT created_at INTO v_latest_timestamp
                FROM tblminutedetails
                WHERE tblminutedetails.deviceid = p_deviceid
                ORDER BY created_at DESC
                LIMIT 1;

                IF v_latest_timestamp IS NULL THEN
                    RETURN;
                END IF;

                v_window_start := date_trunc('hour', v_current_time);

                RETURN QUERY
                WITH device_info AS (
                    SELECT 
                        COALESCE(c.customerName, '') AS client,
                        d.deviceid,
                        d.alias,
                        d.location,
                        (d.working_hours_json->>'start')::TIME AS start_time,
                        (d.working_hours_json->>'end')::TIME AS end_time
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
                        (metrics->>v_tvoc_param_tag)::NUMERIC AS tvoc_val,
                        (metrics->>'HUM')::NUMERIC AS hum_val,
                        (metrics->>'TMP')::NUMERIC AS temp_val
                    FROM tblminutedetails 
                    WHERE tblminutedetails.deviceid = p_deviceid AND created_at = v_latest_timestamp
                    LIMIT 1
                ),
                hourly_aggregations AS (
                    SELECT 
                        ROUND(COALESCE(AVG((metrics->>v_tvoc_param_tag)::NUMERIC), 0), 2) AS tvoc_avg,
                        COALESCE(MAX((metrics->>v_tvoc_param_tag)::NUMERIC), 0) AS tvoc_max,
                        COALESCE(MIN((metrics->>v_tvoc_param_tag)::NUMERIC), 0) AS tvoc_min,
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
                        UPPER(fn_evaluate_status(COALESCE((m.metrics->>v_tvoc_param_tag)::NUMERIC, 0), tm.conditions)) AS status
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
                    
                    COALESCE(lm.tvoc_val, 0)::NUMERIC AS tvoc_value,
                    COALESCE(tm.unit, '')::VARCHAR AS tvoc_unit,
                    fn_evaluate_status(COALESCE(lm.tvoc_val, 0)::NUMERIC, tm.conditions)::VARCHAR AS tvoc_Con,
                    
                    ha.tvoc_avg::NUMERIC,
                    ha.tvoc_max::NUMERIC,
                    ha.tvoc_min::NUMERIC,
                    ctb.consecutive_bad_mins::NUMERIC AS tvoc_bad,
                    
                    да.pcd::NUMERIC,
                    да.pcd_max::NUMERIC,
                    0::NUMERIC AS pcd_bad,
                    
                    json_build_object(
                         'value', GREATEST(0, ha.out_max - ha.out_min),
                         'unit', '',
                         'pch_in', GREATEST(0, ha.in_max - ha.in_min),
                         'condition', 'GOOD'
                    )::JSON AS pch,
                    (ha.out_start - ha.out_avg)::NUMERIC AS pch_Avg,
                    (ha.out_start - ha.out_max)::NUMERIC AS pch_max,
                    0::NUMERIC AS pch_bad,
                    
                    to_char(v_latest_timestamp, 'HH24')::VARCHAR AS "time",
                    COALESCE(lm.hum_val, 0)::NUMERIC AS hum,
                    COALESCE(lm.temp_val, 0)::NUMERIC AS temp,
                    COALESCE((SELECT unit FROM tblParameterMaster WHERE param_tag='TMP' LIMIT 1), '')::VARCHAR AS temp_unit

                FROM device_info di
                CROSS JOIN tvoc_metadata tm
                CROSS JOIN latest_metrics lm
                CROSS JOIN hourly_aggregations ha
                CROSS JOIN daily_aggregations да
                CROSS JOIN continuous_tvoc_bad ctb;
            END;
            $function$
