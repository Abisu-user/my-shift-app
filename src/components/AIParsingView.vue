<script setup>
import { ref, computed, onMounted } from 'vue'
import { shiftService } from '../services/shiftService'

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
const employees      = ref([])
const previewImage   = ref(null)
const fileInput      = ref(null)
const isParsingImage = ref(false)
const isSaving       = ref(false)

// 審核模式
const reviewMode      = ref(false)
const parsedSchedule  = ref([])
const showWarningOnly = ref(false)

// 手機版 Tab
const mobileTab = ref('list') // 'list' | 'image'

// ─────────────────────────────────────────────
// 時間白名單
// ─────────────────────────────────────────────
// ── 開始時間白名單 ──────────────────────────────
// 兩頭班：09:30 / 14:00 / 14:30 / 16:00
// 貼班  ：10:00 / 17:00 / 18:00
// 晚班  ：17:00 / 17:30 / 18:00
// 全日班：09:30 / 14:00 / 14:30
const VALID_START = new Set([
  '09:30',
  '10:00','10:30',
  '11:00','11:30',
  '14:00','14:30',
  '15:30',
  '16:00','16:30',
  '17:00','17:30','18:00'
])

// ── 結束時間白名單 ──────────────────────────────
// 全日班第一段結尾：13:00 / 13:30
// 午餐貼班結尾    ：14:00
// 全日 / 晚班結尾 ：18:00 / 18:30 / 20:30
const VALID_END = new Set([
  '12:30', '13:00', '13:30', 
  '14:00', '14:30', '15:00', '15:30', 
  '16:00', '16:30', '17:00', '17:30', 
  '18:00', '18:30', '19:00', '19:30', 
  '20:00', '20:30'
])

// ─────────────────────────────────────────────
// 功能一：圖片縮放 & 平移
// ─────────────────────────────────────────────
const imgZoom      = ref(1)
const imgTranslate = ref({ x: 0, y: 0 })
const isPanning    = ref(false)
const panStart     = ref({ x: 0, y: 0 })
const touchDist0   = ref(null)
const zoom0        = ref(1)

function onImgWheel(e) {
  e.preventDefault()
  const delta = e.deltaY < 0 ? 0.15 : -0.15
  imgZoom.value = Math.min(5, Math.max(0.5, imgZoom.value + delta))
}
function onImgMousedown(e) {
  if (e.button !== 0) return
  isPanning.value = true
  panStart.value  = { x: e.clientX - imgTranslate.value.x, y: e.clientY - imgTranslate.value.y }
  e.preventDefault()
}
function onImgMousemove(e) {
  if (!isPanning.value) return
  imgTranslate.value = { x: e.clientX - panStart.value.x, y: e.clientY - panStart.value.y }
}
function onImgMouseup()    { isPanning.value = false }
function onImgMouseleave() { isPanning.value = false }
function resetImgView()    { imgZoom.value = 1; imgTranslate.value = { x: 0, y: 0 } }

function onImgTouchstart(e) {
  if (e.touches.length === 1) {
    isPanning.value = true
    panStart.value  = { x: e.touches[0].clientX - imgTranslate.value.x, y: e.touches[0].clientY - imgTranslate.value.y }
  } else if (e.touches.length === 2) {
    isPanning.value  = false
    touchDist0.value = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
    zoom0.value      = imgZoom.value
  }
}
function onImgTouchmove(e) {
  e.preventDefault()
  if (e.touches.length === 1 && isPanning.value) {
    imgTranslate.value = { x: e.touches[0].clientX - panStart.value.x, y: e.touches[0].clientY - panStart.value.y }
  } else if (e.touches.length === 2 && touchDist0.value) {
    const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
    imgZoom.value = Math.min(5, Math.max(0.5, zoom0.value * (dist / touchDist0.value)))
  }
}
function onImgTouchend() { isPanning.value = false; touchDist0.value = null }

// ─────────────────────────────────────────────
// 功能二：日期範圍
// ─────────────────────────────────────────────
const dateRangeStart = ref(1)
const dateRangeEnd   = ref(7)

const weekPresets = [
  { label: '第1週', start: 1,  end: 7  },
  { label: '第2週', start: 8,  end: 14 },
  { label: '第3週', start: 15, end: 21 },
  { label: '第4週', start: 22, end: 28 },
  { label: '月底',  start: 29, end: 31 },
  { label: '全月',  start: 1,  end: 31 },
]
function applyPreset(p) { dateRangeStart.value = p.start; dateRangeEnd.value = p.end }
const targetRange = computed(() => `${dateRangeStart.value}-${dateRangeEnd.value}`)

// ─────────────────────────────────────────────
// 初始化
// ─────────────────────────────────────────────
onMounted(async () => {
  try {
    const { employees: dbEmployees } = await shiftService.fetchInitialData()
    employees.value = dbEmployees
    console.log('✅ 員工名單:', employees.value.map(e => e.name).join(', '))
  } catch (err) {
    console.error('❌ 載入員工名單失敗:', err)
  }
})

