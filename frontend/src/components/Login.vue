<template>
    <div class="form-container">
        <div class="form">
            <form @submit.prevent="submit">
                <h1 class="h3 mb-3 fw-normal" />

                <div v-if="!tokenRequired && !localLoginDisabled" class="form-floating">
                    <input id="floatingInput" v-model="username" type="text" class="form-control" placeholder="Username" autocomplete="username" required>
                    <label for="floatingInput">{{ $t("Username") }}</label>
                </div>

                <div v-if="!tokenRequired && !localLoginDisabled" class="form-floating mt-3">
                    <input id="floatingPassword" v-model="password" type="password" class="form-control" placeholder="Password" autocomplete="current-password" required>
                    <label for="floatingPassword">{{ $t("Password") }}</label>
                </div>

                <div v-if="tokenRequired">
                    <div class="form-floating mt-3">
                        <input id="otp" v-model="token" type="text" maxlength="35" class="form-control" placeholder="123456" autocomplete="one-time-code" required>
                        <label for="otp">{{ $t("twoFactor.loginCode") }}</label>
                    </div>
                </div>

                <div class="form-check mb-3 mt-3 d-flex justify-content-center pe-4">
                    <div class="form-check">
                        <input id="remember" v-model="$root.remember" type="checkbox" value="remember-me" class="form-check-input">

                        <label class="form-check-label" for="remember">
                            {{ $t("Remember me") }}
                        </label>
                    </div>
                </div>

                <!-- Cloudflare Turnstile -->
                <div v-if="turnstileEnabled && !localLoginDisabled" v-show="!tokenRequired" class="mb-3">
                    <div ref="turnstile" class="d-flex justify-content-center"></div>
                </div>

                <button v-if="!localLoginDisabled" class="w-100 btn btn-primary" type="submit" :disabled="processing">
                    {{ $t("Login") }}
                </button>

                <template v-if="oidcEnabled && !tokenRequired">
                    <div v-if="!localLoginDisabled" class="login-separator text-muted my-3">
                        {{ $t("oidc.or") }}
                    </div>
                    <a class="w-100 btn" :class="localLoginDisabled ? 'btn-primary' : 'btn-outline-primary'" href="/api/auth/oidc/login" @click="$root.oidcError = ''">
                        <font-awesome-icon icon="key" class="me-2" />{{ oidcButtonLabel }}
                    </a>
                </template>

                <div v-if="res && !res.ok" class="alert alert-danger mt-3" role="alert">
                    {{ $t(res.msg) }}
                </div>

                <div v-if="$root.oidcError" class="alert alert-danger mt-3" role="alert">
                    {{ $te($root.oidcError) ? $t($root.oidcError) : $t("oidc.failed") }}
                </div>
            </form>
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            processing: false,
            username: "",
            password: "",
            token: "",
            res: null,
            tokenRequired: false,
            challenge: "",
            turnstileToken: "",
            turnstileWidgetId: null,
            previousTitle: "",
        };
    },

    computed: {
        turnstileEnabled() {
            return !!this.$root.info?.turnstileEnabled;
        },
        oidcEnabled() {
            return !!this.$root.info?.oidc;
        },
        localLoginDisabled() {
            return !!this.$root.info?.oidc?.localLoginDisabled;
        },
        oidcButtonLabel() {
            return this.$root.info?.oidc?.buttonLabel || this.$t("oidc.signIn");
        },
        turnstileSiteKey() {
            return this.$root.info?.turnstileSiteKey ?? "";
        },
    },

    watch: {
        turnstileEnabled(enabled) {
            if (enabled) {
                this.$nextTick(() => this.loadTurnstile());
            }
        },
    },

    mounted() {
        this.previousTitle = document.title;
        document.title = `${this.$t("Login")} - Dockge Enhanced - ${location.host}`;
        if (this.turnstileEnabled) {
            this.$nextTick(() => this.loadTurnstile());
        }
    },

    unmounted() {
        document.title = this.previousTitle;
    },

    methods: {
        /**
         * Submit the user details and attempt to log in
         * @returns {void}
         */
        submit() {
            this.processing = true;

            this.$root.login(this.username, this.password, this.token, (res) => {
                this.processing = false;

                if (res.tokenRequired) {
                    this.tokenRequired = true;
                    this.challenge = res.challenge;
                } else {
                    this.res = res;
                    if (res.msg === "twoFactor.restartLogin") {
                        this.tokenRequired = false;
                        this.challenge = "";
                        this.token = "";
                    }
                }

                // Réinitialise le widget Turnstile après une tentative (token à usage unique)
                if (this.turnstileEnabled && window.turnstile && this.turnstileWidgetId !== null) {
                    window.turnstile.reset(this.turnstileWidgetId);
                    this.turnstileToken = "";
                }
            }, this.turnstileToken, this.challenge);
        },

        /**
         * Charge le script Turnstile (une seule fois) puis rend le widget.
         * @returns {void}
         */
        loadTurnstile() {
            if (!this.turnstileSiteKey) {
                return;
            }

            const render = () => this.renderTurnstile();

            if (window.turnstile) {
                render();
                return;
            }

            const existing = document.getElementById("cf-turnstile-script");
            if (existing) {
                existing.addEventListener("load", render, { once: true });
                return;
            }

            const script = document.createElement("script");
            script.id = "cf-turnstile-script";
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
            script.async = true;
            script.defer = true;
            script.addEventListener("load", render, { once: true });
            document.head.appendChild(script);
        },

        /**
         * Rend le widget Turnstile dans le conteneur dédié.
         * @returns {void}
         */
        renderTurnstile() {
            if (!window.turnstile || !this.$refs.turnstile || this.turnstileWidgetId !== null) {
                return;
            }
            this.turnstileWidgetId = window.turnstile.render(this.$refs.turnstile, {
                sitekey: this.turnstileSiteKey,
                callback: (token) => {
                    this.turnstileToken = token;
                },
                "expired-callback": () => {
                    this.turnstileToken = "";
                },
                "error-callback": () => {
                    this.turnstileToken = "";
                },
            });
        },

    },
};
</script>

<style lang="scss" scoped>
.form-container {
    display: flex;
    align-items: center;
    padding-top: 40px;
    padding-bottom: 40px;
}

.form-floating {
    > label {
        padding-left: 1.3rem;
    }

    > .form-control {
        padding-left: 1.3rem;
    }
}

.login-separator {
    display: flex;
    align-items: center;
    gap: 0.75rem;

    &::before,
    &::after {
        content: "";
        flex: 1;
        border-top: 1px solid currentColor;
        opacity: 0.4;
    }
}

.form {
    width: 100%;
    max-width: 330px;
    padding: 15px;
    margin: auto;
    text-align: center;
}
</style>
