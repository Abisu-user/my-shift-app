<script setup>
import { ref, onMounted, watch } from 'vue'
import { shiftService } from '../services/shiftService'

const selectedMonth = ref(new Date().toISOString().substring(0, 7)) // 格式: YYYY-MM
const reportData = ref([])
const isLoading = ref(false)
const baseHourlyWage = ref(200)
const laborFee = ref(500) // 假設勞保費
const healthFee = ref(400) // 假設健保費


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
      let totalNormalHours = 0 
      let totalDoubleHours = 0  
      let totalDeliveryFee = 0
      let totalHours = 0
      
      empShifts.forEach(s => {
        let dailyHours = 0;
        if (s.segments) {
          s.segments.forEach(seg => {
            const startH = parseInt(seg.start.split(':')[0])
            const endH = parseInt(seg.end.split(':')[0])
            dailyHours += (endH - startH) 
          })
        }
        
        // 🌟 關鍵分類：根據這天是不是雙倍薪，放入不同的池子
        if (s.isDoublePay) {
          totalDoubleHours += dailyHours;
        } else {
          totalNormalHours += dailyHours;
        }
        
        totalDeliveryFee += (s.delivery_fee || 0)
      })
      return { 
        ...emp, 
        totalHours: totalNormalHours + totalDoubleHours, // 總時數依然加總給畫面看
        totalNormalHours,
        totalDoubleHours,
        totalDeliveryFee, 
        deductLabor: true, 
        deductHealth: true
      }
    })
  } catch (error) {
    console.error('讀取報表失敗:', error)
  } finally {
    isLoading.value = false
  }
}


onMounted(fetchMonthlyData)

const calculateNetPay = (emp) => {
  const wage = Number(baseHourlyWage.value) || 0;
  const normalHours = Number(emp.totalNormalHours) || 0;
  const doubleHours = Number(emp.totalDoubleHours) || 0;
  const delivery = Number(emp.totalDeliveryFee) || 0;
  const labor = emp.deductLabor ? (Number(laborFee.value) || 0) : 0;
  const health = emp.deductHealth ? (Number(healthFee.value) || 0) : 0;
  const total = (normalHours * wage) + (doubleHours * wage * 2) + delivery - labor - health;
  
  return total;
}

watch(selectedMonth, fetchMonthlyData)
</script>

