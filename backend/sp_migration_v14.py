import os
from database import get_db_connection

def migrate():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DROP FUNCTION IF EXISTS public.sp_get_woloo_schjsoncreator(character varying);")
            cursor.execute("DROP FUNCTION IF EXISTS public.sp_get_woloo_schjsoncreator(character varying, timestamp without time zone);")
            # Recreate with PCD interval consistency check
            cursor.execute("""
            CREATE OR REPLACE FUNCTION public.sp_get_woloo_schjsoncreator(p_deviceid character varying, p_ref_time timestamp without time zone DEFAULT NULL)
                RETURNS TABLE(
                    slno bigint, deviceid character varying, client_id character varying, node_name character varying, 
                    location character varying, current_status character varying, temperature numeric, 
                    humidity numeric, is_operational_hours boolean, alert_sequence integer, current_ist_datetime timestamp without time zone, 
                    tvoc_avg numeric, tvoc_max numeric, tvoc_min numeric, voc_sh2s_sum numeric, tvoc_consecutive_bad integer, 
                    pch_avg numeric, pch_max numeric, in_max numeric, out_max numeric, pcd numeric, pcd_max numeric, pcd_consecutive_bad integer, 
                    pch_consecutive_bad integer, window_start timestamp without time zone, trigger_reason character varying,
                    temperature_unit character varying
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

                -- 2. Check if there's an active alert sequence we are resolving
                SELECT COALESCE(MAX(a.alert_sequence), 0) INTO v_active_alert_seq
                FROM tblScheduledJsonHistory a
                WHERE a.deviceid = p_deviceid 
                  AND a.payload_type = 'Alert'
                  AND a.created_at >= v_window_start;

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
                        ROUND(COALESCE(MIN(COALESCE((metrics->>'VOC')::NUMERIC, 0) + COALESCE((metrics->>'SH2S')::NUMERIC, 0)), 0), 2) AS tvoc_min,
                        COALESCE(MAX((metrics->>'IN')::NUMERIC), 0) AS in_max,
                        COALESCE(MAX((metrics->>'OUT')::NUMERIC), 0) AS out_max
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
                    1::bigint AS slno,
                    p_deviceid AS deviceid,
                    COALESCE((SELECT customername FROM tbldevicemaster WHERE deviceid = p_deviceid LIMIT 1), 'Unknown') AS client_id,
                    COALESCE((SELECT alias FROM tbldevicemaster WHERE deviceid = p_deviceid LIMIT 1), p_deviceid) AS node_name,
                    COALESCE((SELECT location FROM tbldevicemaster WHERE deviceid = p_deviceid LIMIT 1), 'Unknown') AS location,
                    
                    'LIVE'::character varying AS current_status,
                    COALESCE(ls.temp_val, (SELECT COALESCE((metrics->>'TMP')::NUMERIC, 0) FROM tblminutedetails WHERE deviceid=p_deviceid ORDER BY created_at DESC LIMIT 1), 0) AS temperature,
                    COALESCE(ls.humidity_val, (SELECT COALESCE((metrics->>'HUM')::NUMERIC, 0) FROM tblminutedetails WHERE deviceid=p_deviceid ORDER BY created_at DESC LIMIT 1), 0) AS humidity,
                    
                    TRUE AS is_operational_hours,
                    v_active_alert_seq AS alert_sequence,
                    v_latest_timestamp AS current_ist_datetime,
                    
                    ha.tvoc_avg AS tvoc_avg,
                    ha.tvoc_max AS tvoc_max,
                    ha.tvoc_min AS tvoc_min,
                    
                    COALESCE((SELECT (metrics->>'VOC')::NUMERIC + (metrics->>'SH2S')::NUMERIC 
                              FROM tblminutedetails WHERE deviceid=p_deviceid ORDER BY created_at DESC LIMIT 1), 0) AS voc_sh2s_sum,
                    
                    GREATEST(0, c_tvoc.consecutive_bad_minutes::int) AS tvoc_consecutive_bad,
                    
                    pca.pch_avg AS pch_avg,
                    pca.pch_max AS pch_max,
                    
                    ha.in_max AS in_max,
                    ha.out_max AS out_max,
                    
                    da.pcd AS pcd,
                    da.pcd_max AS pcd_max,
                    
                    0 AS pcd_consecutive_bad,
                    0 AS pch_consecutive_bad,
                    
                    v_window_start AS window_start,
                    
                    CASE WHEN v_active_alert_seq > 0 AND c_tvoc.consecutive_bad_minutes < 15 THEN 'resolved' ELSE 'scheduled' END::character varying AS trigger_reason,
                    'C'::character varying AS temperature_unit
                    
                FROM hourly_aggregations ha
                CROSS JOIN pch_cycle_aggregations pca
                CROSS JOIN daily_aggregations da
                CROSS JOIN continuous_tvoc_bad c_tvoc
                LEFT JOIN live_snapshot ls ON 1=1;
            END;
            $BODY$;
            """)
            conn.commit()
            print("Successfully migrated sp_get_woloo_schjsoncreator to V14 (PCD Interval Enforcement).")
    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    migrate()
