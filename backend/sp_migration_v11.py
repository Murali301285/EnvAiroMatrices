import psycopg2
from database import get_db_connection

def migrate():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Create History Tracking Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS tblScheduledJsonHistory (
                slno SERIAL PRIMARY KEY,
                deviceid VARCHAR(50) NOT NULL,
                json_payload JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)

            # Helper Function to dynamically evaluate matrices natively in Postgres
            cursor.execute("""
            CREATE OR REPLACE FUNCTION fn_evaluate_status(p_val NUMERIC, p_conditions JSONB)
            RETURNS VARCHAR AS $$
            DECLARE
                cond RECORD;
                v_operator VARCHAR;
                v_v1 NUMERIC;
                v_v2 NUMERIC;
                v_label VARCHAR;
            BEGIN
                IF p_conditions IS NULL OR jsonb_array_length(p_conditions) = 0 THEN
                    RETURN 'NA';
                END IF;

                FOR cond IN SELECT * FROM jsonb_to_recordset(p_conditions) AS x(operator VARCHAR, val1 NUMERIC, val2 NUMERIC, label VARCHAR)
                LOOP
                    v_operator := UPPER(cond.operator);
                    v_v1 := cond.val1;
                    v_v2 := cond.val2;
                    v_label := UPPER(cond.label);
                    
                    IF v_operator = '<' AND p_val < v_v1 THEN RETURN v_label; END IF;
                    IF v_operator = '<=' AND p_val <= v_v1 THEN RETURN v_label; END IF;
                    IF v_operator = '=' AND p_val = v_v1 THEN RETURN v_label; END IF;
                    IF v_operator = '>=' AND p_val >= v_v1 THEN RETURN v_label; END IF;
                    IF v_operator = '>' AND p_val > v_v1 THEN RETURN v_label; END IF;
                    IF v_operator = 'BETWEEN' AND p_val >= LEAST(v_v1, v_v2) AND p_val <= GREATEST(v_v1, v_v2) THEN RETURN v_label; END IF;
                END LOOP;

                RETURN 'NA';
            END;
            $$ LANGUAGE plpgsql;
            """)

            sp_sql = """
            DROP FUNCTION IF EXISTS sp_get_woloo_schJsonCreator(character varying);
            CREATE OR REPLACE FUNCTION sp_get_woloo_schJsonCreator(
                p_deviceid VARCHAR
            )
            RETURNS TABLE (
                client VARCHAR,
                deviceid VARCHAR,
                alias VARCHAR,
                location VARCHAR,
                datetime VARCHAR,
                startdtime VARCHAR,
                triggered_by VARCHAR,
                parameters VARCHAR,
                hours BOOLEAN,
                alert_sequence INTEGER,
                tvoc_value NUMERIC,
                tvoc_unit VARCHAR,
                tvoc_Con VARCHAR,
                tvoc_avg NUMERIC,
                tvoc_max NUMERIC,
                tvoc_min NUMERIC,
                tvoc_bad NUMERIC,
                pcd NUMERIC,
                pcd_max NUMERIC,
                pcd_bad VARCHAR,
                pch JSON,
                pch_Avg NUMERIC,
                pch_max NUMERIC,
                pch_bad VARCHAR,
                "time" VARCHAR,
                hum NUMERIC,
                temp NUMERIC,
                temp_unit VARCHAR
            ) AS $$
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
                            ELSE NULL
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
                    'NA'::VARCHAR AS pcd_bad,
                    
                    json_build_object(
                         'value', GREATEST(0, ha.out_max - ha.out_min),
                         'unit', '',
                         'pch_in', GREATEST(0, ha.in_max - ha.in_min),
                         'condition', 'GOOD'
                    )::JSON AS pch,
                    (ha.out_start - ha.out_avg)::NUMERIC AS pch_Avg,
                    (ha.out_start - ha.out_max)::NUMERIC AS pch_max,
                    'NA'::VARCHAR AS pch_bad,
                    
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
            $$ LANGUAGE plpgsql;
            """
            cursor.execute(sp_sql)
            print("Successfully migrated sp_get_woloo_schJsonCreator structurally (v11 PCH JSON schema + OUT bindings).")
        
        conn.commit()
    except Exception as e:
        print("ERROR:", e)
    finally:
        if conn: conn.close()

if __name__ == '__main__':
    migrate()
