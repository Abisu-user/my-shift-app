import { supabase } from '../lib/supabase.js'

// 時間轉分鐘計算工具
export const timeToMinutes = (timeStr) => {
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
            segments: shiftData.segments,
            delivery_fee: shiftData.delivery_fee,
            isDoublePay: shiftData.isDoublePay
            }
        ], { onConflict: 'employee_id, date' })
        .select()

        if (error) throw error
        return data[0]
    },

    // 批量儲存排班資料
    async batchSaveShifts(shiftsArray) {
        const { data, error } = await supabase
            .from('shifts')
            .insert(shiftsArray) // 一次把整個陣列的新班表塞進資料庫
        
        if (error) {
            console.error('批量儲存班表錯誤:', error.message)
            throw error
        }
        return data
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
    async addEmployee(employeeData) {
        const { data, error } = await supabase
            .from('employees')
            .insert([
                { 
                    name: employeeData.name, 
                    has_labor_ins: employeeData.has_labor_ins || false,
                    has_health_ins: employeeData.has_health_ins || false,
                    status: 'normal' 
                }
            ])
            .select()
        
        if (error) throw error
        return data
    },
    
    // 更新員工資料
    async updateEmployee(id, updates) {
        const { data, error } = await supabase
            .from('employees')
            .update(updates)
            .eq('id', id)
            .select()
        
        if (error) {
            console.error('更新員工失敗:', error.message)
            throw error
        }
        return data
    },

    // 刪除員工
    async deleteEmployee(id) {
        const { error: shiftError } = await supabase
            .from('shifts')
            .delete()
            .eq('employee_id', id)

        if (shiftError) {
            console.error('刪除關聯班表失敗:', shiftError)
            throw shiftError
        }

        const { error } = await supabase
            .from('employees')
            .delete()
            .eq('id', id)
        
        if (error) throw error
    },

    // 抓取單日設定 (給「排班編輯器」判斷雙倍薪使用)
    async fetchDaySetting(date) {
        try {
            const { data, error } = await supabase
                .from('calendar_settings')
                .select('*')
                .eq('date', date)
                .single() // 因為一天只有一筆設定，所以用 single()
            
            // PGRST116 是 Supabase「找不到資料」的錯誤碼
            // 找不到資料是正常的，代表那天是一般日子（沒有特別設定）
            if (error && error.code !== 'PGRST116') { 
                console.error('抓取單日設定錯誤:', error.message)
                return null
            }
            return data
        } catch (err) {
            console.error('fetchDaySetting 發生例外:', err)
            return null
        }
    },

    // 儲存單日設定 (給「日曆設定頁面」儲存時使用)
    async saveDaySetting(date, isDoublePay, note) {
        const { data, error } = await supabase
            .from('calendar_settings')
            .upsert([ 
                // upsert 會自動判斷：如果這個日期已經有資料就「更新」，沒有就「新增」
                { 
                    date: date, 
                    isDoublePay: isDoublePay, 
                    note: note 
                }
            ], { onConflict: 'date' }) // 以 date 欄位作為判斷重複的依據
        
        if (error) {
            console.error('儲存單日設定錯誤:', error.message)
            throw error
        }
        return data
    },

    // 抓取區間設定 (給「日曆設定頁面」一次載入整個月的標記使用)
    async fetchMonthSettings(startDate, endDate) {
        const { data, error } = await supabase
            .from('calendar_settings')
            .select('*')
            .gte('date', startDate)
            .lte('date', endDate)
        
        if (error) {
            console.error('抓取月份設定錯誤:', error.message)
            throw error
        }
        return data || []
    },
}