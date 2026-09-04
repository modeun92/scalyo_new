<template>
  <div class="kb">
    <!-- TOOLBAR -->
    <div class="kpis_builder_toolbar">
      <router-link to="/app/kpis" class="kpis_builder_back">← {{ t('back') }}</router-link>
      <span class="kpis_builder_title_display">{{ copil?.title || t('copil_cover_title') }}</span>
      <div class="kpis_builder_toolbar_right">
        <router-link v-if="copilId" :to="'/app/kpis/' + copilId + '/preview'" class="tb_button">{{ t('copil_preview') }}</router-link>
        <router-link v-if="copilId" :to="'/app/kpis/' + copilId + '/present'" class="tb_button">{{ t('copil_present') }}</router-link>
        <button v-if="copilId" class="tb_button" :disabled="exporting" @click="exportPptx">{{ exporting ? '…' : '⬇ ' + t('copil_export_pptx') }}</button>
        <span v-if="saved" class="tb_saved">✓ {{ t('copil_saved') }}</span>
      </div>
    </div>

    <div class="kpis_builder_layout" :class="{ 'drawer_open': drawerOpen, 'panel_open': !!activeBlock }">
      <!-- G9-11: below 1024 px the catalog is a drawer opened by "+ Block", the inspector a side panel -->
      <button type="button" class="kpis_builder_drawer_toggle" @click="drawerOpen = !drawerOpen">{{ drawerOpen ? t('copil_close_panel') : t('copil_add_block_cta') }}</button>
      <div v-if="drawerOpen || activeBlock" class="kpis_builder_scrim" @click="closePanels" />
      <!-- SIDEBAR: Block types -->
      <aside class="kpis_builder_sidebar">
        <button class="kpis_builder_metric_button" @click="showMetricWizard = true">✨ {{ t('copil_mw_title') }}</button>
        <h3>{{ t('copil_add_block') }}</h3>
        <div v-for="group in blockGroups" :key="group.title" class="kpis_builder_group">
          <span class="kpis_builder_group_title">{{ group.title }}</span>
          <button v-for="bt in group.items" :key="bt.type" class="kpis_builder_block_button" @click="addBlock(bt.type)">
            <span class="kpis_builder_block_icon">{{ bt.icon }}</span>
            <span>{{ t('copil_bt_' + bt.type) }}</span>
          </button>
        </div>
      </aside>

      <!-- CANVAS -->
      <main class="kpis_builder_canvas">
        <!-- Cover meta -->
        <div class="kpis_builder_cover">
          <div class="kpis_builder_cover_row">
            <div class="field_group full"><label>{{ t('copil_cover_title') }}</label><input v-model="meta.title" class="field_input" @input="saveMeta" /></div>
          </div>
          <div class="kpis_builder_cover_row">
            <div class="field_group"><label>{{ t('copil_cover_subtitle') }}</label><input v-model="meta.subtitle" class="field_input" @input="saveMeta" /></div>
            <div class="field_group">
              <label>{{ t('copil_cover_client') }}</label>
              <select v-model="meta.clientId" class="field_input" @change="onClientPick">
                <option :value="null">{{ t('copil_client_free') }}</option>
                <option v-for="cl in clientStore.clients" :key="cl.id" :value="cl.id">{{ cl.name }}</option>
              </select>
              <input v-if="!meta.clientId" v-model="meta.clientName" class="field_input kpis_builder_client_free" :placeholder="t('copil_cover_client')" @input="saveMeta" />
            </div>
          </div>
          <div class="kpis_builder_cover_row">
            <div class="field_group"><label>{{ t('copil_cover_period') }}</label><input v-model="meta.period" class="field_input" @input="saveMeta" /></div>
            <div class="field_group"><label>{{ t('copil_cover_presenter') }}</label><input v-model="meta.presenter" class="field_input" @input="saveMeta" /></div>
            <div class="field_group small"><label>{{ t('copil_cover_lang') }}</label>
              <select v-model="meta.lang" class="field_input" @change="saveMeta"><option v-for="l in DECK_LANGS" :key="l" :value="l">{{ t('copil_lang_' + l) }}</option></select>
            </div>
            <div class="field_group small"><label>{{ t('copil_cover_color') }}</label>
              <div class="color_row"><button v-for="c in colors" :key="c" type="button" class="cpick" :class="{ active: meta.color === c }" :style="{ background: c }" @click="meta.color = c; saveMeta()" /></div>
            </div>
          </div>
        </div>

        <!-- Blocks (G9-14: boundary = a block that crashes does not take the whole builder down) -->
        <ErrorBoundary>
        <div v-if="copil?.blocks?.length" class="kpis_builder_blocks">
          <div v-for="(block, i) in copil.blocks" :key="block.id" class="kpis_builder_block" :class="{ selected: selectedBlock === block.id, hidden: !block.visible }" @click="selectedBlock = block.id" draggable="true" @dragstart="onDragStart($event, i)" @dragover.prevent="onDragOver($event, i)" @dragend="onDragEnd" @drop.prevent="onDrop(i)">
            <div class="kpis_builder_block_header">
              <span class="kpis_builder_block_drag" title="Drag">⠿</span>
              <span class="kpis_builder_block_type">{{ t('copil_bt_' + block.type) }}</span>
              <input v-model="block.title" class="kpis_builder_block_title_input" :placeholder="t('copil_block_title')" @input="saveBlocks" />
              <button v-if="i > 0" class="kpis_builder_block_control" @click.stop="moveBlock(i, -1)" title="↑">▲</button>
              <button v-if="i < copil.blocks.length - 1" class="kpis_builder_block_control" @click.stop="moveBlock(i, 1)" title="↓">▼</button>
              <button class="kpis_builder_block_control" @click.stop="toggleVisible(block)" :title="block.visible ? t('copil_hide') : t('copil_show')">{{ block.visible ? '👁' : '👁‍🗨' }}</button>
              <button class="kpis_builder_block_delete" :title="t('copil_delete')" @click.stop="askDeleteBlock(block)">🗑</button>
            </div>
            <div class="kpis_builder_block_preview">
              <!-- KPI Grid preview -->
              <div v-if="block.type === 'kpi_grid'" class="preview_kpi_grid">
                <div v-for="(kpi, ki) in block.data.kpis" :key="ki" class="preview_kpi" :style="{ borderLeftColor: kpi.color }">
                  <strong>{{ kpi.value || '—' }}</strong><span>{{ kpi.label || '...' }}</span>
                </div>
              </div>
              <!-- KPI Single -->
              <div v-else-if="block.type === 'kpi_single'" class="preview_kpi_single" :style="{ color: block.data.color }">
                <strong>{{ block.data.value || '—' }}</strong><span>{{ block.data.label || '...' }} {{ block.data.unit }}</span>
              </div>
              <!-- Chart Bar -->
              <div v-else-if="block.type === 'chart_bar'" class="preview_chart">
                <apexchart :key="'bar-' + block.id" type="bar" height="160"
                  :options="{ chart:{toolbar:{show:false},animations:{enabled:false}}, colors:block.data.datasets.map(d=>d.color||'#7c3aed'), xaxis:{categories:block.data.labels}, yaxis:{labels:{formatter:axisNum}}, dataLabels:{enabled:false}, grid:{borderColor:'#f3f4f6'}, plotOptions:{bar:{borderRadius:3}} }"
                  :series="block.data.datasets.map(d=>({name:d.label,data:d.data}))" />
              </div>
              <!-- Chart Line -->
              <div v-else-if="block.type === 'chart_line'" class="preview_chart">
                <apexchart :key="'line-' + block.id" type="line" height="160"
                  :options="{ chart:{toolbar:{show:false},animations:{enabled:false}}, colors:block.data.datasets.map(d=>d.color||'#3b82f6'), xaxis:{categories:block.data.labels}, yaxis:{labels:{formatter:axisNum}}, stroke:{curve:'smooth',width:2}, dataLabels:{enabled:false}, grid:{borderColor:'#f3f4f6'} }"
                  :series="block.data.datasets.map(d=>({name:d.label,data:d.data}))" />
              </div>
              <!-- Chart Donut -->
              <div v-else-if="block.type === 'chart_donut'" class="preview_chart">
                <apexchart :key="'donut-' + block.id" type="donut" height="160"
                  :options="{ labels:block.data.labels, colors:block.data.colors, legend:{position:'bottom',fontSize:'10px'}, dataLabels:{enabled:false}, plotOptions:{pie:{donut:{size:'55%'}}} }"
                  :series="(block.data.data||[]).map(v=>Number(v)||0)" />
              </div>
              <!-- Text -->
              <div v-else-if="block.type === 'text'" class="preview_text" :class="'size_' + block.data.size">{{ block.data.content || '...' }}</div>
              <!-- Table -->
              <div v-else-if="block.type === 'table'" class="preview_table">
                <table><thead><tr><th v-for="h in block.data.headers" :key="h">{{ h }}</th></tr></thead>
                <tbody><tr v-for="(row, ri) in block.data.rows" :key="ri"><td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td></tr></tbody></table>
              </div>
              <!-- Timeline -->
              <div v-else-if="block.type === 'timeline'" class="preview_timeline">
                <div v-for="(ev, ei) in block.data.events" :key="ei" class="preview_timeline_item" :class="'status_' + ev.status">
                  <span class="preview_timeline_dot"></span>
                  <div class="preview_timeline_content">
                    <strong>{{ ev.title || '...' }}</strong>
                    <span class="preview_timeline_date">{{ ev.date }}</span>
                    <p v-if="ev.desc">{{ ev.desc }}</p>
                  </div>
                </div>
              </div>
              <!-- Image -->
              <div v-else-if="block.type === 'image'" class="preview_image">
                <img v-if="imageSrc(block)" :src="imageSrc(block)" :alt="block.data.caption" />
                <div v-else class="preview_image_placeholder">🖼 {{ t('copil_image_placeholder') }}</div>
                <span v-if="block.data.caption" class="preview_image_caption">{{ block.data.caption }}</span>
              </div>
              <!-- Checklist -->
              <div v-else-if="block.type === 'checklist'" class="preview_checklist">
                <div v-for="(item, ii) in block.data.items" :key="ii" class="preview_check_item">{{ item.done ? '✅' : '⬜' }} {{ item.text || '...' }}</div>
              </div>
              <!-- Quote -->
              <div v-else-if="block.type === 'quote'" class="preview_quote">
                <p>"{{ block.data.text || '...' }}"</p>
                <span>— {{ block.data.author }}</span>
              </div>
              <!-- Action plan -->
              <div v-else-if="block.type === 'action_plan'" class="preview_actions">
                <div v-for="(a, ai) in block.data.actions" :key="ai" class="preview_action">{{ a.what || '...' }} → {{ a.who }} ({{ a.when }})</div>
              </div>
              <!-- Divider -->
              <hr v-else-if="block.type === 'divider'" class="preview_divider" />
              <!-- Fallback -->
              <div v-else class="preview_fallback">{{ t('copil_bt_' + block.type) }}</div>
            </div>
          </div>
        </div>
        <div v-else class="kpis_builder_no_blocks">{{ t('copil_no_blocks') }}</div>
        </ErrorBoundary>
      </main>

      <!-- INSPECTOR -->
      <aside v-if="activeBlock" class="kpis_builder_inspector">
        <div class="kpis_builder_insp_header"><h3>{{ t('copil_bt_' + activeBlock.type) }}</h3><button type="button" class="kpis_builder_insp_close" :title="t('copil_close_panel')" @click="selectedBlock = null">✕</button></div>

        <!-- KPI Grid inspector -->
        <div v-if="activeBlock.type === 'kpi_grid'" class="inspector_body">
          <div v-for="(kpi, ki) in activeBlock.data.kpis" :key="ki" class="inspector_kpi">
            <div class="field_group"><label>{{ t('copil_kpi_label') }}</label><input v-model="kpi.label" class="field_input" @input="saveBlocks" /></div>
            <div class="inspector_row">
              <div class="field_group"><label>{{ t('copil_kpi_value') }}</label><input v-model="kpi.value" class="field_input" @input="saveBlocks" /></div>
              <div class="field_group"><label>{{ t('copil_kpi_unit') }}</label><input v-model="kpi.unit" class="field_input small" @input="saveBlocks" /></div>
            </div>
            <div class="field_group"><label>{{ t('copil_kpi_trend') }}</label>
              <select v-model="kpi.trend" class="field_input" @change="saveBlocks"><option value="up">{{ t('copil_trend_up') }}</option><option value="stable">{{ t('copil_trend_stable') }}</option><option value="down">{{ t('copil_trend_down') }}</option></select>
            </div>
            <button class="inspector_remove" @click="activeBlock.data.kpis.splice(ki, 1); saveBlocks()">✕</button>
          </div>
          <button class="inspector_add" @click="activeBlock.data.kpis.push({ label:'', value:'', unit:'', trend:'up', color:'#10b981' }); saveBlocks()">{{ t('copil_add_kpi') }}</button>
        </div>

        <!-- KPI Single inspector -->
        <div v-else-if="activeBlock.type === 'kpi_single'" class="inspector_body">
          <div class="field_group"><label>{{ t('copil_kpi_label') }}</label><input v-model="activeBlock.data.label" class="field_input" @input="saveBlocks" /></div>
          <div class="inspector_row">
            <div class="field_group"><label>{{ t('copil_kpi_value') }}</label><input v-model="activeBlock.data.value" class="field_input" @input="saveBlocks" /></div>
            <div class="field_group"><label>{{ t('copil_kpi_unit') }}</label><input v-model="activeBlock.data.unit" class="field_input small" @input="saveBlocks" /></div>
          </div>
          <div class="field_group"><label>{{ t('copil_prev_value') }}</label><input v-model="activeBlock.data.previous" class="field_input" @input="saveBlocks" /></div>
        </div>

        <!-- Text inspector -->
        <div v-else-if="activeBlock.type === 'text'" class="inspector_body">
          <div class="field_group"><label>{{ t('copil_text_content') }}</label><textarea v-model="activeBlock.data.content" class="field_input textarea" rows="6" @input="saveBlocks" /></div>
          <div class="field_group"><label>{{ t('copil_text_size') }}</label>
            <select v-model="activeBlock.data.size" class="field_input" @change="saveBlocks">
              <option value="small">{{ t('copil_size_small') }}</option><option value="normal">{{ t('copil_size_normal') }}</option>
              <option value="large">{{ t('copil_size_large') }}</option><option value="title">{{ t('copil_size_title') }}</option>
            </select>
          </div>
        </div>

        <!-- Table inspector -->
        <div v-else-if="activeBlock.type === 'table'" class="inspector_body">
          <div class="field_group"><label>{{ t('copil_table_headers') }}</label><input :value="activeBlock.data.headers.join(' | ')" @input="activeBlock.data.headers = $event.target.value.split('|').map(s=>s.trim()); saveBlocks()" class="field_input" /></div>
          <div v-for="(row, ri) in activeBlock.data.rows" :key="ri" class="field_group">
            <label>{{ t('copil_table_row', { n: ri + 1 }) }}</label>
            <input :value="row.join(' | ')" @input="activeBlock.data.rows[ri] = $event.target.value.split('|').map(s=>s.trim()); saveBlocks()" class="field_input" />
          </div>
          <button class="inspector_add" @click="activeBlock.data.rows.push(activeBlock.data.headers.map(()=>'')); saveBlocks()">{{ t('copil_add_row') }}</button>
        </div>

        <!-- Checklist inspector -->
        <div v-else-if="activeBlock.type === 'checklist'" class="inspector_body">
          <div v-for="(item, ii) in activeBlock.data.items" :key="ii" class="inspector_check_row">
            <input type="checkbox" v-model="item.done" @change="saveBlocks" />
            <input v-model="item.text" class="field_input" @input="saveBlocks" />
            <button class="inspector_remove" @click="activeBlock.data.items.splice(ii, 1); saveBlocks()">✕</button>
          </div>
          <button class="inspector_add" @click="activeBlock.data.items.push({ text:'', done:false }); saveBlocks()">{{ t('copil_add_item') }}</button>
        </div>

        <!-- Quote inspector -->
        <div v-else-if="activeBlock.type === 'quote'" class="inspector_body">
          <div class="field_group"><label>{{ t('copil_quote_text') }}</label><textarea v-model="activeBlock.data.text" class="field_input textarea" rows="3" @input="saveBlocks" /></div>
          <div class="field_group"><label>{{ t('copil_quote_author') }}</label><input v-model="activeBlock.data.author" class="field_input" @input="saveBlocks" /></div>
          <div class="field_group"><label>{{ t('copil_quote_role') }}</label><input v-model="activeBlock.data.role" class="field_input" @input="saveBlocks" /></div>
        </div>

        <!-- Action Plan inspector -->
        <div v-else-if="activeBlock.type === 'action_plan'" class="inspector_body">
          <div v-for="(a, ai) in activeBlock.data.actions" :key="ai" class="inspector_action">
            <div class="field_group"><label>{{ t('copil_action_what') }}</label><input v-model="a.what" class="field_input" @input="saveBlocks" /></div>
            <div class="inspector_row">
              <div class="field_group"><label>{{ t('copil_action_who') }}</label><input v-model="a.who" class="field_input" @input="saveBlocks" /></div>
              <div class="field_group"><label>{{ t('copil_action_when') }}</label><input v-model="a.when" class="field_input" @input="saveBlocks" /></div>
            </div>
            <div class="field_group"><label>{{ t('copil_action_status') }}</label>
              <select v-model="a.status" class="field_input" @change="saveBlocks">
                <option value="todo">{{ t('copil_status_todo') }}</option><option value="progress">{{ t('copil_status_progress') }}</option><option value="done">{{ t('copil_status_done') }}</option>
              </select>
            </div>
            <button class="inspector_remove" @click="activeBlock.data.actions.splice(ai, 1); saveBlocks()">✕</button>
          </div>
          <button class="inspector_add" @click="activeBlock.data.actions.push({ what:'', who:'', when:'', status:'todo' }); saveBlocks()">{{ t('copil_add_action') }}</button>
        </div>

        <!-- Timeline inspector -->
        <div v-else-if="activeBlock.type === 'timeline'" class="inspector_body">
          <div v-for="(ev, ei) in activeBlock.data.events" :key="ei" class="inspector_action">
            <div class="inspector_row">
              <div class="field_group"><label>{{ t('copil_tl_title') }}</label><input v-model="ev.title" class="field_input" @input="saveBlocks" /></div>
              <div class="field_group small"><label>{{ t('copil_tl_date') }}</label><input v-model="ev.date" class="field_input" @input="saveBlocks" /></div>
            </div>
            <div class="field_group"><label>{{ t('copil_tl_desc') }}</label><input v-model="ev.desc" class="field_input" @input="saveBlocks" /></div>
            <div class="field_group"><label>{{ t('copil_action_status') }}</label>
              <select v-model="ev.status" class="field_input" @change="saveBlocks">
                <option value="done">{{ t('copil_status_done') }}</option>
                <option value="progress">{{ t('copil_status_progress') }}</option>
                <option value="todo">{{ t('copil_status_todo') }}</option>
              </select>
            </div>
            <button class="inspector_remove" @click="activeBlock.data.events.splice(ei, 1); saveBlocks()">✕</button>
          </div>
          <button class="inspector_add" @click="activeBlock.data.events.push({ date:'', title:'', desc:'', status:'todo' }); saveBlocks()">{{ t('copil_add_event') }}</button>
        </div>

        <!-- Image inspector -->
        <div v-else-if="activeBlock.type === 'image'" class="inspector_body">
          <!-- COPIL-IMAGE-EXPORT (D1①): file uploaded to the private copil-media bucket, exported into the PPTX -->
          <div class="field_group"><label>{{ t('copil_image_file') }}</label>
            <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp" class="inspector_file" :disabled="uploading" @change="onImageFile" />
            <span class="inspector_hint">{{ t('copil_image_hint') }}</span>
            <span v-if="imageError" class="inspector_error">{{ imageError }}</span>
            <span v-else-if="uploading" class="inspector_hint">{{ t('copil_image_uploading') }}</span>
          </div>
          <button v-if="activeBlock.data.path || activeBlock.data.url" type="button" class="inspector_remove_image" :disabled="uploading" @click="removeImage">{{ t('copil_image_remove') }}</button>
          <div class="field_group"><label>{{ t('copil_image_url') }}</label><input v-model="activeBlock.data.url" class="field_input" placeholder="https://..." :disabled="!!activeBlock.data.path" @input="saveBlocks" /></div>
          <div class="field_group"><label>{{ t('copil_image_caption') }}</label><input v-model="activeBlock.data.caption" class="field_input" @input="saveBlocks" /></div>
        </div>

        <!-- Chart Bar inspector -->
        <div v-else-if="activeBlock.type === 'chart_bar'" class="inspector_body">
          <div class="field_group"><label>{{ t('copil_chart_labels') }}</label><input :value="activeBlock.data.labels.join(', ')" @input="activeBlock.data.labels = $event.target.value.split(',').map(s=>s.trim()); saveBlocks()" class="field_input" /></div>
          <div v-for="(ds, dsi) in activeBlock.data.datasets" :key="dsi" class="inspector_action">
            <div class="field_group"><label>{{ t('copil_chart_series') }} {{ dsi + 1 }}</label><input v-model="ds.label" class="field_input" @input="saveBlocks" /></div>
            <div class="field_group"><label>{{ t('copil_chart_values') }}</label><input :value="ds.data.join(', ')" @input="ds.data = $event.target.value.split(',').map(s=>Number(s.trim())||0); saveBlocks()" class="field_input" /></div>
            <div class="field_group small"><label>{{ t('copil_cover_color') }}</label><input type="color" v-model="ds.color" @input="saveBlocks" class="field_input_color" /></div>
            <button v-if="activeBlock.data.datasets.length > 1" class="inspector_remove" @click="activeBlock.data.datasets.splice(dsi, 1); saveBlocks()">✕</button>
          </div>
          <button class="inspector_add" @click="activeBlock.data.datasets.push({ label: t('copil_sample_series'), data: activeBlock.data.labels.map(()=>0), color:'#3b82f6' }); saveBlocks()">{{ t('copil_add_series') }}</button>
        </div>

        <!-- Chart Line inspector -->
        <div v-else-if="activeBlock.type === 'chart_line'" class="inspector_body">
          <div class="field_group"><label>{{ t('copil_chart_labels') }}</label><input :value="activeBlock.data.labels.join(', ')" @input="activeBlock.data.labels = $event.target.value.split(',').map(s=>s.trim()); saveBlocks()" class="field_input" /></div>
          <div v-for="(ds, dsi) in activeBlock.data.datasets" :key="dsi" class="inspector_action">
            <div class="field_group"><label>{{ t('copil_chart_series') }} {{ dsi + 1 }}</label><input v-model="ds.label" class="field_input" @input="saveBlocks" /></div>
            <div class="field_group"><label>{{ t('copil_chart_values') }}</label><input :value="ds.data.join(', ')" @input="ds.data = $event.target.value.split(',').map(s=>Number(s.trim())||0); saveBlocks()" class="field_input" /></div>
            <div class="field_group small"><label>{{ t('copil_cover_color') }}</label><input type="color" v-model="ds.color" @input="saveBlocks" class="field_input_color" /></div>
            <button v-if="activeBlock.data.datasets.length > 1" class="inspector_remove" @click="activeBlock.data.datasets.splice(dsi, 1); saveBlocks()">✕</button>
          </div>
          <button class="inspector_add" @click="activeBlock.data.datasets.push({ label: t('copil_sample_series'), data: activeBlock.data.labels.map(()=>0), color:'#10b981' }); saveBlocks()">{{ t('copil_add_series') }}</button>
        </div>

        <!-- Chart Donut inspector -->
        <div v-else-if="activeBlock.type === 'chart_donut'" class="inspector_body">
          <div v-for="(label, li) in activeBlock.data.labels" :key="li" class="inspector_donut_row">
            <input v-model="activeBlock.data.labels[li]" class="field_input" @input="saveBlocks" />
            <input v-model.number="activeBlock.data.data[li]" type="number" class="field_input small" @input="saveBlocks" />
            <input type="color" v-model="activeBlock.data.colors[li]" @input="saveBlocks" class="field_input_color" />
            <button v-if="activeBlock.data.labels.length > 1" class="inspector_remove_inline" @click="activeBlock.data.labels.splice(li,1); activeBlock.data.data.splice(li,1); activeBlock.data.colors.splice(li,1); saveBlocks()">✕</button>
          </div>
          <button class="inspector_add" @click="activeBlock.data.labels.push(t('copil_sample_segment')); activeBlock.data.data.push(10); activeBlock.data.colors.push('#6366f1'); saveBlocks()">{{ t('copil_add_segment') }}</button>
        </div>

        <!-- Fallback -->
        <div v-else class="inspector_body"><p class="inspector_hint">{{ t('copil_bt_' + activeBlock.type) }}</p></div>

        <!-- Block controls (all types) -->
        <div class="inspector_controls">
          <div class="field_group"><label>{{ t('copil_block_width') }}</label>
            <select v-model="activeBlock.width" class="field_input" @change="saveBlocks">
              <option value="full">{{ t('copil_width_full') }}</option>
              <option value="half">{{ t('copil_width_half') }}</option>
              <option value="third">{{ t('copil_width_third') }}</option>
            </select>
          </div>
        </div>
      </aside>
    </div>

    <!-- NO-CONFIRM: a filled block is only deleted after confirmation in the product -->
    <ConfirmDialog v-if="blockToDelete" :title="t('copil_block_delete_title')" :body="t('copil_block_delete_body', { type: t('copil_bt_' + blockToDelete.type), title: blockToDelete.title || t('copil_block_untitled') })" :cta="t('cf_delete')" :busy="deletingBlock" @confirm="confirmDeleteBlock" @cancel="blockToDelete = null" />
    <MetricWizard v-if="showMetricWizard" :client-id="meta.clientId" @close="showMetricWizard = false" @insert="insertMetric" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useKpiStore } from '@/stores/kpis'
