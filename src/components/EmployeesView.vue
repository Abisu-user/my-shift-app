<script setup>
import { ref, onMounted } from 'vue'
import { shiftService } from '../services/shiftService'

const employees = ref([])
const loading = ref(true)
const showAddModal = ref(false)
const newEmployeeName = ref('')
const isSubmitting = ref(false)

// --- 批次操作狀態 ---
const isBatchMode = ref(false)
const selectedIds = ref([])

// --- 自訂確認彈窗狀態 ---
const confirmModal = ref({
  show: false,
  title: '',
  message: '',
  confirmText: '確認刪除',
  cancelText: '取消',
  isDanger: true,
  onConfirm: null
})

// 呼叫確認視窗的 Helper
const openConfirm = (title, message, onConfirm, isDanger = true) => {
  confirmModal.value = {
    show: true,
    title,
    message,
    confirmText: '確認執行',
    cancelText: '再想想',
    isDanger,
    onConfirm
  }
}

const handleConfirmAction = async () => {
  if (confirmModal.value.onConfirm) {
    await confirmModal.value.onConfirm()
  }
  confirmModal.value.show = false
}

// 載入員工
const loadEmployees = async () => {
  loading.value = true
  const data = await shiftService.fetchInitialData()
  employees.value = data.employees
  loading.value = false
}

// 新增員工
const handleAdd = async () => {
  if (!newEmployeeName.value.trim()) return
  isSubmitting.value = true
  try {
    await shiftService.addEmployee(newEmployeeName.value)
    await loadEmployees()
    showAddModal.value = false
    newEmployeeName.value = ''
  } catch (error) {
    alert('新增失敗: ' + error.message)
  }
  isSubmitting.value = false
}

// 單一刪除 (改用美化彈窗)
const handleDelete = (id) => {
  openConfirm(
    '刪除員工確認',
    '確定要刪除這位員工嗎？此動作無法復原，且可能會影響相關的排班紀錄。',
    async () => {
      try {
        await shiftService.deleteEmployee(id)
        await loadEmployees()
      } catch (error) {
        alert('刪除失敗: ' + error.message)
      }
    }
  )
}

// 批次操作邏輯
const toggleBatchMode = () => {
  isBatchMode.value = !isBatchMode.value
  selectedIds.value = []
}

const toggleSelection = (id) => {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter(item => item !== id)
  } else {
    selectedIds.value.push(id)
  }
}

// 批次刪除 (改用美化彈窗)
const handleBatchDelete = () => {
  if (selectedIds.value.length === 0) return
  
  openConfirm(
    '⚠️ 批次刪除確認',
    `確定要一次刪除這 ${selectedIds.value.length} 位員工嗎？相關的排班紀錄將會一併清除，此動作無法復原。`,
    async () => {
      loading.value = true
      try {
        for (const id of selectedIds.value) {
          await shiftService.deleteEmployee(id)
        }
        await loadEmployees()
        isBatchMode.value = false
        selectedIds.value = []
      } catch (e) {
        alert('批次刪除過程中發生錯誤')
      } finally {
        loading.value = false
      }
    }
  )
}

onMounted(() => {
  loadEmployees()
})
</script>

