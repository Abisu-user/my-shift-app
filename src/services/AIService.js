import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import sharp from 'sharp'                          // 策略二：圖片裁切
import { GoogleGenerativeAI } from '@google/generative-ai'

const app = express()
app.use(cors())

app.get('/api/ping', (req, res) => {
  res.status(200).send('伺服器醒著喔！(pong)')
})

const upload = multer({ storage: multer.memoryStorage() })
const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// ─────────────────────────────────────────────────────────────────────────────
// 共用工具
// ─────────────────────────────────────────────────────────────────────────────

/** 後端驗證：檢查單一 segment 的下班時間是否合理 */
function validateShiftTime(shift) {
  if (shift.isOff || !shift.segments) return shift

  shift.segments = shift.segments.map(seg => {
    const end = parseInt(seg.endTime?.replace(':', '') || '0')
    if (end > 0 && end < 1400) {
      console.warn(`⚠️ 疑似錯誤：${shift.date} 下班時間 ${seg.endTime} 不合理`)
      seg._warning = true
    }
    return seg
  })
  return shift
}

/** 對整個 parsedData 執行後端驗證 */
function applyValidation(parsedData) {
  parsedData.schedule.forEach(employee => {
    employee.shifts = employee.shifts.map(shift => validateShiftTime(shift))
  })
}

/** 將 buffer 轉成 Gemini inline image part（PNG 輸出） */
function bufferToImagePart(buffer, mimeType = 'image/png') {
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType
    }
  }
}

/** 建立 Gemini Flash 模型實例（JSON 模式） */
function getFlashModel() {
  return genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0
    }
  })
}

/** 限制並發數量的批次執行器（避免打爆 Gemini Rate Limit） */
async function processInBatches(items, asyncHandler, batchSize = 3) {
  const results = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(asyncHandler))
    results.push(...batchResults)
    // 每批次之間稍微等待，保護 Rate Limit
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, 800))
    }
  }
  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// 主要 Prompt（供兩個 endpoint 共用）
// ─────────────────────────────────────────────────────────────────────────────
function buildMainPrompt({ targetRange, validNames, currentYear, currentMonth }) {
  return `
    你是一個專業的排班表辨識助理。我會上傳一張手寫的實體排班表圖片。
    表格左側是『員工姓名』，上方是『日期（1~31號）』。

    🎯【本次任務目標】🎯
    本次你 **只需要** 專注解析【${targetRange}號】的班表，完全忽略其他日期的格子！

    ⚠️【第一階段：Markdown 草稿 (Chain of Thought)】⚠️
    請先將【${targetRange}號】的內容，精準地轉換為一個 Markdown 表格。
    在建立表格與思考的過程中，請嚴格遵守以下所有規則：

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

    ⚠️【坐標對齊】⚠️
    - 你必須像讀 Excel 一樣讀取圖片。
    - 每一條橫線代表該員工「整個月」的班表。
    - 每一條垂直線代表該「特定日期」。
    - 解析每一格時，請反覆確認該格所屬的「姓名」與「日期」。

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

    【四排 = 兩段班】
    第1排 → 第一段 startTime / 第2排 → 第一段 endTime
    第3排 → 第二段 startTime / 第4排 → 第二段 endTime

    範例A：
      0930 → 第一段 startTime: "09:30"
      1400 → 第一段 endTime:   "14:00"
      1700 → 第二段 startTime: "17:00"
      >030 → 第二段 endTime:   "20:30"

    範例B：
      0930 → 第一段 startTime: "09:30"
      1230 → 第一段 endTime:   "12:30"
      1530 → 第二段 startTime: "15:30"
      >030 → 第二段 endTime:   "20:30"

    🔍【兩段班休息間隔驗證 - 配對完成後必須執行】🔍
    兩段班之間的休息時間固定為 3 小時。
    除了特殊全日班（第一段 endTime 為 13:00 到 第二段 startTime 為 14:00）之外，
    休息時間少於 3 小時都不合理，需重新配對。

    ✅ 合理範例：
      09:30-14:00 / 17:00-20:30 → 休息 3 小時 ✅
      09:30-12:30 / 15:30-20:30 → 休息 3 小時 ✅
      10:00-13:00 / 14:00-18:00 → 休息 1 小時 ✅

    ❌ 不合理範例：
      09:30-17:00 / 14:00-18:30 → 時間倒退 ❌
      09:30-12:30 / 13:00-17:30 → 休息只有 30 分鐘 ❌

    🚫【嚴格禁止事項】🚫
    - 禁止輸出白名單以外的時間
    - 禁止用「時間大小」來判斷上下班配對
    - 禁止將 1300 誤讀為 1700
    - 禁止將 1530 誤讀為 1300
    - 禁止將 1730 誤讀為 1800
    - 禁止將 >030 輸出為任何非 20:30 的值

    📅【日期基準】📅
    圖片中若未標示年月，預設為 ${currentYear} 年 ${currentMonth} 月。

    ⚠️【第二階段：輸出 JSON】⚠️
    根據你剛才建立的 Markdown 草稿，輸出最終的 JSON。
    只輸出以下 JSON 格式，不要有任何其他說明文字：
    {
      "schedule": [
        {
          "name": "員工姓名",
          "shifts": [
            {
              "date": "${currentYear}-${String(currentMonth).padStart(2, '0')}-01",
              "segments": [
                { "start": "09:30", "end": "14:00" },
                { "start": "17:00", "end": "20:30" }
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
    4. 輸出的 JSON 必須是合法格式
  `
}

