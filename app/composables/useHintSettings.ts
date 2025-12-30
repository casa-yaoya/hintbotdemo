import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '~/utils/firebase'
import type { PhraseConfig } from './useRealtimeAPI'

// Firestoreに保存するヒント設定の型
export interface HintSettings {
  modeId: string // モードID（ドキュメントID）
  configs: PhraseConfig[] // ヒント設定の配列
  updatedAt: Timestamp | null
}

// Firestoreから取得した生データ
interface HintSettingsDoc {
  configs: PhraseConfig[]
  updatedAt?: Timestamp
}

const COLLECTION_NAME = 'hintSettings'

export function useHintSettings() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastSavedAt = ref<Date | null>(null)

  // モードIDに対応するヒント設定を取得
  async function loadSettings(modeId: string): Promise<PhraseConfig[] | null> {
    loading.value = true
    error.value = null

    try {
      const docRef = doc(db, COLLECTION_NAME, modeId)
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) {
        return null
      }

      const data = docSnap.data() as HintSettingsDoc
      return data.configs || []
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load settings'
      console.error('Failed to load settings:', e)
      return null
    }
    finally {
      loading.value = false
    }
  }

  // モードIDに対応するヒント設定を保存
  async function saveSettings(modeId: string, configs: PhraseConfig[]): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const docRef = doc(db, COLLECTION_NAME, modeId)

      await setDoc(docRef, {
        configs,
        updatedAt: serverTimestamp(),
      })

      lastSavedAt.value = new Date()
      return true
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save settings'
      console.error('Failed to save settings:', e)
      return false
    }
    finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    lastSavedAt,
    loadSettings,
    saveSettings,
  }
}
