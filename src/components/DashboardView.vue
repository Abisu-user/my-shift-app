<script setup>
import { ref, computed, onMounted } from 'vue'
import { shiftService } from '../services/shiftService.js'
import StatsGroup from '../components/StatsGroup.vue'
import ShiftTable from '../components/ShiftTable.vue'

const loading = ref(true)
const currentMonday = ref(getInitialMonday())

// 統一資料源：所有的員工與班表都存在這裡
const employees = ref([])
const rawShifts = ref([])

const processedShifts = computed(() => 
  shiftService.processShiftData(employees.value, rawShifts.value)
)

const statsData = computed(() => {
  const totalHours = processedShifts.value.reduce((sum, emp) => sum + (emp.totalHours || 0), 0)
  return {
    employeeCount: employees.value.length,
    totalHours: totalHours.toFixed(1)
  }
})

function getInitialMonday() {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff))
}

// ✅ 統一載入邏輯：不管是初始化還是按下一週，都跑這個
const loadData = async () => {
    loading.value = true
    try {
        const start = currentMonday.value.toISOString().split('T')[0]
        const end = new Date(currentMonday.value.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

        // 1. 同時抓取員工和指定日期的班表
        const data = await shiftService.fetchInitialData() // 抓員工
        const shifts = await shiftService.fetchShiftsByRange(start, end) // 抓該週班表
        
        // 2. 更新 Ref，這會自動觸發 computed 更新
        employees.value = data.employees
        rawShifts.value = shifts
    } catch (e) {
        console.error('載入失敗:', e)
    } finally {
        loading.value = false
    }
}

const handleDateSelect = (selectedDate) => {
    // 這裡我們需要把選中的日期「校正」回該週的週一
    const d = new Date(selectedDate)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    
    currentMonday.value = new Date(d.setDate(diff))
    loadData() // 重新載入該週資料
}

const handleWeekChange = (offset) => {
    const d = new Date(currentMonday.value)
    d.setDate(d.getDate() + (offset * 7))
    currentMonday.value = d
    loadData() // 日期變了，重新去資料庫抓那一週的資料
}

onMounted(() => {
    loadData()
})
</script>

<template>
  <div class="p-4 md:p-8 max-w-7xl mx-auto animate-fade-in">
    <header class="mb-8">
      <h2 class="text-3xl font-black text-slate-800 tracking-tight">儀表板概覽</h2>
      <p class="text-slate-900 font-bold text-sm mt-1">即時排班與統計數據</p>
    </header>

   <StatsGroup 
      :monday="currentMonday" 
      :stats="statsData"
      @change-week="handleWeekChange"
      @select-date="handleDateSelect" 
    />

    <div v-if="loading" class="flex justify-center py-20">
      <div class="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
    </div>

    <ShiftTable 
      v-else 
      :shifts="processedShifts" 
      :monday="currentMonday" 
    />
  </div>
</template>