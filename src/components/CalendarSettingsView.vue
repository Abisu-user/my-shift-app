<script setup>
import { ref, computed, watch, onMounted } from 'vue'
// 🌟 1. 解除註解，把 shiftService 引進來
import { shiftService } from '../services/shiftService' 

const currentDate = ref(new Date())
const currentYear = computed(() => currentDate.value.getFullYear())
const currentMonth = computed(() => currentDate.value.getMonth())

// 將原本的假資料清空，改為空物件準備接收資料庫資料
const specialDays = ref({})
const selectedDate = ref(null)
const settingsPanelRef = ref(null)
const editForm = ref({
  isDoublePay: false,
  note: ''
})

const isLoading = ref(false) // 加入讀取狀態

// 🌟 2. 新增：從資料庫抓取當月設定的函式
const loadMonthSettings = async () => {
  isLoading.value = true
  try {
    const year = currentYear.value
    const month = currentMonth.value
    
    // 計算當月第一天與最後一天 (格式: YYYY-MM-DD)
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]

    // 呼叫 shiftService 去資料庫拿資料
    const data = await shiftService.fetchMonthSettings(startDate, endDate)
    
    // 將資料庫陣列轉換成前端好用的 Object 格式: { '2026-04-04': { ... } }
    const newSpecialDays = {}
    data.forEach(item => {
      newSpecialDays[item.date] = {
        isDoublePay: item.isDoublePay,
        note: item.note
      }
    })
    specialDays.value = newSpecialDays
  } catch (e) {
    console.error('載入當月設定失敗', e)
  } finally {
    isLoading.value = false
  }
}

// === 日曆生成邏輯 ===
const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  
  const days = []
  // 補齊前面的空白
  for (let i = 0; i < firstDay; i++) {
    days.push({ empty: true })
  }
  // 填入當月日期
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
    days.push({
      date: dateStr,
      day: i,
      empty: false,
      isToday: dateStr === new Date().toISOString().split('T')[0],
      setting: specialDays.value[dateStr] || null
    })
  }
  return days
})

const prevMonth = () => {
  currentDate.value = new Date(currentYear.value, currentMonth.value - 1, 1)
  selectedDate.value = null
  loadMonthSettings() // 🌟 切換月份時重新抓資料
}
const nextMonth = () => {
  currentDate.value = new Date(currentYear.value, currentMonth.value + 1, 1)
  selectedDate.value = null
  loadMonthSettings() // 🌟 切換月份時重新抓資料
}

