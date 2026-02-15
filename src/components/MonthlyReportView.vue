<script setup>
import { ref, onMounted, watch } from 'vue'
import { shiftService } from '../services/shiftService'

const selectedMonth = ref(new Date().toISOString().substring(0, 7)) // 格式: YYYY-MM
const reportData = ref([])
const isLoading = ref(false)

const fetchMonthlyData = async () => {
  isLoading.value = true
  try {
    const year = parseInt(selectedMonth.value.split('-')[0])
    const month = parseInt(selectedMonth.value.split('-')[1])
    
    // 計算該月第一天與最後一天
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    const { employees, rawShifts } = await shiftService.fetchInitialData()
    const monthShifts = await shiftService.fetchShiftsByRange(startDate, endDate)

    // 彙總每位員工時數
    reportData.value = employees.map(emp => {
      const empShifts = monthShifts.filter(s => s.employee_id === emp.id)
      let totalHours = 0
      
      empShifts.forEach(s => {
        if (s.segments) {
          s.segments.forEach(seg => {
            const startH = parseInt(seg.start.split(':')[0])
            const endH = parseInt(seg.end.split(':')[0])
            totalHours += (endH - startH)
          })
        }
      })
      return { ...emp, totalHours }
    })
  } catch (error) {
    console.error('讀取報表失敗:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchMonthlyData)
watch(selectedMonth, fetchMonthlyData)
</script>

<template>
  <div class="p-4 md:p-6 bg-white rounded-3xl shadow-sm border border-slate-200 h-full flex flex-col">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h2 class="text-xl font-black text-slate-800 tracking-tight">月度時數報表</h2>
        <p class="text-xs text-slate-500 font-medium uppercase tracking-widest mt-1">查看員工每月總工時彙整</p>
      </div>
      
      <div class="flex items-center gap-3">
        <label class="text-sm font-bold text-slate-600">選擇月份</label>
        <input 
          type="month" 
          v-model="selectedMonth"
          class="bg-slate-100 border-none rounded-xl px-4 py-2 font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500"
        >
      </div>
    </div>

    <div class="flex-1 overflow-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-slate-100">
            <th class="py-4 px-4 text-xs font-bold text-slate-400 uppercase tracking-widest">員工姓名</th>
            <th class="py-4 px-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">當月總時數</th>
          </tr>
        </thead>
        <tbody v-if="!isLoading">
          <tr v-for="emp in reportData" :key="emp.id" class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="py-4 px-4 font-bold text-slate-700">{{ emp.name }}</td>
            <td class="py-4 px-4 text-right">
              <span class="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full font-black text-sm">
                {{ emp.totalHours }} 小時
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 text-slate-400 font-bold animate-pulse">
        <p class="text-4xl mb-2">📊</p>
        <p>報表資料計算中...</p>
      </div>
    </div>
  </div>
</template>