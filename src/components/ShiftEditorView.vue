<script setup>
import { ref, computed, onMounted } from 'vue'
import { shiftService } from '../services/shiftService'

const employees = ref([])
const shifts = ref([])
const loading = ref(true)
const expandedEmpId = ref(null)

const quickPresets = ref([])
const presetInput = ref({ start: '', end: '', label: '' })

// 日期導航
const currentMonday = ref(new Date())

const datePicker = ref(null)
const timeOptions = []
for (let i = 0; i < 24; i++) {
  const h = i.toString().padStart(2, '0')
  timeOptions.push(`${h}:00`)
  timeOptions.push(`${h}:30`)
}

// 編輯彈窗狀態
const showEditModal = ref(false)
const editingShift = ref({
  employee_id: null,
  employee_name: '',
  date: '',
  segments: [] // <--- 改成陣列
})

const confirmConfig = ref({
  show: false,
  title: '',
  message: '',
  onConfirm: null,
  isDanger: true // 是否為危險操作（紅色按鈕）
})

const requestConfirm = (title, message, onConfirm, isDanger = true) => {
  confirmConfig.value = { show: true, title, message, onConfirm, isDanger }
}

// 計算本週日期
const weekDates = computed(() => {
  const dates = []
  const current = new Date(currentMonday.value)
  const day = current.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day 
  
  const monday = new Date(current)
  monday.setDate(current.getDate() + diffToMonday)
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const dateStr = String(d.getDate()).padStart(2, '0')
    
    dates.push(`${year}-${month}-${dateStr}`)
  }
  return dates
})

const toggleEmpCard = (id) => {
  expandedEmpId.value = expandedEmpId.value === id ? null : id
}

const removeSegment = (index) => {
  editingShift.value.segments.splice(index, 1)
}

const loadPresets = async () => {
  try {
    // 呼叫 service 從資料庫抓取常用時段
    const data = await shiftService.fetchPresets()
    quickPresets.value = data || []
  } catch (e) {
    console.error('載入常用時段失敗:', e)
  }
}

// 套用時段 (現在 p 是物件了)
const applyPreset = (p) => {
    const isDuplicate = editingShift.value.segments.some(
        seg => seg.start === p.start_time && seg.end === p.end_time
    )

    if (!isDuplicate) {
        editingShift.value.segments.push({ 
        start: p.start_time, 
        end: p.end_time 
        })
    }
}

// 新增常用時段到資料庫
const addNewPreset = async () => {
  if (!presetInput.value.start || !presetInput.value.end) return
  
  try {
    const newPreset = await shiftService.addPreset({
      start_time: presetInput.value.start,
      end_time: presetInput.value.end,
      label: presetInput.value.label || null
    })
    quickPresets.value.push(newPreset)
    presetInput.value = { start: '', end: '', label: '' }
  } catch (e) {
    alert('新增失敗')
  }
}

// 從資料庫刪除
const removePreset = (id, index) => {
  requestConfirm(
    '刪除常用時段',
    '這會將此時段從雲端永久刪除，所有管理員將無法再看到。',
    async () => {
      try {
        await shiftService.deletePreset(id)
        quickPresets.value.splice(index, 1)
        confirmConfig.value.show = false
      } catch (e) {
        alert('刪除失敗')
      }
    }
  )
}

const openDatePicker = () => {
    if (datePicker.value) {
        datePicker.value.showPicker()
    }
}

const handleDelete = () => {
  requestConfirm(
    '清空班表',
    '確定要清空當日的所有排班嗎？此動作無法復原。',
    async () => {
      try {
        await shiftService.deleteShift(editingShift.value.employee_id, editingShift.value.date)
        await loadData()
        showEditModal.value = false
        confirmConfig.value.show = false // 關閉確認視窗
      } catch (e) {
        alert('刪除失敗')
      }
    }
  )
}



const formatDateLabel = (dateStr) => {
  const d = new Date(dateStr)
  const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
}

const changeWeek = (offset) => {
  const newDate = new Date(currentMonday.value)
  newDate.setDate(newDate.getDate() + (offset * 7))
  currentMonday.value = newDate
  loadData()
}

const loadData = async () => {
  loading.value = true
  try {
    // 平行載入加速
    const [initData, shiftsData] = await Promise.all([
      shiftService.fetchInitialData(),
      shiftService.fetchShiftsByRange(weekDates.value[0], weekDates.value[6])
    ])
    employees.value = initData.employees
    shifts.value = shiftsData
  } catch (e) {
    console.error(e)
  }
  loading.value = false
}

