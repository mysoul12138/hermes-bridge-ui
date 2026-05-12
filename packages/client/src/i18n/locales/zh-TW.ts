import zh from './zh'

const locale = structuredClone(zh) as Record<string, any>

locale.language = {
  ...locale.language,
  zh: '中文（简体）',
  'zh-TW': '繁體中文',
}

locale.models = {
  ...locale.models,
  manageVisibleModels: '管理可見模型',
  manageVisibleModelsFor: '管理 {name} 可見模型',
  visibilityHint: '僅影響 Web UI 的模型選擇器和模型頁展示，不會改寫 Hermes CLI 的 provider/model 配置。實際呼叫仍使用原始模型 ID。',
  visibilitySaved: '可見模型已儲存',
  visibilitySaveFailed: '儲存可見模型失敗',
  showAllModels: '顯示全部模型',
  removeCustomModel: '移除這個未列出的模型',
  aliasEdit: '重新命名',
  aliasTitle: '模型顯示名',
  aliasTitleFor: '{model} 的顯示名',
  aliasPlaceholder: '留空則使用原始模型 ID',
  aliasHint: '僅修改 Web UI 顯示名，傳送給 Hermes 的仍是原始模型 ID。',
  aliasCanonical: '原始 ID：{model}',
  aliasUseOriginal: '恢復原始 ID',
  aliasManage: '顯示名',
  aliasManageFor: '{provider} 的顯示名',
  aliasSaveFailed: '儲存顯示名失敗',
  visibilitySelectOne: '至少保留一個可見模型',
}

locale.settings.voice = {
  ...locale.settings.voice,
  edgeRate: '語速',
  edgeRateHint: '調整語音速度（0.5～2.0 倍）',
  edgePitch: '音調',
  edgePitchHint: '調整語音音調（-20～+20 Hz）',
}

locale.changelog = {
  ...locale.changelog,
  new_0_5_17_1: '全面相容 Windows：路徑處理、程序管理、終端機、日誌解析',
  new_0_5_17_2: '重構 Gateway 程序管理，支援跨平台啟動/停止/健康檢查',
  new_0_5_17_3: '修復 Termux 環境下外掛發現失敗的問題，自動解析 hermes shebang 定位 Python',
  new_0_5_17_4: 'YAML 配置解析容忍重複鍵',
  new_0_5_17_5: '最佳化認證鎖定視窗和開發環境關閉流程',
  new_0_5_17_6: 'Comic 佈景主題新增中文（站酷快樂體）、日文（Zen Maru Gothic）、韓文（Gaegu）手寫字體',
  new_0_5_17_7: '新增 Comic/塗鴉佈景主題風格',
  new_0_5_17_8: '授權條款變更為 BSL-1.1',
  new_0_5_17_9: '新增唯讀 Hermes 外掛頁',
  new_0_5_17_10: '圖片上傳轉為 base64 多模態格式',
  new_0_5_17_11: '修復 Kanban 看板選擇與隔離問題',
  new_0_5_17_12: '新增語音播放設定，支援 4 種 TTS 提供商',
  new_0_5_17_13: '降低上下文壓縮提示閾值從 200 到 150',
  new_0_5_17_14: '修復 Web UI 自更新重啟邏輯',
  new_0_5_17_15: '修復 opencode-zen 和 opencode-go 共享環境變數導致配置聯動',
  new_0_5_17_16: '新增繁體中文（zh-TW）語言支援',
  new_0_5_17_17: '模型頁支援在 Web UI 裡管理可見模型',
  new_0_5_17_18: 'Kanban：補齊任務操作鏈路（評論、日誌、分配、派發），明確能力邊界',
  new_0_5_17_19: '修復刪除 Provider 時未清除認證條目',
  new_0_5_17_20: '修復 Codex credential-pool 認證識別',
  new_0_5_17_21: 'Edge TTS 新增語速/音調調節',
  new_0_5_17_22: 'config.yaml 重複鍵不再導致解析崩潰',
  new_0_5_17_23: 'Gateway 連接埠所有權檢查改為基於 PID 檔案，防止跨 Profile 連接埠佔用',
  new_0_5_17_24: '歷史頁面現在顯示 Cron 工作階段記錄',
  new_0_5_17_25: '修復收起側邊欄時語言切換和佈景主題圖示擠壓問題',
}

export default locale
