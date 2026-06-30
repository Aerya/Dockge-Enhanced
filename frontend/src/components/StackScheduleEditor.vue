<template>
    <div class="stack-schedule-editor" :class="{ compact }">
        <div v-if="showHeading" class="schedule-heading">
            <div>
                <strong>{{ stackName }}</strong>
                <span class="schedule-timezone">{{ timezone }}</span>
            </div>
            <span v-if="saving" class="spinner-border spinner-border-sm" />
        </div>

        <div v-if="schedule" class="schedule-actions">
            <div v-for="action in actions" :key="action" class="schedule-action">
                <label class="schedule-action-label" :for="`${idPrefix}-${action}-mode`">
                    <font-awesome-icon :icon="action === 'start' ? 'play' : 'stop'" />
                    {{ $t(`stackScheduler.${action}`) }}
                </label>

                <select
                    :id="`${idPrefix}-${action}-mode`"
                    class="form-select form-select-sm schedule-mode"
                    :value="schedule[action].mode"
                    :disabled="saving"
                    @change="changeMode(action, $event)"
                >
                    <option v-for="mode in modes" :key="mode" :value="mode">
                        {{ $t(`stackScheduler.mode.${mode}`) }}
                    </option>
                </select>

                <template v-if="schedule[action].mode !== 'off' && schedule[action].mode !== 'custom'">
                    <input
                        type="time"
                        class="form-control form-control-sm schedule-time"
                        :value="schedule[action].time"
                        :disabled="saving"
                        @change="changeField(action, 'time', $event)"
                    />
                </template>

                <select
                    v-if="schedule[action].mode === 'weekly'"
                    class="form-select form-select-sm schedule-weekday"
                    :value="schedule[action].weekday"
                    :disabled="saving"
                    @change="changeNumberField(action, 'weekday', $event)"
                >
                    <option v-for="(day, index) in weekdays" :key="index" :value="index">{{ day }}</option>
                </select>

                <input
                    v-if="schedule[action].mode === 'biweekly'"
                    type="date"
                    class="form-control form-control-sm schedule-date"
                    :value="schedule[action].anchorDate"
                    :title="$t('stackScheduler.firstRun')"
                    :disabled="saving"
                    @change="changeField(action, 'anchorDate', $event)"
                />
                <span v-if="schedule[action].mode === 'biweekly'" class="schedule-field-label">
                    {{ $t("stackScheduler.firstRunShort") }}
                </span>

                <div v-if="schedule[action].mode === 'monthly'" class="schedule-monthday">
                    <span>{{ $t("stackScheduler.day") }}</span>
                    <input
                        type="number"
                        min="1"
                        max="28"
                        class="form-control form-control-sm"
                        :value="schedule[action].dayOfMonth"
                        :disabled="saving"
                        @change="changeNumberField(action, 'dayOfMonth', $event)"
                    />
                </div>

                <input
                    v-if="schedule[action].mode === 'custom'"
                    type="text"
                    class="form-control form-control-sm schedule-cron"
                    :value="schedule[action].cron"
                    placeholder="0 23 * * 0"
                    :disabled="saving"
                    @change="changeField(action, 'cron', $event)"
                />

                <span v-if="nextFor(action)" class="schedule-next" :title="formatFull(nextFor(action))">
                    {{ $t("stackScheduler.next") }} {{ formatShort(nextFor(action)) }}
                </span>
                <span
                    v-if="lastFor(action)"
                    class="schedule-last"
                    :class="lastFor(action)?.success ? 'success' : 'failure'"
                    :title="lastFor(action)?.error || formatFull(lastFor(action)?.timestamp || null)"
                >
                    <font-awesome-icon :icon="lastFor(action)?.success ? 'check-circle' : 'times-circle'" />
                    {{ $t("stackScheduler.last") }} {{ formatShort(lastFor(action)?.timestamp || null) }}
                </span>
            </div>
        </div>
        <div v-else class="schedule-loading">
            <span class="spinner-border spinner-border-sm" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, type PropType } from "vue";
import { useToast } from "vue-toastification";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import {
    type ScheduleAction,
    type ScheduleMode,
    type ScheduleRule,
    type StackSchedule,
    useStackSchedules,
} from "../composables/useStackSchedules";

const props = defineProps({
    stackName: { type: String,
        required: true },
    compact: { type: Boolean,
        default: false },
    showHeading: { type: Boolean,
        default: true },
    scheduleOverride: { type: Object as PropType<StackSchedule | null>,
        default: null },
});

