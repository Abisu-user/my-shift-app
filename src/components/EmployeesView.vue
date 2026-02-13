<script setup>
import { ref, onMounted } from 'vue'
import { shiftService } from '../services/shiftService'

const employees = ref([])
const loading = ref(true)
const showAddModal = ref(false)
const newEmployeeName = ref('')
const isSubmitting = ref(false)

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
    // 呼叫服務新增到資料庫
    await shiftService.addEmployee(newEmployeeName.value)
    // 重新載入列表
    await loadEmployees()
    showAddModal.value = false
    newEmployeeName.value = ''
  } catch (error) {
    alert('新增失敗: ' + error.message)
  }
  isSubmitting.value = false
}

// 刪除員工
const handleDelete = async (id) => {
  if (!confirm('確定要刪除這位員工嗎？這可能會影響排班資料！')) return
  try {
    await shiftService.deleteEmployee(id)
    await loadEmployees()
  } catch (error) {
    alert('刪除失敗: ' + error.message)
  }
}

onMounted(loadEmployees)
</script>

<template>
  <div class="p-8 max-w-5xl mx-auto animate-fade-in">
    <div class="flex justify-between items-center mb-8">
      <div>
        <h2 class="text-3xl font-black text-slate-800 tracking-tight">員工管理</h2>
        <p class="text-slate-500 font-bold text-sm mt-1">管理您的團隊成員與權限</p>
      </div>
      <button 
        @click="showAddModal = true"
        class="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2">
        <span>+</span> 新增員工
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-20">
      <div class="animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-indigo-600"></div>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div v-for="emp in employees" :key="emp.id" class="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
        
        <div class="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-full -mr-8 -mt-8 transition-colors group-hover:bg-indigo-50"></div>

        <div class="flex items-start justify-between relative z-10">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-xl shadow-inner group-hover:scale-110 transition-transform">
              😊
            </div>
            <div>
              <h3 class="font-bold text-lg text-slate-800">{{ emp.name }}</h3>
              <p class="text-xs text-slate-400 font-bold uppercase">Employee ID: #{{ emp.id }}</p>
            </div>
          </div>
          
          <button 
            @click="handleDelete(emp.id)"
            class="text-slate-300 hover:text-rose-500 hover:bg-rose-50 p-2 rounded-lg transition-colors"
            title="刪除員工">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 000-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>

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
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.5s ease-out; }
.animate-fade-in-up { animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
</style>