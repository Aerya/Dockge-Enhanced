<template>
    <ScopedWorkspace v-if="$root.loggedIn && $root.userAccess?.role === 'restricted'" />
    <router-view v-else />
</template>

<script>
import ScopedWorkspace from "./pages/ScopedWorkspace.vue";
export default {
    components: { ScopedWorkspace },
};
</script>