<template>
  <div class="p-6 md:p-10 max-w-7xl mx-auto animate-fade-in pb-32">
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
      <div>
        <h2 class="text-3xl font-black text-slate-800 tracking-tight">員工管理</h2>
        <p class="text-slate-500 font-bold text-sm mt-1">管理您的團隊成員</p>
      </div>
      
      <div class="flex gap-3 w-full md:w-auto">
        <button 
          @click="toggleBatchMode"
          :class="isBatchMode ? 'bg-slate-800 text-white shadow-lg' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'"
          class="px-5 py-3 rounded-xl font-bold transition-all active:scale-95 flex items-center gap-2"
        >
          <span v-if="isBatchMode">退出選取</span>
          <span v-else>⚡ 批次操作</span>
        </button>

        <button 
          @click="showAddModal = true" 
          v-if="!isBatchMode"
          class="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2"
        >
          <span>+</span> 新增員工
        </button>
      </div>
    </header>

    <div v-if="loading" class="flex justify-center py-20">
      <div class="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <div 
        v-for="emp in employees" 
        :key="emp.id" 
        @click="isBatchMode ? toggleSelection(emp.id) : null"
        class="group relative bg-white p-5 rounded-2xl border transition-all duration-200 overflow-hidden"
        :class="[
          isBatchMode 
            ? 'cursor-pointer hover:shadow-md' 
            : 'hover:shadow-lg hover:border-indigo-200 shadow-sm border-slate-100',
          isBatchMode && selectedIds.includes(emp.id) 
            ? 'border-indigo-500 ring-2 ring-indigo-500 bg-indigo-50/10' 
            : 'border-slate-100'
        ]"
      >
        <div v-if="isBatchMode" class="absolute top-4 right-4 z-10">
          <div 
            class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
            :class="selectedIds.includes(emp.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'"
          >
            <svg v-if="selectedIds.includes(emp.id)" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <div class="flex-1">
            <h3 class="font-black text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">{{ emp.name }}</h3>
            <p class="text-xs font-bold text-slate-400">員工 ID: {{ emp.id }}</p>
          </div>
        </div>

        <button 
          v-if="!isBatchMode"
          @click.stop="handleDelete(emp.id)" 
          class="absolute top-4 right-4 p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <button 
        v-if="!isBatchMode"
        @click="showAddModal = true"
        class="group border-2 border-dashed border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all min-h-[100px]"
      >
        <div class="w-10 h-10 rounded-full bg-slate-50 text-slate-300 flex items-center justify-center group-hover:bg-indigo-100 group-hover:text-indigo-500 transition-colors">
          <span class="text-2xl font-light">+</span>
        </div>
        <span class="font-bold text-slate-400 text-sm group-hover:text-indigo-500">新增員工</span>
      </button>
    </div>

    <Teleport to="body">
      <Transition name="slide-up">
        <div v-if="isBatchMode && selectedIds.length > 0" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
          <div class="bg-slate-900 text-white p-4 rounded-3xl shadow-2xl flex items-center justify-between border border-white/10 backdrop-blur-md">
            <div class="flex items-center gap-3 pl-2">
              <div class="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm">
                {{ selectedIds.length }}
              </div>
              <span class="font-bold text-sm">已選取</span>
            </div>
            
            <div class="flex gap-2">
              <button 
                @click="selectedIds = []" 
                class="px-4 py-2 rounded-xl text-slate-400 font-bold text-sm hover:text-white hover:bg-white/10 transition"
              >
                取消
              </button>
              <button 
                @click="handleBatchDelete" 
                class="px-6 py-2 rounded-xl bg-rose-500 text-white font-black text-sm hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition active:scale-95"
              >
                刪除
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <div v-if="showAddModal" class="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="showAddModal = false"></div>
      <div class="bg-white w-full max-w-sm p-6 rounded-3xl shadow-2xl relative z-10 animate-fade-in-up">
        <h3 class="text-xl font-black text-slate-800 mb-4">新增員工</h3>
        <input 
          v-model="newEmployeeName"
          type="text" 
          placeholder="請輸入員工姓名 : 例如 王小明" 
          class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
          @keyup.enter="handleAdd"
        >
        <div class="flex gap-3">
          <button @click="showAddModal = false" class="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition">取消</button>
          <button @click="handleAdd" :disabled="isSubmitting" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-200 transition">
            {{ isSubmitting ? '處理中...' : '確認新增' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="confirmModal.show" class="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" @click="confirmModal.show = false"></div>
      
      <div class="bg-white w-full max-w-[320px] p-6 rounded-[2rem] shadow-2xl relative z-10 animate-scale-up border border-slate-100">
        
        <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
             :class="confirmModal.isDanger ? 'bg-rose-50 text-rose-500' : 'bg-indigo-50 text-indigo-500'">
          <svg v-if="confirmModal.isDanger" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-8 h-8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-8 h-8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
        </div>

        <h4 class="text-xl font-black text-slate-800 text-center mb-2">{{ confirmModal.title }}</h4>
        <p class="text-slate-500 text-sm font-bold text-center mb-6 leading-relaxed px-2">
            {{ confirmModal.message }}
        </p>

        <div class="flex flex-col gap-3">
            <button 
              @click="handleConfirmAction"
              class="w-full py-3.5 rounded-xl font-black text-sm transition-all shadow-lg active:scale-95 text-white"
              :class="confirmModal.isDanger ? 'bg-rose-500 shadow-rose-200 hover:bg-rose-600' : 'bg-indigo-600 shadow-indigo-200 hover:bg-indigo-700'"
            >
              {{ confirmModal.confirmText }}
            </button>
            
            <button 
              @click="confirmModal.show = false"
              class="w-full py-3.5 rounded-xl font-bold text-sm text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
            >
              {{ confirmModal.cancelText }}
            </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.animate-scale-up {
  animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scaleUp {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
</style>