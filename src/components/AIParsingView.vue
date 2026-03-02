<script setup>
import { ref, onMounted } from 'vue'
// 請確認這裡的引入路徑符合你的專案結構
import { shiftService } from '../services/shiftService'

const employees = ref([])
const previewImage = ref(null)
const isParsingImage = ref(false)
const fileInput = ref(null)

// 載入員工名單
onMounted(async () => {
  try {
    // 呼叫你的 shiftService 去資料庫抓資料
    const { employees: dbEmployees } = await shiftService.fetchInitialData()
    employees.value = dbEmployees
    console.log('✅ 成功從資料庫載入員工名單:', employees.value.map(e => e.name).join(', '))
  } catch (error) {
    console.error('❌ 載入員工名單失敗:', error)
  }
})

const handlePreview = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  previewImage.value = URL.createObjectURL(file)
  isParsingImage.value = true

  try {
    // 1. 準備表單資料
    const formData = new FormData()
    formData.append('scheduleImage', file)

    const namesString = employees.value.map(emp => emp.name).join(', ')
    formData.append('employeeNames', namesString)
    
    // 2. 呼叫我們剛寫好的 Node.js API (請確認 port 是否正確)
    const response = await fetch('http://localhost:3000/api/parse-schedule', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error('API 發生錯誤，請檢查後端狀態')
    }

    const aiResults = await response.json()
    console.log('🤖 AI 解析完成:', aiResults)

    // 🌟 4. 準備一個空陣列，用來裝轉換後的資料庫格式
    const shiftsToSave = []

    aiResults.forEach(aiShift => {
      // 找出這個名字對應的員工 ID
      const emp = employees.value.find(e => e.name === aiShift.employee_name)
      if (!emp) return // 如果這個名字在資料庫找不到，就跳過這筆

      // 狀況 A：這天休假、或是沒有排班時間
      // 你的需求：「沒有上班的話一律都是空的，不會寫進資料庫」
      if (aiShift.isOff || !aiShift.segments || aiShift.segments.length === 0) {
        // (如果有需要清除舊資料，這裡可以另外呼叫 shiftService.deleteShift)
        // 這裡我們直接 return 跳過，不把它加入準備寫入的陣列中
        return 
      }

      // 狀況 B：這天有上班
      // 直接把 AI 解析出來的 segments 陣列 (例如 [{"start": "09:30", "end": "18:30"}]) 
      // 完整塞進資料庫的 segments 欄位裡！
      shiftsToSave.push({
        employee_id: emp.id,
        date: aiShift.date,
        segments: aiShift.segments // 🌟 直接存入整個 JSON 陣列
      })
    })

    // 🌟 6. 寫入資料庫
    if (shiftsToSave.length > 0) {
      console.log('準備寫入資料庫的班表:', shiftsToSave)
      
      // 呼叫你的批量寫入 API
      await shiftService.batchSaveShifts(shiftsToSave)
      alert('✅ 班表成功匯入系統！')
      
      // 匯入成功後清空預覽圖
      previewImage.value = null
    } else {
      alert('⚠️ 解析成功，但沒有找到需要新增的排班紀錄。')
    }

  } catch (error) {
    console.error('上傳處理失敗:', error)
    alert('發生錯誤: ' + error.message)
  } finally {
    isParsingImage.value = false
    if (fileInput.value) {
      fileInput.value.value = '' // 安全清空 input
    }
  }
}

const processParsedSchedule = async (parsedData) => {
  for (const record of parsedData) {
    const emp = employees.value.find(e => e.name.includes(record.employee_name))
    if (!emp) continue

    if (record.isOff || record.segments.length === 0) {
      await shiftService.deleteShift(emp.id, record.date)
      continue
    }

    const formattedSegments = record.segments.map(seg => ({
      start: formatTime(seg.start),
      end: formatTime(seg.end)
    }))

    await shiftService.saveShift({
      employee_id: emp.id,
      date: record.date,
      segments: formattedSegments,
      isDoublePay: false,
      delivery_fee: 0
    })
  }
}

const formatTime = (timeStr) => {
  if (timeStr.includes(':')) return timeStr
  if (timeStr.length === 4) return `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}`
  return timeStr
}
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 p-4 md:p-8 rounded-3xl">
    <div class="mb-8">
      <h2 class="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
        <span class="text-4xl">🤖</span> AI 智能排班辨識
      </h2>
      <p class="text-slate-500 font-bold mt-2">上傳手寫或紙本班表照片，AI 將自動為您輸入系統。</p>
    </div>

    <div class="flex-1 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 flex flex-col items-center justify-center">
      
      <div v-if="previewImage" class="w-full max-w-md mb-6 relative group">
        <img :src="previewImage" class="w-full h-auto rounded-2xl shadow-md border-4 border-slate-100" />
        <button @click="previewImage = null" class="absolute top-2 right-2 bg-slate-900/50 hover:bg-rose-500 text-white p-2 rounded-xl backdrop-blur-sm transition-colors">
          ✕
        </button>
      </div>

      <label class="w-full max-w-md flex flex-col items-center px-4 py-12 bg-indigo-50/50 text-indigo-500 rounded-3xl tracking-wide uppercase border-4 border-dashed border-indigo-200 cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-600 transition-all">
        <svg class="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
        </svg>
        <span class="font-black text-lg">選擇或拍攝班表照片</span>
        <span class="text-sm font-bold text-indigo-300 mt-1">支援 JPG, PNG 格式</span>
        <input type="file" ref="fileInput" accept="image/*" class="hidden" @change="handlePreview" />
      </label>
    </div>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="isParsingImage" class="fixed inset-0 z-[300] flex flex-col items-center justify-center p-4 bg-slate-900/85 backdrop-blur-md">
          <div class="relative w-24 h-24 mb-6">
            <div class="absolute inset-0 border-4 border-indigo-500/30 rounded-2xl"></div>
            <div class="absolute inset-0 bg-gradient-to-b from-indigo-500/0 via-indigo-500/40 to-indigo-500/0 animate-scan"></div>
            <svg class="w-full h-full text-indigo-400 p-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
            </svg>
          </div>
          <h3 class="text-white font-black text-2xl mb-2 tracking-widest animate-pulse">AI 視覺解析中</h3>
          <p class="text-indigo-200 text-sm font-bold text-center">
            正在讀取手寫班表與休假記號...<br>
            這可能需要 10 ~ 20 秒，請稍候
          </p>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes scan {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(100%); }
}
.animate-scan {
  animation: scan 2s linear infinite;
}
</style>