export function analysisSourceMessage(source, fallbackReason) {
  if (source === 'ai') return 'AI-assisted analysis'
  if (fallbackReason === 'CONSENT_STORAGE_UNAVAILABLE') return 'AI consent could not be saved—showing the on-device estimate.'
  if (fallbackReason === 'NOT_CONFIGURED') return 'AI-assisted analysis is not configured—showing the on-device estimate.'
  if (fallbackReason === 'REMOTE_INPUT_LIMIT') return 'Remote AI accepts up to 10 messages of 280 characters each—showing the on-device estimate.'
  if (fallbackReason === 'REMOTE_UNAVAILABLE') return 'AI service unavailable—showing the on-device estimate.'
  return 'On-device estimate.'
}