import { useClientStore } from '@/stores/clients'
import MetricWizard from '@/components/kpis/MetricWizard.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { DECK_LANGS, deckNumber } from '@/utils/copilFormat'
import { showToast } from '@/lib/toast'

const props = defineProps({ id: String })
const route = useRoute()
const router = useRouter()
const { t } = useI18n({ useScope: 'global' })
const store = useKpiStore()
const clientStore = useClientStore()

const colors = ['#7c3aed', '#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#ec4899', '#06b6d4', '#1e293b']
const selectedBlock = ref(null)
const saved = ref(false)
const drawerOpen = ref(false)
function closePanels() { drawerOpen.value = false; selectedBlock.value = null }

const copilId = ref(props.id || route.params.id || null)

const meta = reactive({ title: '', subtitle: '', clientId: null, clientName: '', period: '', presenter: '', color: '#7c3aed', lang: 'fr' })

onMounted(async () => {
  if (!store.copils.length) await store.loadCopils()
  if (!clientStore.clients.length) clientStore.loadClients()
  if (!copilId.value) {
    const id = await store.createCopil()
    if (!id) { console.error('[kpis] copil creation failed — redirecting back'); router.replace('/app/kpis'); return }
    copilId.value = id
    router.replace('/app/kpis/' + id)
  }
  const c = store.getCopil(copilId.value)
  if (c) { Object.assign(meta, { title: c.title, subtitle: c.subtitle, clientId: c.clientId || null, clientName: c.clientName, period: c.period, presenter: c.presenter, color: c.color, lang: c.lang || 'fr' }) }
})

