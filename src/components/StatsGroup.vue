<script setup>
// ✅ 修正點：同時導入 computed 和 ref
import { computed, ref } from 'vue' 

const props = defineProps({ 
  monday: Date,
  stats: Object 
})

// ✅ 修正點：確保包含 'select-date' 事件
const emit = defineEmits(['change-week', 'select-date'])

const datePicker = ref(null)

const formatDateRange = computed(() => {
    if (!props.monday) return ''
    const monday = new Date(props.monday)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    
    // 輸出格式：2/16 - 2/22 (Bug 1 修正：確保文字不換行)
    return `${monday.getMonth() + 1}/${monday.getDate()} - ${sunday.getMonth() + 1}/${sunday.getDate()}`
})

const onDateChange = (event) => {
    const selectedDate = new Date(event.target.value)
    if (!isNaN(selectedDate)) {
        emit('select-date', selectedDate)
    }
}

const openDatePicker = () => {
    // 觸發隱藏的 input click
    if (datePicker.value) {
        datePicker.value.showPicker() 
    }
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">

    <div class="relative bg-white p-6 rounded-3xl border border-slate-200 shadow-lg shadow-slate-200/50 transition-all duration-300 group overflow-hidden">
      <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500"></div>
      <div class="flex justify-between items-center relative z-10">
        <div class="flex flex-col">
          <p class="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">員工總數</p>
          <h3 class="text-3xl font-black text-slate-800 tracking-tight">{{ stats?.employeeCount || 0 }}</h3>
        </div>
        <div class="p-3 bg-blue-50 rounded-2xl text-blue-600 text-xl group-hover:scale-110 transition-transform duration-300">👥</div>
      </div>
    </div>
    
    <div class="w-fit relative bg-white p-6 rounded-3xl border border-slate-200 shadow-lg shadow-slate-200/50 hover:shadow-xl transition-all duration-300 group overflow-hidden">
      <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-500"></div>
      
      <div class="flex justify-between items-center relative z-10 cursor-pointer" @click="openDatePicker">
        
        <div class="flex flex-col flex-1">
          <p class="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">日期範圍 (點擊選擇)</p>
          
          <div class="flex items-center gap-2 mt-1 whitespace-nowrap">
            <button @click.stop="emit('change-week', -1)" class="p-1 hover:-translate-y-1 hover:shadow-xl hover:text-blue-500 rounded text-black-600 font-bold text-xl leading-none">< 上週</button>
            
            <h3 class="text-lg font-black text-slate-800 tracking-tight">
              {{ formatDateRange }}
            </h3>

            <button @click.stop="emit('change-week', 1)" class="p-1 hover:-translate-y-1 hover:shadow-xl hover:text-blue-500 rounded text-black-600 font-bold text-xl leading-none">下週 ></button>
          </div>
        </div>

        <input 
            type="date" 
            ref="datePicker" 
            class="absolute opacity-0 pointer-events-none w-0 h-0" 
            @change="onDateChange"
        />

        <div class="p-3 bg-orange-50 rounded-2xl text-orange-600 text-xl group-hover:rotate-12 transition-transform duration-300">📅</div>
      </div>
    </div>
  </div>
</template>