<script setup>
defineProps({
  currentView: String, // 'dashboard' | 'employees' | 'settings'
  user: Object // 目前登入的使用者
})

defineEmits(['changeView', 'logout', 'login'])

const menuItems = [
  { id: 'dashboard', label: '儀表板', icon: '📊', requiresAuth: false },
  { id: 'employees', label: '員工管理', icon: '👥', requiresAuth: true },
  { id: 'shift-editor', label : '排班編輯', icon: '🗓️', requiresAuth: true },
  { id: 'settings', label: '系統設定', icon: '⚙️', requiresAuth: false },
]
</script>

<template>
  <div class="h-screen w-64 bg-slate-900 text-white flex flex-col shadow-2xl z-20 shrink-0 transition-all duration-300">
    
    <div class="p-6 flex items-center gap-3 border-b border-slate-800/50">
      <div class="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-xl font-black shadow-lg shadow-indigo-500/30">S</div>
      <div>
        <h1 class="font-bold text-lg tracking-wide">班表系統</h1>
        <p class="text-[10px] text-emerald-400 flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          System Online
        </p>
      </div>
    </div>

    <nav class="flex-1 p-4 space-y-2 mt-4 overflow-y-auto">
        <template v-for="item in menuItems" :key="item.id">
            <button 
                v-if="!item.requiresAuth || user"
                @click="$emit('changeView', item.id)"
                class="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 group relative overflow-hidden"
                :class="currentView === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'"
            >
                <span class="text-xl group-hover:scale-110 transition-transform duration-200">{{ item.icon }}</span>
                <span class="font-bold tracking-wide text-sm">{{ item.label }}</span>
                <div v-if="currentView === item.id" class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white/30 rounded-r-full"></div>
            </button>
        </template>
    </nav>

    <div class="p-4 border-t border-slate-800/50 bg-slate-900/50">
      
      <div v-if="user" class="animate-fade-in">
        <div class="flex items-center gap-3 mb-4 px-2">
          <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-400 to-purple-400 border-2 border-slate-700 shadow-md"></div>
          <div class="overflow-hidden">
            <p class="text-xs font-bold text-white truncate" :title="user.email">{{ user.email }}</p>
            <p class="text-[10px] text-emerald-400 flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> 線上
            </p>
          </div>
        </div>
        <button 
          @click="$emit('logout')"
          class="w-full bg-slate-800 hover:bg-rose-900/30 hover:text-rose-400 text-slate-400 border border-slate-700 hover:border-rose-500/50 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 group">
          <span class="group-hover:-translate-x-1 transition-transform">🚪</span> 登出系統
        </button>
      </div>

      <div v-else class="animate-fade-in">
        <div class="px-2 mb-4">
          <p class="text-xs text-slate-500 font-bold mb-1">尚未登入</p>
          <p class="text-[10px] text-slate-600">請登入以管理排班資料</p>
        </div>
        <button 
          @click="$emit('login')"
          class="w-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 group hover:-translate-y-0.5">
          <span>🔐</span> 管理員登入
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.3s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
</style>