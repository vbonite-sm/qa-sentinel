"""
Pytest plugin for automatic qa-sentinel report generation.

Registered via the pytest11 entry point in pyproject.toml.
"""
import json
from pathlib import Path
from typing import Optional

import pytest

from .bridge import QaSentinelBridge


def pytest_addoption(parser):
    """Add command-line options for qa-sentinel."""
    group = parser.getgroup("qa-sentinel")
    group.addoption(
        "--qa-sentinel",
        action="store_true",
        default=False,
        help="Generate qa-sentinel HTML report after test run",
    )
    group.addoption(
        "--qa-sentinel-output",
        action="store",
        default="qa-sentinel-report.html",
        help="Output path for qa-sentinel HTML report (default: qa-sentinel-report.html)",
    )


def pytest_configure(config):
    """Configure the plugin: enable json-report and register the session plugin."""
    # Only activate when --qa-sentinel is passed
    if not config.getoption("--qa-sentinel", default=False):
        return

    # Ensure pytest-json-report is configured
    if hasattr(config.option, "json_report"):
        config.option.json_report = True
        config.option.json_report_file = ".pytest-report.json"

    # Register marker
    config.addinivalue_line(
        "markers",
        "qa_sentinel: Generate qa-sentinel report after tests",
    )

    # Register our session-finish plugin
    config.pluginmanager.register(
        QaSentinelPlugin(config), "qa_sentinel_plugin"
    )


class QaSentinelPlugin:
    """Pytest plugin to generate qa-sentinel reports after the session finishes."""

    def __init__(self, config):
        self.config = config
        self.output_path = Path(config.getoption("--qa-sentinel-output"))

    @pytest.hookimpl(trylast=True)
    def pytest_sessionfinish(self, session, exitstatus):
        """Generate report after all tests complete."""
        pytest_json = Path(".pytest-report.json")
        if not pytest_json.exists():
            print("\n⚠️  pytest-json-report file not found, skipping qa-sentinel report")
            return

        try:
            bridge = QaSentinelBridge()
            bridge.generate_report(
                pytest_json_path=pytest_json,
                output_html=self.output_path,
            )
            print(f"\n📊 qa-sentinel report generated: {self.output_path.absolute()}")
        except Exception as e:
            print(f"\n❌ Failed to generate qa-sentinel report: {e}")
