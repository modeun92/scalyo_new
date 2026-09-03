import { defineStore } from 'pinia'
import { ref } from 'vue'

// Structure only — all human-readable strings live in *-content.js (res_* / mc_* keys)
// and are resolved via t() at render time (Option A, cf. GuidesView / WellbeingResources).
export const useResourceStore = defineStore('resources', () => {

  const resources = ref([
    {
      id: 'r1',
      titleKey: 'res_r1_title',
      category: 'guide',
      level: 'intermediate',
      icon: '📘',
      duration: '12 min',
      descKey: 'res_r1_desc',
      content: [
        {
          weekKey: 'res_r1_s1_w',
          itemKeys: [
            'res_r1_s1_i1',
            'res_r1_s1_i2',
            'res_r1_s1_i3',
            'res_r1_s1_i4'
          ]
        },
        {
          weekKey: 'res_r1_s2_w',
          itemKeys: [
            'res_r1_s2_i1',
            'res_r1_s2_i2',
            'res_r1_s2_i3',
            'res_r1_s2_i4'
          ]
        },
        {
          weekKey: 'res_r1_s3_w',
          itemKeys: [
            'res_r1_s3_i1',
            'res_r1_s3_i2',
            'res_r1_s3_i3',
            'res_r1_s3_i4'
          ]
        },
        {
          weekKey: 'res_r1_s4_w',
          itemKeys: [
            'res_r1_s4_i1',
            'res_r1_s4_i2',
            'res_r1_s4_i3',
            'res_r1_s4_i4'
          ]
        }
      ],
      exerciseKey: 'res_r1_ex'
    },
    {
      id: 'r2',
      titleKey: 'res_r2_title',
      category: 'guide',
      level: 'expert',
      icon: '📘',
      duration: '15 min',
      descKey: 'res_r2_desc',
      content: [
        {
          weekKey: 'res_r2_s1_w',
          itemKeys: [
            'res_r2_s1_i1',
            'res_r2_s1_i2',
            'res_r2_s1_i3',
            'res_r2_s1_i4',
            'res_r2_s1_i5'
          ]
        },
        {
          weekKey: 'res_r2_s2_w',
          itemKeys: [
            'res_r2_s2_i1',
            'res_r2_s2_i2',
            'res_r2_s2_i3',
            'res_r2_s2_i4',
            'res_r2_s2_i5'
          ]
        },
        {
          weekKey: 'res_r2_s3_w',
          itemKeys: [
            'res_r2_s3_i1',
            'res_r2_s3_i2',
            'res_r2_s3_i3',
            'res_r2_s3_i4',
            'res_r2_s3_i5'
          ]
        },
        {
          weekKey: 'res_r2_s4_w',
          itemKeys: [
            'res_r2_s4_i1',
            'res_r2_s4_i2',
            'res_r2_s4_i3',
            'res_r2_s4_i4'
          ]
        }
      ],
      exerciseKey: 'res_r2_ex'
    },
    {
      id: 'r3',
      titleKey: 'res_r3_title',
      category: 'guide',
      level: 'intermediate',
      icon: '📘',
      duration: '18 min',
      descKey: 'res_r3_desc',
      content: [
        {
          weekKey: 'res_r3_s1_w',
          itemKeys: [
            'res_r3_s1_i1',
            'res_r3_s1_i2',
            'res_r3_s1_i3',
            'res_r3_s1_i4'
          ]
        },
        {
          weekKey: 'res_r3_s2_w',
          itemKeys: [
            'res_r3_s2_i1',
            'res_r3_s2_i2',
            'res_r3_s2_i3',
            'res_r3_s2_i4',
            'res_r3_s2_i5'
          ]
        },
        {
          weekKey: 'res_r3_s3_w',
          itemKeys: [
            'res_r3_s3_i1',
            'res_r3_s3_i2',
            'res_r3_s3_i3',
            'res_r3_s3_i4'
          ]
        },
        {
          weekKey: 'res_r3_s4_w',
          itemKeys: [
            'res_r3_s4_i1',
            'res_r3_s4_i2',
            'res_r3_s4_i3',
            'res_r3_s4_i4'
          ]
        }
      ],
      exerciseKey: 'res_r3_ex'
    },
    {
      id: 'r4',
      titleKey: 'res_r4_title',
      category: 'checklist',
      level: 'beginner',
      icon: '📋',
      duration: '5 min',
      descKey: 'res_r4_desc',
      content: [
        {
          weekKey: 'res_r4_s1_w',
          itemKeys: [
            'res_r4_s1_i1',
            'res_r4_s1_i2',
            'res_r4_s1_i3',
            'res_r4_s1_i4',
            'res_r4_s1_i5'
          ]
        },
        {
          weekKey: 'res_r4_s2_w',
          itemKeys: [
            'res_r4_s2_i1',
            'res_r4_s2_i2',
            'res_r4_s2_i3',
            'res_r4_s2_i4',
            'res_r4_s2_i5'
          ]
        },
        {
          weekKey: 'res_r4_s3_w',
          itemKeys: [
            'res_r4_s3_i1',
            'res_r4_s3_i2',
            'res_r4_s3_i3',
            'res_r4_s3_i4',
            'res_r4_s3_i5'
          ]
        },
        {
          weekKey: 'res_r4_s4_w',
          itemKeys: [
            'res_r4_s4_i1',
            'res_r4_s4_i2',
            'res_r4_s4_i3',
            'res_r4_s4_i4',
            'res_r4_s4_i5'
          ]
        },
        {
          weekKey: 'res_r4_s5_w',
          itemKeys: [
            'res_r4_s5_i1',
            'res_r4_s5_i2',
            'res_r4_s5_i3',
            'res_r4_s5_i4',
            'res_r4_s5_i5'
          ]
        }
      ]
    },
    {
      id: 'r5',
      titleKey: 'res_r5_title',
      category: 'checklist',
      level: 'intermediate',
      icon: '📋',
      duration: '5 min',
      descKey: 'res_r5_desc',
      content: [
        {
          weekKey: 'res_r5_s1_w',
          itemKeys: [
            'res_r5_s1_i1',
            'res_r5_s1_i2',
            'res_r5_s1_i3',
            'res_r5_s1_i4',
            'res_r5_s1_i5'
          ]
        },
        {
          weekKey: 'res_r5_s2_w',
          itemKeys: [
            'res_r5_s2_i1',
            'res_r5_s2_i2',
            'res_r5_s2_i3',
            'res_r5_s2_i4',
            'res_r5_s2_i5'
          ]
        },
        {
          weekKey: 'res_r5_s3_w',
          itemKeys: [
            'res_r5_s3_i1',
            'res_r5_s3_i2',
            'res_r5_s3_i3',
            'res_r5_s3_i4',
            'res_r5_s3_i5'
          ]
        },
        {
          weekKey: 'res_r5_s4_w',
          itemKeys: [
            'res_r5_s4_i1',
            'res_r5_s4_i2',
            'res_r5_s4_i3',
            'res_r5_s4_i4',
            'res_r5_s4_i5'
          ]
        }
      ]
    },
    {
      id: 'r6',
      titleKey: 'res_r6_title',
      category: 'checklist',
      level: 'expert',
      icon: '📋',
      duration: '8 min',
      descKey: 'res_r6_desc',
      content: [
        {
          weekKey: 'res_r6_s1_w',
          itemKeys: [
            'res_r6_s1_i1',
            'res_r6_s1_i2',
            'res_r6_s1_i3',
            'res_r6_s1_i4',
            'res_r6_s1_i5'
          ]
        },
        {
          weekKey: 'res_r6_s2_w',
          itemKeys: [
            'res_r6_s2_i1',
            'res_r6_s2_i2',
            'res_r6_s2_i3',
            'res_r6_s2_i4',
            'res_r6_s2_i5'
          ]
        },
        {
          weekKey: 'res_r6_s3_w',
          itemKeys: [
            'res_r6_s3_i1',
            'res_r6_s3_i2',
            'res_r6_s3_i3',
            'res_r6_s3_i4'
          ]
        },
        {
          weekKey: 'res_r6_s4_w',
          itemKeys: [
            'res_r6_s4_i1',
            'res_r6_s4_i2',
            'res_r6_s4_i3',
            'res_r6_s4_i4'
          ]
        }
      ]
    },
    {
      id: 'r7',
      titleKey: 'res_r7_title',
      category: 'framework',
      level: 'expert',
      icon: '🎯',
      duration: '18 min',
      descKey: 'res_r7_desc',
      content: [
        {
          weekKey: 'res_r7_s1_w',
          itemKeys: [
            'res_r7_s1_i1',
            'res_r7_s1_i2',
            'res_r7_s1_i3',
            'res_r7_s1_i4',
            'res_r7_s1_i5'
          ]
        },
        {
          weekKey: 'res_r7_s2_w',
          itemKeys: [
            'res_r7_s2_i1',
            'res_r7_s2_i2',
            'res_r7_s2_i3',
            'res_r7_s2_i4',
            'res_r7_s2_i5'
          ]
        },
        {
          weekKey: 'res_r7_s3_w',
          itemKeys: [
            'res_r7_s3_i1',
            'res_r7_s3_i2',
            'res_r7_s3_i3',
            'res_r7_s3_i4',
            'res_r7_s3_i5'
          ]
        },
        {
          weekKey: 'res_r7_s4_w',
          itemKeys: [
            'res_r7_s4_i1',
            'res_r7_s4_i2',
            'res_r7_s4_i3',
            'res_r7_s4_i4',
            'res_r7_s4_i5'
          ]
        }
      ],
      exerciseKey: 'res_r7_ex'
    },
    {
      id: 'r8',
      titleKey: 'res_r8_title',
      category: 'framework',
      level: 'intermediate',
      icon: '🎯',
      duration: '10 min',
      descKey: 'res_r8_desc',
      content: [
        {
          weekKey: 'res_r8_s1_w',
          itemKeys: [
            'res_r8_s1_i1',
            'res_r8_s1_i2',
            'res_r8_s1_i3',
            'res_r8_s1_i4',
            'res_r8_s1_i5',
            'res_r8_s1_i6'
          ]
        },
        {
          weekKey: 'res_r8_s2_w',
          itemKeys: [
            'res_r8_s2_i1',
            'res_r8_s2_i2',
            'res_r8_s2_i3',
            'res_r8_s2_i4',
            'res_r8_s2_i5'
          ]
        },
        {
          weekKey: 'res_r8_s3_w',
          itemKeys: [
            'res_r8_s3_i1',
            'res_r8_s3_i2',
            'res_r8_s3_i3',
            'res_r8_s3_i4',
            'res_r8_s3_i5'
          ]
        }
      ],
      exerciseKey: 'res_r8_ex'
    },
    {
      id: 'r9',
      titleKey: 'res_r9_title',
      category: 'script',
      level: 'beginner',
      icon: '⚙️',
      duration: '7 min',
      descKey: 'res_r9_desc',
      content: [
        {
          weekKey: 'res_r9_s1_w',
          itemKeys: [
            'res_r9_s1_i1',
            'res_r9_s1_i2',
            'res_r9_s1_i3',
            'res_r9_s1_i4',
            'res_r9_s1_i5'
          ]
        },
        {
          weekKey: 'res_r9_s2_w',
          itemKeys: [
            'res_r9_s2_i1',
            'res_r9_s2_i2',
            'res_r9_s2_i3',
            'res_r9_s2_i4'
          ]
        },
        {
          weekKey: 'res_r9_s3_w',
          itemKeys: [
            'res_r9_s3_i1',
            'res_r9_s3_i2',
            'res_r9_s3_i3',
            'res_r9_s3_i4'
          ]
        },
        {
          weekKey: 'res_r9_s4_w',
          itemKeys: [
            'res_r9_s4_i1',
            'res_r9_s4_i2',
            'res_r9_s4_i3',
            'res_r9_s4_i4'
          ]
        },
        {
          weekKey: 'res_r9_s5_w',
          itemKeys: [
            'res_r9_s5_i1',
            'res_r9_s5_i2',
            'res_r9_s5_i3',
            'res_r9_s5_i4'
          ]
        }
      ],
      exerciseKey: 'res_r9_ex'
    },
    {
      id: 'r10',
      titleKey: 'res_r10_title',
      category: 'script',
      level: 'intermediate',
      icon: '⚙️',
      duration: '8 min',
      descKey: 'res_r10_desc',
      content: [
        {
          weekKey: 'res_r10_s1_w',
          itemKeys: [
            'res_r10_s1_i1',
            'res_r10_s1_i2',
            'res_r10_s1_i3',
            'res_r10_s1_i4'
          ]
        },
        {
          weekKey: 'res_r10_s2_w',
          itemKeys: [
            'res_r10_s2_i1',
            'res_r10_s2_i2',
            'res_r10_s2_i3',
            'res_r10_s2_i4',
            'res_r10_s2_i5'
          ]
        },
        {
          weekKey: 'res_r10_s3_w',
          itemKeys: [
            'res_r10_s3_i1',
            'res_r10_s3_i2',
            'res_r10_s3_i3',
            'res_r10_s3_i4'
          ]
        },
        {
          weekKey: 'res_r10_s4_w',
          itemKeys: [
            'res_r10_s4_i1',
            'res_r10_s4_i2',
            'res_r10_s4_i3',
            'res_r10_s4_i4'
          ]
        }
      ]
    },
    {
      id: 'r11',
      titleKey: 'res_r11_title',
      category: 'script',
      level: 'intermediate',
      icon: '⚙️',
      duration: '6 min',
      descKey: 'res_r11_desc',
      content: [
        {
          weekKey: 'res_r11_s1_w',
          itemKeys: [
            'res_r11_s1_i1',
            'res_r11_s1_i2',
            'res_r11_s1_i3',
            'res_r11_s1_i4'
          ]
        },
        {
          weekKey: 'res_r11_s2_w',
          itemKeys: [
            'res_r11_s2_i1',
            'res_r11_s2_i2',
            'res_r11_s2_i3',
            'res_r11_s2_i4',
            'res_r11_s2_i5'
          ]
        },
        {
          weekKey: 'res_r11_s3_w',
          itemKeys: [
            'res_r11_s3_i1',
            'res_r11_s3_i2',
            'res_r11_s3_i3',
            'res_r11_s3_i4',
            'res_r11_s3_i5'
          ]
        },
        {
          weekKey: 'res_r11_s4_w',
          itemKeys: [
            'res_r11_s4_i1',
            'res_r11_s4_i2',
            'res_r11_s4_i3',
            'res_r11_s4_i4'
          ]
        }
      ]
    },
    {
      id: 'r12',
      titleKey: 'res_r12_title',
      category: 'template',
      level: 'beginner',
      icon: '📊',
      duration: '3 min',
      descKey: 'res_r12_desc',
      content: [
        {
          weekKey: 'res_r12_s1_w',
          itemKeys: [
            'res_r12_s1_i1',
            'res_r12_s1_i2',
            'res_r12_s1_i3',
            'res_r12_s1_i4',
            'res_r12_s1_i5',
            'res_r12_s1_i6',
            'res_r12_s1_i7',
            'res_r12_s1_i8'
          ]
        },
        {
          weekKey: 'res_r12_s2_w',
          itemKeys: [
            'res_r12_s2_i1',
            'res_r12_s2_i2',
            'res_r12_s2_i3',
            'res_r12_s2_i4',
            'res_r12_s2_i5'
          ]
        },
        {
          weekKey: 'res_r12_s3_w',
          itemKeys: [
            'res_r12_s3_i1',
            'res_r12_s3_i2',
            'res_r12_s3_i3',
            'res_r12_s3_i4'
          ]
        }
      ]
    }
  ])

  const masterclasses = ref([
    {
      id: 'mc1',
      titleKey: 'mc_mc1_title',
      quarter: 'Q2 2026',
      isNew: true,
      totalHours: '4h30',
      totalDuration: '4h30',
      level: 'intermediate',
      descKey: 'mc_mc1_desc',
      modules: [
        {
          id: 'mod1',
          titleKey: 'mc_mod_mod1_title',
          duration: '1h',
          lessons: [
            {
              id: 'l1_1',
              titleKey: 'mc_les_l1_1_title',
              duration: '20 min',
              contentKey: 'mc_les_l1_1_body'
            },
            {
              id: 'l1_2',
              titleKey: 'mc_les_l1_2_title',
              duration: '15 min',
              contentKey: 'mc_les_l1_2_body'
            },
            {
              id: 'l1_3',
              titleKey: 'mc_les_l1_3_title',
              duration: '25 min',
              contentKey: 'mc_les_l1_3_body'
            }
          ],
          exercises: [
            {
              id: 'ex1_1',
              titleKey: 'mc_ex_ex1_1_title',
              duration: '45 min',
              contentKey: 'mc_ex_ex1_1_body'
            }
          ]
        },
        {
          id: 'mod2',
          titleKey: 'mc_mod_mod2_title',
          duration: '1h15',
          lessons: [
            {
              id: 'l2_1',
              titleKey: 'mc_les_l2_1_title',
              duration: '25 min',
              contentKey: 'mc_les_l2_1_body'
            },
            {
              id: 'l2_2',
              titleKey: 'mc_les_l2_2_title',
              duration: '20 min',
              contentKey: 'mc_les_l2_2_body'
            },
            {
              id: 'l2_3',
              titleKey: 'mc_les_l2_3_title',
              duration: '30 min',
              contentKey: 'mc_les_l2_3_body'
            },
            {
              id: 'l2_4',
              titleKey: 'mc_les_l2_4_title',
              duration: '15 min',
              contentKey: 'mc_les_l2_4_body'
            }
          ],
          exercises: [
            {
              id: 'ex2_1',
              titleKey: 'mc_ex_ex2_1_title',
              duration: '30 min',
              contentKey: 'mc_ex_ex2_1_body'
            }
          ]
        },
        {
          id: 'mod3',
          titleKey: 'mc_mod_mod3_title',
          duration: '45 min',
          lessons: [
            {
              id: 'l3_1',
              titleKey: 'mc_les_l3_1_title',
              duration: '15 min',
              contentKey: 'mc_les_l3_1_body'
            },
            {
              id: 'l3_2',
              titleKey: 'mc_les_l3_2_title',
              duration: '15 min',
              contentKey: 'mc_les_l3_2_body'
            },
            {
              id: 'l3_3',
              titleKey: 'mc_les_l3_3_title',
              duration: '15 min',
              contentKey: 'mc_les_l3_3_body'
            }
          ],
          exercises: [
            {
              id: 'ex3_1',
              titleKey: 'mc_ex_ex3_1_title',
              duration: '20 min',
              contentKey: 'mc_ex_ex3_1_body'
            }
          ]
        }
      ]
    },
    {
      id: 'mc2',
      titleKey: 'mc_mc2_title',
      quarter: 'Q3 2026',
      isNew: false,
      totalHours: '3h45',
      totalDuration: '3h45',
      level: 'expert',
      descKey: 'mc_mc2_desc',
      modules: [
        {
          id: 'mod4',
          titleKey: 'mc_mod_mod4_title',
          duration: '1h',
          lessons: [
            {
              id: 'l4_1',
              titleKey: 'mc_les_l4_1_title',
              duration: '20 min',
              contentKey: 'mc_les_l4_1_body'
            }
          ],
          exercises: []
        }
      ]
    }
  ])

  const categories = ['guide', 'checklist', 'framework', 'script', 'template']
  const levels = ['beginner', 'intermediate', 'expert']

  return { resources, masterclasses, categories, levels }

})