const getShift = (empId, date) => {
  return shifts.value.find(s => s.employee_id === empId && s.date === date)
}

// --- 互動邏輯 ---

const openEdit = (emp, date) => {
  const existing = getShift(emp.id, date)
  
  // 深拷貝 segments 避免直接修改到畫面
  let segments = []
  if (existing && existing.segments) {
    segments = JSON.parse(JSON.stringify(existing.segments))
  } else {
    // 預設給一個時段
    segments = [{ start: '09:00', end: '18:00' }]
  }

  editingShift.value = {
    employee_id: emp.id,
    employee_name: emp.name,
    date: date,
    segments: segments
  }
  showEditModal.value = true
}

// 新增一個時段
const addSegment = () => {
  editingShift.value.segments.push({ start: '12:00', end: '16:00' })
}

const handleSave = async () => {
  try {
    // 過濾掉空的時間
    const cleanSegments = editingShift.value.segments.filter(s => s.start && s.end)
    
    // 如果全部都刪光了，等於刪除班表
    if (cleanSegments.length === 0) {
      await handleDelete()
      return
    }

    await shiftService.saveShift({
      ...editingShift.value,
      segments: cleanSegments
    })
    await loadData()
    showEditModal.value = false
  } catch (e) {
    alert('儲存失敗: ' + e.message)
  }
}

// --- 批次操作狀態 ---
const isBatchMode = ref(false)
const selectedEmpIds = ref([])
const showBatchModal = ref(false)

// 批次編輯的內容
const batchEditForm = ref({
  days: [], // 勾選要套用的星期幾 (0-6)
  segments: []
})

// 切換批次模式
const toggleBatchMode = () => {
  isBatchMode.value = !isBatchMode.value
  selectedEmpIds.value = [] // 切換時清空勾選
}

// 全選/全不選
const toggleSelectAll = () => {
  if (selectedEmpIds.value.length === employees.value.length) {
    selectedEmpIds.value = []
  } else {
    selectedEmpIds.value = employees.value.map(e => e.id)
  }
}

// 執行批次刪除
const handleBatchDelete = () => {
  if (selectedEmpIds.value.length === 0) return
  
  requestConfirm(
    '批次刪除班表',
    `確定要刪除這 ${selectedEmpIds.value.length} 位員工本週的所有班表嗎？`,
    async () => {
      try {
        // 這裡調用 service 執行批次刪除邏輯
        // 建議在 shiftService 寫一個批次刪除的方法，或者循環執行
        for (const id of selectedEmpIds.value) {
            for (const date of weekDates.value) {
                await shiftService.deleteShift(id, date)
            }
        }
        await loadData()
        confirmConfig.value.show = false
        isBatchMode.value = false
      } catch (e) {
        alert('批次刪除失敗')
      }
    }
  )
}

// 執行批次儲存
const handleBatchSave = async () => {
    // 檢查是否有選員工和日期
    if (selectedEmpIds.value.length === 0) {
        alert('請先勾選要操作的員工')
        return
    }
    if (batchEditForm.value.days.length === 0) {
        alert('請至少選擇一個天數（週一～週日）')
        return
    }
    
    // 過濾掉空的時間段（跟單人編輯邏輯一致）
    const cleanSegments = batchEditForm.value.segments.filter(s => s.start && s.end)
    if (cleanSegments.length === 0) {
        alert('請先設定要套用的時段')
        return
    }

    loading.value = true
    try {
        // 3. 執行批次儲存
        for (const empId of selectedEmpIds.value) {
            for (const dayIdx of batchEditForm.value.days) {
                const date = weekDates.value[dayIdx] // 取得對應日期的字串
                
                await shiftService.saveShift({
                    employee_id: empId,
                    date: date,
                    segments: cleanSegments
                })
            }
        }
        
        // 成功後的清理動作
        await loadData()           // 刷新畫面班表
        showBatchModal.value = false // 關閉彈窗
        isBatchMode.value = false    // 退出批次模式
        selectedEmpIds.value = []    // 清空勾選
        batchEditForm.value = { days: [], segments: [] } // 重置表單內容
        
    } catch (e) {
        console.error('批次儲存失敗詳細原因:', e)
        alert('批次儲存失敗，請檢查網路連線')
    } finally {
        loading.value = false
    }
}