// Link a portfolio client: auto-fills name + logo. Back to free
// text: clientId null, the entered name stays.
function onClientPick() {
  const cl = clientStore.clients.find(x => x.id === meta.clientId)
  if (cl) {
    meta.clientName = cl.name
    store.updateCopil(copilId.value, { ...meta, clientLogo: cl.logo || null }).then(res => { if (res && res.success) flash() })
    return
  }
  saveMeta()
}

const copil = computed(() => store.getCopil(copilId.value))
const activeBlock = computed(() => copil.value?.blocks?.find(b => b.id === selectedBlock.value) || null)

// MIN-i18n : titres de groupes localises (etaient FR en dur)
const blockGroups = computed(() => [
  { title: '📊 ' + t('copil_grp_kpis'), items: [{ type: 'kpi_grid', icon: '🔢' }, { type: 'kpi_single', icon: '📈' }] },
  { title: '📉 ' + t('copil_grp_charts'), items: [{ type: 'chart_bar', icon: '📊' }, { type: 'chart_line', icon: '📈' }, { type: 'chart_donut', icon: '🍩' }] },
  { title: '📝 ' + t('copil_grp_content'), items: [{ type: 'text', icon: '📝' }, { type: 'table', icon: '📋' }, { type: 'checklist', icon: '✅' }, { type: 'timeline', icon: '🗓' }, { type: 'quote', icon: '💬' }] },
  { title: '🎯 ' + t('copil_grp_actions'), items: [{ type: 'action_plan', icon: '🎯' }] },
  { title: '🖼 ' + t('copil_grp_media'), items: [{ type: 'image', icon: '🖼' }, { type: 'divider', icon: '──' }] },
])

