<script setup>
import { ref, onMounted } from 'vue'
import { shiftService } from '../services/shiftService'

const employees = ref([])
const loading = ref(true)
const isSubmitting = ref(false)

// --- 彈窗控制 ---
const showAddModal = ref(false)
const showEditModal = ref(false)
const newEmployeeName = ref('')

// --- 編輯中的員工資料暫存 ---
const editingEmployee = ref({
  id: null,
  name: '',
  has_labor_ins: false,
  has_health_ins: false
})

// --- 批次操作與確認視窗 ---
const isBatchMode = ref(false)
const selectedIds = ref([])
const confirmModal = ref({
  show: false,
  title: '',
  message: '',
  confirmText: '確認執行',
  cancelText: '取消',
  isDanger: true,
  onConfirm: null
})

// 載入員工資料
const loadEmployees = async () => {
  loading.value = true
  try {
    const data = await shiftService.fetchInitialData()
    // 確保保險欄位有預設值
    employees.value = data.employees.map(emp => ({
      ...emp,
      has_labor_ins: emp.has_labor_ins || false,
      has_health_ins: emp.has_health_ins || false
    }))
  } catch (error) {
    console.error("載入失敗:", error)
  } finally {
    loading.value = false
  }
}

// 開啟編輯視窗
const openEditModal = (emp) => {
  if (isBatchMode.value) return // 批次模式下不開啟編輯
  editingEmployee.value = { ...emp } // 淺拷貝避免直接更動原始物件
  showEditModal.value = true
}

// 執行新增員工
const handleAdd = async () => {
  if (!newEmployeeName.value.trim()) return
  isSubmitting.value = true
  try {
    await shiftService.addEmployee({ 
        name: newEmployeeName.value,
        has_labor_ins: false,
        has_health_ins: false
    })
    newEmployeeName.value = ''
    showAddModal.value = false
    await loadEmployees()
  } finally {
    isSubmitting.value = false
  }
}

// 執行更新員工 (姓名、勞健保)
const handleUpdate = async () => {
  if (!editingEmployee.value.name.trim()) return
  isSubmitting.value = true
  try {
    const { id, name, has_labor_ins, has_health_ins } = editingEmployee.value
    await shiftService.updateEmployee(id, { name, has_labor_ins, has_health_ins })
    
    // 關閉視窗並刷新列表
    showEditModal.value = false
    await loadEmployees()
  } catch (error) {
    alert('更新失敗')
  } finally {
    isSubmitting.value = false
  }
}

// 單一刪除
const handleDelete = (id) => {
  confirmModal.value = {
    show: true,
    title: '確認刪除',
    message: '確定要刪除這位員工嗎？這將會移除相關排班紀錄。',
    confirmText: '確認刪除',
    cancelText: '取消',
    isDanger: true,
    onConfirm: async () => {
      await shiftService.deleteEmployee(id)
      await loadEmployees()
    }
  }
}

// 批次刪除
const handleBatchDelete = () => {
  confirmModal.value = {
    show: true,
    title: '確認批次刪除',
    message: `確定要刪除這 ${selectedIds.value.length} 位員工嗎？`,
    confirmText: '全部刪除',
    cancelText: '取消',
    isDanger: true,
    onConfirm: async () => {
      for (const id of selectedIds.value) {
        await shiftService.deleteEmployee(id)
      }
      selectedIds.value = []
      isBatchMode.value = false
      await loadEmployees()
    }
  }
}

const handleConfirmAction = async () => {
  if (confirmModal.value.onConfirm) await confirmModal.value.onConfirm()
  confirmModal.value.show = false
}

const toggleBatchMode = () => {
  isBatchMode.value = !isBatchMode.value
  selectedIds.value = []
}

const toggleSelection = (id) => {
  const index = selectedIds.value.indexOf(id)
  if (index === -1) selectedIds.value.push(id)
  else selectedIds.value.splice(index, 1)
}

onMounted(loadEmployees)
</script>

