<template>
  <section class="diff-section anim-section" data-anim="fade-up">
    <div class="container">
      <div class="section-header">
        <span class="section-tag">{{ t('diff_tag') }}</span>
        <h2 v-html="t('diff_h2')"></h2>
        <p class="section-sub">{{ t('diff_sub') }}</p>
      </div>
      <div class="diff-grid">
        <article
          v-for="(p, i) in pillars"
          :key="i"
          class="diff-card"
          :style="{ '--accent': p.accent, '--glow': p.glow }"
        >
          <div class="diff-top">
            <span class="diff-icon">{{ p.icon }}</span>
            <span class="diff-index">0{{ i + 1 }}</span>
          </div>
          <span class="diff-pill">{{ p.tag }}</span>
          <h3 class="diff-title">{{ p.title }}</h3>
          <p class="diff-lead">{{ p.sub }}</p>
          <ul class="diff-points">
            <li v-for="(pt, j) in p.points" :key="j">{{ pt }}</li>
          </ul>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  pillars: { type: Array, required: true },
  t:       { type: Function, required: true }
})
</script>

<style scoped>
.diff-section {
  padding: 104px 0;
  position: relative;
  background: var(--bg, #fff);
  overflow: hidden;
}
.diff-section::before {
  content: '';
  position: absolute;
  top: -12%;
  left: 50%;
  transform: translateX(-50%);
  width: 960px;
  height: 520px;
  background: radial-gradient(ellipse at center, rgba(124, 58, 237, 0.08), transparent 68%);
  pointer-events: none;
}
.diff-section .container { position: relative; max-width: 1180px; margin: 0 auto; padding: 0 24px; }
.section-header { text-align: center; max-width: 660px; margin: 0 auto 60px; }
.section-tag {
  display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--purple, #7c3aed);
  background: rgba(124, 58, 237, 0.09);
  padding: 7px 16px; border-radius: 999px; margin-bottom: 20px;
}
.section-header h2 { font-size: clamp(30px, 4.2vw, 46px); font-weight: 800; line-height: 1.08; color: var(--text, #0f172a); margin: 0 0 16px; letter-spacing: -0.02em; }
.section-sub { font-size: 18px; line-height: 1.5; color: var(--text-muted, #64748b); margin: 0; }
.diff-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; }
.diff-card {
  position: relative; display: flex; flex-direction: column;
  padding: 34px 30px 36px; border-radius: 24px;
  background: var(--bg-white, #fff);
  border: 1px solid var(--border-light, #e8ebf0);
  overflow: hidden;
  transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.32s ease, border-color 0.32s ease;
}
.diff-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
  background: linear-gradient(90deg, var(--accent), transparent 85%);
}
.diff-card:hover {
  transform: translateY(-8px);
  border-color: var(--accent);
  box-shadow: 0 28px 55px -14px var(--glow);
}
.diff-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
.diff-icon {
  width: 54px; height: 54px; border-radius: 15px;
  display: flex; align-items: center; justify-content: center;
  font-size: 27px; background: var(--glow);
}
.diff-index { font-size: 38px; font-weight: 800; line-height: 1; color: var(--accent); opacity: 0.22; }
.diff-pill {
  align-self: flex-start; font-size: 11px; font-weight: 700; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--accent);
  background: var(--glow); padding: 5px 12px; border-radius: 999px; margin-bottom: 16px;
}
.diff-title { font-size: 23px; font-weight: 700; line-height: 1.22; color: var(--text, #0f172a); margin: 0 0 13px; letter-spacing: -0.01em; }
.diff-lead { font-size: 15px; line-height: 1.55; color: var(--text-secondary, #475569); margin: 0 0 22px; }
.diff-points { list-style: none; margin: auto 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.diff-points li {
  position: relative; padding-left: 28px; font-size: 14px; line-height: 1.45; color: var(--text, #0f172a);
}
.diff-points li::before {
  content: '✓'; position: absolute; left: 0; top: 0;
  width: 18px; height: 18px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff; background: var(--accent);
}
@media (max-width: 900px) {
  .diff-grid { grid-template-columns: 1fr; gap: 20px; }
  .diff-section { padding: 68px 0; }
}
</style>
