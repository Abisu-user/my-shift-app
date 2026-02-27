<script setup>
import { ref, onMounted, watch } from 'vue'
import { shiftService } from '../services/shiftService'

const selectedMonth = ref(new Date().toISOString().substring(0, 7))
const reportData = ref([])
const isLoading = ref(false)
const expandedEmpId = ref(null) // 新增：記錄展開的員工 ID

// 切換展開/收起
const toggleExpand = (empId) => {
  expandedEmpId.value = expandedEmpId.value === empId ? null : empId
}

const fetchMonthlyData = async () => {
  isLoading.value = true
  expandedEmpId.value = null // 切換月份時自動收起明細
  
  try {
    const year = parseInt(selectedMonth.value.split('-')[0])
    const month = parseInt(selectedMonth.value.split('-')[1])
    
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    const { employees } = await shiftService.fetchInitialData()
    const monthShifts = await shiftService.fetchShiftsByRange(startDate, endDate)

    reportData.value = employees.map(emp => {
      const empShifts = monthShifts.filter(s => s.employee_id === emp.id)
      let totalHours = 0
      const dailyDetails = [] // 新增：用來存放該員工每一天的明細
      
      empShifts.forEach(s => {
        if (s.segments && s.segments.length > 0) {
          let dayHours = 0 // 單日總工時
          
          s.segments.forEach(seg => {
            const startH = parseInt(seg.start.split(':')[0]) + (seg.start.includes(':30') ? 0.5 : 0)
            const endH = parseInt(seg.end.split(':')[0]) + (seg.end.includes(':30') ? 0.5 : 0)
            const segHours = endH - startH
            dayHours += segHours
            totalHours += segHours
          })
          
          // 將有排班的這天推入明細陣列
          dailyDetails.push({
            date: s.date,
            segments: s.segments,
            dayHours: dayHours
          })
        }
      })
      
      // 依日期排序，確保明細是由月初排到月底
      dailyDetails.sort((a, b) => new Date(a.date) - new Date(b.date))
      
      return { ...emp, totalHours, dailyDetails }
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
        <h2 class="text-xl font-black text-slate-800 tracking-tight">月度時數總表</h2>
        <p class="text-xs text-slate-500 font-medium uppercase tracking-widest mt-1">查看所有員工本月累積工時</p>
      </div>
      
      <div class="flex items-center gap-2">
        <label class="text-sm font-bold text-slate-600">選擇月份</label>
        <input 
          type="month" 
          v-model="selectedMonth"
          class="bg-slate-100 border-none rounded-xl px-4 py-2 font-bold text-slate-700 focus:ring-2 focus:ring-sky-500"
        >
      </div>
    </div>

    <div class="flex-1 overflow-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-slate-100">
            <th class="py-4 px-4 text-xs font-bold text-slate-400 uppercase tracking-widest">員工姓名</th>
            <th class="py-4 px-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">當月累積時數</th>
          </tr>
        </thead>
       <tbody v-if="!isLoading">
        <template v-for="emp in reportData" :key="emp.id">
            
        <tr 
            @click="toggleExpand(emp.id)"
            class="transition-all cursor-pointer"
            :class="expandedEmpId === emp.id 
                ? 'sticky top-0 z-10 bg-white shadow-md border-b-2 border-sky-100' 
                : 'border-b border-slate-50 hover:bg-slate-50'"
            >
            <td class="py-4 px-4 font-bold text-slate-700 flex items-center gap-2 bg-inherit">
                <span class="text-slate-300 text-xs transition-transform duration-200" :class="{ 'rotate-90 text-sky-500': expandedEmpId === emp.id }">▶</span>
                {{ emp.name }}
            </td>
            <td class="py-4 px-4 text-right bg-inherit">
                <span class="px-3 py-1 bg-sky-50 text-sky-600 rounded-full font-black text-sm">
                {{ emp.totalHours }} 小時
                </span>
            </td>
        </tr>

            <tr v-if="expandedEmpId === emp.id" class="bg-slate-50/30">
            <td colspan="2" class="px-4 pb-4 pt-1">
                <div class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">排班明細核對</h4>
                
                <div v-if="emp.dailyDetails.length === 0" class="text-sm font-bold text-slate-400 text-center py-4">
                    本月無排班紀錄
                </div>
                
                <div v-else class="flex flex-col gap-2">
                    <div 
                    v-for="detail in emp.dailyDetails" 
                    :key="detail.date" 
                    class="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
                    >
                    <div class="font-black text-slate-600 w-16">
                        {{ new Date(detail.date).getMonth() + 1 }}/{{ new Date(detail.date).getDate() }}
                    </div>
                    
                    <div class="flex-1 flex flex-wrap gap-2 px-2">
                        <span 
                        v-for="(seg, idx) in detail.segments" 
                        :key="idx"
                        class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-xs font-bold"
                        >
                        {{ seg.start }} - {{ seg.end }}
                        </span>
                    </div>
                    
                    <div class="font-black text-sky-500 text-sm">
                        {{ detail.dayHours }}h
                    </div>
                    </div>
                </div>
                </div>
            </td>
            </tr>
            
        </template>
        </tbody>
      </table>
      
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 text-slate-400 font-bold animate-pulse">
        <p class="text-4xl mb-2">⏱️</p>
        <p>時數計算中...</p>
      </div>
    </div>
  </div>
</template>