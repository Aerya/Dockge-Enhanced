"""Stack state sensors."""
from homeassistant.components.sensor import SensorEntity, SensorDeviceClass
from .entity import StackEntity, setup_entities

STATES = {0: "unknown", 1: "draft", 2: "created", 3: "running", 4: "stopped", 5: "paused"}


class StackStatus(StackEntity, SensorEntity):
    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = list(STATES.values())

    @property
    def native_value(self):
        return STATES.get(self.stack.get("status"), "unknown")


async def async_setup_entry(hass, entry, async_add_entities):
    setup_entities(hass, entry, async_add_entities, lambda coordinator, name: [StackStatus(coordinator, name, "status")])
