<script setup>
import { ref, computed, onMounted } from 'vue'
import { shiftService } from '../services/shiftService'

const employees = ref([])
const shifts = ref([])
const loading = ref(true)

const quickPresets = ref([])
const presetInput = ref({ start: '', end: '', label: '' })
const expandedEmpId = ref(null)
const showAddPreset = ref(false)

// 日期導航
const currentMonday = ref(new Date())

const datePicker = ref(null)

// 產生開始時間選項 (09:00 ~ 18:00)
const startTimeOptions = []
for (let i = 9; i <= 18; i++) {
  const h = i.toString().padStart(2, '0')
  startTimeOptions.push(`${h}:00`)
  if (i < 18) { // 確保最後一個時間是 18:00 而不是 18:30
    startTimeOptions.push(`${h}:30`)
  }
}

// 產生結束時間選項 (14:00 ~ 20:30)
const endTimeOptions = []
for (let i = 14; i <= 20; i++) {
  const h = i.toString().padStart(2, '0')
  endTimeOptions.push(`${h}:00`)
  endTimeOptions.push(`${h}:30`) // 到 20 的時候會剛好 push 20:00 跟 20:30
}

// 編輯彈窗狀態
const showEditModal = ref(false)
const editingShift = ref({
  employee_id: null,
  employee_name: '',
  date: '',
  segments: [],
  delivery_fee: 0,
  isDoublePay: false
})

// 當使用者選好照片後觸發
const handlePreview = (event) => {
  const file = event.target.files[0]
  if (!file) return

  // 產生一個本地預覽網址
  previewImage.value = URL.createObjectURL(file)
}

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

const openEdit = async (emp, date) => {
  const existingShift = shifts.value.find(s => s.employee_id === emp.id && s.date === date);
  const daySetting = await shiftService.fetchDaySetting(date) 
  const isHoliday = daySetting?.isDoublePay || false
  
  if (existingShift) {
    editingShift.value = {
      employee_id: emp.id,
      employee_name: emp.name,
      date: date,
      segments: JSON.parse(JSON.stringify(existingShift.segments || [])),
      isDoublePay: existingShift.isDoublePay || false,
      delivery_fee: existingShift?.delivery_fee || 0
    };
  } else {
    editingShift.value = {
      employee_id: emp.id,
      employee_name: emp.name,
      date: date,
      segments: [],
      isDoublePay: isHoliday,
      delivery_fee: 0
    };
  }
  showEditModal.value = true;
};

// 新增一個時段
const addSegment = () => {
  editingShift.value.segments.push({ start: '', end: '' })
}

