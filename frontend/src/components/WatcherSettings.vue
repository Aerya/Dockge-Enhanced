<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h1 class="mb-0">
        <font-awesome-icon icon="bolt" /> {{ $t("watcher.title") }}
      </h1>
      <!-- Bouton bascule FR / EN -->
      <div class="lang-toggle">
        <button
          class="lang-btn"
          :class="{ active: watcherLang === 'fr' }"
          @click="setWatcherLang('fr')"
          title="Français"
        >
          🇫🇷
        </button>
        <button
          class="lang-btn"
          :class="{ active: watcherLang === 'en' }"
          @click="setWatcherLang('en')"
          title="English"
        >
          🇬🇧
        </button>
      </div>
    </div>

    <div class="shadow-box shadow-box-settings">
      <!-- ═══ TAB BAR ═══ -->
      <div class="watcher-tab-bar mb-4">
        <button
          class="watcher-tab"
          :class="{ active: tab === 'images' }"
          @click="tab = 'images'"
        >
          <font-awesome-icon icon="sync-alt" class="watcher-tab-icon" />
          <span>{{ $t("watcher.tab.images") }}</span>
        </button>
        <button
          class="watcher-tab"
          :class="{ active: tab === 'trivy' }"
          @click="tab = 'trivy'"
        >
          <font-awesome-icon icon="bug" class="watcher-tab-icon" />
          <span>{{ $t("watcher.tab.security") }}</span>
        </button>
        <button
          class="watcher-tab"
          :class="{ active: tab === 'backup' }"
          @click="tab = 'backup'"
        >
          <font-awesome-icon icon="archive" class="watcher-tab-icon" />
          <span>{{ $t("watcher.tab.backup") }}</span>
        </button>
        <button
          class="watcher-tab"
          :class="{ active: tab === 'resources' }"
          @click="tab = 'resources'"
        >
          <font-awesome-icon icon="cube" class="watcher-tab-icon" />
          <span>{{ $t("watcher.tab.resources") }}</span>
        </button>
        <button
          class="watcher-tab"
          :class="{ active: tab === 'notifications' }"
          @click="tab = 'notifications'"
        >
          <font-awesome-icon icon="bell" class="watcher-tab-icon" />
          <span>{{ $t("watcher.tab.notifications") }}</span>
        </button>
        <button
          class="watcher-tab"
          :class="{ active: tab === 'monitoring' }"
          @click="tab = 'monitoring'"
        >
          <font-awesome-icon icon="chart-line" class="watcher-tab-icon" />
          <span>{{ $t("watcher.tab.monitoring") }}</span>
        </button>
      </div>

      <!-- ═══ TAB: IMAGES ═══ -->
      <div v-show="tab === 'images'">
        <!-- IMAGE WATCHER CONFIG -->
        <div class="shadow-box big-padding mb-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="settings-subheading mb-0">
              <font-awesome-icon icon="sync-alt" class="me-2" />{{
                $t("watcher.img.heading")
              }}
            </h5>
            <div class="form-check form-switch mb-0">
              <input
                v-model="imgSettings.enabled"
                class="form-check-input"
                type="checkbox"
                id="imgEnabled"
                role="switch"
              />
              <label class="form-check-label" for="imgEnabled">
                <span :class="imgSettings.enabled ? 'text-success' : ''">
                  {{
                    imgSettings.enabled
                      ? $t("watcher.img.enabled")
                      : $t("watcher.img.disabled")
                  }}
                </span>
              </label>
            </div>
          </div>

          <div class="row g-3">
            <!-- Intervalle -->
            <div class="col-lg-3">
              <label class="form-label">{{
                $t("watcher.img.frequency")
              }}</label>
              <select
                v-model.number="imgSettings.intervalHours"
                class="form-select"
              >
                <option :value="1">{{ $t("watcher.img.every1h") }}</option>
                <option :value="3">{{ $t("watcher.img.every3h") }}</option>
                <option :value="6">{{ $t("watcher.img.every6h") }}</option>
                <option :value="12">{{ $t("watcher.img.every12h") }}</option>
                <option :value="24">{{ $t("watcher.img.every24h") }}</option>
              </select>
            </div>

            <!-- Plateforme image -->
            <div class="col-lg-3">
              <label class="form-label">Plateforme image</label>
              <input
                v-model.trim="imgSettings.imagePlatform"
                class="form-control"
                placeholder="auto, linux/amd64, linux/arm64"
              />
              <small class="text-muted">
                Laisser vide pour auto. Utile si Podman/rootless ou ARM détecte
                mal le digest multi-arch.
              </small>
            </div>

            <!-- Actions -->
            <div class="col-12 d-flex gap-2 flex-wrap">
              <button
                class="btn btn-primary"
                @click="saveImgSettings"
                :disabled="saving"
              >
                <span
                  v-if="saving"
                  class="spinner-border spinner-border-sm me-1"
                />
                <font-awesome-icon v-else icon="save" class="me-1" />{{
                  $t("watcher.img.save")
                }}
              </button>
              <button
                class="btn btn-normal"
                @click="runCheck"
                :disabled="running"
              >
                <span
                  v-if="running"
                  class="spinner-border spinner-border-sm me-1"
                />
                <font-awesome-icon v-else icon="play" class="me-1" />{{
                  $t("watcher.img.checkNow")
                }}
              </button>
            </div>
          </div>
        </div>

        <!-- CREDENTIALS -->
        <div class="shadow-box big-padding mb-4">
          <h5 class="settings-subheading mb-3">
            <font-awesome-icon icon="key" class="me-2" />{{
              $t("watcher.creds.heading")
            }}
          </h5>
          <p class="form-text mb-3" v-html="$t('watcher.creds.hint')"></p>

          <div v-if="credentials.length > 0" class="mb-3">
            <div
              v-for="cred in credentials"
              :key="cred.registry"
              class="d-flex align-items-center gap-3 p-2 rounded mb-2"
              style="background: rgba(255, 255, 255, 0.04)"
            >
              <span class="badge bg-secondary">{{ cred.registry }}</span>
              <span class="form-text">{{ cred.username }}</span>
              <span class="form-text">Token : ***</span>
              <button
                class="btn btn-sm btn-outline-danger ms-auto"
                @click="removeCred(cred.registry)"
              >
                <font-awesome-icon icon="trash" />
              </button>
            </div>
          </div>
          <p v-else class="form-text fst-italic">
            {{ $t("watcher.creds.none") }}
          </p>

          <div class="row g-2 align-items-end">
            <div class="col-md-3">
              <label class="form-label small">{{
                $t("watcher.creds.registry")
              }}</label>
              <input
                v-model="newCred.registry"
                type="text"
                class="form-control form-control-sm"
                placeholder="ghcr.io"
              />
            </div>
            <div class="col-md-3">
              <label class="form-label small">{{
                $t("watcher.creds.username")
              }}</label>
              <input
                v-model="newCred.username"
                type="text"
                class="form-control form-control-sm"
                placeholder="monpseudo"
                autocomplete="off"
              />
            </div>
            <div class="col-md-4">
              <label class="form-label small">{{
                $t("watcher.creds.token")
              }}</label>
              <input
                v-model="newCred.token"
                type="password"
                class="form-control form-control-sm"
                placeholder="ghp_xxxxx"
                autocomplete="new-password"
              />
            </div>
            <div class="col-md-2">
              <button
                class="btn btn-sm btn-success w-100"
                @click="addCred"
                :disabled="
                  !newCred.registry || !newCred.username || !newCred.token
                "
              >
                <font-awesome-icon icon="plus" class="me-1" />{{
                  $t("watcher.creds.add")
                }}
              </button>
            </div>
          </div>
        </div>

        <!-- STATUS TABLE -->
        <div class="shadow-box big-padding mb-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="settings-subheading mb-0">
              <font-awesome-icon icon="table" class="me-2" />{{
                $t("watcher.status.heading")
              }}
            </h5>
            <div class="d-flex align-items-center gap-3">
              <small class="form-text"
                >{{ $t("watcher.status.lastCheck") }} :
                {{ lastCheckDisplay }}</small
              >
              <button class="btn btn-sm btn-normal" @click="loadStatus">
                <font-awesome-icon icon="sync" />
              </button>
            </div>
          </div>

          <div
            v-if="imageStatuses.length === 0"
            class="text-center form-text fst-italic py-3"
          >
            {{ $t("watcher.status.noData") }}
          </div>
          <div v-else class="table-responsive">
            <table class="table table-hover mb-0">
              <thead>
                <tr>
                  <th>{{ $t("watcher.status.image") }}</th>
                  <th>{{ $t("watcher.status.state") }}</th>
                  <th>{{ $t("watcher.status.localDigest") }}</th>
                  <th>{{ $t("watcher.status.remoteDigest") }}</th>
                  <th>{{ $t("watcher.status.checkedAt") }}</th>
                  <th
                    :title="$t('watcher.status.autoUpdateHint')"
                    style="white-space: nowrap; min-width: 160px"
                  >
                    {{ $t("watcher.status.autoUpdate") }}
                  </th>
                  <th style="white-space: nowrap; min-width: 130px">
                    {{ $t("watcher.rollback.col") }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <template v-for="group in imagesByStack" :key="group.stack">
                  <tr class="stack-group-header">
                    <td colspan="7">
                      <font-awesome-icon
                        icon="layer-group"
                        class="me-2 opacity-75"
                      />
                      <strong>{{ group.stack }}</strong>
                      <span
                        class="ms-2 text-muted"
                        style="font-size: 0.8rem; font-weight: 400"
                        >{{ group.items.length }} image{{
                          group.items.length > 1 ? "s" : ""
                        }}</span
                      >
                    </td>
                  </tr>
                  <tr v-for="s in group.items" :key="s.stack + s.image">
                    <td>
                      <code>{{ s.image }}</code>
                      <button
                        class="btn btn-sm btn-link p-0 ms-2"
                        style="font-size: 0.75rem; opacity: 0.7"
                        @click="searchImage(s.image)"
                      >
                        {{ $t("watcher.status.searchProject") }}
                      </button>
                    </td>
                    <td>
                      <span
                        v-if="s.error"
                        class="badge bg-danger"
                        :title="s.error"
                      >
                        <font-awesome-icon
                          icon="exclamation-triangle"
                          class="me-1"
                        />{{ $t("watcher.status.error") }}
                      </span>
                      <template v-else-if="s.hasUpdate">
                        <span class="badge bg-warning text-dark d-block mb-1">
                          <font-awesome-icon
                            icon="arrow-circle-up"
                            class="me-1"
                          />{{ $t("watcher.status.updateAvailable") }}
                        </span>
                        <button
                          class="btn btn-xs btn-outline-secondary"
                          style="
                            font-size: 0.7rem;
                            padding: 1px 5px;
                            white-space: nowrap;
                          "
                          :disabled="ignoringKey === `${s.stack}::${s.image}`"
                          @click="ignoreVersion(s)"
                          :title="$t('watcher.status.ignoreVersion')"
                        >
                          <span
                            v-if="ignoringKey === `${s.stack}::${s.image}`"
                            class="spinner-border spinner-border-sm"
                          />
                          <template v-else
                            >⏭
                            {{ $t("watcher.status.ignoreVersion") }}</template
                          >
                        </button>
                      </template>
                      <template v-else-if="s.ignoredDigest">
                        <span class="badge bg-secondary d-block mb-1">
                          ⏭ {{ $t("watcher.status.versionIgnored") }}
                        </span>
                        <button
                          class="btn btn-xs btn-outline-secondary"
                          style="
                            font-size: 0.7rem;
                            padding: 1px 5px;
                            white-space: nowrap;
                          "
                          :disabled="clearingKey === `${s.stack}::${s.image}`"
                          @click="clearIgnoredDigest(s)"
                          :title="$t('watcher.status.clearIgnored')"
                        >
                          <span
                            v-if="clearingKey === `${s.stack}::${s.image}`"
                            class="spinner-border spinner-border-sm"
                          />
                          <template v-else
                            >✕ {{ $t("watcher.status.clearIgnored") }}</template
                          >
                        </button>
                      </template>
                      <span v-else class="badge bg-success">
                        <font-awesome-icon icon="check-circle" class="me-1" />{{
                          $t("watcher.status.upToDate")
                        }}
                      </span>
                    </td>
                    <td>
                      <code class="small">{{
                        s.localDigest ? s.localDigest.slice(7, 19) + "…" : "—"
                      }}</code>
                    </td>
                    <td>
                      <code class="small">{{
                        s.remoteDigest ? s.remoteDigest.slice(7, 19) + "…" : "—"
                      }}</code>
                    </td>
                    <td class="small form-text">
                      {{ s.lastChecked ? fmtDate(s.lastChecked) : "—" }}
                    </td>
                    <td>
                      <div class="au-cell">
                        <select
                          class="form-select form-select-sm au-select"
                          :value="getAutoUpdateMode(s)"
                          @change="
                            setAutoUpdateMode(
                              s,
                              ($event.target as HTMLSelectElement).value as
                                | 'off'
                                | 'ignored'
                                | 'immediate'
                                | 'scheduled',
                            )
                          "
                        >
                          <option value="off">
                            {{ $t("watcher.status.auOff") }}
                          </option>
                          <option value="ignored">
                            🚫 {{ $t("watcher.status.auIgnored") }}
                          </option>
                          <option value="immediate">
                            ⚡ {{ $t("watcher.status.auImmediate") }}
                          </option>
                          <option value="scheduled">
                            🕐 {{ $t("watcher.status.auScheduled") }}
                          </option>
                        </select>
                        <template v-if="getAutoUpdateMode(s) === 'scheduled'">
                          <input
                            type="time"
                            class="form-control form-control-sm au-time"
                            :value="getAutoUpdateTime(s)"
                            @change="
                              setAutoUpdateMode(
                                s,
                                'scheduled',
                                ($event.target as HTMLInputElement).value,
                              )
                            "
                          />
                          <span
                            v-if="isPending(s)"
                            class="au-pending"
                            :title="$t('watcher.status.auPendingHint')"
                            >⏳</span
                          >
                        </template>
                      </div>
                    </td>
                    <!-- ─── Rollback ─── -->
                    <td>
                      <template v-if="rollbackFor(s)">
                        <div class="rollback-cell">
                          <div class="d-flex align-items-center gap-1 mb-1">
                            <span
                              class="rollback-countdown"
                              :title="
                                $t('watcher.rollback.expiresAt') +
                                ' ' +
                                fmtDate(rollbackFor(s)!.expiresAt)
                              "
                            >
                              ⏳ {{ rollbackCountdown(rollbackFor(s)!) }}
                            </span>
                          </div>
                          <div class="d-flex gap-1">
                            <button
                              class="btn btn-xs btn-rollback"
                              :disabled="
                                rollbackingKey === `${s.stack}::${s.image}`
                              "
                              @click="doRollback(s)"
                              :title="$t('watcher.rollback.btnTitle')"
                            >
                              <span
                                v-if="
                                  rollbackingKey === `${s.stack}::${s.image}`
                                "
                                class="spinner-border spinner-border-sm"
                              />
                              <template v-else
                                >↩ {{ $t("watcher.rollback.btn") }}</template
                              >
                            </button>
                            <button
                              class="btn btn-xs btn-outline-secondary"
                              @click="dismissRollback(s)"
                              :title="$t('watcher.rollback.dismiss')"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </template>
                      <span v-else class="form-text">—</span>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
        <!-- ═══ HISTORIQUE AUTO-UPDATES ═══ -->
        <div class="shadow-box big-padding mb-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="settings-subheading mb-0">
              <font-awesome-icon icon="history" class="me-2" />{{
                $t("watcher.updateHistory.heading")
              }}
            </h5>
            <button
              v-if="updateHistory.length > 0"
              class="btn btn-sm btn-outline-danger"
              @click="clearUpdateHistory"
            >
              {{ $t("watcher.updateHistory.clear") }}
            </button>
          </div>
          <div
            v-if="updateHistory.length === 0"
            class="text-center form-text fst-italic py-3"
          >
            {{ $t("watcher.updateHistory.empty") }}
          </div>
          <div v-else class="table-responsive">
            <table class="table table-sm table-borderless mb-0">
              <thead>
                <tr>
                  <th>{{ $t("watcher.updateHistory.date") }}</th>
                  <th>{{ $t("watcher.updateHistory.stack") }}</th>
                  <th>{{ $t("watcher.updateHistory.image") }}</th>
                  <th>{{ $t("watcher.updateHistory.digests") }}</th>
                  <th>{{ $t("watcher.updateHistory.mode") }}</th>
                  <th>{{ $t("watcher.updateHistory.status") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(h, i) in updateHistory" :key="i">
                  <td class="small form-text text-nowrap">
                    {{ fmtDate(h.timestamp) }}
                  </td>
                  <td class="small">
                    <code>{{ h.stack }}</code>
                  </td>
                  <td class="small update-history-image" :title="h.image">
                    {{ h.image }}
                  </td>
                  <td class="small form-text font-monospace text-nowrap">
                    <template v-if="h.oldDigest && h.newDigest">
                      {{ h.oldDigest.slice(7, 19) }} →
                      {{ h.newDigest.slice(7, 19) }}
                    </template>
                    <template v-else-if="h.oldDigest">
                      {{ h.oldDigest.slice(7, 19) }} → —
                    </template>
                    <span v-else class="form-text">—</span>
                  </td>
                  <td>
                    <span
                      class="badge"
                      :class="
                        h.mode === 'immediate' ? 'bg-primary' : 'bg-secondary'
                      "
                    >
                      {{
                        h.mode === "immediate"
                          ? $t("watcher.updateHistory.immediate")
                          : $t("watcher.updateHistory.scheduled")
                      }}
                    </span>
                  </td>
                  <td>
                    <span v-if="h.success" class="badge bg-success">✓ OK</span>
                    <span v-else class="badge bg-danger" :title="h.error"
                      >✗ {{ $t("watcher.status.error") }}</span
                    >
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ═══ TAB: TRIVY ═══ -->
      <div v-show="tab === 'trivy'">
        <div class="shadow-box big-padding mb-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="settings-subheading mb-0">
              <font-awesome-icon icon="bug" class="me-2" />{{
                $t("watcher.trivy.heading")
              }}
            </h5>
            <div class="form-check form-switch mb-0">
              <input
                v-model="trivySettings.enabled"
                class="form-check-input"
                type="checkbox"
                id="trivyEnabled"
                role="switch"
              />
              <label class="form-check-label" for="trivyEnabled">
                <span :class="trivySettings.enabled ? 'text-success' : ''">
                  {{
                    trivySettings.enabled
                      ? $t("watcher.trivy.enabled")
                      : $t("watcher.trivy.disabled")
                  }}
                </span>
              </label>
            </div>
          </div>

          <div class="row g-3">
            <div class="col-lg-2">
              <label class="form-label">{{
                $t("watcher.trivy.interval")
              }}</label>
              <select
                v-model.number="trivySettings.intervalHours"
                class="form-select"
              >
                <option :value="12">12h</option>
                <option :value="24">24h</option>
                <option :value="72">3 days</option>
                <option :value="168">7 days</option>
              </select>
            </div>

            <div class="col-lg-3">
              <label class="form-label">{{
                $t("watcher.trivy.minSeverity")
              }}</label>
              <select
                v-model="trivySettings.minSeverityAlert"
                class="form-select"
              >
                <option value="LOW">{{ $t("watcher.trivy.low") }}</option>
                <option value="MEDIUM">{{ $t("watcher.trivy.medium") }}</option>
                <option value="HIGH">{{ $t("watcher.trivy.high") }}</option>
                <option value="CRITICAL">
                  {{ $t("watcher.trivy.critical") }}
                </option>
              </select>
            </div>

            <div class="col-lg-2">
              <label class="form-label">{{
                $t("watcher.trivy.timeout")
              }}</label>
              <select
                v-model.number="trivySettings.scanTimeoutMinutes"
                class="form-select"
              >
                <option :value="5">5 min</option>
                <option :value="10">10 min</option>
                <option :value="20">20 min</option>
                <option :value="30">30 min</option>
              </select>
            </div>

            <div class="col-12 d-flex gap-4 flex-wrap">
              <div class="form-check">
                <input
                  v-model="trivySettings.ignoreUnfixed"
                  type="checkbox"
                  class="form-check-input"
                  id="ignoreUnfixed"
                />
                <label class="form-check-label" for="ignoreUnfixed">
                  {{ $t("watcher.trivy.ignoreUnfixed") }}
                </label>
              </div>
            </div>

            <div class="col-12">
              <small style="color: #9ca3af">{{
                $t("watcher.trivy.dockerInfo")
              }}</small>
            </div>

            <div class="col-12 d-flex gap-2 flex-wrap">
              <button
                class="btn btn-primary"
                @click="saveTrivySettings"
                :disabled="savingTrivy"
              >
                <span
                  v-if="savingTrivy"
                  class="spinner-border spinner-border-sm me-1"
                />
                <font-awesome-icon v-else icon="save" class="me-1" />{{
                  $t("watcher.trivy.save")
                }}
              </button>
              <button
                class="btn btn-warning"
                @click="runScanAndRefresh()"
                :disabled="scanning"
              >
                <span
                  v-if="scanning"
                  class="spinner-border spinner-border-sm me-1"
                />
                <font-awesome-icon v-else icon="shield-alt" class="me-1" />{{
                  $t("watcher.trivy.scanNow")
                }}
              </button>
            </div>
          </div>
        </div>

        <!-- TRIVY — CVEs ignorés -->
        <div
          v-if="trivySettings.ignoredCVEs?.length"
          class="shadow-box big-padding mb-4"
        >
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="settings-subheading mb-0">
              <span class="me-2" style="opacity: 0.7">⊘</span
              >{{ $t("watcher.trivy.ignoredCVEs") }}
              <span class="badge bg-secondary ms-2" style="font-size: 0.7rem">{{
                trivySettings.ignoredCVEs.length
              }}</span>
            </h5>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <div
              v-for="cveId in trivySettings.ignoredCVEs"
              :key="cveId"
              class="d-flex align-items-center gap-1 badge-cve-ignored"
            >
              <span class="cve-ignored-id">{{ cveId }}</span>
              <button
                class="btn-cve-clear"
                :disabled="clearingCVE === cveId"
                :title="$t('watcher.trivy.clearCVE')"
                @click="clearIgnoredCVE(cveId)"
              >
                <span
                  v-if="clearingCVE === cveId"
                  class="spinner-border spinner-border-sm"
                  style="width: 0.6rem; height: 0.6rem"
                />
                <template v-else>✕</template>
              </button>
            </div>
          </div>
          <p class="form-text mt-2 mb-0" style="font-size: 0.75rem">
            {{ $t("watcher.trivy.ignoredCVEsHint") }}
          </p>
        </div>

        <!-- TRIVY STATUS -->
        <div class="shadow-box big-padding mb-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="settings-subheading mb-0">
              <font-awesome-icon icon="shield-alt" class="me-2" />{{
                $t("watcher.trivy.status.heading")
              }}
            </h5>
            <div class="d-flex align-items-center gap-3">
              <small v-if="trivyStatus.lastScanAt" class="form-text">
                {{ $t("watcher.trivy.status.lastScan") }} :
                {{ fmtDate(trivyStatus.lastScanAt) }}
              </small>
              <small v-if="nextTrivyDate" class="form-text">
                {{ $t("watcher.trivy.nextScan") }} :
                {{ fmtDate(nextTrivyDate) }}
              </small>
              <button class="btn btn-sm btn-normal" @click="loadTrivyStatus">
                <font-awesome-icon icon="sync" />
              </button>
            </div>
          </div>

          <div v-if="trivyStatus.running" class="text-center py-3 text-warning">
            <span class="spinner-border spinner-border-sm me-2" />
            {{ $t("watcher.trivy.status.running") }}
          </div>
          <div
            v-else-if="!trivyStatus.lastScanAt"
            class="text-center form-text fst-italic py-3"
          >
            {{ $t("watcher.trivy.status.never") }}
          </div>
          <div v-else class="table-responsive">
            <table class="table mb-0">
              <thead>
                <tr>
                  <th>{{ $t("watcher.trivy.status.image") }}</th>
                  <th>{{ $t("watcher.trivy.status.maxSeverity") }}</th>
                  <th>{{ $t("watcher.trivy.status.vulns") }}</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="group in trivyByStack" :key="group.stack">
                  <tr class="stack-group-header">
                    <td colspan="5">
                      <font-awesome-icon
                        icon="layer-group"
                        class="me-2 opacity-75"
                      />
                      <strong>{{ group.stack }}</strong>
                      <span
                        class="ms-2 text-muted"
                        style="font-size: 0.8rem; font-weight: 400"
                        >{{ group.items.length }} image{{
                          group.items.length > 1 ? "s" : ""
                        }}</span
                      >
                    </td>
                  </tr>
                  <template v-for="r in group.items" :key="r.image + r.stack">
                    <tr
                      class="trivy-row"
                      @click="toggleTrivyDetail(r.image + r.stack)"
                    >
                      <td>
                        <code class="small">{{ r.image }}</code>
                      </td>
                      <td>
                        <span
                          v-if="r.error"
                          class="badge bg-danger"
                          :title="r.error"
                        >
                          <font-awesome-icon
                            icon="exclamation-triangle"
                            class="me-1"
                          />Erreur
                        </span>
                        <span
                          v-else-if="
                            r.maxSeverity === 'UNKNOWN' &&
                            !r.counts?.CRITICAL &&
                            !r.counts?.HIGH &&
                            !r.counts?.MEDIUM &&
                            !r.counts?.LOW
                          "
                          class="badge bg-success"
                        >
                          <font-awesome-icon
                            icon="check-circle"
                            class="me-1"
                          />{{ $t("watcher.trivy.status.ok") }}
                        </span>
                        <span
                          v-else
                          class="badge"
                          :class="{
                            'bg-danger': r.maxSeverity === 'CRITICAL',
                            'bg-warning text-dark': r.maxSeverity === 'HIGH',
                            'bg-primary': r.maxSeverity === 'MEDIUM',
                            'bg-info text-dark': r.maxSeverity === 'LOW',
                            'bg-secondary': r.maxSeverity === 'UNKNOWN',
                          }"
                        >
                          {{ r.maxSeverity }}
                        </span>
                      </td>
                      <td class="small">
                        <span v-if="r.counts">
                          <span v-if="r.counts.CRITICAL" class="me-2"
                            >🔴 {{ r.counts.CRITICAL }}</span
                          >
                          <span v-if="r.counts.HIGH" class="me-2"
                            >🟠 {{ r.counts.HIGH }}</span
                          >
                          <span v-if="r.counts.MEDIUM" class="me-2"
                            >🟡 {{ r.counts.MEDIUM }}</span
                          >
                          <span v-if="r.counts.LOW" class="me-2"
                            >🔵 {{ r.counts.LOW }}</span
                          >
                          <span
                            v-if="
                              !r.counts.CRITICAL &&
                              !r.counts.HIGH &&
                              !r.counts.MEDIUM &&
                              !r.counts.LOW
                            "
                            class="text-muted"
                            >—</span
                          >
                        </span>
                      </td>
                      <td class="text-end" style="width: 36px" @click.stop>
                        <button
                          class="btn btn-xs btn-outline-secondary"
                          style="font-size: 0.7rem; padding: 1px 5px"
                          :disabled="scanning"
                          :title="`Scanner ${r.image}`"
                          @click="runScanSingle(r.image)"
                        >
                          <font-awesome-icon icon="shield-alt" />
                        </button>
                      </td>
                      <td class="text-end pe-2" style="width: 30px">
                        <font-awesome-icon
                          :icon="
                            expandedTrivyImage === r.image + r.stack
                              ? 'chevron-up'
                              : 'chevron-down'
                          "
                          class="text-muted small"
                        />
                      </td>
                    </tr>
                    <tr
                      v-if="expandedTrivyImage === r.image + r.stack"
                      class="trivy-detail-row"
                    >
                      <td colspan="6" class="p-0">
                        <div class="trivy-detail-panel">
                          <div
                            v-if="
                              !fullResultFor(r.image, r.stack)?.vulns?.length
                            "
                            class="fst-italic text-muted p-2"
                          >
                            Aucune vulnérabilité au-dessus du seuil.
                          </div>
                          <table
                            v-else
                            class="table table-sm mb-0 trivy-vuln-table"
                            style="font-size: 0.8rem"
                          >
                            <thead>
                              <tr>
                                <th>CVE</th>
                                <th>Package</th>
                                <th>
                                  {{ $t("watcher.trivy.installedVersion") }}
                                </th>
                                <th>{{ $t("watcher.trivy.fixAvailable") }}</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr
                                v-for="v in (
                                  fullResultFor(r.image, r.stack)?.vulns ?? []
                                ).filter((v) => !ignoredCVEsSet.has(v.id))"
                                :key="v.id + v.pkg"
                              >
                                <td>
                                  <a
                                    :href="v.url"
                                    target="_blank"
                                    rel="noopener"
                                    class="cve-link"
                                    :class="`cve-${v.severity.toLowerCase()}`"
                                  >
                                    {{ v.id }}
                                  </a>
                                </td>
                                <td>
                                  <code class="small">{{ v.pkg }}</code>
                                </td>
                                <td>
                                  <code class="small">{{ v.installed }}</code>
                                </td>
                                <td>
                                  <span
                                    v-if="v.fixed"
                                    class="text-success small"
                                    >{{ v.fixed }}</span
                                  >
                                  <span
                                    v-else
                                    class="text-muted small fst-italic"
                                    >—</span
                                  >
                                </td>
                                <td
                                  class="text-end"
                                  style="width: 32px"
                                  @click.stop
                                >
                                  <button
                                    class="btn btn-xs btn-outline-secondary"
                                    style="
                                      font-size: 0.65rem;
                                      padding: 1px 4px;
                                      opacity: 0.6;
                                    "
                                    :disabled="ignoringCVE === v.id"
                                    :title="$t('watcher.trivy.ignoreCVE')"
                                    @click="ignoreCVE(v.id)"
                                  >
                                    <span
                                      v-if="ignoringCVE === v.id"
                                      class="spinner-border spinner-border-sm"
                                    />
                                    <template v-else>⊘</template>
                                  </button>
                                </td>
                              </tr>
                              <!-- Footer : CVEs ignorés pour cette image -->
                              <tr
                                v-if="
                                  (
                                    fullResultFor(r.image, r.stack)?.vulns ?? []
                                  ).some((v) => ignoredCVEsSet.has(v.id))
                                "
                              >
                                <td
                                  colspan="5"
                                  class="text-muted fst-italic"
                                  style="
                                    font-size: 0.73rem;
                                    padding: 0.25rem 0.5rem;
                                    border-bottom: none;
                                  "
                                >
                                  ⊘
                                  {{
                                    $t("watcher.trivy.ignoredCount", {
                                      count: (
                                        fullResultFor(r.image, r.stack)
                                          ?.vulns ?? []
                                      ).filter((v) => ignoredCVEsSet.has(v.id))
                                        .length,
                                    })
                                  }}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </template>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ═══ TAB: BACKUP ═══ -->
      <BackupTab v-show="tab === 'backup'" />

      <!-- ═══ TAB: RESOURCES ═══ -->
      <div v-if="tab === 'resources'">
        <DockerResources :externalLang="watcherLang" />
      </div>

      <!-- ═══ TAB: NOTIFICATIONS ═══ -->
      <div v-show="tab === 'notifications'">
        <!-- Apprise -->
        <div class="shadow-box big-padding mb-4">
          <div class="d-flex align-items-center gap-2 mb-3">
            <font-awesome-icon icon="bell" />
            <h5 class="settings-subheading mb-0">
              <a
                href="https://github.com/caronc/apprise"
                target="_blank"
                rel="noopener"
                class="apprise-link"
                >Apprise</a
              >
            </h5>
            <small class="form-text ms-2">{{
              $t("watcher.apprise.global")
            }}</small>
          </div>
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label small">{{
                $t("watcher.apprise.serverUrl")
              }}</label>
              <input
                v-model="appriseSettings.serverUrl"
                type="url"
                class="form-control form-control-sm"
                :placeholder="$t('watcher.apprise.serverUrlPlaceholder')"
                autocomplete="off"
              />
            </div>
            <div class="col-12">
              <label class="form-label small">{{
                $t("watcher.apprise.urls")
              }}</label>
              <div
                v-for="(url, idx) in appriseSettings.urls"
                :key="idx"
                class="d-flex align-items-center gap-2 mb-2"
              >
                <span
                  class="form-control form-control-sm text-truncate"
                  style="font-family: monospace; font-size: 0.78rem"
                >
                  {{ url }}
                </span>
                <button
                  class="btn btn-sm btn-outline-danger"
                  @click="removeAppriseUrl(idx)"
                >
                  <font-awesome-icon icon="trash" />
                </button>
              </div>
              <p
                v-if="!appriseSettings.urls.length"
                class="form-text fst-italic mb-2"
              >
                {{ $t("watcher.apprise.noUrl") }}
              </p>
              <div class="input-group">
                <input
                  v-model="newAppriseUrl"
                  type="text"
                  class="form-control form-control-sm"
                  :placeholder="$t('watcher.apprise.urlPlaceholder')"
                  autocomplete="off"
                />
                <button
                  class="btn btn-sm btn-success"
                  @click="addAppriseUrl"
                  :disabled="!newAppriseUrl"
                >
                  <font-awesome-icon icon="plus" class="me-1" />{{
                    $t("watcher.apprise.addUrl")
                  }}
                </button>
              </div>
            </div>
            <div class="col-12 d-flex gap-2 flex-wrap">
              <button
                class="btn btn-primary btn-sm"
                @click.stop="saveAppriseSettings"
                :disabled="savingApprise"
              >
                <span
                  v-if="savingApprise"
                  class="spinner-border spinner-border-sm me-1"
                />
                <font-awesome-icon v-else icon="save" class="me-1" />{{
                  $t("watcher.apprise.save")
                }}
              </button>
              <button
                class="btn btn-normal btn-sm"
                @click.stop="testApprise"
                :disabled="testingApprise || !appriseSettings.serverUrl"
              >
                <span
                  v-if="testingApprise"
                  class="spinner-border spinner-border-sm me-1"
                />
                <font-awesome-icon v-else icon="paper-plane" class="me-1" />{{
                  $t("watcher.apprise.test")
                }}
              </button>
            </div>
          </div>
        </div>

        <!-- Discord — Images -->
        <div class="shadow-box big-padding mb-4">
          <h5 class="settings-subheading mb-3">
            <font-awesome-icon icon="sync-alt" class="me-2" />{{
              $t("watcher.img.heading")
            }}
            — Discord
          </h5>
          <div
            v-for="(wh, idx) in imgSettings.discordWebhooks ?? []"
            :key="idx"
            class="d-flex align-items-center gap-2 mb-2"
          >
            <span
              class="form-control form-control-sm text-truncate"
              style="font-family: monospace; font-size: 0.78rem"
            >
              {{ wh }}
            </span>
            <button
              class="btn btn-sm btn-normal"
              @click="testWebhook(wh, 'img')"
              :disabled="testingImg"
            >
              <span
                v-if="testingImg"
                class="spinner-border spinner-border-sm"
              />
              <span v-else><font-awesome-icon icon="paper-plane" /></span>
            </button>
            <button
              class="btn btn-sm btn-outline-danger"
              @click="removeImgWebhook(idx)"
            >
              <font-awesome-icon icon="trash" />
            </button>
          </div>
          <p
            v-if="!imgSettings.discordWebhooks?.length"
            class="form-text fst-italic mb-2"
          >
            {{ $t("watcher.img.noWebhook") }}
          </p>
          <div class="input-group mb-2">
            <input
              v-model="imgWebhook"
              type="password"
              class="form-control form-control-sm"
              :placeholder="$t('watcher.img.webhookPlaceholder')"
              autocomplete="off"
            />
            <button
              class="btn btn-sm btn-success"
              @click="addImgWebhook"
              :disabled="!imgWebhook"
            >
              <font-awesome-icon icon="plus" class="me-1" />{{
                $t("watcher.img.addWebhook")
              }}
            </button>
          </div>
          <div class="d-flex align-items-center gap-2">
            <small class="form-text">{{ $t("watcher.notifLang") }}</small>
            <div class="notif-lang-toggle">
              <button
                :class="[
                  'notif-lang-btn',
                  imgSettings.notificationLang !== 'en' && 'active',
                ]"
                @click="imgSettings.notificationLang = 'fr'"
              >
                🇫🇷
              </button>
              <button
                :class="[
                  'notif-lang-btn',
                  imgSettings.notificationLang === 'en' && 'active',
                ]"
                @click="imgSettings.notificationLang = 'en'"
              >
                🇬🇧
              </button>
            </div>
          </div>
        </div>

        <!-- Discord — Security -->
        <div class="shadow-box big-padding mb-4">
          <h5 class="settings-subheading mb-3">
            <font-awesome-icon icon="bug" class="me-2" />{{
              $t("watcher.trivy.heading")
            }}
            — Discord
          </h5>
          <div
            v-for="(wh, idx) in trivySettings.discordWebhooks ?? []"
            :key="idx"
            class="d-flex align-items-center gap-2 mb-2"
          >
            <span
              class="form-control form-control-sm text-truncate"
              style="font-family: monospace; font-size: 0.78rem"
            >
              {{ wh }}
            </span>
            <button
              class="btn btn-sm btn-normal"
              @click="testWebhook(wh, 'trivy')"
              :disabled="testingTrivy"
            >
              <span
                v-if="testingTrivy"
                class="spinner-border spinner-border-sm"
              />
              <span v-else><font-awesome-icon icon="paper-plane" /></span>
            </button>
            <button
              class="btn btn-sm btn-outline-danger"
              @click="removeTrivyWebhook(idx)"
            >
              <font-awesome-icon icon="trash" />
            </button>
          </div>
          <p
            v-if="!trivySettings.discordWebhooks?.length"
            class="form-text fst-italic mb-2"
          >
            {{ $t("watcher.trivy.noWebhook") }}
          </p>
          <div class="input-group mb-2">
            <input
              v-model="trivyWebhook"
              type="password"
              class="form-control form-control-sm"
              :placeholder="$t('watcher.img.webhookPlaceholder')"
              autocomplete="off"
            />
            <button
              class="btn btn-sm btn-success"
              @click="addTrivyWebhook"
              :disabled="!trivyWebhook"
            >
              <font-awesome-icon icon="plus" class="me-1" />{{
                $t("watcher.img.addWebhook")
              }}
            </button>
          </div>
          <div class="d-flex align-items-center gap-2">
            <small class="form-text">{{ $t("watcher.notifLang") }}</small>
            <div class="notif-lang-toggle">
              <button
                :class="[
                  'notif-lang-btn',
                  trivySettings.notificationLang !== 'en' && 'active',
                ]"
                @click="trivySettings.notificationLang = 'fr'"
              >
                🇫🇷
              </button>
              <button
                :class="[
                  'notif-lang-btn',
                  trivySettings.notificationLang === 'en' && 'active',
                ]"
                @click="trivySettings.notificationLang = 'en'"
              >
                🇬🇧
              </button>
            </div>
          </div>
        </div>

        <!-- Discord — Backup -->
        <div class="shadow-box big-padding mb-4">
          <h5 class="settings-subheading mb-3">
            <font-awesome-icon icon="archive" class="me-2" />{{
              $t("watcher.tab.backup")
            }}
            — Discord
          </h5>
          <div
            v-for="(wh, idx) in backupWebhooks"
            :key="idx"
            class="d-flex align-items-center gap-2 mb-2"
          >
            <span
              class="form-control form-control-sm text-truncate"
              style="font-family: monospace; font-size: 0.78rem"
            >
              {{ wh }}
            </span>
            <button
              class="btn btn-sm btn-normal"
              @click="testBackupWebhook(wh)"
              :disabled="backupTestingWh"
            >
              <span
                v-if="backupTestingWh"
                class="spinner-border spinner-border-sm"
              />
              <span v-else><font-awesome-icon icon="paper-plane" /></span>
            </button>
            <button
              class="btn btn-sm btn-outline-danger"
              @click="removeBackupWebhook(idx)"
            >
              <font-awesome-icon icon="trash" />
            </button>
          </div>
          <p v-if="!backupWebhooks.length" class="form-text fst-italic mb-2">
            {{ $t("watcher.backup.noWebhook") }}
          </p>
          <div class="input-group mb-2">
            <input
              v-model="backupNewWebhook"
              type="password"
              class="form-control form-control-sm"
              :placeholder="$t('watcher.img.webhookPlaceholder')"
              autocomplete="off"
            />
            <button
              class="btn btn-sm btn-success"
              @click="addBackupWebhook"
              :disabled="!backupNewWebhook"
            >
              <font-awesome-icon icon="plus" class="me-1" />{{
                $t("watcher.img.addWebhook")
              }}
            </button>
          </div>
          <div class="d-flex align-items-center gap-2 mb-3">
            <small class="form-text">{{ $t("watcher.notifLang") }}</small>
            <div class="notif-lang-toggle">
              <button
                :class="[
                  'notif-lang-btn',
                  backupNotifLang !== 'en' && 'active',
                ]"
                @click="backupNotifLang = 'fr'"
              >
                🇫🇷
              </button>
              <button
                :class="[
                  'notif-lang-btn',
                  backupNotifLang === 'en' && 'active',
                ]"
                @click="backupNotifLang = 'en'"
              >
                🇬🇧
              </button>
            </div>
          </div>
          <button
            class="btn btn-primary btn-sm"
            @click="saveBackupNotif"
            :disabled="savingBackupNotif"
          >
            <span
              v-if="savingBackupNotif"
              class="spinner-border spinner-border-sm me-1"
            />
            <font-awesome-icon v-else icon="save" class="me-1" />{{
              $t("watcher.apprise.save")
            }}
          </button>
        </div>
      </div>

      <!-- ═══ TAB: MONITORING ═══ -->
      <MonitoringTab v-show="tab === 'monitoring'" />
    </div>

    <!-- TOAST -->
    <Transition name="slide-fade">
      <div
        v-if="toast.msg"
        class="toast-float"
        :class="toast.ok ? 'toast-ok' : 'toast-err'"
      >
        {{ toast.msg }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import BackupTab from "./BackupTab.vue";
import DockerResources from "../pages/DockerResources.vue";
import MonitoringTab from "./MonitoringTab.vue";
import { initServerTz, fmtDate } from "../composables/useServerTz";

// ─── Types ────────────────────────────────────────────────────────

interface AppriseSettings {
  serverUrl: string;
  urls: string[];
}
interface Cred {
  registry: string;
  username: string;
  token: string;
}
interface AutoUpdateEntry {
  mode: "immediate" | "scheduled" | "ignored";
  time?: string;
}
interface ImgSettings {
  enabled: boolean;
  intervalHours: number;
  discordWebhooks: string[];
  notificationLang: "fr" | "en";
  autoUpdateConfig: Record<string, AutoUpdateEntry>;
  pendingAutoUpdates: string[];
  imagePlatform: string;
}
interface TrivySettings {
  enabled: boolean;
  intervalHours: number;
  discordWebhooks: string[];
  minSeverityAlert: string;
  ignoreUnfixed: boolean;
  scanTimeoutMinutes: number;
  notificationLang: "fr" | "en";
  ignoredCVEs: string[];
}
interface ImageStatus {
  image: string;
  stack: string;
  localDigest: string;
  remoteDigest: string;
  hasUpdate: boolean;
  lastChecked: string;
  ignoredDigest?: string;
  error?: string;
}

interface RollbackEntry {
  key: string;
  image: string;
  stack: string;
  oldImageId: string;
  updatedAt: string;
  expiresAt: string;
}

interface UpdateHistoryEntry {
  timestamp: string;
  stack: string;
  image: string;
  oldDigest: string;
  newDigest: string;
  mode: "immediate" | "scheduled";
  success: boolean;
  error?: string;
}

interface TrivyScanResult {
  image: string;
  stack: string;
  maxSeverity: string;
  counts: Record<string, number>;
  error?: string;
}

interface TrivyVuln {
  id: string;
  pkg: string;
  installed: string;
  fixed: string;
  severity: string;
  url: string;
  title: string;
}

interface TrivyFullResult {
  image: string;
  stack: string;
  vulns: TrivyVuln[];
  error?: string;
}

interface TrivyStatus {
  running: boolean;
  lastScanAt: string | null;
  scannedCount: number;
  lastResults: TrivyScanResult[];
  lastFullResults: TrivyFullResult[];
}

// ─── State ────────────────────────────────────────────────────────

const { t, locale, setLocaleMessage } = useI18n();

// ─── Gestion de la langue locale à la page watcher ────────────────────
// On lit / écrit dans localStorage.watcherLang (indépendant du reste de l'app)
// mais on met aussi à jour locale de i18n pour que $t() fonctionne.
const SUPPORTED = ["fr", "en"] as const;
type SupportedLang = (typeof SUPPORTED)[number];

function resolveWatcherLang(): SupportedLang {
  const stored = localStorage.getItem("watcherLang") as SupportedLang | null;
  if (stored && SUPPORTED.includes(stored)) return stored;
  const appLocale = (localStorage.getItem("locale") ?? "en").substring(0, 2);
  return appLocale === "fr" ? "fr" : "en";
}

const watcherLang = ref<SupportedLang>(resolveWatcherLang());

async function setWatcherLang(lang: SupportedLang) {
  watcherLang.value = lang;
  localStorage.setItem("watcherLang", lang);
  const mod = await import(`../lang/${lang}.json`);
  setLocaleMessage(lang, mod.default ?? mod);
  locale.value = lang;
}

// Applique la langue initiale au montage
onMounted(async () => {
  await setWatcherLang(watcherLang.value);
});

const tab = ref("images");

const imgSettings = ref<ImgSettings>({
  enabled: false,
  intervalHours: 6,
  discordWebhooks: [],
  notificationLang: "fr",
  autoUpdateConfig: {},
  pendingAutoUpdates: [],
  imagePlatform: "",
});
const imgWebhook = ref("");
const trivySettings = ref<TrivySettings>({
  enabled: false,
  intervalHours: 24,
  discordWebhooks: [],
  minSeverityAlert: "HIGH",
  ignoreUnfixed: false,
  scanTimeoutMinutes: 10,
  notificationLang: "fr",
  ignoredCVEs: [],
});
const trivyWebhook = ref("");
const credentials = ref<Cred[]>([]);
const newCred = ref<Cred>({ registry: "", username: "", token: "" });
const imageStatuses = ref<ImageStatus[]>([]);
const rollbackEntries = ref<RollbackEntry[]>([]);
const updateHistory = ref<UpdateHistoryEntry[]>([]);
const rollbackingKey = ref<string | null>(null);
const ignoringKey = ref<string | null>(null);
const clearingKey = ref<string | null>(null);

const trivyStatus = ref<TrivyStatus>({
  running: false,
  lastScanAt: null,
  scannedCount: 0,
  lastResults: [],
  lastFullResults: [],
});
const expandedTrivyImage = ref<string | null>(null);
const ignoringCVE = ref<string | null>(null);
const clearingCVE = ref<string | null>(null);

const ignoredCVEsSet = computed(
  () => new Set(trivySettings.value.ignoredCVEs ?? []),
);

function toggleTrivyDetail(key: string) {
  expandedTrivyImage.value = expandedTrivyImage.value === key ? null : key;
}
function fullResultFor(
  image: string,
  stack: string,
): TrivyFullResult | undefined {
  return trivyStatus.value.lastFullResults?.find(
    (r) => r.image === image && r.stack === stack,
  );
}
const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "primary",
  LOW: "info",
  UNKNOWN: "secondary",
};

