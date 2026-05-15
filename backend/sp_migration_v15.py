import os
from database import get_db_connection

def migrate():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Drop V14 variations to prevent signature mismatch
            cursor.execute("DROP FUNCTION IF EXISTS public.sp_get_woloo_schjsoncreator(character varying);")
            cursor.execute("DROP FUNCTION IF EXISTS public.sp_get_woloo_schjsoncreator(character varying, timestamp without time zone);")
            
            # Recreate with exact V13 column headers while injecting PCD calculation logic
            cursor.execute("""
            CREATE OR REPLACE FUNCTION public.sp_get_woloo_schjsoncreator(p_deviceid character varying, p_ref_time timestamp without time zone DEFAULT NULL)
                RETURNS TABLE(
                    client character varying, deviceid character varying, alias character varying, 
                    location character varying, datetime character varying, startdtime character varying, 
                    triggered_by character varying, parameters character varying, hours boolean, 
                    alert_sequence integer, tvoc json, tvoc_avg numeric, tvoc_max numeric, 
                    tvoc_min numeric, tvoc_bad numeric, pcd numeric, pcd_max numeric, 
                    pcd_bad numeric, pch json, pch_avg numeric, pch_max numeric, 
                    pch_bad numeric, "time" character varying, hum numeric, temp numeric, temp_unit character varying
                )
                LANGUAGE 'plpgsql'
                COST 100
                VOLATILE PARALLEL UNSAFE
                ROWS 1000
            AS $BODY$
            DECLARE 
                v_current_time TIMESTAMP;
                v_window_start TIMESTAMP;
                v_latest_timestamp TIMESTAMP;
                v_active_alert_seq INT := 0;
            BEGIN
                -- 1. Establish the Anchor Point
                IF p_ref_time IS NOT NULL THEN
                    v_current_time := p_ref_time;
                ELSE
                    SELECT MAX(created_at) INTO v_current_time 
                    FROM tblminutedetails 
                    WHERE tblminutedetails.deviceid = p_deviceid;
                END IF;

                IF v_current_time IS NULL THEN
                    v_current_time := NOW();
                END IF;

                v_latest_timestamp := v_current_time;
                v_window_start := v_current_time - INTERVAL '15 minutes';

                -- 2. No active alert sequences needed for standard interval
                v_active_alert_seq := 0;

                -- 3. Core Aggregation Logic
                RETURN QUERY
                WITH 
                tvoc_metadata AS (
                    SELECT 
                        15 AS sustained_bad_minutes,
                        12.00 AS bad_threshold
                ),
                live_snapshot AS (
                    SELECT 
                        (metrics->>'HUM')::NUMERIC AS humidity_val,
                        (metrics->>'TMP')::NUMERIC AS temp_val
                    FROM tblminutedetails 
                    WHERE tblminutedetails.deviceid = p_deviceid AND created_at = v_latest_timestamp
                    LIMIT 1
                ),
                hourly_aggregations AS (
                    SELECT 
                        ROUND(COALESCE(AVG(COALESCE((metrics->>'VOC')::NUMERIC, 0) + COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2) AS tvoc_avg,
                        ROUND(COALESCE(MAX(COALESCE((metrics->>'VOC')::NUMERIC, 0) + COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2) AS tvoc_max,
                        ROUND(COALESCE(MIN(COALESCE((metrics->>'VOC')::NUMERIC, 0) + COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2) AS tvoc_min
                    FROM tblminutedetails
                    WHERE tblminutedetails.deviceid = p_deviceid 
                      AND created_at >= v_window_start 
                      AND created_at <= v_current_time
                ),
                pch_cycles AS (
                    SELECT 
                        date_trunc('hour', m.created_at) + (DIV(EXTRACT(MINUTE FROM m.created_at)::INT, 15) * 15) * INTERVAL '1 minute' AS bucket_start,
                        COALESCE(MAX((m.metrics->>'OUT')::NUMERIC), 0) - COALESCE(MIN((m.metrics->>'OUT')::NUMERIC), 0) AS out_delta,
                        COALESCE(MAX((m.metrics->>'OUT_RAW')::NUMERIC), 0) - COALESCE(MIN((m.metrics->>'OUT_RAW')::NUMERIC), 0) AS pcd_interval_delta
                    FROM tblminutedetails m
                    WHERE m.deviceid = p_deviceid 
                      AND m.created_at >= v_window_start 
                      AND m.created_at <= v_current_time
                    GROUP BY bucket_start
                ),
                pch_cycle_aggregations AS (
                    SELECT 
                        ROUND(COALESCE(AVG(CASE WHEN out_delta != pcd_interval_delta THEN pcd_interval_delta ELSE out_delta END), 0), 0) AS pch_avg,
                        COALESCE(MAX(CASE WHEN out_delta != pcd_interval_delta THEN pcd_interval_delta ELSE out_delta END), 0) AS pch_max
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
                        END AS consecutive_bad_minutes
                )
                SELECT 
                    COALESCE((SELECT customername FROM tbldevicemaster WHERE tbldevicemaster.deviceid = p_deviceid LIMIT 1), 'Unknown')::character varying AS client,
                    p_deviceid AS deviceid,
                    COALESCE((SELECT alias FROM tbldevicemaster WHERE tbldevicemaster.deviceid = p_deviceid LIMIT 1), p_deviceid)::character varying AS alias,
                    COALESCE((SELECT location FROM tbldevicemaster WHERE tbldevicemaster.deviceid = p_deviceid LIMIT 1), 'Unknown')::character varying AS location,
                    
                    to_char(v_latest_timestamp, 'YYYY-MM-DD HH24:MI:SS')::character varying AS datetime,
                    to_char(v_window_start, 'YYYY-MM-DD HH24:MI:SS')::character varying AS startdtime,
                    
                    CASE WHEN v_active_alert_seq > 0 AND c_tvoc.consecutive_bad_minutes < 15 THEN 'resolved' ELSE 'scheduled' END::character varying AS triggered_by,
                    'tvoc,pcd,pch'::character varying AS parameters,
                    
                    TRUE AS hours,
                    v_active_alert_seq AS alert_sequence,
                    
                    json_build_object('unit', 'ppm', 'value', ha.tvoc_max, 'condition', CASE WHEN ha.tvoc_max <= 5 THEN 'good' WHEN ha.tvoc_max <= 12 THEN 'moderate' ELSE 'bad' END) AS tvoc,
                    ha.tvoc_avg AS tvoc_avg,
                    ha.tvoc_max AS tvoc_max,
                    ha.tvoc_min AS tvoc_min,
                    GREATEST(0, c_tvoc.consecutive_bad_minutes::int)::numeric AS tvoc_bad,
                    
                    da.pcd AS pcd,
                    da.pcd_max AS pcd_max,
                    0::numeric AS pcd_bad,
                    
                    json_build_object('unit', 'count', 'value', pca.pch_max, 'pch_max', pca.pch_max, 'condition', CASE WHEN pca.pch_max > 120 THEN 'bad' ELSE 'good' END) AS pch,
                    pca.pch_avg AS pch_avg,
                    pca.pch_max AS pch_max,
                    0::numeric AS pch_bad,
                    
                    to_char(v_latest_timestamp, 'HH24:MI:SS')::character varying AS time,
                    
                    COALESCE(ls.humidity_val, (SELECT COALESCE((metrics->>'HUM')::NUMERIC, 0) FROM tblminutedetails WHERE tblminutedetails.deviceid=p_deviceid ORDER BY created_at DESC LIMIT 1), 0) AS hum,
                    COALESCE(ls.temp_val, (SELECT COALESCE((metrics->>'TMP')::NUMERIC, 0) FROM tblminutedetails WHERE tblminutedetails.deviceid=p_deviceid ORDER BY created_at DESC LIMIT 1), 0) AS temp,
                    'C'::character varying AS temp_unit
                    
                FROM hourly_aggregations ha
                CROSS JOIN pch_cycle_aggregations pca
                CROSS JOIN daily_aggregations da
                CROSS JOIN continuous_tvoc_bad c_tvoc
                LEFT JOIN live_snapshot ls ON 1=1;
            END;
            $BODY$;
            """)
            conn.commit()
            print("Successfully migrated sp_get_woloo_schjsoncreator to V15 (PCD Interval Enforcement + Native Schema Restore).")
    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    migrate()
