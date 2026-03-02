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
            responseMimeType: "application/json" 
        }
    })

    // 取得當前年月，讓 AI 有參考基準
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // 3. 準備我們精心設計的 Prompt
    const prompt = `
        你是一個專業的資料分析助理。我會上傳一張手寫的實體排班表圖片。
        表格左側是『員工姓名』，上方是『日期（1~31號）』。

        ⚠️【非常重要的姓名辨識規則】⚠️
        本店的正確員工名單只有這些：[ ${validNames} ]。
        請你務必「只從這個名單中」去比對表格左側的姓名。如果遇到字跡潦草，請根據筆畫或字形，自動修正為名單上最相似的名字。絕對不要自己發明名單上沒有的名字！
        
        請仔細辨識表格內的內容：
        1. 如果格子內有寫時間數字（例如 0930 上下兩排 1830，代表 09:30 到 18:30），請將其轉換為時間區段。如果一天有兩段時間，請解析為兩個物件。
        2. 如果格子內用紅筆寫著『休』，代表該日休假，請標記 isOff: true。
        3. 空白的格子請直接忽略，不要回傳。
        4. 請留意年份與月份，如果圖片中未標示，請預設為 ${currentYear} 年 ${currentMonth} 月。並將日期轉換為 YYYY-MM-DD 格式。
  
        回傳格式範例：
        [
            {"employee_name": "依萍", "date": "${currentYear}-03-04", "segments": [{"start": "09:30", "end": "18:30"}], "isOff": false}
        ]
    `

    // 4. 呼叫 AI API
    const result = await model.generateContent([prompt, imagePart])
    const responseText = result.response.text()
    
    console.log('🤖 AI 原始回傳:', responseText) 

    // 5. 將結果轉成 JSON 物件
    const parsedData = JSON.parse(responseText)

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