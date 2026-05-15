
BEGIN
    RETURN QUERY
    SELECT 
        b.DeviceId,
        b.tvoc_value,
        b.count AS alert_count,
        b.continousbad,
        b.currentstatus,
        to_char(b.CDatetime, 'YYYY-MM-DD HH24:MI:SS')::VARCHAR AS cdatetime,
        to_char(b.lastupdatedon, 'YYYY-MM-DD HH24:MI:SS')::VARCHAR AS lastupdatedon
    FROM tblAlertBucketTVOC b
    WHERE b.DeviceId = p_deviceid 
    ORDER BY b.lastupdatedon DESC 
    LIMIT 1;
END;
