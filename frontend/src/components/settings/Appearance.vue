<template>
    <div>
        <div class="my-4">
            <label for="language" class="form-label">
                {{ $t("Language") }}
            </label>
            <select id="language" v-model="$root.language" class="form-select">
                <option
                    v-for="(lang, i) in $i18n.availableLocales"
                    :key="`Lang${i}`"
                    :value="lang"
                >
                    {{ $i18n.messages[lang].languageName }}
                </option>
            </select>
        </div>
        <div v-show="true" class="my-4">
            <label for="timezone" class="form-label">{{ $t("Theme") }}</label>
            <div>
                <div
                    class="btn-group"
                    role="group"
                    aria-label="Basic checkbox toggle button group"
                >
                    <input
                        id="btncheck1"
                        v-model="$root.userTheme"
                        type="radio"
                        class="btn-check"
                        name="theme"
                        autocomplete="off"
                        value="light"
                    />
                    <label class="btn btn-outline-primary" for="btncheck1">
                        {{ $t("Light") }}
                    </label>

                    <input
                        id="btncheck2"
                        v-model="$root.userTheme"
                        type="radio"
                        class="btn-check"
                        name="theme"
                        autocomplete="off"
                        value="dark"
                    />
                    <label class="btn btn-outline-primary" for="btncheck2">
                        {{ $t("Dark") }}
                    </label>

                    <input
                        id="btncheck3"
                        v-model="$root.userTheme"
                        type="radio"
                        class="btn-check"
                        name="theme"
                        autocomplete="off"
                        value="auto"
                    />
                    <label class="btn btn-outline-primary" for="btncheck3">
                        {{ $t("Auto") }}
                    </label>
                </div>
            </div>
        </div>
        <div class="my-4">
            <label for="day-palette" class="form-label">{{ $t("themePalette.day") }}</label>
            <select id="day-palette" v-model="$root.dayPalette" class="form-select">
                <option v-for="palette in lightPalettes" :key="palette" :value="palette">
                    {{ $t(`themePalette.${palette}`) }}
                </option>
            </select>
        </div>
        <div class="my-4">
            <label for="night-palette" class="form-label">{{ $t("themePalette.night") }}</label>
            <select id="night-palette" v-model="$root.nightPalette" class="form-select">
                <option v-for="palette in darkPalettes" :key="palette" :value="palette">
                    {{ $t(`themePalette.${palette}`) }}
                </option>
            </select>
            <div class="form-text">{{ $t("themePalette.help") }}</div>
        </div>
        <div class="form-check my-4">
            <input id="log-timestamps-default" v-model="logTimestampsDefault" type="checkbox" class="form-check-input" />
            <label for="log-timestamps-default" class="form-check-label">{{ $t("logTimestampsDefault") }}</label>
            <div class="form-text">{{ $t("logTimestampsDefaultHelp") }}</div>
        </div>
    </div>
</template>

<script>
import { LIGHT_PALETTES, DARK_PALETTES } from "../../theme-palettes";

export default {
    data() {
        return {
            lightPalettes: LIGHT_PALETTES,
            darkPalettes: DARK_PALETTES,
            logTimestampsDefault: localStorage.getItem("logTimestampsDefault") === "true",
        };
    },
    watch: {
        logTimestampsDefault(value) {
            localStorage.setItem("logTimestampsDefault", String(value));
        },
    },
};
</script>

<style lang="scss" scoped>

.btn-check:active + .btn-outline-primary,
.btn-check:checked + .btn-outline-primary,
.btn-check:hover + .btn-outline-primary {
    background-color: var(--primary-strong);
    border-color: var(--primary-strong);
    color: var(--primary-text);
}
</style>
