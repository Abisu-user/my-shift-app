<script setup>
import { ref } from 'vue'

// 定義可以觸發的事件
const emit = defineEmits(['close', 'login'])

// 接收父層傳來的屬性
defineProps({
  loading: Boolean
})

const email = ref('')
const password = ref('')
const errorMsg = ref('')

const handleLogin = () => {
  if (!email.value || !password.value) {
    errorMsg.value = '請輸入 Email 與密碼'
    return
  }
  errorMsg.value = ''
  
  // 發送登入事件給 App.vue
  // 注意：這裡我們把 email 當作 username 傳出去，配合 App.vue 的接收格式
  emit('login', { username: email.value, password: password.value })
}
</script>

<template>
  <div class="fixed inset-0 z-[100] flex items-center justify-center">
    
    <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" @click="$emit('close')"></div>

    <div class="relative bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl animate-fade-in-up border border-slate-100">
      
      <div class="text-center mb-8">
        <div class="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-slate-300">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 class="text-2xl font-black text-slate-800 tracking-tight">管理員登入</h2>
        <p class="text-slate-500 text-sm font-bold mt-2">請輸入您的管理權限憑證</p>
      </div>

      <div class="space-y-5">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Email 信箱</label>
          <input 
            v-model="email"
            type="email" 
            placeholder="admin@example.com"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-300"
            @keyup.enter="handleLogin"
          >
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">密碼</label>
          <input 
            v-model="password"
            type="password" 
            placeholder="請輸入密碼"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-300"
            @keyup.enter="handleLogin"
          >
        </div>

        <div v-if="errorMsg" class="text-rose-500 text-sm font-bold text-center bg-rose-50 py-3 rounded-xl border border-rose-100 flex items-center justify-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          {{ errorMsg }}
        </div>

        <button 
          @click="handleLogin" 
          :disabled="loading"
          class="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl shadow-lg shadow-slate-300 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 mt-2"
        >
          <span v-if="loading" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          <span v-else>登入系統</span>
        </button>
      </div>

      <button @click="$emit('close')" class="absolute top-5 right-5 text-slate-300 hover:text-slate-600 transition-colors bg-white hover:bg-slate-100 p-2 rounded-full">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

    </div>
  </div>
</template>

<style scoped>
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.animate-fade-in-up {
  animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>