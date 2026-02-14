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
const isMobileMenuOpen = ref(false) // 控制手機版選單開關

const isSidebarOpen = ref(window.innerWidth >= 1024)
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

const navigateTo = (view) => {
  currentView.value = view
  isMobileMenuOpen.value = false
}

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
  <div class="flex flex-col md:flex-row landscape:flex-row h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-800">

    <header class="md:hidden landscape:hidden bg-slate-900 text-white px-4 py-3 flex justify-between items-center z-[60] shadow-md">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-sm font-black">S</div>
        <span class="font-bold tracking-wide">排班 App</span>
      </div>
      <button @click="isMobileMenuOpen = !isMobileMenuOpen" class="p-2 text-slate-300">
        <svg v-if="!isMobileMenuOpen" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </header>

    <transition name="slide-down">
      <div v-if="isMobileMenuOpen" class="md:hidden landscape:hidden fixed top-[56px] left-0 w-full bg-slate-900 z-50 border-t border-slate-800 shadow-2xl">
        <div class="p-4 space-y-2">
          <button 
            v-for="item in [
              { id: 'dashboard', label: '儀表板', icon: '📊', auth: false },
              { id: 'employees', label: '員工管理', icon: '👥', auth: true },
              { id: 'shift-editor', label: '排班編輯', icon: '🗓️', auth: true },
              { id: 'settings', label: '系統設定', icon: '⚙️', auth: false }
            ]" 
            v-show="!item.auth || currentUser"
            @click="navigateTo(item.id)"
            class="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-slate-300 transition-colors"
            :class="currentView === item.id ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'"
          >
            <span>{{ item.icon }}</span>
            <span class="font-bold">{{ item.label }}</span>
          </button>
          <div class="pt-4 border-t border-slate-800">
            <button v-if="currentUser" @click="handleLogout(); isMobileMenuOpen = false" class="w-full py-3 text-rose-400 font-bold text-center">🚪 登出系統</button>
            <button v-else @click="showLogin = true; isMobileMenuOpen = false" class="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold">🔐 管理員登入</button>
          </div>
        </div>
      </div>
    </transition>
    
    <div 
      class="h-full shrink-0 transition-all duration-300 ease-in-out overflow-hidden relative z-50 bg-slate-900 hidden md:block landscape:block"
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

    <main class="flex-1 h-full overflow-hidden flex flex-col relative bg-gray-200">
      
      <header class="bg-white border-b border-slate-100 px-4 md:px-8 py-3 flex justify-between items-center shrink-0 shadow-sm z-10">
  
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
            <span class="text-[10px] opacity-100">日期</span>
            <span class="text-xs font-bold text-slate-500 tracking-tight">
              {{ currentTime.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) }}
            </span>
          </div>
          
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] opacity-100">時間</span>
            <span class="text-sm font-black text-indigo-500 tabular-nums tracking-wider">
              {{ currentTime.toLocaleTimeString('zh-TW', { hour12: false }) }}
            </span>
          </div>
        </div>
      </header>

      <div class="flex-1 overflow-y-auto md:overflow-hidden p-2">
        <DashboardView v-if="currentView === 'dashboard'" />
        <EmployeesView v-if="currentView === 'employees' && currentUser" />
        <ShiftEditorView v-if="currentView === 'shift-editor' && currentUser" />
        <div v-if="currentView === 'settings'" class="p-10 text-center text-slate-400 font-bold animate-pulse">
          <p class="text-6xl mb-4">🚧</p>
          設定頁面建構中...
        </div>
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

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease-out;
  max-height: 400px; /* 預設一個夠大的高度 */
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-10px);
}
</style>