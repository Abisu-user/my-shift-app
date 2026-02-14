<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { shiftService } from '../services/shiftService.js'

const props = defineProps({ 
    shifts: Array,
    monday: Date 
})

const employees = ref([])
const shifts = ref([])
const loading = ref(true)

// --- 篩選狀態 ---
const filters = ref({
    name: '',
    day: null,     // 0-6
    category: null // 'full', 'morning', 'evening'
})

const resetFilters = () => {
    filters.value = { name: '', day: null, category: null }
}

// 建立日期標籤
const weekDateLabels = computed(() => {
    const labels = []
    
    const current = props.monday ? new Date(props.monday) : new Date()
    
    const day = current.getDay()
    const diffToMonday = day === 0 ? 6 : day - 1
    
    const start = new Date(current)
    start.setDate(current.getDate() - diffToMonday)

    const dayNames = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']
    
    for (let i = 0; i < 7; i++) {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const dateStr = String(d.getDate()).padStart(2, '0')
        
        labels.push({
            name: dayNames[i], 
            date: `${d.getMonth() + 1}/${d.getDate()}`,
            fullDate: `${year}-${month}-${dateStr}`
        })
    }
    return labels
})

// 輔助函式：判斷時段屬於哪種班別
const getShiftCategory = (start, end) => {
    if (!start || !end) return null
    
    const s = parseInt(start.replace(':', ''))
    const e = parseInt(end.replace(':', ''))

    if (s <= 1000 && e >= 1700) return 'full'
    if (s <= 1000 && e < 1700) return 'morning'
    if (s >= 1400 && e >= 2000) return 'evening'
    
    return null
}

// --- App 喚醒自動刷新邏輯 ---
const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    console.log('App 喚醒，自動更新班表...')
    loadData() // 重新抓取資料
  }
}

// 核心資料處理
const processShiftData = computed(() => {
    return employees.value.map(emp => {
        const empDays = weekDateLabels.value.map(label => {
            const dayShift = shifts.value.find(s => 
                s.employee_id === emp.id && s.date === label.fullDate
            )
            return dayShift ? dayShift.segments : []
        })

        const totalMinutes = empDays.flat().reduce((acc, seg) => {
            const start = new Date(`2000/01/01 ${seg.start}`)
            const end = new Date(`2000/01/01 ${seg.end}`)
            return acc + (end - start) / 1000 / 60
        }, 0)

        return {
            ...emp,
            days: empDays,
            totalHours: totalMinutes / 60
        }
    })
})

// 🌟 修改後的過濾邏輯
const filteredProcessedData = computed(() => {
    return processShiftData.value.filter(emp => {
        // 姓名搜尋
        const matchName = filters.value.name ? emp.name === filters.value.name : true
        
        // 星期搜尋
        let matchDay = true
        if (filters.value.day !== null) {
            const dayShifts = emp.days[filters.value.day]
            matchDay = dayShifts && dayShifts.length > 0
        }

        // 班別篩選 (全日/早/晚)
        let matchCategory = true
        if (filters.value.category) {
            // 檢查本週是否有任一天含有符合該類別的時段
            matchCategory = emp.days.some(daySegs => 
                daySegs.some(seg => getShiftCategory(seg.start, seg.end) === filters.value.category)
            )
        }
        return matchName && matchDay && matchCategory
    })
})

const calculateDayTotal = (dayShifts) => {
    if (!dayShifts || dayShifts.length === 0) return '0'
    const mins = dayShifts.reduce((acc, seg) => {
        const start = new Date(`2000/01/01 ${seg.start}`)
        const end = new Date(`2000/01/01 ${seg.end}`)
        return acc + (end - start) / 1000 / 60
    }, 0)
    return (mins / 60).toFixed(1)
}

const loadData = async () => {
    loading.value = true
    try {
        const [initData, shiftsData] = await Promise.all([
            shiftService.fetchInitialData(),
            shiftService.fetchShiftsByRange(
                weekDateLabels.value[0].fullDate, 
                weekDateLabels.value[6].fullDate
            )
        ])
        employees.value = initData.employees
        shifts.value = shiftsData
    } catch (e) {
        console.error('載入失敗:', e)
    } finally {
        loading.value = false
    }
}

