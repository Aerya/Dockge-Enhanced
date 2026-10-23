<template>
    <p v-if="timezone" class="form-text">{{ $t("schedulingTimezone.notice", { timezone }) }}</p>
</template>

<script>
export default {
    computed: {
        timezone() {
            return this.$root.info?.schedulingTimezone;
        },
    },
};
</script>
