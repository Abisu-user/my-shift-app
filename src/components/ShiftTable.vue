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

// 建立日期標籤 (✨ 新增週末判斷)
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
        const dayOfWeek = d.getDay()
        
        labels.push({
            name: dayNames[i], 
            date: `${d.getMonth() + 1}/${d.getDate()}`,
            fullDate: `${year}-${month}-${dateStr}`,
            isSaturday: dayOfWeek === 6, // 判斷週六
            isSunday: dayOfWeek === 0    // 判斷週日
        })
    }
    return labels
})

const todayDateStr = computed(() => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const dateStr = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${dateStr}`
})

// 輔助函式：判斷時段屬於哪種班別
const getShiftCategory = (start, end) => {
    if (!start || !end) return null
    
    const s = parseInt(start.replace(':', ''))
    const e = parseInt(end.replace(':', ''))

    if (s === 930) return 'open_morning'
    if (e === 2030) return 'closing'
    if (s <= 1000 && e >= 1700) return 'full'
    if (s <= 1000 && e < 1700) return 'morning'
    if (s >= 1400 && e >= 2000) return 'evening'
    
    return null
}

// ✨ 新增：用於 Hover 提示的班別中文名稱
const getShiftCategoryText = (start, end) => {
    const cat = getShiftCategory(start, end)
    const map = {
        open_morning: '開早班',
        closing: '收班',
        full: '全日班',
        morning: '早班',
        evening: '晚班'
    }
    return map[cat] || '一般班'
}

// --- App 喚醒自動刷新邏輯 ---
const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    console.log('App 喚醒，自動更新班表...')
    loadData()
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

const filteredProcessedData = computed(() => {
    return processShiftData.value.filter(emp => {
        if (filters.value.name && emp.name !== filters.value.name) return false
        
        if (filters.value.day !== null) {
            const dayShifts = emp.days[filters.value.day]
            if (!dayShifts || dayShifts.length === 0) return false

            if (filters.value.category) {
                return dayShifts.some(seg => {
                    const cat = getShiftCategory(seg.start, seg.end)
                    if (cat === filters.value.category) return true
                    if (filters.value.category === 'full') {
                        const s = parseInt(seg.start.replace(':', ''))
                        const e = parseInt(seg.end.replace(':', ''))
                        return s <= 1000 && e >= 1700
                    }
                    return false
                })
            }
            return true
        }

        if (filters.value.category) {
            return emp.days.some(daySegs => 
                daySegs.some(seg => {
                    const cat = getShiftCategory(seg.start, seg.end)
                    if (cat === filters.value.category) return true
                    if (filters.value.category === 'full') {
                        const s = parseInt(seg.start.replace(':', ''))
                        const e = parseInt(seg.end.replace(':', ''))
                        return s <= 1000 && e >= 1700
                    }
                    return false
                })
            )
        }
        return true
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
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="flex flex-col h-auto md:h-[calc(100dvh-280px)] overflow-hidden animate-fade-in">
    
    <div class="mb-4 landscape:mb-2 flex flex-wrap items-center justify-between gap-4 bg-white p-3 md:p-4 rounded-2xl md:rounded-[1.5rem] border border-slate-200 shadow-sm">
        
        <div class="flex flex-wrap items-center gap-3 w-full md:w-auto flex-1">
            <div class="flex items-center gap-3 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors w-full md:w-64 relative focus-within:ring-2 focus-within:ring-indigo-100">
                <span class="text-xl">👤</span>
                <select v-model="filters.name" class="bg-transparent border-none outline-none text-base font-black text-slate-700 w-full cursor-pointer appearance-none z-10">
                    <option value="">搜尋全體員工</option>
                    <option v-for="emp in employees" :key="emp.id" :value="emp.name">{{ emp.name }}</option>
                </select>
                <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
            </div>

            <div class="flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors">
                <span class="text-sm">📅</span>
                <select v-model="filters.day" class="bg-transparent border-none outline-none text-sm font-bold text-slate-600 cursor-pointer pr-2 appearance-none">
                    <option :value="null">所有星期</option>
                    <option value="0">星期一</option>
                    <option value="1">星期二</option>
                    <option value="2">星期三</option>
                    <option value="3">星期四</option>
                    <option value="4">星期五</option>
                    <option value="5">星期六</option>
                    <option value="6">星期日</option>
                </select>
            </div>

            <div class="flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors">
                <span class="text-sm">⏳</span>
                <select v-model="filters.category" class="bg-transparent border-none outline-none text-sm font-bold text-slate-600 cursor-pointer pr-2 appearance-none">
                    <option :value="null">所有班別</option>
                    <option value="full">全日班</option>
                    <option value="morning">早班</option>
                    <option value="evening">晚班</option>
                    <option value="open_morning">開早班</option>
                    <option value="closing">收班</option>
                </select>
            </div>
        </div>

        <div class="flex items-center gap-2 w-full md:w-auto justify-end">
            <button @click="resetFilters" class="text-sm font-bold text-slate-400 hover:text-slate-600 px-4 py-2 transition-colors active:scale-95">
                重設條件
            </button>
            <button @click="loadData" class="flex items-center justify-center p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all active:scale-95" title="重新整理班表">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 transition-transform duration-500" :class="{'animate-spin': loading}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
            </button>
        </div>
    </div>

    <div class="hidden md:block landscape:block flex-1 md:overflow-y-auto min-h-0 bg-white shadow-xl border border-slate-200 rounded-xl relative">
        <div v-if="loading" class="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 rounded-xl">
            <svg class="animate-spin h-10 w-10 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-sm font-black text-indigo-600 tracking-widest animate-pulse">資料同步中...</span>
        </div>

        <table class="w-full text-left border-collapse">
            <thead class="bg-white sticky top-0 z-30 shadow-sm border-b-2 border-slate-400">
                <tr>
                    <th class="py-4 px-6 border-r border-slate-400 min-w-[140px] text-sm font-black text-slate-400 uppercase tracking-widest sticky left-0 bg-white z-40 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)]">
                        員工姓名
                    </th>
                    
                    <th v-for="(label, idx) in weekDateLabels" :key="idx" 
                        v-show="filters.day == null || filters.day == idx"
                        :class="[
                        'py-4 px-2 lg:px-4 text-center border-r transition-all relative',
                        label.fullDate === todayDateStr ? 'bg-orange-50/50 border-orange-400' : 
                        label.isSunday ? 'bg-rose-50/30 border-slate-400' : 
                        label.isSaturday ? 'bg-sky-50/30 border-slate-400' : 'bg-slate-50 border-slate-400'
                        ]">
                        
                        <div v-if="label.fullDate === todayDateStr" class="absolute top-0 left-0 w-full h-1 bg-orange-500"></div>

                        <div class="flex flex-col items-center gap-1.5">
                            <span :class="['text-xs font-bold uppercase tracking-widest', 
                                label.fullDate === todayDateStr ? 'text-orange-600' : 
                                label.isSunday ? 'text-rose-500' : 
                                label.isSaturday ? 'text-sky-600' : 'text-slate-400']">
                                {{ label.name }}
                            </span>
                            <span :class="['text-sm lg:text-lg font-black px-4 py-1 rounded-xl border transition-all', 
                                label.fullDate === todayDateStr ? 'bg-orange-500 text-white border-orange-600 shadow-md shadow-orange-200 scale-110' : 
                                label.isSunday ? 'bg-white text-rose-600 border-rose-200 shadow-sm' : 
                                label.isSaturday ? 'bg-white text-sky-600 border-sky-200 shadow-sm' : 'bg-white text-slate-700 border-slate-200 shadow-sm']">
                                {{ label.date }}
                            </span>
                        </div>
                    </th>

                    <th class="py-4 px-6 text-center text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-50 w-[120px]">
                        總工時
                    </th>
                </tr>
            </thead>

            <tbody>
                <tr v-for="(emp, index) in filteredProcessedData" :key="emp.id" 
                    :class="['group transition-colors', index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60', 'hover:bg-indigo-50/40']">
                    
                    <td :class="['py-4 px-6 border-b border-r border-slate-400 sticky left-0 z-20 transition-colors shadow-[4px_0_10px_-4px_rgba(0,0,0,0.03)]', 
                        index % 2 === 0 ? 'bg-white group-hover:bg-indigo-50/40' : 'bg-slate-50 group-hover:bg-indigo-50/40']">
                        <span class="font-black text-slate-700 text-base">{{ emp.name }}</span>
                    </td>

                    <td v-for="(dayShifts, idx) in emp.days" :key="idx" 
                        v-show="filters.day == null || filters.day == idx"
                        :class="['py-3 lg:py-4 px-2 lg:px-3 border-b border-r border-slate-400 align-top transition-colors',
                        weekDateLabels[idx].fullDate === todayDateStr ? 'bg-orange-50/10' : '']">
                        
                        <template v-if="dayShifts?.length > 0">
                            <div class="flex flex-col gap-2">
                                <div v-for="(seg, sIdx) in dayShifts" :key="sIdx" 
                                    :title="`${getShiftCategoryText(seg.start, seg.end)} (${seg.start} - ${seg.end})`"
                                    :class="[
                                    'text-[11px] lg:text-[13px] font-black py-1.5 px-2 rounded-xl border text-center shadow-sm transition-all hover:scale-105 hover:shadow-md cursor-default',
                                    getShiftCategory(seg.start, seg.end) === 'morning' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                    getShiftCategory(seg.start, seg.end) === 'full' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                                    getShiftCategory(seg.start, seg.end) === 'evening' ? 'bg-purple-50 text-purple-700 border-purple-200' : 
                                    getShiftCategory(seg.start, seg.end) === 'open_morning' ? 'bg-teal-50 text-teal-700 border-teal-200' : 
                                    'bg-rose-50 text-rose-700 border-rose-200' // closing
                                    ]">
                                    {{ seg.start }} — {{ seg.end }}
                                </div>
                                
                                <div class="text-[10px] lg:text-xs text-slate-400 font-bold text-center mt-0.5">
                                    {{ calculateDayTotal(dayShifts) }}h
                                </div>
                            </div>
                        </template>
                        
                        <div v-else class="h-full min-h-[50px] flex items-center justify-center">
                            <span class="text-slate-300 font-bold text-sm tracking-widest px-3 py-1 rounded-lg border border-dashed border-slate-200">休息</span>
                        </div>
                    </td>

                    <td class="py-4 px-6 border-b border-slate-200 text-center">
                        <div class="inline-flex items-center justify-center min-w-[60px] px-3 py-1.5 rounded-xl font-black text-sm border shadow-sm transition-colors"
                             :class="emp.totalHours > 40 ? 'bg-rose-100 text-rose-700 border-rose-200' : 
                                     emp.totalHours > 0 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 
                                     'bg-slate-100 text-slate-400 border-slate-200'">
                            {{ emp.totalHours.toFixed(1) }}<span class="text-[10px] ml-0.5 uppercase opacity-70">h</span>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>

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
                class="bg-white rounded-[1.5rem] shadow-sm border border-slate-200 overflow-hidden mx-1">
                
                <div class="bg-slate-50 px-5 py-4 flex justify-between items-center border-b border-slate-100">
                    <span class="font-black text-slate-800 text-lg">{{ emp.name }}</span>
                    <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border shadow-sm"
                         :class="emp.totalHours > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'">
                        <span class="text-[10px] font-bold text-emerald-600/70 uppercase">Total</span>
                        <span class="text-sm font-black" :class="emp.totalHours > 0 ? 'text-emerald-700' : 'text-slate-400'">
                            {{ emp.totalHours.toFixed(1) }}h
                        </span>
                    </div>
                </div>

                <div v-show="filters.day == null || filters.day === ''" class="flex justify-around p-3 bg-white border-b border-slate-100">
                    <div v-for="(label, idx) in weekDateLabels" :key="idx" 
                        class="flex flex-col items-center gap-1.5 transition-all"
                        :class="label.fullDate === todayDateStr ? 'scale-110' : ''">
                        <span :class="['text-[10px] font-bold uppercase', 
                            label.fullDate === todayDateStr ? 'text-orange-600' : 
                            label.isSunday ? 'text-rose-400' : 
                            label.isSaturday ? 'text-sky-500' : 'text-slate-400'
                        ]">
                            {{ label.name.replace('週', '') }}
                        </span>
                        
                        <div :class="[
                            'w-2 h-2 rounded-full',
                            emp.days[idx]?.length > 0 
                                ? (label.fullDate === todayDateStr ? 'bg-orange-500 ring-2 ring-orange-200' : 'bg-indigo-500') 
                                : 'bg-slate-200'
                        ]"></div>
                    </div>
                </div>

                <div class="p-3 flex flex-col gap-2 bg-white">
                    <div v-for="(dayShifts, dayIdx) in emp.days" :key="dayIdx"
                        v-show="filters.day == null || filters.day == dayIdx">
                        
                        <div v-if="dayShifts?.length > 0" 
                            :class="['flex items-start justify-between p-3 rounded-2xl transition-colors',
                                    weekDateLabels[dayIdx].fullDate === todayDateStr ? 'bg-orange-50/40 border border-orange-100' : 'bg-slate-50/50 border border-slate-100']">
                            <div class="flex items-center gap-4">
                                <div class="flex flex-col items-center min-w-[40px]">
                                    <span :class="['text-[10px] font-bold uppercase', 
                                            weekDateLabels[dayIdx].fullDate === todayDateStr ? 'text-orange-600' : 
                                            weekDateLabels[dayIdx].isSunday ? 'text-rose-500' :
                                            weekDateLabels[dayIdx].isSaturday ? 'text-sky-500' : 'text-slate-400']">
                                        {{ weekDateLabels[dayIdx].name }}
                                    </span>
                                    
                                    <span :class="['text-sm font-black mt-0.5', 
                                                weekDateLabels[dayIdx].fullDate === todayDateStr ? 'text-orange-600 scale-110' : 'text-slate-700']">
                                        {{ weekDateLabels[dayIdx].date }}
                                    </span>
                                </div>
                                
                                <div class="flex flex-col gap-2">
                                    <div v-for="(seg, sIdx) in dayShifts" :key="sIdx" 
                                        class="flex items-center gap-2.5 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
                                        <span class="text-[10px] px-2 py-1 rounded-lg font-black tracking-widest"
                                            :class="[
                                            getShiftCategory(seg.start, seg.end) === 'morning' ? 'bg-emerald-100 text-emerald-700' : 
                                            getShiftCategory(seg.start, seg.end) === 'full' ? 'bg-blue-100 text-blue-700' : 
                                            getShiftCategory(seg.start, seg.end) === 'evening' ? 'bg-purple-100 text-purple-700' : 
                                            getShiftCategory(seg.start, seg.end) === 'open_morning' ? 'bg-teal-100 text-teal-700' : 
                                            'bg-rose-100 text-rose-700'
                                            ]">
                                            {{ getShiftCategoryText(seg.start, seg.end) }}
                                        </span>

                                        <span class="text-xs font-black text-slate-700 tabular-nums">
                                            {{ seg.start }} — {{ seg.end }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <span class="text-[10px] font-bold text-slate-400 mt-2 bg-white px-2 py-1 rounded-lg border border-slate-100 shadow-sm">
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