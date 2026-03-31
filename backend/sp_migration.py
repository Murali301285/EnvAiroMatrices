import psycopg2
from database import get_db_connection

def migrate():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Add Local JSON Folders schema tracking
            cursor.execute("ALTER TABLE tblJsonFormatter ADD COLUMN IF NOT EXISTS folder_name VARCHAR(255) DEFAULT '';")
            print("Successfully added folder_name column.")

            # Drop and recreate Volatile Functional engine matching variables exactly.
            sp_sql = """
            CREATE OR REPLACE FUNCTION sp_get_woloo_schJsonCreator(
                p_deviceid VARCHAR,
                p_tvoc_param_tag VARCHAR DEFAULT 'SH2S'
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
                hours VARCHAR,
                alert_sequence INTEGER,
                tvoc_value NUMERIC,
                tvoc_unit VARCHAR,
                tvoc_Con VARCHAR,
                tvoc_avg NUMERIC,
                tvoc_max NUMERIC,
                tvoc_min NUMERIC,
                tvoc_bad VARCHAR,
                pcd NUMERIC,
                pcd_max NUMERIC,
                pcd_bad VARCHAR,
                pch NUMERIC,
                pch_Avg NUMERIC,
                pch_max NUMERIC,
                pch_bad VARCHAR
            ) AS $$
            DECLARE
                v_latest_timestamp TIMESTAMP;
                v_window_start TIMESTAMP;
            BEGIN
                -- 1. Grab absolute latest payload timestamp dynamically resolving network lags strictly.
                SELECT createdat INTO v_latest_timestamp
                FROM tblminutedetails
                WHERE tblminutedetails.deviceid = p_deviceid
                ORDER BY createdat DESC
                LIMIT 1;

                IF v_latest_timestamp IS NULL THEN
                    RETURN;
                END IF;

                -- 2. Lock hourly boundary interval
                v_window_start := date_trunc('hour', v_latest_timestamp);

                RETURN QUERY
                WITH device_info AS (
                    SELECT 
                        COALESCE(c.customerName, '') AS client,
                        d.deviceid,
                        d.alias,
                        d.location
                    FROM tblDeviceMaster d
                    LEFT JOIN tblCustomerMaster c ON d.customer_code = c.customer_code
                    WHERE d.deviceid = p_deviceid
                    LIMIT 1
                ),
                tvoc_metadata AS (
                    -- Fetch parametric units ensuring dynamic parameter changes map without rewriting.
                    SELECT COALESCE(unit, '') AS unit FROM tblParameterMaster WHERE param_tag = p_tvoc_param_tag LIMIT 1
                ),
                latest_metrics AS (
                    -- Explicit point-in-time value resolutions strictly.
                    SELECT 
                        (metrics->>p_tvoc_param_tag)::NUMERIC AS tvoc_val,
                        (metrics->>'IN')::NUMERIC AS pch_val
                    FROM tblminutedetails 
                    WHERE tblminutedetails.deviceid = p_deviceid AND createdat = v_latest_timestamp
                    LIMIT 1
                ),
                hourly_aggregations AS (
                    SELECT 
                        COALESCE(AVG((metrics->>p_tvoc_param_tag)::NUMERIC), 0) AS tvoc_avg,
                        COALESCE(MAX((metrics->>p_tvoc_param_tag)::NUMERIC), 0) AS tvoc_max,
                        COALESCE(MIN((metrics->>p_tvoc_param_tag)::NUMERIC), 0) AS tvoc_min,
                        COALESCE(AVG((metrics->>'IN')::NUMERIC), 0) AS pch_Avg,
                        COALESCE(MAX((metrics->>'IN')::NUMERIC), 0) AS pch_max
                    FROM tblminutedetails
                    WHERE tblminutedetails.deviceid = p_deviceid 
                      AND createdat >= v_window_start 
                      AND createdat <= v_latest_timestamp
                ),
                daily_aggregations AS (
                    SELECT 
                        COALESCE(SUM((metrics->>'IN')::NUMERIC), 0) AS pcd,
                        COALESCE(MAX((metrics->>'IN')::NUMERIC), 0) AS pcd_max
                    FROM tblminutedetails
                    WHERE tblminutedetails.deviceid = p_deviceid 
                      AND date(createdat) = date(v_latest_timestamp)
                )
                SELECT 
                    di.client::VARCHAR,
                    di.deviceid::VARCHAR,
                    di.alias::VARCHAR,
                    di.location::VARCHAR,
                    to_char(v_latest_timestamp, 'YYYY-MM-DD HH24:MI:SS')::VARCHAR AS datetime,
                    to_char(v_window_start, 'YYYY-MM-DD HH24:MI:SS')::VARCHAR AS startdtime,
                    'scheduled'::VARCHAR AS triggered_by,
                    'tvoc'::VARCHAR AS parameters,
                    'yes'::VARCHAR AS hours,
                    0::INTEGER AS alert_sequence,
                    
                    COALESCE(lm.tvoc_val, 0)::NUMERIC AS tvoc_value,
                    COALESCE(tm.unit, '')::VARCHAR AS tvoc_unit,
                    CASE 
                        WHEN COALESCE(lm.tvoc_val, 0) >= 0 AND COALESCE(lm.tvoc_val, 0) <= 0.20 THEN 'good'
                        WHEN COALESCE(lm.tvoc_val, 0) > 0.20 AND COALESCE(lm.tvoc_val, 0) <= 0.50 THEN 'moderate'
                        ELSE 'bad'
                    END::VARCHAR AS tvoc_Con,
                    
                    ha.tvoc_avg::NUMERIC,
                    ha.tvoc_max::NUMERIC,
                    ha.tvoc_min::NUMERIC,
                    'NA'::VARCHAR AS tvoc_bad,
                    
                    da.pcd::NUMERIC,
                    da.pcd_max::NUMERIC,
                    'NA'::VARCHAR AS pcd_bad,
                    
                    COALESCE(lm.pch_val, 0)::NUMERIC AS pch,
                    ha.pch_Avg::NUMERIC,
                    ha.pch_max::NUMERIC,
                    'NA'::VARCHAR AS pch_bad

                FROM device_info di
                CROSS JOIN tvoc_metadata tm
                CROSS JOIN latest_metrics lm
                CROSS JOIN hourly_aggregations ha
                CROSS JOIN daily_aggregations da;
            END;
            $$ LANGUAGE plpgsql;
            """
            cursor.execute(sp_sql)
            print("Successfully instantiated sp_get_woloo_schJsonCreator Stored Procedure.")
        
        conn.commit()
    except Exception as e:
        print("ERROR:", e)
    finally:
        if conn: conn.close()

if __name__ == '__main__':
    migrate()
