import type { DetectionType, PhraseConfig } from '~/composables/useRealtimeAPI'

/**
 * CSVテキストをパースしてPhraseConfig配列に変換
 * CSV形式: 名前,判定基準,ヒント（改行を含む場合はダブルクォートで囲む）
 */
export function parseHintCSV(csvText: string, detectionType: DetectionType): PhraseConfig[] {
  const configs: PhraseConfig[] = []
  const lines = csvText.split('\n')

  let i = 0
  // ヘッダー行をスキップ（名前,判定基準,ヒント）
  if (lines[0]?.includes('名前') && lines[0]?.includes('判定基準') && lines[0]?.includes('ヒント')) {
    i = 1
  }

  while (i < lines.length) {
    const line = lines[i]?.trim()
    if (!line) {
      i++
      continue
    }

    // CSVをパース（ダブルクォート内の改行・カンマに対応）
    const parsed = parseCSVLine(lines, i)
    if (parsed.fields.length >= 3) {
      const [name, description, hintText] = parsed.fields

      if (name && hintText) {
        configs.push({
          id: crypto.randomUUID(),
          phrase: name.trim(),
          description: description?.trim() || undefined,
          detectionType,
          hintType: 'fixed',
          hintText: hintText.trim(),
          enabled: true,
        })
      }
    }
    i = parsed.nextIndex
  }

  return configs
}

/**
 * CSV行をパース（ダブルクォート内の改行・カンマに対応）
 */
function parseCSVLine(lines: string[], startIndex: number): { fields: string[], nextIndex: number } {
  const fields: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = startIndex

  while (i < lines.length) {
    const line = lines[i] || ''

    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      const nextChar = line[j + 1]

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          // エスケープされたダブルクォート
          currentField += '"'
          j++
        }
        else if (char === '"') {
          // クォート終了
          inQuotes = false
        }
        else {
          currentField += char
        }
      }
      else {
        if (char === '"') {
          // クォート開始
          inQuotes = true
        }
        else if (char === ',') {
          // フィールド区切り
          fields.push(currentField)
          currentField = ''
        }
        else {
          currentField += char
        }
      }
    }

    if (inQuotes) {
      // クォート内の改行
      currentField += '\n'
      i++
    }
    else {
      // 行終了
      fields.push(currentField)
      return { fields, nextIndex: i + 1 }
    }
  }

  // ファイル末尾
  fields.push(currentField)
  return { fields, nextIndex: i }
}
