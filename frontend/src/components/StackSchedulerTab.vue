<template>
    <section>
        <div class="scheduler-header mb-3">
            <div>
                <h5 class="mb-1">
                    <font-awesome-icon icon="calendar-days" class="me-2" />{{ $t("stackScheduler.heading") }}
                </h5>
                <p class="form-text mb-0">{{ $t("stackScheduler.hint", { timezone }) }}</p>
            </div>
            <button class="btn btn-normal btn-sm" :disabled="loading" @click="loadSchedules">
                <font-awesome-icon icon="rotate" :spin="loading" />
            </button>
        </div>

        <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
        <div v-if="loading && schedules.length === 0" class="text-center py-4">
            <span class="spinner-border spinner-border-sm" />
        </div>
        <div v-else-if="schedules.length === 0" class="form-text py-3">{{ $t("stackScheduler.empty") }}</div>
        <div v-else class="scheduler-list">
            <StackScheduleEditor
                v-for="schedule in schedules"
                :key="schedule.stack"
                :stack-name="schedule.stack"
                :schedule-override="schedule"
            />
        </div>
    </section>
</template>

<script setup lang="ts">
import StackScheduleEditor from "./StackScheduleEditor.vue";
import { useStackSchedules } from "../composables/useStackSchedules";

const { schedules, timezone, loading, error, loadSchedules } = useStackSchedules();
</script>

<style scoped lang="scss">
.scheduler-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.scheduler-list {
    border-top: 1px solid rgba(127, 127, 127, 0.18);
}
</style>
