import { supabase } from '../lib/supabase.js'

// 時間轉分鐘計算工具
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0
  const [hrs, mins] = timeStr.split(':').map(Number)
  return hrs * 60 + mins
}

export const shiftService = {
    // 從資料庫抓取原始資料
    async fetchInitialData() {
        const { data: employees } = await supabase
            .from('employees')
            .select('*')
            .eq('status', 'normal')
            .order('id')
        const { data: shifts } = await supabase
            .from('shifts')
            .select('*')
        return { employees: employees || [], rawShifts: shifts || [] }
    },

    // 抓取特定日期區間的班表資料
    async fetchShiftsByRange(startDate, endDate) {
        const { data, error } = await supabase
            .from('shifts')
            .select('*')
            .gte('date', startDate) // 大於等於開始日期
            .lte('date', endDate)   // 小於等於結束日期
        
        if (error) {
            console.error('抓取區間班表錯誤:', error.message)
            throw error
        }
        return data || []
    },

    // 儲存排班資料
    async saveShift(shiftData) {
        const { data, error } = await supabase
        .from('shifts')
        .upsert([
            {
            employee_id: shiftData.employee_id,
            date: shiftData.date,
            segments: shiftData.segments // <--- 改傳 JSON 陣列
            }
        ], { onConflict: 'employee_id, date' })
        .select()

        if (error) throw error
        return data[0]
    },

    // 刪除排班資料
    async deleteShift(employeeId, date) {
        const { error } = await supabase
        .from('shifts')
        .delete()
        .eq('employee_id', employeeId)
        .eq('date', date)

        if (error) throw error
    },

    // 處理資料轉換邏輯
    processShiftData(employees, rawShifts) {
        return employees.map(emp => {
        const empShifts = rawShifts.filter(s => s.employee_id === emp.id)
        const days = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }
        
        let totalHours = 0

        empShifts.forEach(s => {
            const date = new Date(s.date)
            let dayIndex = date.getDay()
            if (dayIndex === 0) dayIndex = 7
            
            // 把這一天的所有時段加進去
            days[dayIndex].push(s)

            // 計算這一天的總時數 (累加 segments)
            if (s.segments && Array.isArray(s.segments)) {
                s.segments.forEach(seg => {
                    const startH = parseInt(seg.start.split(':')[0])
                    const endH = parseInt(seg.end.split(':')[0])
                    // 簡單計算：只算小時差 (你可以根據需求改成算分鐘)
                    totalHours += (endH - startH)
                })
            }
        })

        return { ...emp, days, totalHours }
        })
    },

    // 抓取排班預設模板
    async fetchPresets() {
        const { data, error } = await supabase
            .from('shift_presets')
            .select('*')
            .order('created_at', { ascending: true })
        
        if (error) throw error
        return data || []
    },

    async addPreset(preset) {
        const { data, error } = await supabase
            .from('shift_presets')
            .insert([preset])
            .select()
        
        if (error) throw error
        return data[0]
    },

    async deletePreset(id) {
        const { error } = await supabase
            .from('shift_presets')
            .delete()
            .eq('id', id)
        
        if (error) throw error
    },

    // 新增員工
    async addEmployee(name, status = 'normal') {
        const { data, error } = await supabase
            .from('employees')
            .insert([
                {
                    name: name, 
                    status: status 
                }
            ])
            .select()

        if (error) {
            console.error('新增員工錯誤:', error.message)
            throw error
        }
    },

    // 刪除員工
    async deleteEmployee(id) {
        // 刪除該員工的所有班表紀錄
        const { error: shiftError } = await supabase
            .from('shifts')
            .delete()
            .eq('employee_id', id)

        if (shiftError) {
            console.error('刪除關聯班表失敗:', shiftError)
            throw shiftError
        }

        //班表刪乾淨了，現在可以放心刪除員工本人
        const { error } = await supabase
            .from('employees')
            .delete()
            .eq('id', id)
        
        if (error) throw error
    }
}