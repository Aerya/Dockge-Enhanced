"""Optional start/stop switch."""
from homeassistant.components.switch import SwitchEntity
from .entity import StackEntity, setup_entities


class StackSwitch(StackEntity, SwitchEntity):
    @property
    def is_on(self):
        return self.stack.get("status") == 3

    async def async_turn_on(self, **kwargs):
        await self.run_action("start")

    async def async_turn_off(self, **kwargs):
        await self.run_action("stop")


async def async_setup_entry(hass, entry, async_add_entities):
    setup_entities(hass, entry, async_add_entities, lambda coordinator, name: [StackSwitch(coordinator, name, "control")], controls=True)