// 批次套用常用時段
const applyBatchPreset = (p) => {
  // 檢查是否重複，不重複才新增到 batchEditForm 裡
  const isDuplicate = batchEditForm.value.segments.some(
    seg => seg.start === p.start_time && seg.end === p.end_time
  )

  if (!isDuplicate) {
    batchEditForm.value.segments.push({ 
      start: p.start_time, 
      end: p.end_time 
    })
  }
}

onMounted(() => {
  loadData()
  loadPresets() 
})
</script>

<template>
  <div class="p-6 h-full flex flex-col">
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 shrink-0 gap-4">
      <div class="flex items-center gap-3">
        <h2 class="text-2xl font-black text-slate-800 tracking-tight">班表編輯器</h2>
        
        <button 
            @click="toggleBatchMode"
            :class="isBatchMode ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border-slate-200'"
            class="flex items-center gap-2 px-4 py-1.5 rounded-xl border-2 font-bold text-sm transition-all shadow-sm active:scale-95"
        >
            <span v-if="isBatchMode">退出批次</span>
            <span v-else>批次操作</span>
            <span v-if="isBatchMode" class="bg-white/20 px-1.5 rounded text-[10px]">{{ selectedEmpIds.length }}</span>
        </button>
        </div>
      
      <div class="flex items-center gap-4 bg-white p-1 rounded-xl shadow-sm border border-slate-400 relative">
        <button @click="changeWeek(-1)" class="p-2 hover:bg-slate-100 rounded-lg text-slate-500 font-bold">&lt; 上週</button>
        
        <span 
          @click="openDatePicker"
          class="font-bold text-slate-700 px-2 min-w-[180px] text-center cursor-pointer hover:text-indigo-600 transition-colors"
        >
          {{ weekDates[0] }} ~ {{ weekDates[6] }} 📅
        </span>
        
        <button @click="changeWeek(1)" class="p-2 hover:bg-slate-100 rounded-lg text-slate-500 font-bold">下週 &gt;</button>

        <input 
          type="date" 
          ref="datePicker" 
          class="absolute opacity-0 pointer-events-none w-0 h-0" 
          @change="handleDateSelect"
        />
      </div>
    </header>

    <div v-if="loading" class="flex-1 flex justify-center items-center">
      <div class="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
    </div>

    <div v-else class="hidden md:block landscape:blockflex-1 overflow-auto bg-white rounded-2xl shadow-sm border border-slate-400 relative">
      <table class="w-full text-left border-collapse">
        <thead class="bg-slate-50 sticky top-0 z-10 shadow-sm">
          <tr>
            <th class="p-4 border-b border-r border-slate-400 min-w-[180px] font-bold text-slate-600 sticky left-0 z-30 bg-slate-50">
                <div class="flex items-center gap-3">
                    <input 
                    v-if="isBatchMode" 
                    type="checkbox" 
                    :checked="selectedEmpIds.length === employees.length && employees.length > 0"
                    @change="toggleSelectAll"
                    class="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    >
                    <span>員工姓名</span>
                </div>
            </th>
            <th v-for="date in weekDates" :key="date" class="p-4 border-b border-r last:border-r-0 border-slate-400 min-w-[145px] font-bold text-slate-600 text-center">
              {{ formatDateLabel(date) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="emp in employees" :key="emp.id" class="hover:bg-slate-50/50">
            <td class="p-4 border-b border-r border-slate-400 font-bold text-slate-700 bg-white sticky left-0 z-10">
              <div class="flex items-center gap-3">
                <input 
                    v-if="isBatchMode" 
                    type="checkbox" 
                    :value="emp.id" 
                    v-model="selectedEmpIds"
                    class="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    >
                {{ emp.name }}
              </div>
            </td>

            <td v-for="date in weekDates" :key="date" class="border-b border-r last:border-r-0 border-slate-400 p-1 h-24 align-top relative">
              <button 
                @click="openEdit(emp, date)"
                class="w-full h-full rounded-xl transition-all duration-200 flex flex-col gap-1 p-1 group hover:bg-slate-100 border border-transparent"
                :class="getShift(emp.id, date) ? 'border-indigo-100 bg-indigo-50/30' : ''"
              >
                <template v-if="getShift(emp.id, date) && getShift(emp.id, date).segments">
                  <div 
                    v-for="(seg, idx) in getShift(emp.id, date).segments" 
                    :key="idx"
                    class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold w-full text-center truncate"
                  >
                    {{ seg.start }} - {{ seg.end }}
                  </div>
                </template>

                <template v-else>
                  <span class="text-slate-400 text-3xl font-light m-auto">+</span>
                </template>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  <!-- 手機版員工卡片 -->
  <div class="md:hidden landscape:hidden flex-1 overflow-y-auto space-y-3 pb-24">
    <div v-if="isBatchMode" class="flex items-center justify-between bg-indigo-50 p-3 rounded-xl border border-indigo-100 mb-2">
      <span class="text-xs font-bold text-indigo-600">批次模式：請勾選員工</span>
      <div class="flex items-center gap-2">
          <input 
            type="checkbox" 
            :checked="selectedEmpIds.length === employees.length && employees.length > 0"
            @change="toggleSelectAll"
            class="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          >
          <span class="text-xs font-bold text-slate-600">全選</span>
      </div>
    </div>

    <div v-for="emp in employees" :key="emp.id" class="bg-white rounded-2xl border border-slate-300 overflow-hidden shadow-sm transition-all" 
        :class="isBatchMode && selectedEmpIds.includes(emp.id) ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/10' : ''">
      
      <div 
        @click="isBatchMode ? (selectedEmpIds.includes(emp.id) ? selectedEmpIds = selectedEmpIds.filter(id => id !== emp.id) : selectedEmpIds.push(emp.id)) : toggleEmpCard(emp.id)"
        class="p-4 flex items-center justify-between border-b border-slate-200 active:bg-indigo-50 transition-colors cursor-pointer"
        :class="expandedEmpId === emp.id ? 'bg-slate-50' : 'bg-white'"
      >
        <div class="flex items-center gap-3">
          <div v-if="isBatchMode" class="pointer-events-none">
              <input 
                type="checkbox" 
                :value="emp.id" 
                v-model="selectedEmpIds"
                class="w-6 h-6 rounded-lg border-2 border-slate-300 text-indigo-600 focus:ring-indigo-500"
              >
          </div>
          <span class="font-black text-slate-700 text-lg">{{ emp.name }}</span>
        </div>
        
        <span v-if="!isBatchMode" class="text-slate-400 transition-transform duration-300" :class="expandedEmpId === emp.id ? 'rotate-180' : ''">▼</span>
      </div>

      <div v-show="!isBatchMode && expandedEmpId === emp.id" class="p-3 grid grid-cols-2 gap-2 bg-slate-50/50">
        <div 
          v-for="date in weekDates" 
          :key="date" 
          @click="openEdit(emp, date)"
          class="border border-slate-200 rounded-xl p-3 flex flex-col gap-2 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all active:scale-95 bg-white"
          :class="getShift(emp.id, date) ? 'bg-indigo-50/50 border-indigo-200' : ''"
        >
          <div class="flex justify-between items-center">
            <span class="text-xs font-bold text-slate-500">{{ formatDateLabel(date).split(' ')[0] }}</span>
            <span class="text-[10px] font-black text-white bg-slate-400 px-1.5 rounded">{{ formatDateLabel(date).split(' ')[1].replace(/[()]/g, '') }}</span>
          </div>
          <div class="min-h-[30px] flex items-center justify-center">
            <template v-if="getShift(emp.id, date) && getShift(emp.id, date).segments.length > 0">
                <div class="flex flex-col gap-1 w-full">
                  <div v-for="(seg, i) in getShift(emp.id, date).segments" :key="i" class="text-[10px] font-black text-indigo-600 bg-white border border-indigo-100 rounded px-1 text-center truncate">
                    {{ seg.start }}-{{ seg.end }}
                  </div>
                </div>
            </template>
            <template v-else>
                <span class="text-slate-300 text-2xl font-light">+</span>
            </template>
          </div>
        </div>
      </div>

    </div>
  </div>

   <Teleport to="body">
        <Transition name="slide-up">
            <div v-if="isBatchMode && selectedEmpIds.length > 0" class="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
                <div class="bg-slate-900 text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-8 border border-white/10 backdrop-blur-md">
                    <div class="flex flex-col">
                    <span class="text-xs text-slate-400 font-bold uppercase tracking-widest">已選取</span>
                    <span class="text-lg font-black text-indigo-400">{{ selectedEmpIds.length }} 位員工</span>
                    </div>
                    
                    <div class="h-8 w-[1px] bg-white/10"></div>
                    
                    <div class="flex gap-3">
                    <button @click="handleBatchDelete" class="px-6 py-2.5 rounded-2xl bg-rose-500/10 text-rose-400 font-black text-sm hover:bg-rose-500 hover:text-white transition-all">
                        批次刪除
                    </button>
                    <button @click="showBatchModal = true" class="px-6 py-2.5 rounded-2xl bg-indigo-600 text-white font-black text-sm hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all">
                        批次修改時段
                    </button>
                    </div>
                    
                    <button @click="selectedEmpIds = []" class="p-2 text-slate-400 hover:text-white">✕</button>
                </div>
            </div>
        </Transition>

        <div v-if="showBatchModal" class="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="showBatchModal = false"></div>
                <div class="bg-white w-full max-w-lg p-8 rounded-[2.5rem] shadow-2xl relative z-10 animate-scale-up">
                <h3 class="text-2xl font-black text-slate-800 mb-6 tracking-tight">批次套用時段</h3>
                
                <div class="mb-8">
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">第一步：選擇套用日期</label>
                    <div class="grid grid-cols-7 gap-2">
                    <button 
                        v-for="(day, idx) in ['一', '二', '三', '四', '五', '六', '日']" :key="idx"
                        @click="batchEditForm.days.includes(idx) ? batchEditForm.days = batchEditForm.days.filter(d => d !== idx) : batchEditForm.days.push(idx)"
                        :class="batchEditForm.days.includes(idx) ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-50 text-slate-400'"
                        class="py-3 rounded-xl font-black text-sm transition-all"
                    >
                        {{ day }}
                    </button>
                    </div>
                </div>

                <div class="mb-8">
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">第二步：設定上班時段</label>
                    <div class="flex flex-wrap gap-2 mb-6">
                        <button 
                        v-for="p in quickPresets" :key="p.id"
                        @click="applyBatchPreset(p)"
                        class="bg-slate-50 border-2 border-slate-100 hover:border-indigo-400 hover:bg-indigo-50 text-slate-700 px-3 py-2 rounded-2xl text-xs font-bold transition-all flex flex-col items-center min-w-[90px]"
                        >
                        <span v-if="p.label" class="text-[9px] text-indigo-500 font-black mb-1">{{ p.label }}</span>
                        <span class="font-black">{{ p.start_time }} - {{ p.end_time }}</span>
                        </button>
                    </div>

                    <div v-if="batchEditForm.segments.length > 0" class="space-y-2 p-4 bg-indigo-50/50 rounded-3xl border border-indigo-100">
                        <p class="text-[10px] font-black text-indigo-400 uppercase mb-2">準備套用的時段：</p>
                        <div v-for="(seg, idx) in batchEditForm.segments" :key="idx" class="flex items-center justify-between bg-white p-2 rounded-xl shadow-sm">
                        <div class="flex items-center gap-2">
                            <input v-model="seg.start" type="time" class="text-xs font-bold border-none p-0 focus:ring-0 w-25">
                            <span class="text-slate-300">~</span>
                            <input v-model="seg.end" type="time" class="text-xs font-bold border-none p-0 focus:ring-0 w-25">
                        </div>
                        <button @click="batchEditForm.segments.splice(idx, 1)" class="text-slate-300 hover:text-rose-500">✕</button>
                        </div>
                    </div>
                    
                    <div v-else class="text-center py-6 border-2 border-dashed border-slate-100 rounded-3xl text-slate-300 text-xs font-bold">
                        尚未選擇任何時段
                    </div>
                </div>

                <div class="flex gap-3">
                    <button @click="showBatchModal = false" class="flex-1 py-4 rounded-2xl font-black text-slate-400 hover:bg-slate-50">取消</button>
                    <button @click="handleBatchSave" class="flex-1 py-4 rounded-2xl bg-indigo-600 text-white font-black shadow-lg shadow-indigo-200 hover:bg-indigo-500">確認套用</button>
                </div>
            </div>
        </div>
      <div v-if="showEditModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="showEditModal = false"></div>
        
        <div class="bg-white w-full max-w-md p-6 rounded-3xl shadow-2xl relative z-10 animate-scale-up max-h-[90vh] overflow-y-auto">
          <h3 class="text-xl font-black text-slate-800 mb-1">編輯班表</h3>
          <p class="text-slate-500 font-bold text-sm mb-6">{{ editingShift.employee_name }} - {{ editingShift.date }}</p>

        <div class="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">⚡ 常用時段</label>
            
            <div class="flex flex-wrap gap-2 mb-4">
                <div v-for="(p, index) in quickPresets" :key="p.id" class="group relative">
                <button 
                    @click="applyPreset(p)"
                    class="bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex flex-col items-center"
                >
                    <span v-if="p.label" class="text-[9px] opacity-50 block leading-none mb-0.5">{{ p.label }}</span>
                    <span>{{ p.start_time }} - {{ p.end_time }}</span>
                </button>
                
                <button 
                    @click.stop="removePreset(p.id, index)"
                    class="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                >✕</button>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div class="relative">
                  <select 
                      v-model="presetInput.start"
                      class="w-full bg-white border-none rounded-xl px-4 py-3 font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                  >
                      <option disabled value="">開始時間</option>
                      <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
                  </select>
                  <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
              </div>

              <div class="relative">
                  <select 
                      v-model="presetInput.end"
                      class="w-full bg-white border-none rounded-xl px-4 py-3 font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                  >
                      <option disabled value="">結束時間</option>
                      <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
                  </select>
                  <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
              </div>

              <input 
                  type="text" 
                  v-model="presetInput.label"
                  placeholder="標籤 (選填，如: 早班)"
                  class="bg-white border-none rounded-xl px-4 py-3 font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500"
              >
          </div>
        </div>

          <div class="space-y-3 mb-6">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">當日詳細時段</label>
           <div v-for="(seg, idx) in editingShift.segments" :key="idx" class="mb-4">
    
            <div class="flex items-center gap-2 mb-2">
                <div class="relative flex-1">
                    <select 
                        v-model="seg.start"
                        class="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-black text-slate-700 focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                    >
                        <option disabled value="">開始</option>
                        <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
                    </select>
                    <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
                </div>

                <span class="text-slate-300 font-bold">→</span>

                <div class="relative flex-1">
                    <select 
                        v-model="seg.end"
                        class="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-black text-slate-700 focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                    >
                        <option disabled value="">結束</option>
                        <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
                    </select>
                    <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
                </div>

                <button 
                    @click="removeSegment(idx)"
                    class="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                >
                    🗑️
                </button>
              </div>
            </div>
          </div>

          <button @click="addSegment" class="w-full py-3 mb-6 border border-dashed border-slate-300 rounded-xl text-slate-500 font-bold text-sm hover:bg-slate-50 hover:text-indigo-600 transition flex justify-center items-center gap-2">
            <span>+</span> 增加手動時段
          </button>

          <div class="flex gap-3">
            <button @click="handleDelete" class="px-4 py-3 rounded-xl border border-rose-100 text-rose-500 font-bold hover:bg-rose-50 transition text-sm">全部清空</button>
            <button @click="handleSave" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg transition">儲存設定</button>
          </div>
        </div>
      </div>

        <div v-if="confirmConfig.show" class="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity"></div>
            
            <div class="bg-white w-full max-w-[320px] p-6 rounded-[2.5rem] shadow-2xl relative z-10 animate-scale-up border border-slate-100">
                <div class="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-8 h-8 text-rose-500">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                </div>

                <h4 class="text-xl font-black text-slate-800 text-center mb-2">{{ confirmConfig.title }}</h4>
                <p class="text-slate-500 text-sm font-bold text-center mb-8 leading-relaxed">
                    {{ confirmConfig.message }}
                </p>

                <div class="flex flex-col gap-2">
                    <button 
                    @click="confirmConfig.onConfirm"
                    class="w-full py-4 rounded-2xl font-black text-sm transition-all shadow-lg active:scale-95"
                    :class="confirmConfig.isDanger ? 'bg-rose-500 text-white shadow-rose-200 hover:bg-rose-600' : 'bg-indigo-600 text-white shadow-indigo-200'"
                    >
                    確定執行
                    </button>
                    
                    <button 
                    @click="confirmConfig.show = false"
                    class="w-full py-4 rounded-2xl font-black text-sm text-slate-400 hover:bg-slate-50 transition-colors"
                    >
                    我再想想
                    </button>
                </div>
            </div>
        </div>
    </Teleport>

  </div>
</template>

<style scoped>
.animate-scale-up { animation: scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.animate-fade-in { animation: fadeIn 0.3s ease-out; }
@keyframes scaleUp { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
</style>