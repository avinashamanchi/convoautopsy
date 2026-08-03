export function analysisSourceMessage(source, fallbackReason) {
  if (source === 'ai') return 'AI-assisted analysis'
  if (fallbackReason === 'NOT_CONFIGURED') return 'AI-assisted analysis is not configured—showing the on-device estimate.'
  if (fallbackReason === 'REMOTE_UNAVAILABLE') return 'AI service unavailable—showing the on-device estimate.'
  return 'On-device estimate.'
}
