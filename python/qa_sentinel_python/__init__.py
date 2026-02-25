"""
qa-sentinel - Python Bridge

Python/pytest integration for qa-sentinel.
Converts pytest results to qa-sentinel format and generates
HTML reports with AI-powered analysis.

Requires Node.js 18+ at runtime (no npm install needed).
"""

from .bridge import QaSentinelBridge

__version__ = "1.0.0"
__all__ = ["QaSentinelBridge"]

# Backward-compatible alias
SmartReporterBridge = QaSentinelBridge