const toast = useToast();
const { locale, t } = useI18n();
const { timezone, scheduleFor, saveSchedule } = useStackSchedules();
const sharedSchedule = scheduleFor(props.stackName);
const schedule = computed(() => props.scheduleOverride ?? sharedSchedule.value);
const saving = ref(false);
const actions: ScheduleAction[] = [ "start", "stop" ];
const modes: ScheduleMode[] = [ "off", "daily", "weekly", "biweekly", "monthly", "custom" ];
const weekdays = computed(() => {
    const base = new Date(2024, 0, 7);
    return Array.from({ length: 7 }, (_, index) =>
        new Intl.DateTimeFormat(locale.value === "fr" ? "fr-FR" : "en-GB", { weekday: "long" })
            .format(new Date(base.getTime() + index * 86_400_000))
    );
});
const idPrefix = computed(() => `schedule-${props.stackName.replace(/[^a-zA-Z0-9_-]/g, "-")}`);

function nextSunday(): string {
    const date = new Date();
    const add = (7 - date.getDay()) % 7;
    date.setDate(date.getDate() + add);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function defaults(mode: ScheduleMode): ScheduleRule {
    if (mode === "off") {
        return { mode };
    }
    if (mode === "daily") {
        return { mode,
            time: "08:00" };
    }
    if (mode === "weekly") {
        return { mode,
            time: "08:00",
            weekday: 1 };
    }
    if (mode === "biweekly") {
        return { mode,
            time: "23:00",
            anchorDate: nextSunday() };
    }
    if (mode === "monthly") {
        return { mode,
            time: "08:00",
            dayOfMonth: 1 };
    }
    return { mode,
        cron: "0 8 * * 1" };
}

async function persist(action: ScheduleAction, rule: ScheduleRule) {
    if (!schedule.value || saving.value) {
        return;
    }
    saving.value = true;
    try {
        const start = action === "start" ? rule : schedule.value.start;
        const stop = action === "stop" ? rule : schedule.value.stop;
        await saveSchedule(props.stackName, start, stop);
        toast.success(t("stackScheduler.saved"));
    } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
    } finally {
        saving.value = false;
    }
}

function changeMode(action: ScheduleAction, event: Event) {
    persist(action, defaults((event.target as HTMLSelectElement).value as ScheduleMode));
}

function changeField(action: ScheduleAction, field: keyof ScheduleRule, event: Event) {
    persist(action, { ...schedule.value[action],
        [field]: (event.target as HTMLInputElement).value });
}

function changeNumberField(action: ScheduleAction, field: keyof ScheduleRule, event: Event) {
    persist(action, { ...schedule.value[action],
        [field]: Number((event.target as HTMLInputElement).value) });
}

function nextFor(action: ScheduleAction): string | null {
    return action === "start" ? schedule.value?.nextStart : schedule.value?.nextStop;
}

function lastFor(action: ScheduleAction) {
    return action === "start" ? schedule.value?.lastStart : schedule.value?.lastStop;
}

function formatShort(value: string | null): string {
    if (!value) {
        return "";
    }
    return new Date(value).toLocaleString(locale.value === "fr" ? "fr-FR" : "en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatFull(value: string | null): string {
    return value ? new Date(value).toLocaleString() : "";
}
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

.stack-schedule-editor {
    padding: 12px 0;
    border-bottom: 1px solid rgba(127, 127, 127, 0.18);
}

.schedule-heading,
.schedule-actions,
.schedule-action,
.schedule-monthday,
.schedule-loading {
    display: flex;
    align-items: center;
}

.schedule-heading {
    justify-content: space-between;
    margin-bottom: 8px;
}

.schedule-loading {
    min-height: 38px;
    justify-content: center;
}

.schedule-timezone {
    margin-left: 8px;
    color: $dark-font-color3;
    font-size: 0.72rem;
}

.schedule-actions {
    gap: 12px;
    flex-wrap: wrap;
}

.schedule-action {
    min-width: min(100%, 520px);
    gap: 6px;
    flex-wrap: wrap;
}

.schedule-action-label {
    min-width: 82px;
    font-size: 0.78rem;
    font-weight: 600;
}

.schedule-mode { width: 135px; }
.schedule-time { width: 104px; }
.schedule-weekday { width: 125px; }
.schedule-date { width: 145px; }
.schedule-cron { width: 175px; font-family: monospace; }

.schedule-monthday {
    gap: 4px;
    font-size: 0.75rem;

    .form-control { width: 70px; }
}

.schedule-next {
    color: $dark-font-color3;
    font-size: 0.7rem;
}

.schedule-field-label {
    color: $dark-font-color3;
    font-size: 0.68rem;
}

.schedule-last {
    font-size: 0.7rem;

    &.success { color: #16a34a; }
    &.failure { color: $danger; }
}

.compact {
    padding: 8px 0;
    border-bottom: 0;

    .schedule-actions { gap: 6px 14px; }
}

@media (max-width: 575px) {
    .schedule-action { align-items: flex-start; }
    .schedule-action-label { width: 100%; }
}
</style>
