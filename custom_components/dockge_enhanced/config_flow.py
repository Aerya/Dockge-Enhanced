"""Configuration and token renewal without exposing credentials."""
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers import selector
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from . import DOMAIN
from .api import DockgeApi, AuthenticationError, ApiError, normalize_url


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}
        if user_input is not None:
            try:
                user_input["url"] = normalize_url(user_input["url"])
                await DockgeApi(async_get_clientsession(self.hass), user_input["url"], user_input["token"]).stacks()
                await self.async_set_unique_id(user_input["url"])
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=user_input["url"], data=user_input)
            except AuthenticationError:
                errors["base"] = "invalid_auth"
            except (ApiError, ValueError):
                errors["base"] = "cannot_connect"
        return self.async_show_form(step_id="user", errors=errors, data_schema=vol.Schema({
            vol.Required("url"): str,
            vol.Required("token"): selector.TextSelector(selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD)),
            vol.Optional("controls", default=False): bool,
        }))

    async def async_step_reauth(self, entry_data):
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input=None):
        entry = self._get_reauth_entry()
        errors = {}
        if user_input is not None:
            try:
                await DockgeApi(async_get_clientsession(self.hass), entry.data["url"], user_input["token"]).stacks()
                return self.async_update_reload_and_abort(entry, data_updates=user_input)
            except AuthenticationError:
                errors["base"] = "invalid_auth"
            except ApiError:
                errors["base"] = "cannot_connect"
        return self.async_show_form(step_id="reauth_confirm", errors=errors, data_schema=vol.Schema({
            vol.Required("token"): selector.TextSelector(selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD)),
        }))
