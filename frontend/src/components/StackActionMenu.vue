<template>
    <details ref="menu" class="stack-action-menu" @keydown.esc="close" @toggle="position">
        <summary class="btn btn-normal">{{ label }} <span aria-hidden="true">▾</span></summary>
        <div ref="content" class="stack-action-menu-content" @click="onAction">
            <slot />
        </div>
    </details>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

defineProps<{ label: string }>();
const menu = ref<HTMLDetailsElement>();
const content = ref<HTMLDivElement>();
async function position() {
    if (!menu.value?.open) {
        return;
    }
    await nextTick();
    if (content.value) {
        content.value.style.transform = "";
        const box = content.value.getBoundingClientRect();
        const offset = Math.max(8 - box.left, Math.min(0, window.innerWidth - 8 - box.right));
        content.value.style.transform = `translateX(${offset}px)`;
    }
}
function close() {
    if (menu.value) {
        menu.value.open = false;
    }
}
function outside(event: Event) {
    if (event.target instanceof Node && !menu.value?.contains(event.target)) {
        close();
    }
}
function onAction(event: MouseEvent) {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (button && !button.disabled) {
        close();
    }
}
onMounted(() => {
    document.addEventListener("click", outside);
    window.addEventListener("resize", close);
});
onBeforeUnmount(() => {
    document.removeEventListener("click", outside);
    window.removeEventListener("resize", close);
});
</script>

<style scoped lang="scss">
.stack-action-menu {
    position: relative;
    min-width: 0;

    summary {
        list-style: none;
        cursor: pointer;
        display: flex;
        gap: .6rem;
        align-items: center;
        min-height: 38px;
    }

    summary::-webkit-details-marker {
        display: none;
    }
}

.stack-action-menu-content {
    position: absolute;
    inset-inline-end: 0;
    top: calc(100% + .4rem);
    z-index: 1050;
    width: min(300px, calc(100vw - 48px));
    max-height: 65vh;
    overflow-y: auto;
    padding: .4rem;
    border: 1px solid var(--bs-border-color, #606570);
    border-radius: .6rem;
    background: var(--bs-body-bg, #151920);
    box-shadow: 0 8px 24px #0004;
    display: grid;
    gap: .25rem;

    :deep(.stack-action) {
        width: 100%;
        min-height: 36px;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: .65rem;
        text-align: start;
    }

    :deep(.stack-action-label) {
        display: inline !important;
        font-size: .85rem;
    }

    :deep(.stack-action--danger) {
        border-top: 1px solid var(--bs-border-color, #606570);
        margin-top: .4rem;
    }
}
</style>