/** 針對「單條裁切圖」使用的精簡 Prompt（已知員工姓名，只需辨識時間） */
function buildSingleRowPrompt({ employeeName, targetRange, currentYear, currentMonth }) {
  return `
    你是排班表辨識助理。
    圖片上方是日期列（標示 1~31 號），下方是員工「${employeeName}」的單一班表行。
    你的任務：**只**解析【${targetRange}號】的班次，其他日期完全忽略。

    員工姓名已知為「${employeeName}」，輸出時直接使用，不需要再辨識姓名欄。

    🏖️ 休假辨識（優先）
    - 紅色「休」字、「X」、「Off」→ isOff: true，不輸出 segments

    🔢 ">" 符號：辨識時間之前，所有 ">" 一律替換為 "2"

    🔢 手寫數字辨識
    - 四位數加冒號："0930"→"09:30"、"1400"→"14:00"、"2030"→"20:30"
    - 三位數補零："930"→"09:30"
    - ⚠️ "1" 和 "7" 字形相似，注意區分

    ✅ 時間白名單（必須在白名單內，否則強制修正）
    上班：09:00 / 09:30 / 10:00 / 10:30 / 11:00 / 12:00 / 13:00 / 14:00 / 15:30 / 16:30 / 17:00 / 17:30 / 18:00
    下班：12:30 / 13:00 / 13:30 / 14:00 / 17:00 / 17:30 / 18:00 / 18:30 / 20:30

    常見修正：19:30/21:00/22:00/22:30 → 20:30 / 15:00 → 15:30

    ⏰ 時間配對：按從上到下的位置順序配對（奇數行=上班，偶數行=下班）

    📅 預設年月：${currentYear} 年 ${currentMonth} 月

    輸出格式（JSON only）：
    {
      "schedule": [
        {
          "name": "${employeeName}",
          "shifts": [
            {
              "date": "${currentYear}-${String(currentMonth).padStart(2, '0')}-01",
              "segments": [{ "start": "09:30", "end": "18:30" }],
              "isOff": false
            }
          ]
        }
      ]
    }

    規則：空白格不輸出、休假日不輸出 segments、JSON 必須合法。
  `
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint 1：原始整圖解析（保留原有功能，不動）
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parse-schedule', upload.single('scheduleImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '請上傳圖片' })
    }

    const validNames  = req.body.employeeNames || '未提供名單'
    const targetRange = req.body.targetRange   || '1-31'

    console.log(`🖼️ 收到圖片，開始交給 AI 解析【${targetRange}號】範圍…`)

    const imagePart    = bufferToImagePart(req.file.buffer, req.file.mimetype)
    const model        = getFlashModel()
    const currentYear  = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1
    const prompt       = buildMainPrompt({ targetRange, validNames, currentYear, currentMonth })

    const result       = await model.generateContent([prompt, imagePart])
    const responseText = result.response.text()
    console.log('🤖 AI 原始回傳:', responseText)

    const parsedData = JSON.parse(responseText)
    applyValidation(parsedData)

    console.log('✅ 解析成功！回傳資料中…')
    res.json(parsedData)

  } catch (error) {
    console.error('❌ 解析發生錯誤:', error)
    res.status(500).json({ error: '圖片解析失敗，請確認圖片清晰度或稍後再試' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint 2：策略二 ── 物理裁切逐行解析
//
// 作法：
//   1. 用 sharp 取得圖片尺寸
//   2. 估算標題列高度（約占整體 8%）
//   3. 將剩餘高度平均切成 N 條（N = 員工人數）
//   4. 每條：用 sharp 合成「日期標題列 + 單員工列」成一張細長圖
//   5. 每張圖分別送給 Gemini（並發 3 條一批，保護 Rate Limit）
//   6. 合併所有結果後回傳
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parse-schedule-crop', upload.single('scheduleImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '請上傳圖片' })
    }

    const validNames    = req.body.employeeNames || '未提供名單'
    const targetRange   = req.body.targetRange   || '1-31'
    const employeeList  = validNames.split(',').map(n => n.trim()).filter(Boolean)
    const numEmployees  = employeeList.length

    if (numEmployees === 0) {
      return res.status(400).json({ error: '請提供員工名單' })
    }

    console.log(`✂️  物理裁切模式：${numEmployees} 位員工，各自送 AI 解析【${targetRange}號】`)

    // ── Step 1：取得圖片尺寸 ──────────────────────────
    const metadata    = await sharp(req.file.buffer).metadata()
    const imgWidth    = metadata.width
    const imgHeight   = metadata.height

    // ── Step 2：估算標題列（日期列）高度 ──────────────
    // 手寫班表通常日期列占約 8%；可依實際情況調整這個比例
    const HEADER_RATIO  = 0.08
    const headerHeight  = Math.max(30, Math.floor(imgHeight * HEADER_RATIO))
    const bodyHeight    = imgHeight - headerHeight
    const rowHeight     = Math.floor(bodyHeight / numEmployees)
    // 每條上下多取 5px 作為安全邊距，避免切到文字邊緣
    const OVERLAP       = 5

    console.log(`📐 圖片尺寸：${imgWidth}×${imgHeight}｜標題列高：${headerHeight}px｜每員工列高：${rowHeight}px`)

    // 預先切好標題列（PNG buffer，所有員工共用）
    const headerBuffer = await sharp(req.file.buffer)
      .extract({
        left:   0,
        top:    0,
        width:  imgWidth,
        height: headerHeight
      })
      .png()
      .toBuffer()

    const currentYear  = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1
    const model        = getFlashModel()

    // ── Step 3：為每位員工建立裁切任務 ──────────────────
    const tasks = employeeList.map((employeeName, i) => ({
      employeeName,
      index: i
    }))

    // ── Step 4：處理單一員工的裁切 + AI 解析 ─────────────
    const processEmployee = async ({ employeeName, index }) => {
      try {
        // 計算這位員工在圖片中的 Y 範圍（含上下重疊）
        const rowTop    = headerHeight + index * rowHeight
        const safeTop   = Math.max(0, rowTop - OVERLAP)
        const safeBot   = Math.min(imgHeight, rowTop + rowHeight + OVERLAP)
        const cropH     = safeBot - safeTop

        // 裁切員工列
        const empRowBuffer = await sharp(req.file.buffer)
          .extract({
            left:   0,
            top:    safeTop,
            width:  imgWidth,
            height: cropH
          })
          .png()
          .toBuffer()

        // 將「日期標題列」和「員工列」垂直合成成一張新圖
        const combinedHeight = headerHeight + cropH
        const combinedBuffer = await sharp({
          create: {
            width:      imgWidth,
            height:     combinedHeight,
            channels:   4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          }
        })
          .composite([
            { input: headerBuffer,  top: 0,            left: 0 },
            { input: empRowBuffer,  top: headerHeight,  left: 0 }
          ])
          .png()
          .toBuffer()

        console.log(`  → [${index + 1}/${employeeList.length}] 正在解析：${employeeName}`)

        // 送給 AI
        const imagePart = bufferToImagePart(combinedBuffer, 'image/png')
        const prompt    = buildSingleRowPrompt({ employeeName, targetRange, currentYear, currentMonth })
        const result    = await model.generateContent([prompt, imagePart])
        const text      = result.response.text()

        const parsed = JSON.parse(text)

        // 確保 name 欄位一定是正確的員工名（防止 AI 亂填）
        if (parsed.schedule?.[0]) {
          parsed.schedule[0].name = employeeName
        }

        console.log(`  ✅ ${employeeName}：解析到 ${parsed.schedule?.[0]?.shifts?.length ?? 0} 天班次`)
        return parsed

      } catch (err) {
        console.error(`  ❌ ${employeeName} 解析失敗：`, err.message)
        // 回傳空結果，不中斷整體流程
        return { schedule: [{ name: employeeName, shifts: [] }] }
      }
    }

    // ── Step 5：並發執行（每批最多 3 條，保護 Rate Limit）──
    const allResults = await processInBatches(tasks, processEmployee, 3)

    // ── Step 6：合併所有員工的結果 ────────────────────────
    const mergedData = {
      schedule: allResults.flatMap(r => r.schedule ?? [])
    }

    // 後端驗證
    applyValidation(mergedData)

    console.log(`✅ 裁切模式解析完成！共 ${mergedData.schedule.length} 位員工`)
    res.json(mergedData)

  } catch (error) {
    console.error('❌ 裁切解析發生錯誤:', error)
    res.status(500).json({ error: '圖片裁切解析失敗，請確認圖片清晰度或稍後再試' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 啟動
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動於 http://localhost:${PORT}`)
  console.log(`   ├─ GET  /api/ping`)
  console.log(`   ├─ POST /api/parse-schedule       （原始整圖解析）`)
  console.log(`   └─ POST /api/parse-schedule-crop  （策略二：物理裁切逐行解析）`)
})