function addBlock(type) {
  if (!copilId.value) return
  store.addBlock(copilId.value, type)
  const blocks = copil.value?.blocks
  if (blocks?.length) selectedBlock.value = blocks[blocks.length - 1].id
  drawerOpen.value = false
}

// COPIL-BLOCK-DELETE: an EMPTY block (no value entered) is removed immediately; a filled
// block goes through ConfirmDialog. "Filled" = at least one non-empty string in data,
// excluding the examples set at creation time (labels/colors), or a title.
function blockHasContent(b) {
  if (b.title && b.title.trim()) return true
  // a chart always carries numeric values: we always confirm
  if (b.type === 'chart_bar' || b.type === 'chart_line' || b.type === 'chart_donut') return true
  const skip = new Set(['color', 'colors', 'trend', 'status', 'size', 'style', 'done', 'labels'])
  const walk = (v, k) => {
    if (skip.has(k)) return false
    if (typeof v === 'string') return v.trim() !== ''
    if (Array.isArray(v)) return v.some(x => walk(x, k))
    if (v && typeof v === 'object') return Object.entries(v).some(([kk, vv]) => walk(vv, kk))
    return false
  }
  return b.type === 'image' ? !!(b.data?.url) : walk(b.data, null)
}
const blockToDelete = ref(null)
const deletingBlock = ref(false)
function askDeleteBlock(block) {
  if (!blockHasContent(block)) { store.deleteBlock(copilId.value, block.id); return }
  blockToDelete.value = block
}
async function confirmDeleteBlock() {
  if (!blockToDelete.value || deletingBlock.value) return
  deletingBlock.value = true
  try {
    if (selectedBlock.value === blockToDelete.value.id) selectedBlock.value = null
    await store.deleteBlock(copilId.value, blockToDelete.value.id)
  } finally { deletingBlock.value = false; blockToDelete.value = null }
}