const handleSave = async () => {
  try {
    // 過濾掉空的時間
    const cleanSegments = editingShift.value.segments.filter(s => s.start && s.end)
    
    // 如果全部都刪光了，等於刪除班表
    if (cleanSegments.length === 0 && (!editingShift.value.delivery_fee || editingShift.value.delivery_fee === 0)) {
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

      <div v-show="!isBatchMode && expandedEmpId === emp.id" class="p-3 flex flex-col gap-3 bg-slate-50/50">
          <div 
            v-for="date in weekDates" 
            :key="date" 
            class="flex flex-col gap-2 bg-white rounded-2xl border border-slate-200 shadow-sm"
          >
            <div class="text-xl font-black text-slate-700 tracking-wider">
              {{ new Date(date).getMonth() + 1 }}/{{ new Date(date).getDate() }}
            </div>
            
            <button 
              @click="openEdit(emp, date)"
              class="w-full min-h-[3.5rem] rounded-xl flex flex-wrap items-center gap-2 transition-all active:scale-95"
              :class="getShift(emp.id, date) ? 'bg-indigo-100 border border-indigo-200' : 'bg-slate-50 border-2 border-dashed border-slate-300'"
            >
              <template v-if="getShift(emp.id, date) && getShift(emp.id, date).segments.length > 0">
                <div 
                  v-for="(seg, i) in getShift(emp.id, date).segments" 
                  :key="i" 
                  class="bg-indigo-600 text-white px-5 py-1.5 rounded-lg text-sm font-black shadow-sm text-center w-full truncate"
                >
                  {{ seg.start }} - {{ seg.end }}
                </div>
              </template>
              <template v-else>
                <span class="text-slate-300 text-2xl font-light m-auto">+</span>
              </template>
            </button>
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
            <div class="bg-white w-full max-w-lg p-8 rounded-[2.5rem] shadow-2xl relative z-10 animate-scale-up max-h-[90vh] overflow-y-auto">
                <h3 class="text-2xl font-black text-slate-800 mb-6 tracking-tight">批次套用時段</h3>
                
                <div class="mb-8">
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">第一步：選擇套用日期</label>
                    <div class="grid grid-cols-7 gap-2">
                        <button 
                            v-for="(date, idx) in weekDates" :key="idx"
                            @click="batchEditForm.days.includes(idx) ? batchEditForm.days = batchEditForm.days.filter(d => d !== idx) : batchEditForm.days.push(idx)"
                            :class="batchEditForm.days.includes(idx) ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'"
                            class="py-2 rounded-xl font-black text-sm transition-all flex flex-col items-center justify-center gap-1"
                        >
                            <span :class="batchEditForm.days.includes(idx) ? 'text-indigo-200' : 'text-slate-400'" class="text-[10px] font-bold">
                                {{ new Date(date).getMonth() + 1 }}/{{ new Date(date).getDate() }}
                            </span>
                            <span>{{ ['日', '一', '二', '三', '四', '五', '六'][new Date(date).getDay()] }}</span>
                        </button>
                    </div>
                </div>

                <div class="mb-8">
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">第二步：設定上班時段</label>
                    
                    <div class="flex flex-wrap gap-2 mb-6">
                        <button 
                            v-for="p in quickPresets" :key="p.id"
                            @click="applyBatchPreset(p)"
                            class="bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex flex-col items-center"
                        >
                            <span v-if="p.label" class="text-[9px] opacity-50 block leading-none mb-0.5">{{ p.label }}</span>
                            <span>{{ p.start_time }} - {{ p.end_time }}</span>
                        </button>
                    </div>

                    <div class="space-y-3">
                        <div v-for="(seg, idx) in batchEditForm.segments" :key="idx" class="flex items-center gap-2">
                            <div class="relative flex-1">
                                <select 
                                    v-model="seg.start"
                                    class="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-black text-slate-700 focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                                >
                                    <option disabled value="">開始</option>
                                    <option v-for="t in startTimeOptions" :key="t" :value="t">{{ t }}</option>
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
                                    <option v-for="t in endTimeOptions" :key="t" :value="t">{{ t }}</option>
                                </select>
                                <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
                            </div>

                            <button 
                                @click="batchEditForm.segments.splice(idx, 1)"
                                class="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                            >
                                🗑️
                            </button>
                        </div>

                        <div v-if="batchEditForm.segments.length === 0" class="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <p class="text-xs font-bold text-slate-400 mb-3">尚未設定套用的時段</p>
                            <button 
                                @click="batchEditForm.segments.push({ start: '', end: '' })"
                                class="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-sm shadow-md hover:bg-indigo-700 transition-all active:scale-95"
                            >
                                <span class="text-lg leading-none">+</span> 手動新增時段
                            </button>
                        </div>

                        <button 
                            v-else
                            @click="batchEditForm.segments.push({ start: '', end: '' })"
                            class="w-full flex justify-center items-center gap-2 px-5 py-3 bg-slate-50 text-slate-500 font-black text-sm rounded-xl hover:bg-slate-100 transition-all active:scale-95"
                        >
                            <span class="text-lg leading-none">+</span> 再新增一個時段
                        </button>
                    </div>
                </div>

                <div class="flex gap-3">
                    <button @click="showBatchModal = false" class="flex-1 py-4 rounded-2xl font-black text-slate-400 hover:bg-slate-50">取消</button>
                    <button @click="handleBatchSave" class="flex-1 py-4 rounded-2xl bg-indigo-600 text-white font-black shadow-lg shadow-indigo-200 hover:bg-indigo-500">確認套用</button>
                </div>
            </div>
        </div>
        <div v-if="showEditModal" class="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-4">
          <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="showEditModal = false"></div>
          
          <div class="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-4xl flex flex-col relative z-10 md:rounded-[2rem] shadow-2xl animate-scale-up overflow-hidden">
            
            <div class="flex justify-between items-center shrink-0 p-5 md:p-8 border-b border-slate-100 bg-white z-20 shadow-sm md:shadow-none">
              <div>
                <h3 class="text-2xl md:text-2xl font-black text-slate-800 tracking-tight">編輯班表</h3>
                <p class="text-indigo-600 font-black text-sm md:text-sm mt-1 bg-indigo-50 inline-block px-2 py-0.5 rounded-md">
                  {{ editingShift.employee_name }} · {{ editingShift.date }}
                </p>
              </div>
              <button 
                @click="showEditModal = false" 
                class="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all bg-slate-50 md:bg-transparent"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 md:h-7 md:w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="flex-1 overflow-y-auto p-5 md:p-8 custom-scrollbar bg-slate-50/30 md:bg-white pb-24 md:pb-8">
              <div class="flex flex-col md:grid md:grid-cols-2 md:grid-rows-[1fr_auto] gap-6 md:gap-8 h-full">
                
                <div class="order-1 md:row-span-2 flex flex-col">
                  <div class="bg-white md:bg-slate-50 p-5 rounded-3xl border border-slate-100 h-full flex flex-col shadow-sm md:shadow-none">
                    <div class="flex items-center justify-between mb-4 pl-1">
                      <label class="block text-xs md:text-[10px] font-black text-slate-500 md:text-slate-400 uppercase tracking-widest">⚡ 快速代入常用時段</label>
                    </div>
                    
                    <div class="flex flex-wrap gap-2.5 mb-6 overflow-y-auto max-h-[140px] md:max-h-[100px] content-start custom-scrollbar pr-1">
                      <div v-for="(p, index) in quickPresets" :key="p.id" class="group relative">
                        <button 
                          @click="applyPreset(p)"
                          class="bg-slate-50 md:bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 active:bg-indigo-50 px-4 py-2.5 md:px-3 md:py-1.5 rounded-xl text-sm md:text-xs font-bold transition-all flex flex-col items-center"
                        >
                          <span v-if="p.label" class="text-xs md:text-[9px] text-indigo-500 md:opacity-50 block leading-none mb-1 md:mb-0.5">{{ p.label }}</span>
                          <span>{{ p.start_time }} - {{ p.end_time }}</span>
                        </button>
                        
                        <button 
                          @click.stop="removePreset(p.id, index)"
                          class="absolute top-1 right-1 md:top-0 md:right-0 w-3 h-3 md:w-3.5 md:h-3.5 bg-rose-500 text-white rounded-full text-[10px] md:text-[8px] flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shadow-sm"
                        >✕</button>
                      </div>
                    </div>

                    <div class="mt-auto bg-slate-50 md:bg-transparent p-3 md:p-0 rounded-2xl md:rounded-none border border-slate-100 md:border-none">
                      <div class="hidden md:block w-full h-px bg-slate-200 mb-3"></div>
                      
                      <button 
                          @click="showAddPreset = !showAddPreset"
                          class="w-full flex justify-between items-center text-xs md:text-[10px] font-black text-slate-500 md:text-slate-400 uppercase tracking-widest pl-1 py-1 hover:text-indigo-600 transition-colors"
                      >
                          <span class="flex items-center gap-1">
                              <span class="text-sm leading-none">{{ showAddPreset ? '−' : '➕' }}</span> 
                              新增常用時段
                          </span>
                          <span class="transition-transform duration-300" :class="{ 'rotate-180': showAddPreset }">▼</span>
                      </button>

                      <div v-show="showAddPreset" class="flex flex-col gap-3 mt-4 animate-fade-in">    
                        <div class="grid grid-cols-2 gap-3">
                            <div class="relative">
                                <select 
                                    v-model="presetInput.start"
                                    class="w-full bg-white border-none rounded-xl px-4 py-3.5 md:py-3 font-bold text-base md:text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer shadow-sm"
                                >
                                    <option disabled value="">開始</option>
                                    <option v-for="t in startTimeOptions" :key="t" :value="t">{{ t }}</option>
                                </select>
                                <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-sm">▼</div>
                            </div>

                            <div class="relative">
                                <select 
                                    v-model="presetInput.end"
                                    class="w-full bg-white border-none rounded-xl px-4 py-3.5 md:py-3 font-bold text-base md:text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer shadow-sm"
                                >
                                    <option disabled value="">結束</option>
                                    <option v-for="t in endTimeOptions" :key="t" :value="t">{{ t }}</option>
                                </select>
                                <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-sm">▼</div>
                            </div>
                        </div>

                        <input 
                            type="text" 
                            v-model="presetInput.label"
                            placeholder="標籤 (選填，如: 早班)"
                            class="w-full bg-white border-none rounded-xl px-4 py-3.5 md:py-3 font-bold text-base md:text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 shadow-sm"
                        >

                        <button 
                            @click="addNewPreset"
                            :disabled="!presetInput.start || !presetInput.end"
                            class="w-full flex justify-center items-center gap-2 px-5 py-3.5 bg-emerald-500 text-white font-black text-base md:text-sm rounded-xl shadow-md hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 mt-1"
                        >
                            儲存為常用時段
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="order-2 flex flex-col">
                  <div class="space-y-4 mb-2 md:mb-6 flex-1">
                    <label class="block text-xs md:text-[10px] font-black text-slate-500 md:text-slate-400 uppercase tracking-widest pl-1">📅 當日排班時段</label>
                    
                    <div v-if="editingShift.segments.length === 0" class="text-center py-10 bg-white md:bg-slate-50/50 rounded-3xl border border-dashed border-slate-300 shadow-sm md:shadow-none">
                        <p class="text-base font-bold text-slate-400 mb-4">這天目前沒有排班紀錄</p>
                        <button 
                            @click="addSegment"
                            class="inline-flex items-center gap-2 px-6 py-3.5 bg-indigo-600 text-white rounded-2xl font-black text-base shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
                        >
                            <span class="text-xl leading-none">+</span> 手動新增時段
                        </button>
                    </div>

                    <div v-else class="flex flex-col gap-3">
                      <div v-for="(seg, idx) in editingShift.segments" :key="idx" class="flex items-center gap-2 bg-white md:bg-transparent p-2 md:p-0 rounded-2xl shadow-sm md:shadow-none border border-slate-100 md:border-none">
                        <div class="relative flex-1">
                            <select 
                                v-model="seg.start"
                                class="w-full bg-slate-50 border-none rounded-xl px-4 py-3.5 md:py-3 font-black text-base md:text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                            >
                                <option disabled value="">開始</option>
                                <option v-for="t in startTimeOptions" :key="t" :value="t">{{ t }}</option>
                            </select>
                            <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-sm">▼</div>
                        </div>

                        <span class="text-slate-300 font-bold px-1">→</span>

                        <div class="relative flex-1">
                            <select 
                                v-model="seg.end"
                                class="w-full bg-slate-50 border-none rounded-xl px-4 py-3.5 md:py-3 font-black text-base md:text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                            >
                                <option disabled value="">結束</option>
                                <option v-for="t in endTimeOptions" :key="t" :value="t">{{ t }}</option>
                            </select>
                            <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-sm">▼</div>
                        </div>

                        <button 
                            @click="removeSegment(idx)"
                            class="p-3.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors bg-slate-50 md:bg-transparent"
                        >
                            🗑️
                        </button>
                      </div>
                      
                      <button 
                          @click="addSegment"
                          class="w-full flex justify-center items-center gap-2 px-5 py-3.5 bg-white md:bg-slate-50 text-indigo-600 font-black text-base md:text-sm rounded-2xl md:rounded-xl border border-indigo-100 hover:bg-indigo-50 transition-all active:scale-95 mt-2 shadow-sm md:shadow-none"
                      >
                          <span class="text-xl leading-none">+</span> 再新增時段
                      </button>
                    </div>
                  </div>
                </div>

                <div class="order-3 flex flex-col justify-end mt-4 md:mt-0">
                  <div class="bg-white md:bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-sm md:shadow-none space-y-4">
                    <div>
                      <div class="flex items-center justify-between mb-3">
                        <h4 class="text-base md:text-sm font-bold text-slate-700 flex items-center gap-2">
                          <span class="text-xl">🛵</span> 外送津貼
                        </h4>
                        <span class="text-xs font-bold text-slate-400">當日累計</span>
                      </div>
                      <div class="relative">
                        <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-lg">$</span>
                        <input 
                          type="number" 
                          v-model.number="editingShift.delivery_fee"
                          placeholder="請輸入金額"
                          class="w-full pl-9 pr-4 py-3.5 bg-slate-50 md:bg-white border-none rounded-xl font-black text-base text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                        >
                      </div>
                    </div>

                    <div class="w-full h-px bg-slate-100 md:bg-slate-200"></div>

                    <label class="flex items-start md:items-center gap-3 p-3 bg-slate-50 md:bg-white rounded-2xl cursor-pointer border border-transparent hover:border-rose-100 transition-colors">
                      <input 
                        type="checkbox" 
                        v-model="editingShift.isDoublePay" 
                        class="w-6 h-6 md:w-5 md:h-5 mt-0.5 md:mt-0 rounded border-slate-300 text-rose-500 focus:ring-rose-500"
                      >
                      <div class="flex flex-col">
                        <span class="font-bold text-slate-700 text-base md:text-sm">此班表為雙倍薪資</span>
                        <span class="text-xs md:text-[10px] text-slate-400 mt-1 md:mt-0.5 leading-tight">系統自動同步，可手動調整</span>
                      </div>
                    </label>
                  </div>
                </div>

              </div>
            </div>
            
            <div class="shrink-0 p-4 md:p-6 bg-white border-t border-slate-100 flex gap-3 z-20">
              <button @click="handleDelete" class="w-1/3 md:w-auto px-4 py-4 md:py-4 rounded-2xl border-2 border-rose-100 text-rose-500 font-bold hover:bg-rose-50 transition text-base md:text-sm active:scale-95">清空</button>
              <button @click="handleSave" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-lg md:text-base py-4 rounded-2xl shadow-lg shadow-indigo-200 transition active:scale-95">儲存班表設定</button>
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
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1; /* slate-300 */
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: #94a3b8; /* slate-400 */
}
</style>