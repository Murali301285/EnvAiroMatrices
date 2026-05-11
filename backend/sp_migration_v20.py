import psycopg2
import datetime
from database import DATABASE_URL

new_sp = """
CREATE OR REPLACE FUNCTION public.sp_get_woloo_schjsoncreator(p_deviceid character varying, p_ref_time timestamp without time zone DEFAULT NULL::timestamp without time zone)
 RETURNS TABLE(client character varying, deviceid character varying, alias character varying, location character varying, datetime character varying, startdtime character varying, triggered_by character varying, parameters character varying, hours boolean, alert_sequence integer, is_pch_alert character varying, pch_value json, tvoc json, tvoc_avg numeric, tvoc_max numeric, tvoc_min numeric, tvoc_bad numeric, pcd numeric, pcd_max numeric, pcd_bad numeric, pch json, pch_avg numeric, pch_max numeric, pch_bad numeric, "time" character varying, hum numeric, temp numeric, temp_unit character varying)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_tvoc_param_tag   VARCHAR := 'VOC';
    v_current_time     TIMESTAMP := COALESCE(p_ref_time, CURRENT_TIMESTAMP);
    v_window_start     TIMESTAMP;
    v_hour_start       TIMESTAMP;
    v_latest_timestamp TIMESTAMP;
    v_final_pch_value  NUMERIC;
    
    v_is_pch_alert     VARCHAR := 'false';
    v_pch_val_json     JSON;
    v_pch_breach_time_str VARCHAR := '';
    
    v_pch_count        NUMERIC;
    v_pch_breached_on  TIMESTAMP;
    
    v_timeframe_mins   NUMERIC;
    v_pch_active_count INTEGER := 0;
    v_past_limit       INTEGER := 0;
BEGIN
    SELECT r.receivedOn INTO v_latest_timestamp
    FROM public.tbldatareceiver r
    WHERE r.deviceid = p_deviceid
    ORDER BY r.slno DESC
    LIMIT 1;

    IF v_latest_timestamp IS NULL THEN
        RETURN;
    END IF;

    -- PCD DIFFERENCE FROM HISTORY
    v_final_pch_value := public.fn_get_pcd_difference(p_deviceid);
    
    -- 15-MINUTE ANCHORING
    v_window_start := date_trunc('hour', v_current_time)
                    + (DIV(EXTRACT(MINUTE FROM v_current_time)::INT, 15) * 15) * INTERVAL '1 minute';
                    
    -- HOUR START FOR PCH MAX/AVG
    v_hour_start := date_trunc('hour', v_current_time);
      
    -- DYNAMIC PCH COUNT BASED ON TIMEFRAME
    SELECT COALESCE((dm.working_hours_json->>'pch_timeframe_mins')::NUMERIC, 15)
    INTO v_timeframe_mins
    FROM public.tblDeviceMaster dm
    WHERE dm.deviceid = p_deviceid;

    -- DYNAMIC SUMMATION LOGIC
    IF v_timeframe_mins > 15 THEN
        -- Calculate how many past records to pull. If timeframe is 60, (60/15)-1 = 3 past records
        v_past_limit := (v_timeframe_mins / 15) - 1;
        
        SELECT COALESCE(SUM((json_payload->'pch'->>'value')::NUMERIC), 0)::INT
        INTO v_pch_active_count
        FROM (
            SELECT json_payload
            FROM public.tblScheduledJsonHistory h
            WHERE h.deviceid = p_deviceid AND h.payload_type = 'Scheduled'
            ORDER BY h.slno DESC
            LIMIT v_past_limit
        ) sub;
        
        -- Add the current bucket's value to the sum of the past buckets
        v_pch_active_count := v_pch_active_count + v_final_pch_value;
    ELSE
        -- Just 15 minutes, so it's just the current bucket value
        v_pch_active_count := v_final_pch_value;
    END IF;

    -- PCH ALERT LOGIC
    SELECT 
        pa.PchCount,
        pa.created_on
    INTO v_pch_count, v_pch_breached_on
    FROM public.tbl_pch_alert pa
    WHERE pa.deviceid = p_deviceid 
      AND pa.isAlertrequired = True
      AND pa.created_on >= v_window_start
      AND pa.created_on <= v_current_time
    ORDER BY pa.slno DESC
    LIMIT 1;
    
    IF v_pch_count IS NOT NULL THEN
        v_is_pch_alert := 'true';
        v_pch_breach_time_str := to_char(v_pch_breached_on, 'YYYY-MM-DD HH24:MI:SS');
    END IF;

    RETURN QUERY
    WITH tblminutedetails AS (
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
            ROUND(COALESCE(MAX((tmd.metrics->>'OUT')::NUMERIC) - MIN((tmd.metrics->>'OUT')::NUMERIC), 0), 2) AS pcd_interval_value,
            ROUND(COALESCE(MAX((tmd.metrics->>'IN')::NUMERIC) - MIN((tmd.metrics->>'IN')::NUMERIC), 0), 2) AS pch_in_value,
            ROUND(COALESCE(AVG((tmd.metrics->>'HUM')::NUMERIC), 0), 2) AS hum_avg,
            ROUND(COALESCE(AVG((tmd.metrics->>'TMP')::NUMERIC), 0), 2) AS tmp_avg
        FROM tblminutedetails tmd
        WHERE tmd.deviceid = p_deviceid
          AND tmd.created_at >= v_window_start
          AND tmd.created_at <= v_current_time
    ),
    hour_accumulating AS (
        SELECT
            ROUND(COALESCE(v_final_pch_value, 0), 0) AS pch_max_val,
            ROUND(COALESCE(v_final_pch_value / NULLIF(COUNT(NULLIF(tmd.metrics->>'OUT', '')), 0), 0), 0) AS pch_avg_val
        FROM tblminutedetails tmd
        WHERE tmd.deviceid = p_deviceid
          AND tmd.created_at >= v_window_start
          AND tmd.created_at <= v_current_time
    ),
    daily_pcd AS (
        SELECT
            COALESCE((SELECT (tmd.metrics->>'OUT')::NUMERIC FROM tblminutedetails tmd WHERE tmd.deviceid = p_deviceid AND date(tmd.created_at) = date(v_current_time) ORDER BY tmd.created_at ASC LIMIT 1), 0) AS start_out,
            COALESCE((SELECT (tmd.metrics->>'OUT')::NUMERIC FROM tblminutedetails tmd WHERE tmd.deviceid = p_deviceid AND date(tmd.created_at) = date(v_current_time) ORDER BY tmd.created_at DESC LIMIT 1), 0) AS current_out
    )

    SELECT
        di.client::VARCHAR,
        di.deviceid::VARCHAR,
        di.alias::VARCHAR,
        di.location::VARCHAR,
        to_char(v_window_start + INTERVAL '14 minutes', 'YYYY-MM-DD HH24:MI:SS')::VARCHAR AS datetime,
        to_char(date_trunc('hour', v_window_start), 'YYYY-MM-DD HH24:MI:SS')::VARCHAR     AS startdtime,
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
        json_build_object(
            'pch_count', v_pch_active_count::VARCHAR,
            'pch_prev_alert_on', '',
            'pch_threshold_breached_on', v_pch_breach_time_str
        )::JSON                                                                           AS pch_value,
        json_build_object('value', ha.tvoc_max, 'unit', 'ppm', 'condition', 'good')::JSON AS tvoc,
        ha.tvoc_avg::NUMERIC,
        ha.tvoc_max::NUMERIC,
        ha.tvoc_min::NUMERIC,
        0::NUMERIC                                                                        AS tvoc_bad,
        (dp.current_out - dp.start_out)::NUMERIC                                          AS pcd,
        (dp.current_out - dp.start_out)::NUMERIC                                          AS pcd_max,
        0::NUMERIC                                                                        AS pcd_bad,
        json_build_object(
            'value',     v_final_pch_value,
            'unit',      'count',
            'condition', CASE WHEN v_is_pch_alert = 'true' THEN 'bad' ELSE 'good' END,
            'pch_in',    ROUND(COALESCE(ha.pch_in_value, 0), 0),
            'pch_breach_count', v_pch_active_count,
            'threshold_breach_time', v_pch_breach_time_str
        )::JSON                                                                           AS pch,
        h_acc.pch_avg_val::NUMERIC                                                        AS pch_avg,
        h_acc.pch_max_val::NUMERIC                                                        AS pch_max,
        0::NUMERIC                                                                        AS pch_bad,
        to_char(v_latest_timestamp, 'HH24')::VARCHAR                                      AS "time",
        ha.hum_avg::NUMERIC                                                               AS hum,
        ha.tmp_avg::NUMERIC                                                               AS temp,
        COALESCE((SELECT unit FROM tblParameterMaster WHERE param_tag='TMP' LIMIT 1), '')::VARCHAR AS temp_unit
    FROM device_info di
    CROSS JOIN hourly_aggregations ha
    CROSS JOIN hour_accumulating h_acc
    CROSS JOIN daily_pcd dp;
END;
$function$
"""

def update_db():
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    try:
        cursor.execute(new_sp)
        print("Successfully created the new dynamic summation sp_get_woloo_schjsoncreator.")
    except Exception as e:
        print(f"Error creating SP: {e}")
        conn.rollback()
        
    conn.commit()
    cursor.close()
    conn.close()

if __name__ == "__main__":
    update_db()