onMounted(() => {
  loadData()
  // 註冊監聽器
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="flex flex-col h-auto md:h-[calc(100dvh-280px)] overflow-hidden animate-fade-in">
    <!-- 篩選器區域 -->
    <div class="mb-2 md:mb-6 landscape:mb-1 flex flex-wrap items-center gap-2 md:gap-4 bg-white/60 p-2 md:p-3 rounded-2xl md:rounded-[2rem] border border-slate-200 shadow-sm backdrop-blur-md">
    
        <div class="flex items-center gap-3 bg-white px-5 py-2 rounded-full border border-slate-500 shadow-sm flex-1 min-w-0 w-full md:w-auto md:flex-1">
            <span class="text-lg group-hover:scale-110 transition-transform">👥</span>
            <div class="relative w-full">
                <select v-model="filters.name" class="bg-transparent border-none outline-none text-base font-bold text-slate-700 w-full cursor-pointer appearance-none relative z-10">
                    <option value="">顯示員工</option>
                    <option v-for="emp in employees" :key="emp.id" :value="emp.name">
                        {{ emp.name }}
                    </option>
                </select>
                <div class="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-2 bg-white px-5 py-3 rounded-full border border-slate-500 shadow-sm min-w-[160px]">
            <span class="text-sm">📅</span>
            <select v-model="filters.day" class="bg-transparent border-none outline-none text-sm font-black text-slate-600 cursor-pointer w-full">
            <option :value="null">所有星期</option>
            <option v-for="(label, idx) in weekDateLabels" :key="idx" :value="idx">{{ label.name }}</option>
            </select>
        </div>

        <div class="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-slate-500 shadow-sm group hover:border-orange-200 transition-all">
            <span class="text-xs">⏳</span>
            <select v-model="filters.category" class="bg-transparent border-none outline-none text-xs font-black text-slate-600 cursor-pointer pr-4 appearance-none">
            <option :value="null">所有班別</option>
            <option value="full">🏠 全日班</option>
            <option value="morning">☀️ 早班</option>
            <option value="evening">🌙 晚班</option>
            </select>
        </div>

        <button 
            @click="resetFilters" 
            class="flex items-center gap-2 px-6 py-3 rounded-full text-slate-500 hover:text-orange-600 hover:bg-orange-50 transition-all active:scale-95"
        >
            <span class="text-xs font-black uppercase tracking-widest">重製</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
        </button>

        <button 
            @click="loadData" 
            class="flex items-center justify-center w-10 h-10 md:w-auto md:px-5 md:py-3 bg-white border border-slate-200 rounded-full shadow-sm text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:shadow-md transition-all active:scale-95 active:bg-slate-50 group"
            title="重新整理班表"
        >
            <svg 
                xmlns="http://www.w3.org/2000/svg" 
                class="h-5 w-5 transition-transform duration-500" 
                :class="{'animate-spin text-indigo-600': loading, 'group-hover:rotate-180': !loading}" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
            >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            
            <span class="hidden md:inline ml-2 font-bold text-sm">刷新</span>
        </button>
    </div>
    <!-- 班表區域 -->
    <div class="hidden md:block landscape:block flex-1 md:overflow-y-auto min-h-0 bg-white shadow-xl border border-slate-200 relative">
        <div v-if="loading" class="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
            <svg class="animate-spin h-10 w-10 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-sm font-black text-indigo-600 tracking-widest animate-pulse">資料同步中...</span>
        </div>

        <table class="w-full text-left border-collapse">
            <thead class="bg-slate-50/80 sticky top-0 z-20 backdrop-blur-md">
            <tr class="landscape:text-[10px]">
                <th class="py-2 px-3 md:py-6 md:px-6 min-w-[100px] md:min-w-[180px] landscape:min-w-[100px] border-b-2 border-r border-slate-300 min-w-[100px] md:min-w-[180px] text-xs font-black text-slate-400 uppercase tracking-widest sticky left-0 bg-white z-30 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.1)]">
                員工姓名
                </th>
                
                <th v-for="label in weekDateLabels" :key="label.date" class="py-2 px-2 md:py-5 md:px-4 min-w-[80px] md:min-w-[130px] landscape:min-w-[85px] border-b-2 border-r border-slate-300 text-center min-w-[90px] md:min-w-[130px]">
                <div class="flex flex-col gap-1">
                    <span class="text-xs font-black text-slate-400 uppercase">{{ label.name }}</span>
                    <span class="text-base font-black text-slate-800">{{ label.date }}</span>
                </div>
                </th>

                <th class="py-6 px-6 border-b-2 border-slate-300 text-right text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-50/80 w-[100px]">
                總計(h)
                </th>
            </tr>
            </thead>

            <tbody>
            <tr v-for="emp in filteredProcessedData" :key="emp.id" class="group hover:bg-indigo-50/20 transition-colors">
                
                <td class="py-2 px-3 lg:py-5 lg:px-6 border-b-2 border-r border-slate-300 sticky left-0 bg-white z-10 group-hover:bg-slate-50 transition-colors shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)]">
                <div class="flex items-center gap-4">
                    <span class="font-black text-slate-700 text-base">{{ emp.name }}</span>
                </div>
                </td>

                <td v-for="(dayShifts, dayIdx) in emp.days" :key="dayIdx" class="p-3 border-b-2 border-r border-slate-300 align-top">
                    <div class="flex flex-col gap-1 md:gap-2 lg:min-h-[80px] justify-between">
                        <div class="flex flex-col gap-1.5">
                        <template v-if="dayShifts?.length > 0">
                            <div v-for="(seg, sIdx) in dayShifts" :key="sIdx" 
                                :class="[
                                'text-[9px] max-lg:landscape:text-[10px] lg:text-[15px] font-black py-1 px-1.5 rounded-xl border text-center shadow-sm transition-transform hover:scale-105',
                                getShiftCategory(seg.start, seg.end) === 'full' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                                getShiftCategory(seg.start, seg.end) === 'morning' ? 'bg-sky-50 text-sky-700 border-sky-200' : 
                                'bg-indigo-50 text-indigo-700 border-indigo-200'
                                ]">
                            {{ seg.start }} — {{ seg.end }}
                            </div>
                        </template>
                        <div v-else class="text-center py-6">
                            <span class="text-slate-500 text-[8px] md:text-xs italic font-bold">休假</span>
                        </div>
                        </div>

                        <div v-if="dayShifts?.length > 0" class="mt-2 text-right">
                        <span class="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                            {{ calculateDayTotal(dayShifts) }} hr
                        </span>
                        </div>
                    </div>
                </td>

                <td class="py-5 px-6 border-b-2 text-right font-black text-xl text-slate-900 bg-slate-50/30 tabular-nums">
                {{ emp.totalHours.toFixed(1) }}
                </td>
            </tr>
            </tbody>
        </table>
    </div>

    <!-- 手機版員工卡片 -->
    <div class="block md:hidden landscape:hidden flex-1 min-h-0 pb-24">
        <div v-if="loading" class="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <svg class="animate-spin h-10 w-10 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-xs font-bold tracking-widest">資料同步中...</span>
        </div>

        <div v-else class="flex flex-col gap-4 pt-1">
            <div v-for="emp in filteredProcessedData" :key="emp.id" 
                class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mx-1">
                
                <div class="bg-slate-50 px-4 py-3 flex justify-between items-center border-b border-slate-100">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-slate-800">{{ emp.name }}</span>
                    </div>
                    <div class="bg-indigo-50 px-3 py-1 rounded-full">
                        <span class="text-[10px] font-bold text-indigo-400 uppercase mr-1">Total</span>
                        <span class="text-sm font-black text-indigo-600">{{ emp.totalHours.toFixed(1) }}h</span>
                    </div>
                </div>

                <div class="flex justify-around p-3 bg-white border-b border-slate-100">
                    <div v-for="(label, idx) in weekDateLabels" :key="idx" class="flex flex-col items-center gap-1">
                        <span class="text-[9px] font-bold text-slate-400 uppercase">{{ label.name.replace('週', '') }}</span>
                        <div :class="[
                        'w-1.5 h-1.5 rounded-full',
                        emp.days[idx]?.length > 0 ? 'bg-indigo-500' : 'bg-slate-200'
                        ]"></div>
                    </div>
                </div>

                <div class="p-4 space-y-3 bg-white">
                    <div v-for="(dayShifts, dayIdx) in emp.days" :key="dayIdx">
                        <div v-if="dayShifts?.length > 0" class="flex items-start justify-between">
                            <div class="flex items-center gap-4">
                                <div class="flex flex-col items-center min-w-[36px]">
                                    <span class="text-[10px] font-bold text-slate-400 uppercase">{{ weekDateLabels[dayIdx].name }}</span>
                                    <span class="text-xs font-black text-slate-700">{{ weekDateLabels[dayIdx].date }}</span>
                                </div>
                                
                                <div class="flex flex-col gap-1">
                                    <div v-for="(seg, sIdx) in dayShifts" :key="sIdx" 
                                        class="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                        <span class="text-xs font-black text-slate-600 tabular-nums">
                                        {{ seg.start }} — {{ seg.end }}
                                        </span>
                                        <span :class="[
                                        'text-[9px] px-1.5 py-0.5 rounded font-bold',
                                        getShiftCategory(seg.start, seg.end) === 'full' ? 'bg-amber-100 text-amber-600' : 
                                        getShiftCategory(seg.start, seg.end) === 'morning' ? 'bg-sky-100 text-sky-600' : 
                                        'bg-indigo-100 text-indigo-600'
                                        ]">
                                        {{ getShiftCategory(seg.start, seg.end) === 'morning' ? '早' : 
                                            getShiftCategory(seg.start, seg.end) === 'evening' ? '晚' : '全' }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <span class="text-[10px] font-bold text-slate-400 mt-1">
                                {{ calculateDayTotal(dayShifts) }}h
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

  </div>
</template>