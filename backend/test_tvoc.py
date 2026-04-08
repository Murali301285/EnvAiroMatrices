import traceback
from scheduler import dispatch_tvoc_alerts_job

try:
    print('Starting manual dispatch...')
    dispatch_tvoc_alerts_job()
    print('Finished dispatch_tvoc_alerts_job successfully.')
except Exception as e:
    print('Error caught:')
    traceback.print_exc()