// ─── Recherche DuckDuckGo pour une image ──────────────────────────
function searchImage(image: string): void {
  const noTag = image.replace(/:[\w.-]+$/, "");
  window.open(
    `https://duckduckgo.com/?q=${encodeURIComponent(noTag)}`,
    "_blank",
  );
}

const appriseSettings = ref<AppriseSettings>({ serverUrl: "", urls: [] });
const newAppriseUrl = ref("");
const savingApprise = ref(false);
const testingApprise = ref(false);

const backupWebhooks = ref<string[]>([]);
const backupNewWebhook = ref("");
const backupTestingWh = ref(false);
const backupNotifLang = ref<"fr" | "en">("fr");
const savingBackupNotif = ref(false);

const saving = ref(false);
const savingTrivy = ref(false);
const running = ref(false);
const scanning = ref(false);
const testingImg = ref(false);
const testingTrivy = ref(false);
const toast = ref({ msg: "", ok: true });

let pollTimer: ReturnType<typeof setInterval> | null = null;

const lastCheckDisplay = computed(() => {
  if (!imageStatuses.value.length) return t("watcher.status.never");
  const dates = imageStatuses.value
    .map((s) => new Date(s.lastChecked).getTime())
    .filter(Boolean);
  if (!dates.length) return "—";
  return fmtDate(new Date(Math.max(...dates)));
});