// D-14: "✓ Saved" only after an OK Supabase response — failure is toasted
// by withWrite (store), the user's input is never destroyed.
// COPIL-RACE: the fields are wired to @input; a 400 ms debounce
// groups a burst of keystrokes into a single write, and the store's queue (one write
// in flight per COPIL, coalescing) guarantees ordering. The ✓ only appears when
// nothing is pending any more for this COPIL.
const SAVE_DEBOUNCE_MS = 400
let metaTimer = null
let blocksTimer = null

function saveMeta() {
  if (!copilId.value) return
  clearTimeout(metaTimer)
  metaTimer = setTimeout(async () => {
    metaTimer = null
    const res = await store.updateCopil(copilId.value, { ...meta })
    if (res && res.success && !store.hasPendingWrite(copilId.value)) flash()
  }, SAVE_DEBOUNCE_MS)
}

function saveBlocks() {
  if (!copilId.value) return
  clearTimeout(blocksTimer)
  blocksTimer = setTimeout(async () => {
    blocksTimer = null
    const res = await store.updateCopil(copilId.value, { blocks: copil.value.blocks })
    if (res && res.success && !store.hasPendingWrite(copilId.value)) flash()
  }, SAVE_DEBOUNCE_MS)
}

// Leaving the page: we send whatever is still debounced, then wait for the
// queue to be empty (bounded by the withWrite timeout). Text typed right before
// "← Back" makes it into the database.
async function flushPending() {
  if (!copilId.value) return
  if (metaTimer) { clearTimeout(metaTimer); metaTimer = null; store.updateCopil(copilId.value, { ...meta }) }
  if (blocksTimer) { clearTimeout(blocksTimer); blocksTimer = null; store.updateCopil(copilId.value, { blocks: copil.value?.blocks || [] }) }
  await store.flushWrites(copilId.value)
}
onBeforeRouteLeave(async () => { await flushPending() })