<template>
  <div class="p-6 md:p-10 max-w-7xl mx-auto animate-fade-in pb-32">
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
      <div>
        <h2 class="text-3xl font-black text-slate-800 tracking-tight">員工管理</h2>
        <p class="text-slate-500 font-bold text-sm mt-1">點擊員工卡片進行資料編輯</p>
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
        @click="isBatchMode ? toggleSelection(emp.id) : openEditModal(emp)"
        class="group relative bg-white p-5 rounded-2xl border transition-all duration-200 overflow-hidden"
        :class="[
          isBatchMode 
            ? 'cursor-pointer hover:shadow-md' 
            : 'cursor-pointer hover:shadow-lg hover:border-indigo-200 shadow-sm border-slate-100',
          selectedIds.includes(emp.id) 
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
            <div class="flex gap-2 mt-1">
              <span v-if="emp.has_labor_ins" class="text-[10px] font-black bg-rose-50 text-rose-500 px-2 py-0.5 rounded-md">🛡️ 勞保</span>
              <span v-if="emp.has_health_ins" class="text-[10px] font-black bg-sky-50 text-sky-500 px-2 py-0.5 rounded-md">🏥 健保</span>
              <span v-if="!emp.has_labor_ins && !emp.has_health_ins" class="text-[10px] font-bold text-slate-300 italic">無預設保險</span>
            </div>
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
      <div v-if="showEditModal" class="fixed inset-0 z-[100] flex items-center justify-center px-4">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="showEditModal = false"></div>
        <div class="bg-white w-full max-w-sm p-8 rounded-[2.5rem] shadow-2xl relative z-10 animate-fade-in-up border border-slate-100">
          <div class="text-center mb-6">
            <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl shadow-inner">👤</div>
            <h3 class="text-2xl font-black text-slate-800">編輯員工資料</h3>
            <p class="text-slate-400 font-bold text-sm mt-1">設定預設薪資扣除項目</p>
          </div>

          <div class="mb-6">
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">員工姓名</label>
            <input 
              v-model="editingEmployee.name"
              type="text" 
              class="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-5 py-4 font-black text-slate-700 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-inner"
              placeholder="請輸入姓名"
            >
          </div>

          <div class="grid grid-cols-2 gap-4 mb-8">
            <button 
              @click="editingEmployee.has_labor_ins = !editingEmployee.has_labor_ins"
              :class="editingEmployee.has_labor_ins ? 'bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-100' : 'bg-slate-50 text-slate-400 border-slate-100'"
              class="flex flex-col items-center gap-2 py-4 rounded-3xl border-2 transition-all active:scale-95"
            >
              <span class="text-2xl">🛡️</span>
              <span class="font-black text-xs">勞保</span>
              <span class="text-[9px] font-black uppercase opacity-60">{{ editingEmployee.has_labor_ins ? '已開啟' : '未開啟' }}</span>
            </button>

            <button 
              @click="editingEmployee.has_health_ins = !editingEmployee.has_health_ins"
              :class="editingEmployee.has_health_ins ? 'bg-sky-500 text-white border-sky-500 shadow-lg shadow-sky-100' : 'bg-slate-50 text-slate-400 border-slate-100'"
              class="flex flex-col items-center gap-2 py-4 rounded-3xl border-2 transition-all active:scale-95"
            >
              <span class="text-2xl">🏥</span>
              <span class="font-black text-xs">健保</span>
              <span class="text-[9px] font-black uppercase opacity-60">{{ editingEmployee.has_health_ins ? '已開啟' : '未開啟' }}</span>
            </button>
          </div>

          <div class="flex gap-3">
            <button @click="showEditModal = false" class="flex-1 py-4 font-black text-slate-400 hover:bg-slate-50 rounded-2xl transition">取消</button>
            <button 
              @click="handleUpdate" 
              :disabled="isSubmitting" 
              class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-100 transition active:scale-95 flex items-center justify-center gap-2"
            >
              <span v-if="isSubmitting" class="animate-spin text-sm">⏳</span>
              <span>儲存修改</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

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
              <button @click="selectedIds = []" class="px-4 py-2 rounded-xl text-slate-400 font-bold text-sm hover:text-white hover:bg-white/10 transition">取消</button>
              <button @click="handleBatchDelete" class="px-6 py-2 rounded-xl bg-rose-500 text-white font-black text-sm hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition active:scale-95">刪除</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <div v-if="showAddModal" class="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="showAddModal = false"></div>
      <div class="bg-white w-full max-w-sm p-6 rounded-3xl shadow-2xl relative z-10 animate-fade-in-up">
        <h3 class="text-xl font-black text-slate-800 mb-4 px-1">新增員工</h3>
        <input 
          v-model="newEmployeeName"
          type="text" 
          placeholder="請輸入姓名" 
          class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
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

    <div v-if="confirmModal.show" class="fixed inset-0 z-[110] flex items-center justify-center px-4">
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @click="confirmModal.show = false"></div>
      <div class="bg-white w-full max-w-[320px] p-6 rounded-[2.5rem] shadow-2xl relative z-10 animate-scale-up border border-slate-100">
        <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
             :class="confirmModal.isDanger ? 'bg-rose-50 text-rose-500' : 'bg-indigo-50 text-indigo-500'">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-8 h-8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h4 class="text-xl font-black text-slate-800 text-center mb-2">{{ confirmModal.title }}</h4>
        <p class="text-slate-500 text-sm font-bold text-center mb-6 px-2">{{ confirmModal.message }}</p>
        <div class="flex flex-col gap-3">
          <button @click="handleConfirmAction" class="w-full py-3.5 rounded-xl font-black text-sm text-white shadow-lg active:scale-95 transition-all" :class="confirmModal.isDanger ? 'bg-rose-500 hover:bg-rose-600' : 'bg-indigo-600 hover:bg-indigo-700'">{{ confirmModal.confirmText }}</button>
          <button @click="confirmModal.show = false" class="w-full py-3.5 rounded-xl font-bold text-sm text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors">{{ confirmModal.cancelText }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.5s ease-out; }
.animate-fade-in-up { animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.animate-scale-up { animation: scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes scaleUp { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }

.slide-up-enter-active, .slide-up-leave-active { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.slide-up-enter-from, .slide-up-leave-to { transform: translate(-50%, 100%); opacity: 0; }
</style>