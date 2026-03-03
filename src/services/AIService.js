import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { GoogleGenerativeAI } from '@google/generative-ai'

const app = express()
app.use(cors())

app.get('/api/ping', (req, res) => {
  res.status(200).send('伺服器醒著喔！(pong)')
})

// 設定 multer 將上傳的檔案暫存在記憶體中
const upload = multer({ storage: multer.memoryStorage() })

// 初始化 Gemini AI 客戶端
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

app.post('/api/parse-schedule', upload.single('scheduleImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '請上傳圖片' })
    }

    console.log('🖼️ 收到圖片，開始交給 AI 解析...')

    // 🌟 接收前端從資料庫抓出來並傳過來的員工名單 (這行一定要在 app.post 裡面！)
    const validNames = req.body.employeeNames || '未提供名單';
    console.log('📋 參考員工名單:', validNames)

    // 1. 將圖片轉為 Gemini 需要的 base64 格式
    const imagePart = {
      inlineData: {
        data: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype
      }
    }

    // 2. 指定使用 Flash 模型，享有免費額度！
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        generationConfig: { 
            responseMimeType: "application/json" ,
            temperature: 0
        }
    })

    // 取得當前年月，讓 AI 有參考基準
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // 3. 準備我們精心設計的 Prompt
  const prompt = `
    你是一個專業的排班表辨識助理。我會上傳一張手寫的實體排班表圖片。
    表格左側是『員工姓名』，上方是『日期（1~31號）』。

    ⚠️【姓名辨識規則 - 零容忍】⚠️
    本店的正確員工名單只有這些：[ ${validNames} ]
    規則：
    1. 只能從這個名單中輸出人名，名單外的人名一律忽略，不得輸出
    2. 字跡潦草時，根據筆畫修正為名單上最相似的名字
    3. 如果某列姓名完全無法對應到名單上任何一人，整列忽略不輸出
    4. 即使你非常確定看到某個名字，只要不在名單內，禁止輸出

    🏖️【休假辨識 - 所有辨識的第一步，優先於一切】🏖️
    處理每個格子前，第一步一定先判斷是否為休假：
    - 看到紅色「休」字 → isOff: true，立刻停止，不再看任何數字，直接輸出休假
    - 看到「X」或「Off」→ isOff: true，立刻停止
    - 只有確認完全沒有休假符號後，才可以開始辨識時間數字

    ⚠️ 休假特別警告：
    - 隔壁格的數字可能會視覺上很靠近，禁止將隔壁格數字誤認為該格班次
    - 同一格內若同時有「休」字和數字，一律以「休」字為準，輸出 isOff: true
    - 寧可判斷為休假也不要憑空製造班次

    🔢【">" 符號處理 - 執行優先級最高，辨識數字前必須先做】🔢
    在辨識任何時間數字之前，先掃描整格，將所有 ">" 符號全部替換為 "2"，再開始辨識。
    此步驟必須在所有其他辨識之前完成，不得跳過。

    替換範例（先替換，再辨識）：
      ">030"  → 替換為 "2030" → 辨識為 "20:30"
      ">30"   → 替換為 "230"  → 辨識為 "23:00" → 白名單修正為 "20:30"
      "153>"  → 替換為 "1532" → 白名單修正為 "15:30"
      "183>"  → 替換為 "1832" → 白名單修正為 "18:30"
      "193>"  → 替換為 "1932" → 白名單修正為 "19:30" → 白名單修正為 "20:30"

    🔢【手寫數字辨識規則】🔢
    1. 四位數字直接加冒號：
      - "0930" → "09:30"
      - "1300" → "13:00"（⚠️ 1 和 7 字形相似，禁止將 1300 誤讀為 1700）
      - "1400" → "14:00"
      - "1530" → "15:30"（⚠️ 禁止誤讀為 1300）
      - "1730" → "17:30"（⚠️ 禁止誤讀為 1800）
      - "1830" → "18:30"
      - "2030" → "20:30"

    2. 三位數字補零：
      - "930"  → "09:30"
      - "830"  → "08:30"
      - "530"  → "15:30"（若在下班時間位置）

    3. 兩位數字補零：
      - "9"    → "09:00"
      - "18"   → "18:00"

    ✅【時間白名單 - 最終強制修正】✅
    辨識完成後，所有時間必須在以下白名單內，否則強制修正為最接近的值：

    上班時間白名單：
    09:00 / 09:30 / 10:00 / 10:30 / 11:00 / 12:00 / 13:00 / 14:00 / 15:30 / 16:30 / 17:00 / 17:30 / 18:00

    下班時間白名單：
    12:30 / 13:00 / 13:30 / 14:00 / 17:00 / 17:30 / 18:00 / 18:30 / 20:30

    常見錯誤修正對照：
    - 辨識出 22:30 → 強制修正為 20:30
    - 辨識出 22:00 → 強制修正為 20:30
    - 辨識出 21:00 → 強制修正為 20:30
    - 辨識出 19:30 → 強制修正為 20:30
    - 辨識出 17:00 作為唯一下班時間且搭配晚班開始 → 保留 17:00
    - 辨識出 15:00 → 修正為 15:30
    - 辨識出 13:30 作為第二段上班 → 修正為 14:00

    ⏰【時間配對規則 - 強制按位置順序，禁止用大小判斷】⏰

    【處理每個格子的強制流程】
    Step 1: 有「休」「X」「Off」？→ 有：isOff:true，結束
    Step 2: 完全空白？→ 跳過，不輸出
    Step 3: 先將所有 ">" 替換為 "2"
    Step 4: 數出共有幾排數字（N排）
    Step 5: N÷2 = 幾段班
    Step 6: 按位置順序配對（奇數排=startTime，偶數排=endTime），絕對不跳排不重排
    Step 7: 對照白名單修正
    Step 8: 執行休息間隔驗證
    Step 9: 輸出結果

    【兩排 = 一段班】
    第1排 → startTime / 第2排 → endTime
    範例：
      0930 → startTime: "09:30"
      1830 → endTime:   "18:30"

    【四排 = 兩段班】
    第1排 → 第一段 startTime
    第2排 → 第一段 endTime
    第3排 → 第二段 startTime
    第4排 → 第二段 endTime

    範例A：
      0930 → 第一段 startTime: "09:30"
      1400 → 第一段 endTime:   "14:00"  ← 不是 "17:00"
      1700 → 第二段 startTime: "17:00"  ← 不是 "14:00"
      >030 → 第二段 endTime:   "20:30"  ← ">" 是 "2"

    範例B：
      0930 → 第一段 startTime: "09:30"
      1230 → 第一段 endTime:   "12:30"
      1530 → 第二段 startTime: "15:30"  ← 不是 "1300"
      >030 → 第二段 endTime:   "20:30"  ← ">" 是 "2"

    【六排 = 三段班，依此類推】

    🔍【兩段班休息間隔驗證 - 配對完成後必須執行】🔍
    這間店兩段班之間的休息時間固定為 3 小時。
    配對完成後請驗證：第一段 endTime 到 第二段 startTime 的間隔是否在 3 小時內。
    除了特殊全日班（第一隊 endTime 為13:00 到 第二段startTime為14:00 這種特殊全日班 第二段 endTime 不是18:00就是18:30）之外，其他兩段班的休息時間如果少於 3 小時，都不合理。

    ✅ 合理範例：
      09:30-14:00 / 17:00-20:30 → 休息 3 小時 ✅
      09:30-12:30 / 15:30-20:30 → 休息 3 小時 ✅
      10:00-13:00 / 14:00-18:00 → 休息 1 小時 ✅

    ❌ 不合理範例（代表配對錯誤，請重新按位置順序配對）：
      09:30-17:00 / 14:00-18:30 → 第二段開始早於第一段結束，時間倒退 ❌
      09:30-12:30 / 13:00-17:30 → 休息只有 30 分鐘，不合理，重新辨識第三排數字 ❌
      09:30-14:00 / 14:30-20:30 → 休息只有 30 分鐘，不合理 ❌

    如果驗證失敗，請重新執行 Step 6，重新按位置配對，不得自行調整順序。

    🚫【嚴格禁止事項】🚫
    - 禁止輸出白名單以外的時間
    - 禁止用「時間大小」或「看起來合理」來判斷上下班配對
    - 禁止自行調整數字順序或合併數字
    - 禁止將 1300 誤讀為 1700
    - 禁止將 1530 誤讀為 1300
    - 禁止將 1730 誤讀為 1800
    - 禁止將 >030 輸出為任何非 20:30 的值
    - 禁止因為「看起來像一段班」就跳過中間的數字

    📅【日期基準】📅
    圖片中若未標示年月，預設為 ${currentYear} 年 ${currentMonth} 月。

    📦【輸出格式】📦
    只輸出以下 JSON 格式，不要有任何說明文字、不要有 markdown 符號：
    {
      "schedule": [
        {
          "name": "員工姓名",
          "shifts": [
            {
              "date": "${currentYear}-${String(currentMonth).padStart(2, '0')}-01",
              "segments": [
                { "startTime": "09:30", "endTime": "14:00" },
                { "startTime": "17:00", "endTime": "20:30" }
              ],
              "isOff": false
            },
            {
              "date": "${currentYear}-${String(currentMonth).padStart(2, '0')}-02",
              "isOff": true
            }
          ]
        }
      ]
    }

    注意：
    1. 每天的班次統一放在 "segments" 陣列中，即使只有一段班也用陣列包著
    2. 休假日不需要輸出 segments
    3. 空白格子完全不輸出，不要產生空的 shifts
    4. 輸出的 JSON 必須是合法格式，不得有多餘的逗號或缺少括號
    `

    // 4. 呼叫 AI API
    const result = await model.generateContent([prompt, imagePart])
    const responseText = result.response.text()
    
    console.log('🤖 AI 原始回傳:', responseText) 

    // 5. 將結果轉成 JSON 物件
    const parsedData = JSON.parse(responseText)

      function validateShiftTime(shift) {
      if (shift.isOff || !shift.segments) return shift;
      
      shift.segments = shift.segments.map(seg => {
          const end = parseInt(seg.endTime?.replace(':', '') || '0');
          if (end > 0 && end < 1400) {
              console.warn(`⚠️ 疑似錯誤：${shift.date} 下班時間 ${seg.endTime} 不合理`);
              seg._warning = true;
          }
          return seg;
      });
      return shift;
  }

    // 遍歷所有解析後的資料，並套用驗證函數
    parsedData.schedule.forEach(employee => {
        employee.shifts = employee.shifts.map(shift => validateShiftTime(shift))
    })

    console.log('✅ 解析成功！回傳資料中...')
    res.json(parsedData)

  } catch (error) {
    console.error('❌ 解析發生錯誤:', error)
    res.status(500).json({ error: '圖片解析失敗，請確認圖片清晰度或稍後再試' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動於 http://localhost:${PORT}`)
})