const showMetricWizard = ref(false)
const exporting = ref(false)
// COPIL-PPTX-FORMAT: an export failure is VISIBLE (toast); an unrecoverable image
// produces an empty frame in the file and a "partial export" toast.
async function exportPptx() {
  if (!copil.value) return
  exporting.value = true
  try {
    await flushPending()
    const { exportCopilPptx } = await import('@/utils/pptxExport.js')
    const loadImage = (b) => b.data.path ? store.mediaDataUrl(b.data.path, true) : store.mediaDataUrl(b.data.url, false)
    const res = await exportCopilPptx(copil.value, t, loadImage)
    if (res.missingImages) showToast(t('copil_export_partial', { n: res.missingImages }), 'error', 6000)
  } catch (e) {
    console.error('[kpis] export PPTX failed:', e.message || e)
    showToast(t('copil_export_failed'), 'error', 6000)
  } finally {
    exporting.value = false
  }
}

// ── Image (COPIL-IMAGE-EXPORT) ──────────────────────────────────────────────
const imageInput = ref(null)
const uploading = ref(false)
const imageError = ref('')
// ApexCharts axes: decimals from the deck's language (COPIL-I18N)
function axisNum(v) { return deckNumber(v, meta.lang) }
function imageSrc(block) {
  const d = block.data || {}
  if (d.path) { store.resolveMedia(d.path); return store.mediaUrls[d.path] || '' }
  return d.url || ''
}
async function onImageFile(e) {
  const file = e.target.files && e.target.files[0]
  if (!file || !activeBlock.value) return
  imageError.value = ''
  uploading.value = true
  try {
    const res = await store.uploadImage(copilId.value, activeBlock.value.id, file)
    if (res.error) imageError.value = ['copil_image_type', 'copil_image_too_large'].includes(res.error) ? t(res.error, { max: Math.round(store.MEDIA_MAX_BYTES / 1024 / 1024) }) : t('write_failed')
    else flash()
  } finally {
    uploading.value = false
    if (imageInput.value) imageInput.value.value = ''
  }
}
async function removeImage() {
  if (!activeBlock.value) return
  imageError.value = ''
  const res = await store.removeImage(copilId.value, activeBlock.value.id)
  if (res.success) flash()
}
// Insertion of a block generated by the metric wizard (already pre-filled)
function insertMetric(block) {
  if (!copil.value) return
  const blocks = [...(copil.value.blocks || []), block]
  store.updateCopil(copilId.value, { blocks }).then(res => { if (res && res.success) flash() })
  selectedBlock.value = block.id
}

function flash() { saved.value = true; setTimeout(() => { saved.value = false }, 1500) }

// Drag & drop
const dragIdx = ref(null)
const dropIdx = ref(null)

