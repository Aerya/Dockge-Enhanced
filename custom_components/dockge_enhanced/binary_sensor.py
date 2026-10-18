"""Running state, not a claim of application health."""
from homeassistant.components.binary_sensor import BinarySensorEntity
from .entity import StackEntity, setup_entities


class StackRunning(StackEntity, BinarySensorEntity):
    @property
    def is_on(self):
        return self.stack.get("status") == 3


async def async_setup_entry(hass, entry, async_add_entities):
    setup_entities(hass, entry, async_add_entities, lambda coordinator, name: [StackRunning(coordinator, name, "running")])
