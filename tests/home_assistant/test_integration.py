"""Real HTTP client and Home Assistant entity/coordinator regression tests."""
import asyncio
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, AsyncMock
from types import MappingProxyType

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from aiohttp import web, ClientSession
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.exceptions import ConfigEntryAuthFailed, HomeAssistantError
from homeassistant.helpers.update_coordinator import UpdateFailed
from custom_components.dockge_enhanced import DockgeCoordinator, DOMAIN
from custom_components.dockge_enhanced.api import DockgeApi, ApiError, AuthenticationError, normalize_url
from custom_components.dockge_enhanced.sensor import StackStatus
from custom_components.dockge_enhanced.binary_sensor import StackRunning
from custom_components.dockge_enhanced.button import StackButton
from custom_components.dockge_enhanced.switch import StackSwitch
from custom_components.dockge_enhanced.entity import setup_entities
from custom_components.dockge_enhanced.config_flow import ConfigFlow


class IntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.rows = [{"name": "demo", "status": 3}]
        self.status = 200
        self.calls = []
        self.redirect_calls = 0
        self.action_success = True

        async def handler(request):
            self.calls.append((request.method, request.path))
            self.assertEqual(request.headers.get("Authorization"), "Bearer fixture-only")
            if self.status == 302:
                return web.Response(status=302, headers={"Location": "/redirect-target"})
            if self.status != 200:
                return web.Response(status=self.status)
            return web.json_response({"ok": True, "data": self.rows if request.method == "GET" else {"success": self.action_success}})

        async def redirected(request):
            self.redirect_calls += 1
            return web.json_response({"ok": True, "data": []})

        app = web.Application()
        app.router.add_route("*", "/api/v1/{tail:.*}", handler)
        app.router.add_get("/redirect-target", redirected)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.url = f"http://127.0.0.1:{self.runner.addresses[0][1]}"
        self.session = ClientSession()
        self.api = DockgeApi(self.session, self.url, "fixture-only")

    async def asyncTearDown(self):
        await self.session.close()
        await self.runner.cleanup()

    async def test_scoped_inventory_and_actions(self):
        self.assertEqual(list(await self.api.stacks()), ["demo"])
        await self.api.action("demo", "restart")
        self.assertEqual(self.calls[-1], ("POST", "/api/v1/stacks/demo/actions/restart"))
        with self.assertRaises(ApiError):
            await self.api.action("demo", "prune")
        self.assertEqual(len(self.calls), 2)

    async def test_authentication_errors_and_redirects_are_safe(self):
        for status in (401, 403):
            self.status = status
            with self.assertRaises(AuthenticationError):
                await self.api.stacks()
        self.status = 302
        with self.assertRaises(ApiError):
            await self.api.stacks()
        self.assertEqual(self.redirect_calls, 0)

    async def test_failed_actions_and_malformed_inventory(self):
        self.action_success = False
        with self.assertRaises(ApiError):
            await self.api.action("demo", "stop")
        self.rows = [{"name": "demo", "status": "not-an-integer"}]
        with self.assertRaises(ApiError):
            await self.api.stacks()

    async def test_home_assistant_entities_and_dynamic_discovery(self):
        with tempfile.TemporaryDirectory(prefix="dockge-ha-test-") as directory:
            hass = HomeAssistant(directory)
            entry = ConfigEntry(domain=DOMAIN, title="Fixture", data={"url": self.url, "token": "fixture-only"},
                                options={}, version=1, minor_version=1, source="user", unique_id=self.url,
                                discovery_keys=MappingProxyType({}), subentries_data=[])
            with patch("custom_components.dockge_enhanced.async_get_clientsession", return_value=self.session):
                coordinator = DockgeCoordinator(hass, entry)
            coordinator.api = self.api
            await coordinator.async_refresh()
            self.assertTrue(coordinator.last_update_success)
            sensor = StackStatus(coordinator, "demo", "status")
            running = StackRunning(coordinator, "demo", "running")
            switch = StackSwitch(coordinator, "demo", "control")
            button = StackButton(coordinator, "demo", "restart")
            self.assertEqual(sensor.native_value, "running")
            self.assertTrue(running.is_on)
            self.assertTrue(switch.is_on)
            self.assertTrue(sensor.available)
            hass.data[DOMAIN] = {entry.entry_id: coordinator}
            entities = []
            setup_entities(hass, entry, entities.extend, lambda c, n: [StackStatus(c, n, "status")])
            self.assertEqual(len(entities), 1)
            controls = []
            setup_entities(hass, entry, controls.extend, lambda c, n: [StackButton(c, n, "start")], controls=True)
            self.assertEqual(controls, [])
            self.rows = [{"name": "new", "status": 4}]
            await coordinator.async_refresh()
            self.assertEqual(len(entities), 2)
            self.assertFalse(sensor.available)
            self.assertNotEqual(entities[0].unique_id, entities[1].unique_id)
            self.status = 503
            await coordinator.async_refresh()
            self.assertFalse(entities[1].available)
            with self.assertRaises(HomeAssistantError):
                await button.async_press()
            self.status = 401
            with self.assertRaises(ConfigEntryAuthFailed):
                await coordinator._async_update_data()
            await hass.async_stop()

    async def test_url_validation(self):
        for url in ("http://user:secret@example.com", "file:///tmp/file", "https://example.com/?token=x", "https://example.com/#x"):
            with self.assertRaises(ValueError):
                normalize_url(url)
        self.assertEqual(normalize_url("https://EXAMPLE.com/base/"), "https://example.com/base")

    async def test_configuration_validates_token_and_defaults_to_read_only(self):
        with tempfile.TemporaryDirectory(prefix="dockge-ha-flow-") as directory:
            hass = HomeAssistant(directory)
            flow = ConfigFlow()
            flow.hass = hass
            form = await flow.async_step_user()
            self.assertEqual(form["data_schema"]({"url": self.url, "token": "fixture-only"})["controls"], False)
            with patch("custom_components.dockge_enhanced.config_flow.async_get_clientsession", return_value=self.session):
                self.status = 401
                form = await flow.async_step_user({"url": self.url, "token": "fixture-only"})
                self.assertEqual(form["errors"]["base"], "invalid_auth")
                self.status = 200
                with patch.object(flow, "async_set_unique_id", new=AsyncMock()), patch.object(flow, "_abort_if_unique_id_configured"):
                    result = await flow.async_step_user({"url": self.url, "token": "fixture-only", "controls": False})
                    self.assertEqual(result["type"], "create_entry")
                    self.assertFalse(result["data"]["controls"])
            await hass.async_stop()


if __name__ == "__main__":
    unittest.main()