function onDragStart(e, i) {
  dragIdx.value = i
  e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(e, i) { dropIdx.value = i }
function onDragEnd() { dragIdx.value = null; dropIdx.value = null }
function onDrop(targetIdx) {
  if (dragIdx.value === null || dragIdx.value === targetIdx) return
  const blocks = [...copil.value.blocks]
  const [moved] = blocks.splice(dragIdx.value, 1)
  blocks.splice(targetIdx, 0, moved)
  store.reorderBlocks(copilId.value, blocks.map(b => b.id))
  dragIdx.value = null
  dropIdx.value = null
}

function moveBlock(i, dir) {
  const blocks = [...copil.value.blocks]
  const j = i + dir
  if (j < 0 || j >= blocks.length) return
  ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
  store.reorderBlocks(copilId.value, blocks.map(b => b.id))
}

function toggleVisible(block) {
  block.visible = !block.visible
  saveBlocks()
}


</script>

<style scoped>
.kb { max-width: 100%; }
.kpis_builder_client_free { margin-top: 6px; }
.kpis_builder_metric_button { width: 100%; background: linear-gradient(135deg, var(--purple), #a78bfa); color: #fff; border: none; padding: 10px; border-radius: 10px; font-size: 0.82rem; font-weight: 700; cursor: pointer; margin-bottom: 14px; transition: opacity 0.15s; }
.kpis_builder_metric_button:hover { opacity: 0.9; }

/* Toolbar */
.kpis_builder_toolbar { display: flex; align-items: center; gap: 12px; padding: 10px 0; margin-bottom: 16px; flex-wrap: wrap; }
.kpis_builder_back { font-size: 0.82rem; color: var(--text-muted); text-decoration: none; }
.kpis_builder_back:hover { color: var(--purple); }
.kpis_builder_title_display { font-size: 1rem; font-weight: 700; flex: 1; }
.kpis_builder_toolbar_right { display: flex; gap: 6px; align-items: center; }
.tb_button { padding: 6px 14px; border-radius: 6px; font-size: 0.78rem; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); text-decoration: none; }
.tb_button:hover { border-color: var(--purple); color: var(--purple); }
.tb_saved { font-size: 0.75rem; color: var(--green); font-weight: 600; }

/* Layout */
.kpis_builder_layout { display: grid; grid-template-columns: 200px minmax(420px, 1fr) 280px; gap: 16px; min-height: calc(100vh - 180px); position: relative; }
.kpis_builder_drawer_toggle, .kpis_builder_scrim { display: none; }

/* Sidebar */
.kpis_builder_sidebar { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px; overflow-y: auto; }
.kpis_builder_sidebar h3 { font-size: 0.82rem; font-weight: 700; margin-bottom: 12px; }
.kpis_builder_group { margin-bottom: 12px; }
.kpis_builder_group_title { font-size: 0.68rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px; }
.kpis_builder_block_button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; background: var(--bg); border: 1px solid transparent; border-radius: 6px; font-size: 0.78rem; cursor: pointer; transition: all 0.15s; }
.kpis_builder_block_button:hover { border-color: var(--purple); background: var(--purple-bg); }
.kpis_builder_block_icon { font-size: 0.9rem; }

/* Canvas */
.kpis_builder_canvas { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; overflow-y: auto; }

/* Cover */
.kpis_builder_cover { background: var(--bg); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 20px; }
.kpis_builder_cover_row { display: flex; gap: 12px; margin-bottom: 10px; }
.kpis_builder_cover_row:last-child { margin-bottom: 0; }
.field_group { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.field_group.full { flex: 2; }
.field_group.small { flex: 0 0 auto; }
.field_group label { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); }
.field_input { padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.82rem; outline: none; background: var(--bg-card); width: 100%; }
.field_input:focus { border-color: var(--purple); }
.field_input.small { width: 60px; }
.textarea { resize: vertical; }
.color_row { display: flex; gap: 5px; }
.cpick { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.cpick.active { border-color: var(--text); transform: scale(1.15); }

/* Blocks */
.kpis_builder_blocks { display: flex; flex-direction: column; gap: 12px; }
.kpis_builder_block { border: 2px solid var(--border-light); border-radius: var(--radius-sm); overflow: hidden; cursor: pointer; transition: all 0.15s; }
.kpis_builder_block:hover { border-color: var(--border); }
.kpis_builder_block.selected { border-color: var(--purple); box-shadow: 0 0 0 2px rgba(124,58,237,0.1); }
/* flex-wrap: below ~1300 px the controls move to a 2nd line instead of overflowing (🗑 cut off) */
.kpis_builder_block_header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 8px 12px; background: var(--bg); border-bottom: 1px solid var(--border-light); }
.kpis_builder_block_drag { cursor: grab; color: var(--text-muted); font-size: 0.85rem; }
.kpis_builder_block_type { font-size: 0.65rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }
.kpis_builder_block_title_input { flex: 1 1 140px; min-width: 0; border: none; background: transparent; font-size: 0.82rem; font-weight: 600; outline: none; }
.kpis_builder_block_delete { background: none; border: none; cursor: pointer; font-size: 0.8rem; opacity: 0.3; }
.kpis_builder_block_delete:hover { opacity: 1; }
.kpis_builder_block_preview { padding: 14px; min-height: 40px; }

/* Previews */
.preview_kpi_grid { display: flex; gap: 10px; flex-wrap: wrap; }
.preview_kpi { border-left: 3px solid var(--green); padding: 8px 12px; background: var(--bg); border-radius: 6px; min-width: 80px; }
.preview_kpi strong { display: block; font-size: 1.1rem; font-weight: 800; }
.preview_kpi span { font-size: 0.7rem; color: var(--text-muted); }
.preview_kpi_single { text-align: center; padding: 12px; }
.preview_kpi_single strong { font-size: 2rem; font-weight: 800; display: block; }
.preview_kpi_single span { font-size: 0.82rem; }
.preview_chart { text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem; background: var(--bg); border-radius: 6px; }
.preview_text { font-size: 0.85rem; line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; }
.preview_text.size_small { font-size: 0.75rem; }
.preview_text.size_large { font-size: 1.1rem; }
.preview_text.size_title { font-size: 1.4rem; font-weight: 800; color: var(--text); }
.preview_table table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.preview_table th { padding: 6px 10px; background: var(--bg); text-align: left; font-weight: 600; border-bottom: 1px solid var(--border); }
.preview_table td { padding: 6px 10px; border-bottom: 1px solid var(--border-light); }
.preview_checklist { display: flex; flex-direction: column; gap: 4px; }
.preview_check_item { font-size: 0.82rem; }
.preview_quote { text-align: center; font-style: italic; padding: 12px; }
.preview_quote p { font-size: 0.95rem; margin-bottom: 6px; }
.preview_quote span { font-size: 0.75rem; color: var(--text-muted); }
.preview_actions { display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; }
.preview_action { padding: 4px 8px; background: var(--bg); border-radius: 4px; }
.preview_divider { border: none; border-top: 1px solid var(--border); margin: 8px 0; }
.preview_fallback { text-align: center; color: var(--text-muted); font-size: 0.82rem; }
.kpis_builder_no_blocks { text-align: center; padding: 40px; color: var(--text-muted); font-size: 0.88rem; }

/* Timeline preview */
.preview_timeline { display: flex; flex-direction: column; gap: 0; padding-left: 12px; border-left: 2px solid var(--border); }
.preview_timeline_item { display: flex; gap: 10px; padding: 6px 0; position: relative; }
.preview_timeline_dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border); flex-shrink: 0; margin-top: 4px; margin-left: -17px; }
.preview_timeline_item.status_done .preview_timeline_dot { background: var(--green); }
.preview_timeline_item.status_progress .preview_timeline_dot { background: var(--purple); }
.preview_timeline_item.status_todo .preview_timeline_dot { background: var(--border); }
.preview_timeline_content strong { font-size: 0.82rem; display: block; }
.preview_timeline_date { font-size: 0.7rem; color: var(--text-muted); }
.preview_timeline_content p { font-size: 0.75rem; color: var(--text-secondary); margin: 2px 0 0; }