// === 點選與設定邏輯 ===
const handleDateClick = (dayObj) => {
  if (dayObj.empty) return
  
  selectedDate.value = dayObj.date
  // 載入該日的設定到右側表單
  const existingSetting = specialDays.value[dayObj.date]
  editForm.value = {
    isDoublePay: existingSetting?.isDoublePay || false,
    note: existingSetting?.note || ''
  }

  // 🌟 新增：如果是手機版 (螢幕寬度小於 768px)，點擊後自動平滑滾動到設定面板
  if (window.innerWidth < 768) {
    setTimeout(() => {
      settingsPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }
}

// 🌟 3. 修改：真正把資料存進資料庫
const saveSettings = async () => {
  if (!selectedDate.value) return
  
  try {
    // 呼叫 shiftService 存入 Supabase
    await shiftService.saveDaySetting(
      selectedDate.value, 
      editForm.value.isDoublePay, 
      editForm.value.note
    )

    // 更新本地畫面狀態，讓畫面馬上顯示出來不用重整
    specialDays.value[selectedDate.value] = {
      isDoublePay: editForm.value.isDoublePay,
      note: editForm.value.note
    }
    
    alert('儲存成功！') // 簡單的成功提示
  } catch (e) {
    alert('儲存失敗，請重試！')
    console.error(e)
  }
}

// 🌟 元件載入時，自動抓取這個月的設定
onMounted(() => {
  loadMonthSettings()
})
</script>

<template>
  <div class="h-full flex flex-col md:flex-row gap-4 md:gap-6 p-4 md:p-6 bg-slate-50/50 overflow-y-auto md:overflow-hidden">
    
    <div class="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col h-fit md:h-full">
      <div class="flex flex-col md:flex-row items-center justify-between mb-6 md:mb-8 gap-4">
        <h2 class="text-xl md:text-2xl font-black text-slate-800">店鋪行事曆與假日設定</h2>
        <div class="flex items-center gap-2 md:gap-4 bg-slate-50 p-1.5 rounded-2xl w-full md:w-auto justify-between md:justify-start">
          <button @click="prevMonth" class="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white text-slate-500 hover:text-indigo-600 hover:shadow-sm transition-all font-bold">&lt;</button>
          <span class="text-base md:text-lg font-black text-slate-700 w-28 md:w-32 text-center">{{ currentYear }} 年 {{ currentMonth + 1 }} 月</span>
          <button @click="nextMonth" class="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white text-slate-500 hover:text-indigo-600 hover:shadow-sm transition-all font-bold">&gt;</button>
        </div>
      </div>

      <div class="grid grid-cols-7 gap-2 md:gap-4 mb-2 md:mb-4 text-center">
        <div v-for="dayName in ['日', '一', '二', '三', '四', '五', '六']" :key="dayName" class="font-bold text-slate-400 text-xs md:text-sm">
          {{ dayName }}
        </div>
      </div>

      <div class="grid grid-cols-7 auto-rows-[1fr] gap-2 md:gap-4 flex-1">
        <div 
          v-for="(day, idx) in calendarDays" 
          :key="idx"
          @click="handleDateClick(day)"
          class="relative p-1 md:p-3 rounded-xl md:rounded-2xl border-2 transition-all duration-200 flex flex-col h-14 md:h-32"
          :class="[
            day.empty ? 'border-transparent opacity-0 cursor-default' : 'cursor-pointer bg-white shadow-sm hover:-translate-y-1 hover:shadow-lg hover:border-indigo-400',
            selectedDate === day.date ? 'border-indigo-600 bg-indigo-50 shadow-md ring-2 md:ring-4 ring-indigo-200 z-10' : 'border-slate-200 md:border-slate-300',
            day.isToday && selectedDate !== day.date ? 'border-indigo-300 bg-indigo-50/50' : ''
          ]"
        >
          <template v-if="!day.empty">
            <div class="flex flex-col md:flex-row justify-between items-center md:items-start mb-1 md:mb-2 gap-1 md:gap-0">
              <span class="text-sm md:text-lg font-black" :class="day.isToday ? 'text-indigo-600' : 'text-slate-800'">
                {{ day.day }}
              </span>
              
              <span v-if="day.setting?.isDoublePay" class="hidden md:inline px-2 py-0.5 bg-rose-100 text-rose-600 text-[10px] font-black rounded-lg shadow-sm border border-rose-200">
                雙倍薪
              </span>
              <span v-if="day.setting?.isDoublePay" class="md:hidden w-1.5 h-1.5 rounded-full bg-rose-500 shadow-sm mt-0.5"></span>
            </div>

            <p v-if="day.setting?.note" class="hidden md:block text-xs text-slate-600 font-bold line-clamp-2 mt-auto bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              {{ day.setting.note }}
            </p>
            <div v-if="day.setting?.note" class="md:hidden mt-auto w-1.5 h-1.5 rounded-full bg-amber-400 mx-auto mb-1"></div>
          </template>
        </div>
      </div>
    </div>

    <div ref="settingsPanelRef" class="w-full md:w-80 bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex flex-col shrink-0 mb-6 md:mb-0">
      <div v-if="selectedDate" class="animate-fade-in flex flex-col h-full">
        <h3 class="text-xl font-black text-slate-800 mb-2">{{ selectedDate }}</h3>
        <p class="text-sm font-bold text-slate-400 mb-6 md:mb-8">當日薪資與備註設定</p>

        <div class="space-y-6 flex-1">
          <label class="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl cursor-pointer border border-slate-100 hover:bg-slate-100 transition-colors group">
            <div class="mt-0.5">
              <input type="checkbox" v-model="editForm.isDoublePay" class="w-5 h-5 rounded border-slate-300 text-rose-500 focus:ring-rose-500">
            </div>
            <div class="flex flex-col">
              <span class="font-black text-slate-700 text-sm group-hover:text-rose-600 transition-colors">設為雙倍薪資日</span>
              <span class="text-xs text-slate-500 font-bold mt-1 leading-relaxed">勾選後，當日排班預設將以雙倍時薪計算，適用於國定假日或特殊節日。</span>
            </div>
          </label>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-black text-slate-700 ml-1">當日備註</label>
            <textarea 
              v-model="editForm.note" 
              rows="4"
              class="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-0 transition-colors resize-none"
              placeholder="輸入節日名稱或特殊備註 (例: 中秋節...)"
            ></textarea>
          </div>
        </div>

        <button 
          @click="saveSettings"
          class="w-full mt-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-lg shadow-indigo-200 transition-all active:scale-95 flex justify-center items-center gap-2"
        >
          <span v-if="isLoading" class="animate-spin text-xl">⏳</span>
          <span>儲存當日設定</span>
        </button>
      </div>

      <div v-else class="h-64 md:h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
        <span class="text-5xl md:text-6xl mb-4 transform md:rotate-0 -rotate-90">👈</span>
        <p class="font-black text-lg">請點選上方日期</p>
        <p class="text-sm font-bold mt-2">以設定雙倍薪資或備註</p>
      </div>
    </div>

  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.3s ease-out; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
/* 隱藏捲軸但可滾動 */
textarea::-webkit-scrollbar { display: none; }
textarea { -ms-overflow-style: none; scrollbar-width: none; }
</style>