// ─────────────────────────────────────────────
// 工具函數
// ─────────────────────────────────────────────
function timeToMin(t) {
  if (!t || !t.includes(':')) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function isValidStart(t) { return VALID_START.has(t) }
function isValidEnd(t)   { return VALID_END.has(t) }

// 依萍專屬：允許 09:30 起的連續長班（無休息），結束時間可以是 16:00 或白名單內所有時間
const YIPING_NAME   = '依萍'
const YIPING_VALID_END = new Set([...VALID_END, '16:00'])

function isValidEndForRow(t, employeeName) {
  if (employeeName?.includes(YIPING_NAME)) return YIPING_VALID_END.has(t)
  return VALID_END.has(t)
}

function segmentHasWarning(seg, employeeName) {
  return (
    !isValidStart(seg.startTime) ||
    !isValidEndForRow(seg.endTime, employeeName) ||
    timeToMin(seg.endTime) <= timeToMin(seg.startTime)
  )
}

function rowHasWarning(row) {
  if (!row.segments?.length) return false
  if (row.segments.some(s => segmentHasWarning(s, row.name))) return true

  // 依萍單段長班（只有 1 段）→ 無需檢查休息間隔
  if (row.name?.includes(YIPING_NAME) && row.segments.length === 1) return false

  for (let i = 0; i < row.segments.length - 1; i++) {
    const restMin = timeToMin(row.segments[i + 1].startTime) - timeToMin(row.segments[i].endTime)
    // 豁免：全日班標準中場休息（剛好 60 min）
    const isSpecial =
      (row.segments[i].endTime === '13:00' && row.segments[i + 1].startTime === '14:00') ||
      (row.segments[i].endTime === '13:30' && row.segments[i + 1].startTime === '14:30')
    if (!isSpecial && restMin < 60) return true
  }
  return false
}

// ─────────────────────────────────────────────
// AI 資料轉換（相容兩種格式）
// 格式A：[{ employee_name, date, segments:[{start,end}], isOff }]
// 格式B：{ schedule:[{ name, shifts:[{ date, segments:[{startTime,endTime}], isOff }] }] }
// ─────────────────────────────────────────────
function buildEditableRows(aiData) {
  const rows = []

  if (Array.isArray(aiData)) {
    for (const item of aiData) {
      if (item.isOff || !item.segments?.length) continue
      rows.push({
        name: item.employee_name ?? item.name ?? '未知',
        date: item.date,
        segments: item.segments.map(s => ({
          startTime: s.startTime ?? s.start ?? '',
          endTime:   s.endTime   ?? s.end   ?? ''
        }))
      })
    }
  } else {
    for (const emp of aiData.schedule ?? []) {
      for (const shift of emp.shifts ?? []) {
        if (shift.isOff || !shift.segments?.length) continue
        rows.push({
          name: emp.name,
          date: shift.date,
          segments: shift.segments.map(s => ({
            startTime: s.startTime ?? s.start ?? '',
            endTime:   s.endTime   ?? s.end   ?? ''
          }))
        })
      }
    }
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW') || a.date.localeCompare(b.date))
  return rows
}

// ─────────────────────────────────────────────
// Computed
// ─────────────────────────────────────────────
const warningCount = computed(() =>
  parsedSchedule.value.filter(r => rowHasWarning(r)).length
)

const displayedRows = computed(() =>
  showWarningOnly.value
    ? parsedSchedule.value.filter(r => rowHasWarning(r))
    : parsedSchedule.value
)

const nameChangeIndexes = computed(() => {
  const seen    = new Set()
  const indexes = new Set()
  displayedRows.value.forEach((r, i) => {
    if (!seen.has(r.name)) { seen.add(r.name); indexes.add(i) }
  })
  return indexes
})

// ─────────────────────────────────────────────
// 日期格式化
// ─────────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const weekDay = '日一二三四五六'[d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}（${weekDay}）`
}

// ─────────────────────────────────────────────
// 表格操作
// ─────────────────────────────────────────────
function removeRow(rowIndex) {
  const target  = displayedRows.value[rowIndex]
  const realIdx = parsedSchedule.value.indexOf(target)
  if (realIdx !== -1) parsedSchedule.value.splice(realIdx, 1)
}
function addSegment(row) {
  row.segments.push({ startTime: '17:00', endTime: '20:30' })
}
function removeSegment(row, segIdx) {
  row.segments.splice(segIdx, 1)
  if (row.segments.length === 0) {
    const i = parsedSchedule.value.indexOf(row)
    if (i !== -1) parsedSchedule.value.splice(i, 1)
  }
}

// ─────────────────────────────────────────────
// 功能三：手動新增列
// ─────────────────────────────────────────────
const showAddPanel   = ref(false)
const newRowName     = ref('')
const newRowDate     = ref('')
const newRowSegments = ref([{ startTime: '09:30', endTime: '18:30' }])

function openAddPanel() {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = String(now.getMonth() + 1).padStart(2, '0')
  const d   = String(dateRangeStart.value).padStart(2, '0')
  newRowDate.value     = `${y}-${m}-${d}`
  newRowName.value     = employees.value[0]?.name ?? ''
  newRowSegments.value = [{ startTime: '09:30', endTime: '18:30' }]
  showAddPanel.value   = true
}
function addNewRowSegment() {
  newRowSegments.value.push({ startTime: '17:00', endTime: '20:30' })
}
function removeNewRowSegment(i) {
  newRowSegments.value.splice(i, 1)
}
function confirmAddRow() {
  if (!newRowName.value) { alert('請選擇員工'); return }
  if (!newRowDate.value) { alert('請選擇日期'); return }
  if (!newRowSegments.value.length) { alert('請至少填寫一段班次'); return }

  const exists = parsedSchedule.value.some(
    r => r.name === newRowName.value && r.date === newRowDate.value
  )
  if (exists && !confirm(`${newRowName.value} 在 ${newRowDate.value} 已有班次，確定要新增嗎？`)) return

  parsedSchedule.value.push({
    name:     newRowName.value,
    date:     newRowDate.value,
    segments: newRowSegments.value.map(s => ({ startTime: s.startTime, endTime: s.endTime }))
  })
  parsedSchedule.value.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW') || a.date.localeCompare(b.date))
  showAddPanel.value = false
}

// ─────────────────────────────────────────────
// 步驟一：上傳 → AI 解析 → 審核模式
// ─────────────────────────────────────────────
const handlePreview = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  previewImage.value   = URL.createObjectURL(file)
  isParsingImage.value = true

  try {
    const formData = new FormData()
    formData.append('scheduleImage', file)
    formData.append('employeeNames', employees.value.map(e => e.name).join(', '))
    formData.append('targetRange', targetRange.value)

    const response = await fetch('https://my-shift-app.onrender.com/api/parse-schedule', {
      method: 'POST',
      body: formData
    })
    if (!response.ok) throw new Error('API 發生錯誤，請檢查後端狀態')

    const aiResults = await response.json()
    console.log('🤖 AI 原始回傳:', JSON.stringify(aiResults, null, 2))

    // 防呆
    const hasData = Array.isArray(aiResults)
      ? aiResults.length > 0
      : (aiResults?.schedule?.length ?? 0) > 0

    if (!hasData) {
      alert('⚠️ AI 沒有解析到任何班次，請確認圖片清晰度或名單是否正確。')
      previewImage.value = null
      return
    }

    // Log（相容兩種格式，不 crash）
    if (Array.isArray(aiResults)) {
      aiResults.forEach(item =>
        console.log(`  員工：${item.employee_name ?? item.name}，isOff=${item.isOff}，segments=`, item.segments)
      )
    } else {
      aiResults.schedule?.forEach(emp => {
        console.log(`  員工：${emp.name}，shifts：${emp.shifts?.length ?? 0} 天`)
        emp.shifts?.forEach(s => console.log(`    ${s.date} isOff=${s.isOff} segments=`, s.segments))
      })
    }

    // 轉換 + 前端過濾日期範圍
    parsedSchedule.value = buildEditableRows(aiResults).filter(row => {
      const day = new Date(row.date + 'T00:00:00').getDate()
      return day >= dateRangeStart.value && day <= dateRangeEnd.value
    })
    console.log('📋 最終筆數:', parsedSchedule.value.length)

    reviewMode.value      = true
    showWarningOnly.value = false
    resetImgView()

  } catch (err) {
    console.error('上傳處理失敗:', err)
    alert('發生錯誤: ' + err.message)
  } finally {
    isParsingImage.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

// ─────────────────────────────────────────────
// 步驟二：確認寫入資料庫
// ─────────────────────────────────────────────
const confirmSave = async () => {
  if (warningCount.value > 0) {
    if (!confirm(`還有 ${warningCount.value} 筆紅色警告尚未修正。\n確定要強制寫入資料庫嗎？`)) return
  }

  isSaving.value = true
  try {
    const shiftsToSave = []
    for (const row of parsedSchedule.value) {
      // 🛡️ 防呆 1：如果沒有段落，或是沒有日期，直接跳過這筆不存
      if (!row.segments?.length || !row.date) {
        console.warn(`⚠️ 資料不完整 (缺少班次或日期)，跳過：${row.name}`)
        continue
      }
      
      const emp = employees.value.find(e =>
        e.name === row.name || e.name.includes(row.name) || row.name.includes(e.name)
      )
      if (!emp) { console.warn(`⚠️ 找不到員工：${row.name}`); continue }

      // 🛡️ 防呆 2：過濾並清理 segments 資料
      const validSegments = row.segments
        .filter(s => s.startTime && s.endTime) // 過濾掉沒有開始或結束時間的殘缺班次
        .map(s => ({
          // 確保寫入的一定是字串，並把前後不小心多出的空白鍵去掉
          start: String(s.startTime).trim(),
          end: String(s.endTime).trim(),
        }))

      // 如果過濾完之後發現沒有合法班次了，這筆也不要存
      if (validSegments.length === 0) {
        console.warn(`⚠️ 班次時間皆為空值，跳過：${row.name}`)
        continue
      }

      shiftsToSave.push({
        employee_id:  emp.id,
        date:         row.date,
        segments:     validSegments, // 👈 改用過濾過的安全資料
        isDoublePay:  false,
        delivery_fee: 0
      })
    }

    if (shiftsToSave.length === 0) { alert('⚠️ 沒有找到完整且需要寫入的班表。'); return }

    await shiftService.batchSaveShifts(shiftsToSave)
    alert(`✅ 成功寫入 ${shiftsToSave.length} 筆班次！`)

    reviewMode.value     = false
    previewImage.value   = null
    parsedSchedule.value = []

  } catch (err) {
    console.error('寫入失敗:', err)
    alert('寫入失敗: ' + err.message)
  } finally {
    isSaving.value = false
  }
}

const cancelReview = () => {
  reviewMode.value     = false
  previewImage.value   = null
  parsedSchedule.value = []
  if (fileInput.value) fileInput.value.value = ''
}
</script>

<template>

  <!-- ════════════════════════════
       審核模式
       ════════════════════════════ -->
  <div v-if="reviewMode" class="h-full flex flex-col bg-slate-50 p-3 md:p-6 rounded-3xl gap-3 md:gap-4 overflow-hidden">

    <!-- 頂部工具列 -->
    <div class="flex items-center justify-between gap-2 shrink-0">
      <div class="min-w-0">
        <h2 class="text-lg md:text-2xl font-black text-slate-800 flex items-center gap-2 flex-wrap">
          <span class="text-2xl md:text-3xl">🔍</span>
          <span class="hidden sm:inline">人工審核班表</span>
          <span class="text-xs md:text-sm font-black bg-indigo-100 text-indigo-600 rounded-full px-2.5 py-0.5">
            {{ targetRange }} 號
          </span>
        </h2>
        <p class="text-slate-500 font-semibold text-xs md:text-sm mt-0.5 hidden md:block">
          對照左側原圖，修正紅色警告欄位，確認無誤後再寫入資料庫。
        </p>
      </div>
      <div class="flex gap-2 shrink-0">
        <button @click="cancelReview"
          class="px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 transition-colors text-xs md:text-sm">
          ✕ 取消
        </button>
        <button @click="confirmSave" :disabled="isSaving"
          class="hidden md:block px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black transition-colors text-sm shadow-md shadow-indigo-200">
          {{ isSaving ? '寫入中…' : '✅ 確認寫入資料庫' }}
        </button>
      </div>
    </div>

    <!-- 警告橫幅 -->
    <div v-if="warningCount > 0"
      class="shrink-0 flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2.5 md:px-4 md:py-3">
      <div class="flex items-center gap-2 text-amber-700 font-bold text-xs md:text-sm">
        <span>⚠️</span>
        發現 <span class="text-amber-900 font-black">{{ warningCount }}</span> 筆可能有誤，已標紅。
      </div>
      <button @click="showWarningOnly = !showWarningOnly"
        :class="['px-2.5 py-1 rounded-xl text-xs font-black transition-colors shrink-0',
          showWarningOnly ? 'bg-amber-500 text-white' : 'bg-white border border-amber-300 text-amber-700 hover:bg-amber-100']">
        {{ showWarningOnly ? '顯示全部' : '只看警告' }}
      </button>
    </div>

    <!-- ── 手機版 Tab 切換 ────────────────── -->
    <div class="md:hidden shrink-0 flex bg-slate-200 rounded-2xl p-1 gap-1">
      <button @click="mobileTab = 'list'"
        :class="['flex-1 py-2 rounded-xl text-xs font-black transition-colors',
          mobileTab === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500']">
        📋 審核清單（{{ parsedSchedule.length }} 筆）
      </button>
      <button @click="mobileTab = 'image'"
        :class="['flex-1 py-2 rounded-xl text-xs font-black transition-colors',
          mobileTab === 'image' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500']">
        🖼️ 原始班表
      </button>
    </div>

    <!-- 主體：左圖 + 右表（桌面並排 / 手機 Tab） -->
    <div class="flex-1 flex gap-4 overflow-hidden min-h-0">

      <!-- 左側：縮放 & 平移圖片 -->
      <div :class="['shrink-0 flex flex-col gap-2 overflow-hidden',
        'w-full md:w-2/5 xl:w-1/3',
        mobileTab === 'image' ? 'flex' : 'hidden md:flex']">

        <div class="flex items-center justify-between shrink-0 px-1">
          <p class="text-xs font-black text-slate-400 uppercase tracking-widest">原始班表</p>
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-black text-slate-400 tabular-nums w-10 text-right">
              {{ Math.round(imgZoom * 100) }}%
            </span>
            <button @click="imgZoom = Math.max(0.5, imgZoom - 0.25)"
              class="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 font-black text-sm flex items-center justify-center transition-colors">−</button>
            <button @click="imgZoom = Math.min(5, imgZoom + 0.25)"
              class="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 font-black text-sm flex items-center justify-center transition-colors">＋</button>
            <button @click="resetImgView" title="重置縮放"
              class="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-400 hover:bg-slate-100 text-xs flex items-center justify-center transition-colors">⊙</button>
          </div>
        </div>

        <div class="flex-1 overflow-hidden rounded-2xl bg-slate-100 border border-slate-200 cursor-grab active:cursor-grabbing select-none"
          @wheel.prevent="onImgWheel"
          @mousedown="onImgMousedown"
          @mousemove="onImgMousemove"
          @mouseup="onImgMouseup"
          @mouseleave="onImgMouseleave"
          @touchstart.prevent="onImgTouchstart"
          @touchmove.prevent="onImgTouchmove"
          @touchend="onImgTouchend"
        >
          <img :src="previewImage" draggable="false" alt="原始班表"
            :style="{
              transform: `translate(${imgTranslate.x}px, ${imgTranslate.y}px) scale(${imgZoom})`,
              transformOrigin: 'top left',
              transition: isPanning ? 'none' : 'transform 0.1s ease',
              display: 'block', width: '100%', height: 'auto',
              pointerEvents: 'none', userSelect: 'none'
            }"
          />
        </div>

        <p class="text-center text-xs text-slate-300 font-bold shrink-0">
          滾輪縮放 · 拖曳平移 · 雙指捏合
        </p>
      </div>

      <!-- 右側：桌面 Table / 手機 Card list -->
      <div :class="['flex-1 overflow-auto rounded-2xl bg-white shadow-xl border border-slate-100',
        mobileTab === 'list' ? 'block' : 'hidden md:block']">

        <!-- ── 桌面 Table（md 以上顯示） ── -->
        <table class="hidden md:table text-sm border-collapse w-full">
          <thead class="sticky top-0 z-10">
            <tr class="bg-slate-800 text-white text-left">
              <th class="px-4 py-3 font-black rounded-tl-2xl w-24">姓名</th>
              <th class="px-4 py-3 font-black w-28">日期</th>
              <th class="px-4 py-3 font-black">班次（可直接修改）</th>
              <th class="px-4 py-3 font-black text-center rounded-tr-2xl w-14">刪除</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(row, ri) in displayedRows" :key="`d-${row.name}-${row.date}`">
              <tr v-if="nameChangeIndexes.has(ri)" class="bg-slate-100">
                <td colspan="4" class="px-4 py-2 font-black text-slate-600 text-xs tracking-widest">
                  {{ row.name }}
                  <span class="ml-2 text-slate-400 font-bold">
                    {{ parsedSchedule.filter(r => r.name === row.name).length }} 班次
                  </span>
                  <span v-if="parsedSchedule.filter(r => r.name === row.name && rowHasWarning(r)).length"
                    class="ml-2 text-amber-600 font-bold">
                    ⚠️ {{ parsedSchedule.filter(r => r.name === row.name && rowHasWarning(r)).length }} 警告
                  </span>
                </td>
              </tr>
              <tr :class="['border-b border-slate-100 transition-colors',
                rowHasWarning(row) ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50']">
                <td class="px-4 py-2.5 font-bold text-slate-700 text-xs">{{ row.name }}</td>
                <td class="px-4 py-2.5 text-slate-600 whitespace-nowrap text-xs">{{ formatDate(row.date) }}</td>
                <td class="px-4 py-2">
                  <div v-for="(seg, si) in row.segments" :key="si"
                    class="flex items-center gap-2 mb-1.5 last:mb-0">
                    <span class="text-slate-300 text-xs font-bold w-3 shrink-0">{{ si + 1 }}</span>
                    <select v-model="seg.startTime"
                      :class="['border rounded-lg px-1 py-1 w-[5.5rem] text-center font-mono text-sm font-bold transition-colors focus:outline-none focus:ring-2',
                        !isValidStart(seg.startTime)
                          ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-300'
                          : 'border-slate-200 bg-white text-slate-700 focus:ring-indigo-200 focus:border-indigo-400']">
                      <option v-if="!isValidStart(seg.startTime)" :value="seg.startTime">{{ seg.startTime }}</option>
                      <option v-for="t in [...VALID_START]" :key="t" :value="t">{{ t }}</option>
                    </select>
                    <span class="text-slate-300 text-xs shrink-0">→</span>
                    <select v-model="seg.endTime"
                      :class="['border rounded-lg px-1 py-1 w-[5.5rem] text-center font-mono text-sm font-bold transition-colors focus:outline-none focus:ring-2',
                        !isValidEnd(seg.endTime)
                          ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-300'
                          : 'border-slate-200 bg-white text-slate-700 focus:ring-indigo-200 focus:border-indigo-400']">
                      <option v-if="!isValidEnd(seg.endTime)" :value="seg.endTime">{{ seg.endTime }}</option>
                      <option v-for="t in [...VALID_END]" :key="t" :value="t">{{ t }}</option>
                    </select>
                    <span class="text-slate-400 text-xs font-mono tabular-nums w-10 shrink-0">
                      {{ (() => { const m = timeToMin(seg.endTime) - timeToMin(seg.startTime); return m > 0 ? `${Math.floor(m/60)}h${m%60 ? (m%60)+'m' : ''}` : '' })() }}
                    </span>
                    <span
                      v-if="si < row.segments.length - 1 &&
                            !(row.segments[si].endTime === '13:00' && row.segments[si+1].startTime === '14:00') &&
                            (timeToMin(row.segments[si+1].startTime) - timeToMin(row.segments[si].endTime)) < 60"
                      class="text-amber-500 text-xs font-bold shrink-0" title="休息不足 1 小時">⚠️ 休息不足</span>
                    <button @click="removeSegment(row, si)"
                      class="text-slate-300 hover:text-rose-500 transition-colors text-base leading-none shrink-0"
                      title="刪除此班段">✕</button>
                  </div>
                  <button @click="addSegment(row)"
                    class="text-xs text-indigo-400 hover:text-indigo-600 font-bold mt-1 transition-colors">
                    ＋ 新增班段
                  </button>
                </td>
                <td class="px-4 py-2.5 text-center">
                  <button @click="removeRow(ri)"
                    class="text-slate-300 hover:text-rose-500 transition-colors text-lg leading-none"
                    title="刪除這天的班次">🗑</button>
                </td>
              </tr>
            </template>
            <tr v-if="displayedRows.length === 0">
              <td colspan="4" class="py-16 text-center text-slate-400 font-bold">
                {{ showWarningOnly ? '🎉 沒有警告！所有班次都已通過驗證。' : '沒有班次資料。' }}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- ── 手機 Card 列表（md 以下顯示） ── -->
        <div class="md:hidden flex flex-col divide-y divide-slate-100">

          <!-- 空狀態 -->
          <div v-if="displayedRows.length === 0" class="py-16 text-center text-slate-400 font-bold text-sm">
            {{ showWarningOnly ? '🎉 沒有警告！所有班次都已通過驗證。' : '沒有班次資料。' }}
          </div>

          <template v-for="(row, ri) in displayedRows" :key="`m-${row.name}-${row.date}`">

            <!-- 員工分組標題 -->
            <div v-if="nameChangeIndexes.has(ri)"
              class="bg-slate-100 px-4 py-2 flex items-center gap-2">
              <span class="font-black text-slate-700 text-sm">{{ row.name }}</span>
              <span class="text-slate-400 text-xs font-bold">
                {{ parsedSchedule.filter(r => r.name === row.name).length }} 班次
              </span>
              <span v-if="parsedSchedule.filter(r => r.name === row.name && rowHasWarning(r)).length"
                class="text-amber-600 text-xs font-bold">
                ⚠️ {{ parsedSchedule.filter(r => r.name === row.name && rowHasWarning(r)).length }} 警告
              </span>
            </div>

            <!-- 班次卡片 -->
            <div :class="['px-4 py-3 transition-colors',
              rowHasWarning(row) ? 'bg-red-50' : 'bg-white']">

              <!-- 卡片頂部：日期 + 刪除 -->
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <span v-if="rowHasWarning(row)" class="text-red-400 text-xs font-black">⚠️</span>
                  <span class="font-black text-slate-700 text-sm">{{ formatDate(row.date) }}</span>
                </div>
                <button @click="removeRow(ri)"
                  class="text-slate-300 hover:text-rose-500 transition-colors text-base p-1"
                  title="刪除這天的班次">🗑</button>
              </div>

              <!-- 班段 -->
              <div class="flex flex-col gap-2">
                <div v-for="(seg, si) in row.segments" :key="si"
                  class="flex items-center gap-2">
                  <span class="text-slate-300 text-xs font-bold w-3 shrink-0">{{ si + 1 }}</span>

                  <select v-model="seg.startTime"
                    :class="['border rounded-xl px-2 py-2 flex-1 text-center font-mono text-sm font-bold focus:outline-none focus:ring-2',
                      !isValidStart(seg.startTime)
                        ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-300'
                        : 'border-slate-200 bg-white text-slate-700 focus:ring-indigo-200']">
                    <option v-if="!isValidStart(seg.startTime)" :value="seg.startTime">{{ seg.startTime }}</option>
                    <option v-for="t in [...VALID_START]" :key="t" :value="t">{{ t }}</option>
                  </select>

                  <span class="text-slate-300 text-xs shrink-0">→</span>

                  <select v-model="seg.endTime"
                    :class="['border rounded-xl px-2 py-2 flex-1 text-center font-mono text-sm font-bold focus:outline-none focus:ring-2',
                      !isValidEnd(seg.endTime)
                        ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-300'
                        : 'border-slate-200 bg-white text-slate-700 focus:ring-indigo-200']">
                    <option v-if="!isValidEnd(seg.endTime)" :value="seg.endTime">{{ seg.endTime }}</option>
                    <option v-for="t in [...VALID_END]" :key="t" :value="t">{{ t }}</option>
                  </select>

                  <!-- 時長 -->
                  <span class="text-slate-400 text-xs font-mono tabular-nums w-9 text-right shrink-0">
                    {{ (() => { const m = timeToMin(seg.endTime) - timeToMin(seg.startTime); return m > 0 ? `${Math.floor(m/60)}h${m%60 ? (m%60)+'m' : ''}` : '' })() }}
                  </span>

                  <button @click="removeSegment(row, si)"
                    class="text-slate-300 hover:text-rose-500 transition-colors text-lg leading-none shrink-0 p-1">✕</button>
                </div>

                <!-- 休息不足 inline -->
                <div v-for="(seg, si) in row.segments" :key="`w-${si}`">
                  <span
                    v-if="si < row.segments.length - 1 &&
                          !(row.segments[si].endTime === '13:00' && row.segments[si+1].startTime === '14:00') &&
                          (timeToMin(row.segments[si+1].startTime) - timeToMin(row.segments[si].endTime)) < 60"
                    class="text-amber-500 text-xs font-bold">
                    ⚠️ 第 {{ si+1 }}、{{ si+2 }} 段休息不足 1 小時
                  </span>
                </div>
              </div>

              <button @click="addSegment(row)"
                class="mt-2 text-xs text-indigo-400 hover:text-indigo-600 font-bold transition-colors">
                ＋ 新增班段
              </button>
            </div>

          </template>
        </div>

      </div>
    </div>

    <!-- 底部列 -->
    <div class="shrink-0 bg-white rounded-2xl px-4 py-3 shadow-sm border border-slate-100">
      <!-- 手機：兩行佈局 -->
      <div class="flex flex-col gap-2 md:hidden">
        <div class="flex items-center justify-between">
          <div class="text-sm text-slate-500">
            共 <span class="font-black text-slate-700">{{ parsedSchedule.length }}</span> 筆
            <span v-if="warningCount > 0" class="ml-1 text-red-500 font-bold">· {{ warningCount }} 筆需確認</span>
            <span v-else class="ml-1 text-emerald-500 font-bold">· 全部通過 ✓</span>
          </div>
          <button @click="openAddPanel"
            class="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-black text-xs transition-colors">
            ＋ 新增班次
          </button>
        </div>
        <button @click="confirmSave" :disabled="isSaving"
          class="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black transition-colors shadow-md shadow-indigo-200 text-sm">
          {{ isSaving ? '⏳ 寫入中…' : `✅ 確認寫入 ${parsedSchedule.length} 筆` }}
        </button>
      </div>
      <!-- 桌面：單行佈局 -->
      <div class="hidden md:flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="text-sm text-slate-500">
            共 <span class="font-black text-slate-700">{{ parsedSchedule.length }}</span> 筆班次
            <span v-if="warningCount > 0" class="ml-2 text-red-500 font-bold">· {{ warningCount }} 筆需確認</span>
            <span v-else class="ml-2 text-emerald-500 font-bold">· 全部通過驗證 ✓</span>
          </div>
          <button @click="openAddPanel"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-600 font-black text-xs transition-colors">
            <span class="text-base leading-none">＋</span> 手動新增班次
          </button>
        </div>
        <div class="flex gap-3">
          <button @click="cancelReview"
            class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 transition-colors text-sm">取消</button>
          <button @click="confirmSave" :disabled="isSaving"
            class="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black transition-colors shadow-md shadow-indigo-200 text-sm">
            {{ isSaving ? '⏳ 寫入中…' : `✅ 確認寫入 ${parsedSchedule.length} 筆` }}
          </button>
        </div>
      </div>
    </div>
  </div>


  <!-- ════════════════════════════
       上傳模式
       ════════════════════════════ -->
  <div v-else class="h-full flex flex-col bg-slate-50 p-4 md:p-8 rounded-3xl">
    <div class="mb-8">
      <h2 class="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
        <span class="text-4xl">🤖</span> AI 智能排班辨識
      </h2>
      <p class="text-slate-500 font-bold mt-2">
        上傳手寫或紙本班表照片，AI 自動辨識後供您人工審核，確認無誤再寫入系統。
      </p>
    </div>

    <div class="flex-1 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 flex flex-col items-center justify-center">

      <div v-if="previewImage" class="w-full max-w-md mb-6 relative">
        <img :src="previewImage" class="w-full h-auto rounded-2xl shadow-md border-4 border-slate-100" />
        <button @click="previewImage = null"
          class="absolute top-2 right-2 bg-slate-900/50 hover:bg-rose-500 text-white p-2 rounded-xl backdrop-blur-sm transition-colors">✕</button>
      </div>

      <!-- 日期範圍設定 -->
      <div class="w-full max-w-md mb-5 bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
        <p class="text-xs font-black text-indigo-400 uppercase tracking-widest mb-3">📅 解析日期範圍</p>
        <div class="flex flex-wrap gap-1.5 mb-3">
          <button v-for="p in weekPresets" :key="p.label" @click="applyPreset(p)"
            :class="['px-3 py-1 rounded-lg text-xs font-black transition-colors',
              dateRangeStart === p.start && dateRangeEnd === p.end
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-100']">
            {{ p.label }}
          </button>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-slate-500 shrink-0">只抓</span>
          <input v-model.number="dateRangeStart" type="number" min="1" max="31"
            class="w-14 border border-indigo-200 rounded-lg px-2 py-1.5 text-center font-mono font-black text-sm text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          <span class="text-slate-400 font-bold">～</span>
          <input v-model.number="dateRangeEnd" type="number" min="1" max="31"
            class="w-14 border border-indigo-200 rounded-lg px-2 py-1.5 text-center font-mono font-black text-sm text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          <span class="text-xs font-bold text-slate-500 shrink-0">號</span>
          <span class="ml-auto text-xs font-black text-indigo-500 bg-white border border-indigo-200 rounded-lg px-2.5 py-1">
            共 {{ dateRangeEnd - dateRangeStart + 1 }} 天
          </span>
        </div>
      </div>

      <!-- 上傳區 -->
      <label class="w-full max-w-md flex flex-col items-center px-4 py-10 bg-indigo-50/50 text-indigo-500 rounded-3xl tracking-wide uppercase border-4 border-dashed border-indigo-200 cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-600 transition-all">
        <svg class="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
        </svg>
        <span class="font-black text-lg">選擇或拍攝班表照片</span>
        <span class="text-sm font-bold text-indigo-300 mt-1">支援 JPG、PNG 格式</span>
        <span class="mt-2 text-xs font-black text-indigo-400 bg-indigo-100 rounded-lg px-3 py-1">
          將解析 {{ dateRangeStart }}～{{ dateRangeEnd }} 號
        </span>
        <input type="file" ref="fileInput" accept="image/*" class="hidden" @change="handlePreview" />
      </label>

      <div class="mt-8 flex items-center gap-2 text-xs text-slate-400 font-bold">
        <span class="bg-indigo-100 text-indigo-600 rounded-full w-6 h-6 flex items-center justify-center font-black">1</span>
        設定範圍
        <span class="text-slate-200">────</span>
        <span class="bg-indigo-100 text-indigo-600 rounded-full w-6 h-6 flex items-center justify-center font-black">2</span>
        上傳照片
        <span class="text-slate-200">────</span>
        <span class="bg-indigo-100 text-indigo-600 rounded-full w-6 h-6 flex items-center justify-center font-black">3</span>
        人工審核
        <span class="text-slate-200">────</span>
        <span class="bg-indigo-100 text-indigo-600 rounded-full w-6 h-6 flex items-center justify-center font-black">4</span>
        寫入資料庫
      </div>
    </div>
  </div>


  <!-- ════════════════════════════
       Loading Overlay
       ════════════════════════════ -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isParsingImage"
        class="fixed inset-0 z-[300] flex flex-col items-center justify-center p-4 bg-slate-900/85 backdrop-blur-md">
        <div class="relative w-24 h-24 mb-6">
          <div class="absolute inset-0 border-4 border-indigo-500/30 rounded-2xl"></div>
          <div class="absolute inset-0 bg-gradient-to-b from-indigo-500/0 via-indigo-500/40 to-indigo-500/0 animate-scan"></div>
          <svg class="w-full h-full text-indigo-400 p-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
          </svg>
        </div>
        <h3 class="text-white font-black text-2xl mb-2 tracking-widest animate-pulse">AI 視覺解析中</h3>
        <p class="text-indigo-200 text-sm font-bold text-center">
          正在讀取手寫班表與休假記號…<br>這可能需要 1 ~ 2 分鐘，請稍候
        </p>
      </div>
    </Transition>

    <!-- ════════════════════════════
         手動新增 Modal
         ════════════════════════════ -->
    <Transition name="fade">
      <div v-if="showAddPanel"
        class="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
        @click.self="showAddPanel = false">
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5">

          <div class="flex items-center justify-between">
            <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">✏️ 手動新增班次</h3>
            <button @click="showAddPanel = false"
              class="text-slate-300 hover:text-slate-500 text-xl leading-none transition-colors">✕</button>
          </div>

          <!-- 員工 -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-black text-slate-400 uppercase tracking-widest">員工姓名</label>
            <select v-model="newRowName"
              class="border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white">
              <option value="" disabled>請選擇員工…</option>
              <option v-for="emp in employees" :key="emp.id" :value="emp.name">{{ emp.name }}</option>
            </select>
          </div>

          <!-- 日期 -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-black text-slate-400 uppercase tracking-widest">日期</label>
            <input v-model="newRowDate" type="date"
              class="border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
          </div>

          <!-- 班段 -->
          <div class="flex flex-col gap-2">
            <label class="text-xs font-black text-slate-400 uppercase tracking-widest">班次時間</label>

            <div v-for="(seg, si) in newRowSegments" :key="si"
              class="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
              <span class="text-xs font-black text-slate-300 w-3 shrink-0">{{ si + 1 }}</span>

              <select v-model="seg.startTime"
                :class="['border rounded-lg px-2 py-1.5 font-mono font-black text-sm flex-1 focus:outline-none focus:ring-2',
                  !isValidStart(seg.startTime) ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-200' : 'border-slate-200 bg-white text-slate-700 focus:ring-indigo-200']">
                <option v-for="t in [...VALID_START]" :key="t" :value="t">{{ t }}</option>
              </select>

              <span class="text-slate-300 text-xs shrink-0">→</span>

              <select v-model="seg.endTime"
                :class="['border rounded-lg px-2 py-1.5 font-mono font-black text-sm flex-1 focus:outline-none focus:ring-2',
                  !isValidEnd(seg.endTime) ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-200' : 'border-slate-200 bg-white text-slate-700 focus:ring-indigo-200']">
                <option v-for="t in [...VALID_END]" :key="t" :value="t">{{ t }}</option>
              </select>

              <button v-if="newRowSegments.length > 1" @click="removeNewRowSegment(si)"
                class="text-slate-300 hover:text-rose-500 transition-colors text-base leading-none shrink-0">✕</button>
            </div>

            <button @click="addNewRowSegment"
              class="text-xs text-indigo-400 hover:text-indigo-600 font-black transition-colors text-left px-1">
              ＋ 新增第二段班
            </button>
          </div>

          <div class="flex gap-3 pt-1">
            <button @click="showAddPanel = false"
              class="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors">取消</button>
            <button @click="confirmAddRow"
              class="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black transition-colors shadow-md shadow-indigo-200">
              ✅ 新增到審核表
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>

</template>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

@keyframes scan {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(100%); }
}
.animate-scan { animation: scan 2s linear infinite; }
</style>