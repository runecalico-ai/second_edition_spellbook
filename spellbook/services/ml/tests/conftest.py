import sys
import os

# Add the parent directory (services/ml) to sys.path so spellbook_sidecar can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
