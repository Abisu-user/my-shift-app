<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { authService } from './services/authService.js'
import Sidebar from './components/Sidebar.vue'
import DashboardView from './components/DashboardView.vue'
import EmployeesView from './components/EmployeesView.vue'
import LoginModal from './components/LoginModal.vue'
import ShiftEditorView from './components/ShiftEditorView.vue'

// 狀態管理
const currentView = ref('dashboard')
const showLogin = ref(false)
const isLoggingIn = ref(false)
const currentUser = ref(null)

const isSidebarOpen = ref(false)
const currentTime = ref(new Date())
let timer = null

onMounted(() => {
  timer = setInterval(() => {
    currentTime.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

// 處理登入
const handleLoginRequest = async ({ username, password }) => {
  isLoggingIn.value = true
  const result = await authService.login(username, password)
  if (result.success) {
    showLogin.value = false
  } else {
    alert(result.message)
  }
  isLoggingIn.value = false
}

// 處理登出
const handleLogout = async () => {
  if(confirm('確定要登出系統嗎？')) {
    await authService.logout()
    // 登出後預設回到儀表板，但如果儀表板也需要權限，可以考慮做別的跳轉
    currentView.value = 'dashboard' 
  }
}

onMounted(async () => {
  currentUser.value = await authService.getCurrentUser()
  authService.onAuthStateChange((user) => {
    currentUser.value = user
  })
})
</script>

<template>
  <div class="flex h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-800">
    
    <div 
      class="h-full shrink-0 transition-all duration-300 ease-in-out overflow-hidden relative z-50 bg-slate-900"
      :class="isSidebarOpen ? 'w-64 shadow-2xl' : 'w-16 cursor-pointer hover:bg-slate-800'"
      @mouseenter="isSidebarOpen = true"
      @mouseleave="isSidebarOpen = false"
    >
      <div class="w-64 h-full bg-slate-900 transition-opacity duration-300" :class="isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'">
        <Sidebar 
          :currentView="currentView" 
          :user="currentUser"
          @changeView="currentView = $event"
          @logout="handleLogout"
          @login="showLogin = true"
        />
      </div>

      <div v-if="!isSidebarOpen" class="absolute top-0 left-0 w-full h-16 flex items-center justify-center text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </div>
    </div>

    <main class="flex-1 h-full overflow-hidden flex flex-col relative bg-slate-100 transition-all duration-300">
      
    <header class="bg-white border-b border-slate-100 px-8 py-3 flex justify-between items-center shrink-0 shadow-sm z-10">
  
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-sm">
            🏠
          </div>
          <h2 class="text-sm font-bold text-slate-700 flex items-center gap-2">
            <span class="text-slate-400 font-medium">系統</span>
            <span class="text-slate-200">/</span>
            <span class="bg-slate-50 px-2 py-0.5 rounded-md text-slate-600">
              {{ currentView === 'dashboard' ? '儀表板' : currentView === 'employees' ? '員工管理' : currentView === 'shift-editor' ? '排班編輯' : '系統設定' }}
            </span>
          </h2>
        </div>

        <div class="flex items-center gap-4 bg-slate-50 px-4 py-1.5 rounded-full border border-slate-100">
          <div class="flex items-center gap-1.5 border-r border-slate-200 pr-4">
            <span class="text-[10px] opacity-40">CALENDAR</span>
            <span class="text-xs font-bold text-slate-500 tracking-tight">
              {{ currentTime.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) }}
            </span>
          </div>
          
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] opacity-40">REAL-TIME</span>
            <span class="text-sm font-black text-indigo-500 tabular-nums tracking-wider">
              {{ currentTime.toLocaleTimeString('zh-TW', { hour12: false }) }}
            </span>
          </div>
        </div>
      </header>

      <div class="flex-1 overflow-y-auto p-2 scroll-smooth">
        <DashboardView v-if="currentView === 'dashboard'" />
        <EmployeesView v-if="currentView === 'employees' && currentUser" />
        <ShiftEditorView v-if="currentView === 'shift-editor' && currentUser" />
        <div v-if="currentView === 'settings'" class="p-10 text-center text-slate-400 font-bold animate-pulse">
          <p class="text-6xl mb-4">🚧</p>
          設定頁面建構中...
        </div>
        <div class="h-10"></div>
      </div>
    </main>

    <Teleport to="body">
      <LoginModal 
        v-if="showLogin" 
        :loading="isLoggingIn"
        @close="showLogin = false"
        @login="handleLoginRequest"
      />
    </Teleport>

  </div>
</template>