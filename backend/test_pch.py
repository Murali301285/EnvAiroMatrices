import traceback
from scheduler import dispatch_pch_alerts_job

try:
    print('Starting manual PCH dispatch...')
    dispatch_pch_alerts_job()
    print('Finished dispatch_pch_alerts_job successfully.')
except Exception as e:
    print('Error caught:')
    traceback.print_exc()