/* Image preview */
.preview_image { text-align: center; }
.preview_image img { max-width: 100%; max-height: 200px; border-radius: 6px; object-fit: contain; }
.preview_image_placeholder { padding: 30px; color: var(--text-muted); background: var(--bg); border-radius: 6px; font-size: 0.85rem; }
.preview_image_caption { display: block; font-size: 0.72rem; color: var(--text-muted); margin-top: 6px; }

/* Block hidden state */
.kpis_builder_block.hidden { opacity: 0.45; }
.kpis_builder_block.hidden .kpis_builder_block_preview { display: none; }

/* Block controls */
.kpis_builder_block_control { background: none; border: none; cursor: pointer; font-size: 0.55rem; color: var(--text-muted); padding: 2px 3px; opacity: 0.4; }
.kpis_builder_block_control:hover { opacity: 1; color: var(--purple); }

/* Inspector */
.kpis_builder_inspector { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; overflow-y: auto; }
.kpis_builder_inspector h3 { font-size: 0.85rem; font-weight: 700; margin-bottom: 14px; }
.kpis_builder_insp_header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kpis_builder_insp_close { display: none; background: none; border: none; cursor: pointer; font-size: 0.9rem; color: var(--text-muted); padding: 2px 6px; }
.kpis_builder_insp_close:hover { color: var(--text); }
.inspector_body { display: flex; flex-direction: column; gap: 12px; }
.inspector_row { display: flex; gap: 8px; }
.inspector_row .field_group { flex: 1; }
.inspector_kpi { border: 1px solid var(--border-light); border-radius: 6px; padding: 10px; position: relative; }
.inspector_action { border: 1px solid var(--border-light); border-radius: 6px; padding: 10px; position: relative; margin-bottom: 8px; }
.inspector_remove { position: absolute; top: 6px; right: 6px; background: none; border: none; font-size: 0.75rem; color: var(--text-muted); cursor: pointer; }
.inspector_remove:hover { color: var(--red); }
.inspector_add { background: var(--purple-bg); color: var(--purple); border: 1px dashed var(--purple-border); padding: 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer; text-align: center; }
.inspector_add:hover { background: rgba(124,58,237,0.1); }
.inspector_check_row { display: flex; align-items: center; gap: 8px; }
.inspector_check_row input[type="checkbox"] { accent-color: var(--purple); }
.inspector_check_row .field_input { flex: 1; }
.inspector_hint { font-size: 0.78rem; color: var(--text-muted); }
.inspector_error { font-size: 0.78rem; color: var(--red); }
.inspector_file { font-size: 0.78rem; }
.inspector_remove_image { background: var(--red-bg); color: var(--red); border: none; padding: 7px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
.inspector_remove_image:disabled { opacity: 0.5; cursor: not-allowed; }
.inspector_controls { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-light); }
.inspector_donut_row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.inspector_donut_row .field_input { flex: 1; }
.inspector_donut_row .field_input.small { width: 60px; flex: 0 0 60px; }
.field_input_color { width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 6px; padding: 2px; cursor: pointer; flex-shrink: 0; }
.inspector_remove_inline { background: none; border: none; font-size: 0.75rem; color: var(--text-muted); cursor: pointer; flex-shrink: 0; }
.inspector_remove_inline:hover { color: var(--red); }

/* 1024-1300 px: the inspector narrows to let the canvas breathe */
@media (max-width: 1300px) { .kpis_builder_layout { grid-template-columns: 180px minmax(380px, 1fr) 240px; gap: 12px; } }
/* G9-11 — < 1024 px: single column; catalog as a drawer, inspector as a side panel */
@media (max-width: 1024px) {
  .kpis_builder_layout { grid-template-columns: 1fr; }
  .kpis_builder_drawer_toggle { display: inline-flex; position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 62; background: var(--purple); color: #fff; border: none; padding: 10px 18px; border-radius: 999px; font-size: 0.85rem; font-weight: 700; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.25); }
  .kpis_builder_scrim { display: block; position: fixed; inset: 0; background: rgba(15,23,42,0.35); z-index: 60; }
  .kpis_builder_sidebar { display: none; position: fixed; left: 0; right: 0; bottom: 0; max-height: 70vh; z-index: 61; border-radius: 16px 16px 0 0; box-shadow: 0 -12px 40px rgba(0,0,0,0.25); padding-bottom: 72px; }
  .kpis_builder_layout.drawer_open .kpis_builder_sidebar { display: block; }
  .kpis_builder_inspector { display: none; position: fixed; top: 0; right: 0; bottom: 0; width: min(360px, 92vw); z-index: 61; border-radius: 0; box-shadow: -12px 0 40px rgba(0,0,0,0.25); }
  .kpis_builder_layout.panel_open .kpis_builder_inspector { display: block; }
  .kpis_builder_insp_close { display: inline-block; }
}
@media (max-width: 768px) { .kpis_builder_cover_row { flex-direction: column; } }
</style>