const nextTrivyDate = computed(() => {
  if (!trivySettings.value.enabled || !trivyStatus.value.lastScanAt)
    return null;
  return new Date(
    new Date(trivyStatus.value.lastScanAt).getTime() +
      trivySettings.value.intervalHours * 3_600_000,
  );
});

const imagesByStack = computed(() => {
  const map = new Map<string, ImageStatus[]>();
  for (const s of imageStatuses.value) {
    if (!map.has(s.stack)) map.set(s.stack, []);
    map.get(s.stack)!.push(s);
  }
  return [...map.entries()].map(([stack, items]) => ({ stack, items }));
});

const trivyByStack = computed(() => {
  const map = new Map<string, typeof trivyStatus.value.lastResults>();
  for (const r of trivyStatus.value.lastResults) {
    if (!map.has(r.stack)) map.set(r.stack, []);
    map.get(r.stack)!.push(r);
  }
  return [...map.entries()].map(([stack, items]) => ({ stack, items }));
});

// ─── API ──────────────────────────────────────────────────────────

const API = "/api/watcher";
async function api(method: string, path: string, body?: unknown) {
  const token = localStorage.getItem("token") ?? "";
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function showToast(msg: string, ok = true) {
  toast.value = { msg, ok };
  setTimeout(() => (toast.value.msg = ""), 3500);
}

// ─── Init & polling ───────────────────────────────────────────────

onMounted(async () => {
  await initServerTz(api);
  const [
    imgRes,
    trivyRes,
    statusRes,
    trivyStatusRes,
    rollbackRes,
    backupRes,
    histRes,
  ] = await Promise.all([
    api("GET", "/image/settings"),
    api("GET", "/trivy/settings"),
    api("GET", "/image/status"),
    api("GET", "/trivy/status"),
    api("GET", "/image/rollback"),
    api("GET", "/backup/settings"),
    api("GET", "/image/update-history"),
  ]);
  // Charge la config Apprise depuis les settings image (stockée globalement)
  if (imgRes.ok && imgRes.data) {
    appriseSettings.value = {
      serverUrl: imgRes.data.appriseServerUrl ?? "",
      urls: Array.isArray(imgRes.data.appriseUrls)
        ? imgRes.data.appriseUrls
        : [],
    };
  }
  if (imgRes.ok) {
    imgSettings.value = {
      enabled: imgRes.data.enabled,
      intervalHours: imgRes.data.intervalHours,
      discordWebhooks: imgRes.data.discordWebhooks ?? [],
      notificationLang: imgRes.data.notificationLang ?? "fr",
      autoUpdateConfig: imgRes.data.autoUpdateConfig ?? {},
      pendingAutoUpdates: imgRes.data.pendingAutoUpdates ?? [],
      imagePlatform: imgRes.data.imagePlatform ?? "",
    };
    credentials.value = imgRes.data.credentials ?? [];
  }
  if (trivyRes.ok)
    trivySettings.value = {
      ...trivySettings.value,
      ...trivyRes.data,
      discordWebhooks: Array.isArray(trivyRes.data.discordWebhooks)
        ? trivyRes.data.discordWebhooks
        : trivySettings.value.discordWebhooks,
    };
  if (statusRes.ok) imageStatuses.value = statusRes.data ?? [];
  if (rollbackRes.ok) rollbackEntries.value = rollbackRes.data ?? [];
  if (histRes.ok) updateHistory.value = histRes.data ?? [];
  if (backupRes.ok) {
    backupWebhooks.value = backupRes.data.discordWebhooks ?? [];
    backupNotifLang.value = backupRes.data.notificationLang ?? "fr";
  }
  if (trivyStatusRes.ok)
    trivyStatus.value = {
      ...trivyStatus.value,
      ...trivyStatusRes.data,
      lastResults: trivyStatusRes.data.lastResults ?? [],
      lastFullResults: trivyStatusRes.data.lastFullResults ?? [],
    };
  pollTimer = setInterval(loadStatus, 10000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});

async function loadStatus() {
  const [statusRes, rollbackRes] = await Promise.all([
    api("GET", "/image/status"),
    api("GET", "/image/rollback"),
  ]);
  if (statusRes.ok) imageStatuses.value = statusRes.data;
  if (rollbackRes.ok) rollbackEntries.value = rollbackRes.data;
}

function rollbackFor(s: ImageStatus): RollbackEntry | undefined {
  return rollbackEntries.value.find((r) => r.key === `${s.stack}::${s.image}`);
}

function rollbackCountdown(entry: RollbackEntry): string {
  const ms = new Date(entry.expiresAt).getTime() - Date.now();
  if (ms <= 0) return t("watcher.rollback.expired");
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(
    locale.value === "fr" ? "fr-FR" : "en-GB",
  );
}

async function clearUpdateHistory() {
  await api("DELETE", "/image/update-history");
  updateHistory.value = [];
}

async function doRollback(s: ImageStatus) {
  const key = `${s.stack}::${s.image}`;
  if (
    !confirm(t("watcher.rollback.confirm", { image: s.image, stack: s.stack }))
  )
    return;
  rollbackingKey.value = key;
  try {
    const res = await api("POST", "/image/rollback", { key });
    if (res.ok) {
      showToast(t("watcher.rollback.done", { image: s.image }));
      await loadStatus();
    } else {
      showToast(`❌ ${res.message}`, false);
    }
  } finally {
    rollbackingKey.value = null;
  }
}

async function dismissRollback(s: ImageStatus) {
  const key = `${s.stack}::${s.image}`;
  const res = await api("DELETE", `/image/rollback/${encodeURIComponent(key)}`);
  if (res.ok) {
    rollbackEntries.value = rollbackEntries.value.filter((r) => r.key !== key);
    showToast(t("watcher.rollback.dismissed"));
  }
}

// ─── Actions ──────────────────────────────────────────────────────

function addImgWebhook() {
  const url = imgWebhook.value.trim();
  if (!url || imgSettings.value.discordWebhooks.includes(url)) return;
  imgSettings.value.discordWebhooks.push(url);
  imgWebhook.value = "";
}
function removeImgWebhook(idx: number) {
  imgSettings.value.discordWebhooks.splice(idx, 1);
}
function addTrivyWebhook() {
  const url = trivyWebhook.value.trim();
  if (!url || trivySettings.value.discordWebhooks.includes(url)) return;
  trivySettings.value.discordWebhooks.push(url);
  trivyWebhook.value = "";
}
function removeTrivyWebhook(idx: number) {
  trivySettings.value.discordWebhooks.splice(idx, 1);
}

function addBackupWebhook() {
  const url = backupNewWebhook.value.trim();
  if (!url || backupWebhooks.value.includes(url)) return;
  backupWebhooks.value.push(url);
  backupNewWebhook.value = "";
}
function removeBackupWebhook(idx: number) {
  backupWebhooks.value.splice(idx, 1);
}
async function testBackupWebhook(url: string) {
  backupTestingWh.value = true;
  try {
    const res = await api("POST", "/discord/test", { webhookUrl: url });
    showToast(
      res.ok ? t("watcher.discord.testOk") : t("watcher.discord.testFail"),
      res.ok,
    );
  } finally {
    backupTestingWh.value = false;
  }
}
async function saveBackupNotif() {
  savingBackupNotif.value = true;
  try {
    const res = await api("POST", "/backup/settings", {
      discordWebhooks: backupWebhooks.value,
      notificationLang: backupNotifLang.value,
    });
    showToast(res.ok ? t("watcher.backup.saved") : `❌ ${res.message}`, res.ok);
  } finally {
    savingBackupNotif.value = false;
  }
}

async function saveImgSettings() {
  saving.value = true;
  try {
    const res = await api("POST", "/image/settings", { ...imgSettings.value });
    showToast(res.ok ? t("watcher.img.saved") : `❌ ${res.message}`, res.ok);
  } finally {
    saving.value = false;
  }
}

async function saveTrivySettings() {
  savingTrivy.value = true;
  try {
    const res = await api("POST", "/trivy/settings", {
      ...trivySettings.value,
    });
    showToast(res.ok ? t("watcher.trivy.saved") : `❌ ${res.message}`, res.ok);
  } finally {
    savingTrivy.value = false;
  }
}

async function runCheck() {
  running.value = true;
  try {
    await api("POST", "/image/run");
    showToast(t("watcher.img.checking"));
  } finally {
    running.value = false;
  }
}

async function loadTrivyStatus() {
  const res = await api("GET", "/trivy/status");
  if (res.ok)
    trivyStatus.value = {
      ...trivyStatus.value,
      ...res.data,
      lastResults: res.data.lastResults ?? [],
      lastFullResults: res.data.lastFullResults ?? [],
    };
}

async function runScan(image?: string) {
  scanning.value = true;
  try {
    await api("POST", "/trivy/run", image ? { image } : {});
    showToast(t("watcher.trivy.scanning"));
  } finally {
    scanning.value = false;
  }
}

async function runScanSingle(image: string) {
  await runScan(image);
  let attempts = 0;
  const poll = setInterval(async () => {
    await loadTrivyStatus();
    attempts++;
    if (!trivyStatus.value.running || attempts >= 40) clearInterval(poll);
  }, 3000);
}

async function runScanAndRefresh(image?: string) {
  await runScan(image);
  // Polling du statut toutes les 3s pendant 2 minutes max
  let attempts = 0;
  const poll = setInterval(async () => {
    await loadTrivyStatus();
    attempts++;
    if (!trivyStatus.value.running || attempts >= 40) clearInterval(poll);
  }, 3000);
}

async function testWebhook(url: string, context: "img" | "trivy") {
  if (context === "img") testingImg.value = true;
  else testingTrivy.value = true;
  try {
    const res = await api("POST", "/discord/test", { webhookUrl: url });
    showToast(
      res.ok ? t("watcher.discord.testOk") : t("watcher.discord.testFail"),
      res.ok,
    );
  } finally {
    if (context === "img") testingImg.value = false;
    else testingTrivy.value = false;
  }
}

// ─── Apprise ─────────────────────────────────────────────────────

function addAppriseUrl() {
  const url = newAppriseUrl.value.trim();
  if (!url || appriseSettings.value.urls.includes(url)) return;
  appriseSettings.value.urls.push(url);
  newAppriseUrl.value = "";
}
function removeAppriseUrl(idx: number) {
  appriseSettings.value.urls.splice(idx, 1);
}
async function saveAppriseSettings() {
  savingApprise.value = true;
  try {
    // Mise à jour partielle : le backend merge avec les settings existants
    const res = await api("POST", "/image/settings", {
      appriseServerUrl: appriseSettings.value.serverUrl,
      appriseUrls: appriseSettings.value.urls,
    });
    showToast(
      res.ok ? t("watcher.apprise.saved") : `❌ ${res.message}`,
      res.ok,
    );
  } finally {
    savingApprise.value = false;
  }
}
async function testApprise() {
  testingApprise.value = true;
  try {
    const res = await api("POST", "/apprise/test", {
      serverUrl: appriseSettings.value.serverUrl,
      urls: appriseSettings.value.urls,
    });
    showToast(
      res.ok ? t("watcher.apprise.testOk") : t("watcher.apprise.testFail"),
      res.ok,
    );
  } finally {
    testingApprise.value = false;
  }
}

async function addCred() {
  const res = await api("POST", "/image/credentials", { ...newCred.value });
  if (res.ok) {
    credentials.value = credentials.value
      .filter((c) => c.registry !== newCred.value.registry)
      .concat({ ...newCred.value, token: "***" });
    newCred.value = { registry: "", username: "", token: "" };
    showToast(t("watcher.creds.added"));
  } else {
    showToast(`❌ ${res.message}`, false);
  }
}

function getAutoUpdateMode(
  s: ImageStatus,
): "off" | "ignored" | "immediate" | "scheduled" {
  const cfg = imgSettings.value.autoUpdateConfig[`${s.stack}::${s.image}`];
  return cfg?.mode ?? "off";
}
function getAutoUpdateTime(s: ImageStatus): string {
  return (
    imgSettings.value.autoUpdateConfig[`${s.stack}::${s.image}`]?.time ??
    "02:00"
  );
}
function isPending(s: ImageStatus): boolean {
  return imgSettings.value.pendingAutoUpdates.includes(
    `${s.stack}::${s.image}`,
  );
}

async function ignoreVersion(s: ImageStatus) {
  const key = `${s.stack}::${s.image}`;
  ignoringKey.value = key;
  try {
    const res = await api("POST", "/image/ignore-digest", {
      key,
      digest: s.remoteDigest,
    });
    if (res.ok) {
      const idx = imageStatuses.value.findIndex(
        (x) => x.stack === s.stack && x.image === s.image,
      );
      if (idx !== -1) {
        imageStatuses.value[idx] = {
          ...imageStatuses.value[idx],
          hasUpdate: false,
          ignoredDigest: s.remoteDigest,
        };
      }
      showToast(t("watcher.status.ignoreVersionDone"));
    } else {
      showToast(`❌ ${res.message}`, false);
    }
  } finally {
    ignoringKey.value = null;
  }
}

async function clearIgnoredDigest(s: ImageStatus) {
  const key = `${s.stack}::${s.image}`;
  clearingKey.value = key;
  try {
    const res = await api("DELETE", "/image/ignore-digest", { key });
    if (res.ok) {
      const idx = imageStatuses.value.findIndex(
        (x) => x.stack === s.stack && x.image === s.image,
      );
      if (idx !== -1) {
        const { ignoredDigest: _, ...rest } = imageStatuses.value[idx];
        imageStatuses.value[idx] = {
          ...rest,
          hasUpdate: rest.localDigest !== rest.remoteDigest,
        };
      }
      showToast(t("watcher.status.clearIgnoredDone"));
    } else {
      showToast(`❌ ${res.message}`, false);
    }
  } finally {
    clearingKey.value = null;
  }
}

async function ignoreCVE(cveId: string) {
  ignoringCVE.value = cveId;
  try {
    const res = await api("POST", "/trivy/ignore-cve", { cveId });
    if (res.ok) {
      if (!trivySettings.value.ignoredCVEs)
        trivySettings.value.ignoredCVEs = [];
      if (!trivySettings.value.ignoredCVEs.includes(cveId)) {
        trivySettings.value.ignoredCVEs = [
          ...trivySettings.value.ignoredCVEs,
          cveId,
        ];
      }
      showToast(t("watcher.trivy.ignoreCVEDone"));
    } else {
      showToast(`❌ ${res.message}`, false);
    }
  } finally {
    ignoringCVE.value = null;
  }
}

async function clearIgnoredCVE(cveId: string) {
  clearingCVE.value = cveId;
  try {
    const res = await api("DELETE", "/trivy/ignore-cve", { cveId });
    if (res.ok) {
      trivySettings.value.ignoredCVEs = (
        trivySettings.value.ignoredCVEs ?? []
      ).filter((id) => id !== cveId);
      showToast(t("watcher.trivy.clearCVEDone"));
    } else {
      showToast(`❌ ${res.message}`, false);
    }
  } finally {
    clearingCVE.value = null;
  }
}

async function setAutoUpdateMode(
  s: ImageStatus,
  mode: "off" | "ignored" | "immediate" | "scheduled",
  time?: string,
) {
  const key = `${s.stack}::${s.image}`;
  const body: Record<string, unknown> = { key, mode };
  if (mode === "scheduled") body.time = time ?? getAutoUpdateTime(s);
  const res = await api("POST", "/image/auto-update", body);
  if (res.ok) {
    if (mode === "off") {
      delete imgSettings.value.autoUpdateConfig[key];
      imgSettings.value.pendingAutoUpdates =
        imgSettings.value.pendingAutoUpdates.filter((k) => k !== key);
    } else {
      imgSettings.value.autoUpdateConfig[key] =
        mode === "scheduled" ? { mode, time: body.time as string } : { mode };
    }
    showToast(t("watcher.status.autoUpdateSaved"));
  } else {
    showToast(`❌ ${res.message}`, false);
  }
}

async function removeCred(registry: string) {
  try {
    const res = await api(
      "DELETE",
      `/image/credentials/${encodeURIComponent(registry)}`,
    );
    if (res.ok) {
      credentials.value = credentials.value.filter(
        (c) => c.registry !== registry,
      );
      showToast(t("watcher.creds.removed"));
    } else {
      showToast(`❌ ${res.message ?? "Erreur lors de la suppression"}`, false);
    }
  } catch {
    showToast("❌ Erreur réseau lors de la suppression", false);
  }
}
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

// Tables État des images + Résultats du dernier scan
.table-responsive .table {
  --bs-table-bg: transparent;
  --bs-table-color: #e5e7eb;

  > thead > tr > th {
    color: #9ca3af;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }

  > tbody > tr > td {
    color: #e5e7eb;
    border-bottom-color: rgba(255, 255, 255, 0.06);
  }

  // "Voir le projet →" : btn-link force $link-color:#111, on l'écrase
  .btn-link {
    color: $primary;
    &:hover {
      color: lighten(#74c2ff, 10%);
    }
  }
}

// ─── Rollback ─────────────────────────────────────────────────────
.rollback-cell {
  min-width: 120px;
}
.rollback-countdown {
  font-size: 0.72rem;
  font-family: monospace;
  color: #f59e0b;
  cursor: default;
}
.btn-xs {
  padding: 2px 7px;
  font-size: 0.72rem;
  line-height: 1.4;
  border-radius: 4px;
}
.btn-rollback {
  background: rgba(251, 191, 36, 0.15);
  border: 1px solid rgba(251, 191, 36, 0.4);
  color: #fbbf24;
  &:hover:not(:disabled) {
    background: rgba(251, 191, 36, 0.28);
  }
  &:disabled {
    opacity: 0.5;
  }
}

// Panneau CVE Trivy (hors table-responsive)
.trivy-detail-panel .table {
  --bs-table-bg: transparent;
  --bs-table-color: #e5e7eb;

  > :not(caption) > * > * {
    color: #e5e7eb;
  }

  > thead > tr > th {
    color: #9ca3af;
    font-weight: 500;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }

  > tbody > tr > td {
    border-bottom-color: rgba(255, 255, 255, 0.06);
  }
}

.trivy-row {
  cursor: pointer;
  &:hover {
    background: rgba(255, 255, 255, 0.04);
  }
}

.stack-group-header {
  td {
    background: rgba(255, 255, 255, 0.05);
    border-top: 2px solid rgba(255, 255, 255, 0.1);
    padding: 0.45rem 0.75rem;
    font-size: 0.85rem;
    letter-spacing: 0.02em;
    color: #d1d5db;
  }
  &:first-child td {
    border-top-color: transparent;
  }
}

.trivy-detail-row td {
  padding: 0 !important;
}

.trivy-detail-panel {
  background: rgba(0, 0, 0, 0.15);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.cve-link {
  font-family: monospace;
  font-size: 0.78rem;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
  &.cve-critical {
    color: #ef4444;
  }
  &.cve-high {
    color: #f97316;
  }
  &.cve-medium {
    color: #f59e0b;
  }
  &.cve-low {
    color: #3b82f6;
  }
  &.cve-unknown {
    color: #9ca3af;
  }
}

// ─── CVE ignorés ─────────────────────────────────────────────────
.badge-cve-ignored {
  background: rgba(107, 114, 128, 0.18);
  border: 1px solid rgba(107, 114, 128, 0.35);
  border-radius: 5px;
  padding: 2px 7px 2px 8px;
}
.cve-ignored-id {
  font-family: monospace;
  font-size: 0.78rem;
  color: #9ca3af;
}
.btn-cve-clear {
  background: none;
  border: none;
  padding: 0 0 0 4px;
  font-size: 0.7rem;
  color: #6b7280;
  cursor: pointer;
  line-height: 1;
  &:hover:not(:disabled) {
    color: #ef4444;
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.apprise-link {
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
}

.form-control::placeholder,
.form-control-sm::placeholder {
  color: #9ca3af !important;
  opacity: 1;
}

// ─── Onglets ─────────────────────────────────────────────────────
.watcher-tab-bar {
  display: flex;
  gap: 6px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  padding: 5px;
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.watcher-tab {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #9ca3af;
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    box-shadow 0.15s;

  .watcher-tab-icon {
    font-size: 0.9rem;
  }

  &:hover:not(.active) {
    background: rgba(255, 255, 255, 0.06);
    color: #d1d5db;
  }

  &.active {
    background: rgba(116, 194, 255, 0.15);
    color: #74c2ff;
    box-shadow: 0 0 0 1px rgba(116, 194, 255, 0.25);
  }
}

.shadow-box-settings {
  padding: 20px;
  min-height: calc(100vh - 155px);
}

.lang-toggle {
  display: flex;
  gap: 0.35rem;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 50rem;
  padding: 3px 5px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.lang-btn {
  background: none;
  border: none;
  font-size: 1.15rem;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 50rem;
  cursor: pointer;
  opacity: 0.45;
  transition:
    opacity 0.15s,
    background 0.15s;
  &:hover {
    opacity: 0.8;
  }
  &.active {
    opacity: 1;
    background: rgba(255, 255, 255, 0.12);
  }
}

// Toggle langue notifications Discord (plus petit que le lang-toggle principal)
.notif-lang-toggle {
  display: inline-flex;
  gap: 2px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 50rem;
  padding: 2px 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.notif-lang-btn {
  background: none;
  border: none;
  font-size: 0.9rem;
  line-height: 1;
  padding: 1px 4px;
  border-radius: 50rem;
  cursor: pointer;
  opacity: 0.4;
  transition:
    opacity 0.15s,
    background 0.15s;
  &:hover {
    opacity: 0.75;
  }
  &.active {
    opacity: 1;
    background: rgba(255, 255, 255, 0.1);
  }
}

.settings-subheading {
  font-size: 1.1rem;
  font-weight: 600;
}

.au-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}
.au-select {
  width: auto;
  min-width: 120px;
  font-size: 0.78rem;
  padding: 2px 6px;
}
.au-time {
  width: 90px;
  font-size: 0.78rem;
  padding: 2px 4px;
}
.au-pending {
  font-size: 0.85rem;
  opacity: 0.75;
  cursor: default;
}

.update-history-image {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table th {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.55;
  border-bottom-color: $dark-border-color;
}

.table td {
  vertical-align: middle;
  border-bottom-color: $dark-border-color;
}

// Toast
.toast-float {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 9999;
  padding: 0.65rem 1.25rem;
  border-radius: 50rem;
  font-size: 0.875rem;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.toast-ok {
  background: #166534;
  color: #bbf7d0;
  border: 1px solid #15803d;
}

.toast-err {
  background: #7f1d1d;
  color: #fecaca;
  border: 1px solid #b91c1c;
}
</style>
