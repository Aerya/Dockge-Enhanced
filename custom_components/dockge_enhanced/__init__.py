"""Optional Home Assistant integration for Dockge Enhanced."""
from datetime import timedelta
import logging

from homeassistant.const import Platform
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import DockgeApi, AuthenticationError, ApiError

DOMAIN = "dockge_enhanced"
PLATFORMS = [Platform.SENSOR, Platform.BINARY_SENSOR, Platform.BUTTON, Platform.SWITCH]


class DockgeCoordinator(DataUpdateCoordinator):
    def __init__(self, hass, entry):
        super().__init__(hass, logging.getLogger(__name__), name=DOMAIN,
                         update_interval=timedelta(seconds=60), config_entry=entry)
        self.entry = entry
        self.api = DockgeApi(async_get_clientsession(hass), entry.data["url"], entry.data["token"])

    async def _async_update_data(self):
        try:
            return await self.api.stacks()
        except AuthenticationError as error:
            raise ConfigEntryAuthFailed("API token rejected") from error
        except ApiError as error:
            raise UpdateFailed(str(error)) from error


async def async_setup_entry(hass, entry):
    coordinator = DockgeCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, entry.entry_id)},
        name=entry.title, manufacturer="Dockge Enhanced", model="Instance",
        configuration_url=entry.data["url"],
    )
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass, entry):
    if await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        hass.data[DOMAIN].pop(entry.entry_id)
        return True
    return False
