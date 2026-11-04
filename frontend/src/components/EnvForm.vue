<template>
    <div class="mb-2">
        <button v-if="!disabled" type="button" class="btn btn-sm btn-normal" @click="form = !form">{{ $t(form ? 'configTools.text' : 'configTools.form') }}</button>
        <template v-if="form">
            <p class="small mt-2">{{ $t('configTools.envHint') }}</p>
            <label><input v-model="reveal" type="checkbox"> {{ $t('configTools.reveal') }}</label>
            <div v-for="(line, index) in lines" :key="index" class="d-flex gap-2 my-2 align-items-center">
                <template v-if="line.key">
                    <code class="env-key">{{ line.key }}</code>
                    <input class="form-control form-control-sm" :aria-label="line.key" :type="reveal ? 'text' : 'password'" autocomplete="off" :value="line.value" @input="edit(index, $event.target.value)">
                    <button type="button" class="btn btn-sm btn-normal" :title="$t('Delete')" @click="remove(index)">×</button>
                </template>
                <span v-else class="small text-muted">{{ line.raw.startsWith('#') ? line.raw : $t('configTools.rawLine') }}</span>
            </div>
            <div class="d-flex gap-2">
                <input v-model="newKey" class="form-control form-control-sm" :placeholder="$t('configTools.variable')" :aria-label="$t('configTools.variable')">
                <button type="button" class="btn btn-sm btn-normal" :disabled="!validKey" @click="add">{{ $t('Add') }}</button>
            </div>
        </template>
        <slot v-else />
    </div>
</template>

<script>
import { parseEnvForm, editEnvValue } from "../../../common/env-form";
export default {
    props: { modelValue: { type: String,
        default: "" },
    disabled: Boolean },
    emits: [ "update:modelValue" ],
    data: () => ({ form: false,
        reveal: false,
        newKey: "" }),
    computed: {
        lines() {
            return parseEnvForm(this.modelValue);
        },
        validKey() {
            return /^[A-Za-z_][A-Za-z0-9_]*$/.test(this.newKey) && !this.lines.some(line => line.key === this.newKey);
        },
    },
    watch: { disabled(value) {
        if (value) {
            this.form = false;
        }
    } },
    methods: {
        edit(index, value) {
            this.$emit("update:modelValue", editEnvValue(this.modelValue, index, value));
        },
        remove(index) {
            this.$emit("update:modelValue", this.lines.filter((_, i) => i !== index).map(line => line.raw + line.ending).join(""));
        },
        add() {
            if (!this.validKey) {
                return;
            }
            const ending = this.modelValue.includes("\r\n") ? "\r\n" : "\n";
            this.$emit("update:modelValue", this.modelValue + (this.modelValue && !/[\r\n]$/.test(this.modelValue) ? ending : "") + this.newKey + "=" + ending);
            this.newKey = "";
        },
    },
};
</script>

<style scoped>
.env-key { min-width: 8rem; max-width: 35%; overflow-wrap: anywhere; }
</style>
