import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from scheduler import evaluate_active_alerts

try:
    evaluate_active_alerts()
    print("evaluate_active_alerts ran successfully with zero crashes!")
except Exception as e:
    print(f"Error testing dynamic alerts: {e}")
