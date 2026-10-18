"""Explicit optional stack actions; no destructive pruning or down."""
from homeassistant.components.button import ButtonEntity
from .entity import StackEntity, setup_entities


class StackButton(StackEntity, ButtonEntity):
    def __init__(self, coordinator, name, action):
        super().__init__(coordinator, name, action)
        self.action = action

    async def async_press(self):
        await self.run_action(self.action)


async def async_setup_entry(hass, entry, async_add_entities):
    setup_entities(hass, entry, async_add_entities,
                   lambda coordinator, name: [StackButton(coordinator, name, action) for action in ("start", "stop", "restart")], controls=True)
