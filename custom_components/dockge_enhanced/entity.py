"""Stable per-instance, per-stack devices and dynamic discovery."""
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from . import DOMAIN
from .api import ApiError, AuthenticationError


class StackEntity(CoordinatorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, name, key):
        super().__init__(coordinator)
        self.stack_name = name
        self._attr_unique_id = f"{coordinator.entry.entry_id}_{name}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = {
            "identifiers": {(DOMAIN, f"{coordinator.entry.entry_id}_{name}")},
            "name": coordinator.data[name].get("displayName") or name,
            "manufacturer": "Dockge Enhanced", "model": "Compose stack",
            "via_device": (DOMAIN, coordinator.entry.entry_id),
        }

    @property
    def available(self):
        return super().available and self.stack_name in self.coordinator.data

    @property
    def stack(self):
        return self.coordinator.data.get(self.stack_name, {})

    async def run_action(self, action):
        try:
            await self.coordinator.api.action(self.stack_name, action)
        except (ApiError, AuthenticationError) as error:
            raise HomeAssistantError(str(error)) from error
        await self.coordinator.async_request_refresh()


def setup_entities(hass, entry, async_add_entities, factory, controls=False):
    if controls and not entry.data.get("controls", False):
        return
    coordinator = hass.data[DOMAIN][entry.entry_id]
    known = set()

    def discover():
        new = set(coordinator.data) - known
        async_add_entities([entity for name in sorted(new)
                            if not controls or coordinator.data[name].get("isManagedByDockge", False)
                            for entity in factory(coordinator, name)])
        known.update(new)

    discover()
    entry.async_on_unload(coordinator.async_add_listener(discover))
