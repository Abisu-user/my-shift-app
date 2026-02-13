import { supabase } from '../lib/supabase' 

export const authService = {
  // 登入
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    
    if (error) {
      console.error('登入錯誤:', error.message)
    //   return { success: false, message: '帳號或密碼錯誤' }
    return { success: false, message: error.message }
    }
    return { success: true, user: data.user }
  },

  // 登出
  async logout() {
    await supabase.auth.signOut()
  },

  // 取得目前使用者
  async getCurrentUser() {
    const { data } = await supabase.auth.getSession()
    return data.session?.user || null
  },
  
  // 監聽狀態變化 (登入/登出自動更新)
  onAuthStateChange(callback) {
    supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null)
    })
  }
}