<template>
  <div class="p-4 md:p-6 bg-slate-50 min-h-full flex flex-col gap-4">
    <div class="p-5 bg-white rounded-3xl shadow-sm border border-slate-200">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h2 class="text-2xl font-black text-slate-800 tracking-tight">薪資報表</h2>
          <p class="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">工時彙整與實領薪資計算</p>
        </div>

        <div class="grid grid-cols-2 md:flex md:flex-wrap items-end gap-3 md:gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-black text-slate-400 ml-1">選擇月份</label>
            <input 
              type="month" 
              v-model="selectedMonth"
              class="w-full bg-slate-100 border-none rounded-2xl px-4 py-2.5 font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500"
            >
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-black text-slate-400 ml-1">基本時薪</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input type="number" v-model.number="baseHourlyWage" class="w-full pl-7 pr-3 py-2.5 bg-slate-100 border-none rounded-2xl font-black text-slate-700 focus:ring-2 focus:ring-emerald-500">
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-black text-slate-400 ml-1">勞保費</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input type="number" v-model.number="laborFee" class="w-full pl-7 pr-3 py-2.5 bg-slate-100 border-none rounded-2xl font-black text-slate-700 focus:ring-2 focus:ring-rose-500">
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-black text-slate-400 ml-1">健保費</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input type="number" v-model.number="healthFee" class="w-full pl-7 pr-3 py-2.5 bg-slate-100 border-none rounded-2xl font-black text-slate-700 focus:ring-2 focus:ring-blue-500">
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-auto">
      <div class="hidden md:block bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <table class="w-full text-left border-collapse">
          <thead class="bg-slate-50/50">
            <tr class="border-b border-slate-100">
              <th class="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest">員工姓名</th>
              <th class="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">當月總時數</th>
              <th class="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">外送加給</th> 
              <th class="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">預估薪資</th>
              <th class="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">扣除項目</th>
              <th class="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">實領薪資</th>
            </tr>
          </thead>
          <tbody v-if="!isLoading">
            <tr v-for="emp in reportData" :key="emp.id" class="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
              <td class="py-4 px-6 font-bold text-slate-700">{{ emp.name }}</td>
              <td class="py-4 px-6 text-right">
                <span class="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full font-black text-sm">{{ emp.totalHours }}h</span>
              </td>
              <td class="py-4 px-6 text-right font-bold" :class="emp.totalDeliveryFee > 0 ? 'text-orange-500' : 'text-slate-300'">
                ${{ (emp.totalDeliveryFee || 0).toLocaleString() }}
              </td>
              <td class="py-4 px-6 text-right font-bold">
                <div class="text-slate-400">
                  ${{ (((emp.totalNormalHours || 0) * (baseHourlyWage || 0)) + ((emp.totalDoubleHours || 0) * (baseHourlyWage || 0) * 2) + (emp.totalDeliveryFee || 0)).toLocaleString() }}
                </div>
                <div v-if="emp.totalDoubleHours > 0" class="text-[10px] text-rose-500 mt-1">
                  含雙倍 {{ emp.totalDoubleHours }}h
                </div>
              </td>
              <td class="py-4 px-6 text-center">
                <div class="flex justify-center gap-4">
                  <label class="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" v-model="emp.deductLabor" class="w-4 h-4 rounded border-slate-300 text-rose-500 focus:ring-rose-500">
                    <span class="text-xs font-bold text-slate-400">勞</span>
                  </label>
                  <label class="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" v-model="emp.deductHealth" class="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500">
                    <span class="text-xs font-bold text-slate-400">健</span>
                  </label>
                </div>
              </td>
              <td class="py-4 px-6 text-right font-black text-emerald-600 text-lg">
                ${{ calculateNetPay(emp).toLocaleString() }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="md:hidden flex flex-col gap-3">
        <div v-if="!isLoading" v-for="emp in reportData" :key="'mob-' + emp.id" 
          class="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="text-lg font-black text-slate-800">{{ emp.name }}</h3>
              <span class="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-xs">
                {{ emp.totalHours }} 小時
              </span>
            </div>
            <div class="text-right">
              <p class="text-[10px] font-black text-slate-400 uppercase tracking-tighter">實領薪資</p>
              <p class="text-xl font-black text-emerald-600">${{ calculateNetPay(emp).toLocaleString() }}</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 py-3 border-y border-slate-50 mb-3">
            <div>
              <p class="text-[10px] font-bold text-slate-400">外送加給</p>
              <p class="font-bold text-slate-600">${{ (emp.totalDeliveryFee || 0).toLocaleString() }}</p>
            </div>
           <div>
            <p class="text-[10px] font-bold text-slate-400">應領小計</p>
            <div class="flex items-center gap-2">
              <p class="font-bold text-slate-400">
                ${{ (((emp.totalNormalHours || 0) * (baseHourlyWage || 0)) + ((emp.totalDoubleHours || 0) * (baseHourlyWage || 0) * 2) + (emp.totalDeliveryFee || 0)).toLocaleString() }}
              </p>
              <span v-if="emp.totalDoubleHours > 0" class="px-1.5 py-0.5 bg-rose-50 text-rose-500 rounded text-[10px] font-black">
                雙倍 {{ emp.totalDoubleHours }}h
              </span>
            </div>
          </div>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-500">扣除項目設定</span>
            <div class="flex gap-4">
              <label class="flex items-center gap-2 px-3 py-1.5 bg-rose-50 rounded-xl cursor-pointer">
                <input type="checkbox" v-model="emp.deductLabor" class="w-4 h-4 rounded border-rose-200 text-rose-500">
                <span class="text-xs font-black text-rose-600">勞保</span>
              </label>
              <label class="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-xl cursor-pointer">
                <input type="checkbox" v-model="emp.deductHealth" class="w-4 h-4 rounded border-blue-200 text-blue-500">
                <span class="text-xs font-black text-blue-600">健保</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 text-slate-400 font-bold animate-pulse">
        <p class="text-4xl mb-2">📊</p>
        <p>報表資料計算中...</p>
      </div>
    </div>
  </div>
</template>