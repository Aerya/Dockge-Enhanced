<template>
    <div>
        <template v-if="valid">
            <div v-for="(item, index) in modelValue" :key="index" class="d-flex flex-wrap gap-2 mb-2">
                <input class="form-control flex-fill" style="min-width: 12rem; width: auto" :value="entry(item).url" :aria-label="$t('url')" placeholder="https://" @input="update(index, 'url', $event.target.value)">
                <input class="form-control flex-fill" style="min-width: 10rem; width: auto" :value="entry(item).label || ''" :aria-label="$t('stackURLs.label')" :placeholder="$t('stackURLs.label')" @input="update(index, 'label', $event.target.value)">
                <button type="button" class="btn btn-outline-danger" :aria-label="$t('remove')" @click="remove(index)">×</button>
            </div>
            <button type="button" class="btn btn-normal btn-sm" @click="$emit('update:modelValue', [ ...(modelValue || []), '' ])">{{ $t('addListItem', [ $t('url') ]) }}</button>
            <div class="form-text">{{ $t('stackURLs.help') }}</div>
        </template>
        <div v-else class="form-text">{{ $t('LongSyntaxNotSupported') }}</div>
    </div>
</template>

<script>
import { stackURLValue } from "../../../common/stack-urls";

export default {
    props: { modelValue: { type: [ Array, Object, String, Number, Boolean ],
        default: undefined } },
    emits: [ "update:modelValue" ],
    computed: {
        valid() {
            return this.modelValue === undefined || (Array.isArray(this.modelValue) && this.modelValue.every(item => stackURLValue(item)));
        },
    },
    methods: {
        entry: stackURLValue,
        update(index, field, value) {
            const items = [ ...this.modelValue ];
            const old = items[index];
            // Preserve extension properties and the legacy string format.
            if (typeof old === "string" && (field === "url" || !value)) {
                items[index] = field === "url" ? value : old;
            } else {
                items[index] = { ...(typeof old === "string" ? { url: old } : old),
                    [field]: value };
            }
            this.$emit("update:modelValue", items);
        },
        remove(index) {
            this.$emit("update:modelValue", this.modelValue.filter((_, i) => i !== index));
        },
    },
};
</script>
