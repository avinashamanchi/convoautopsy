Pod::Spec.new do |s|
  s.name           = 'ConvoOcr'
  s.version        = '1.0.0'
  s.summary        = 'Private, on-device conversation screenshot text recognition.'
  s.description    = 'Apple Vision OCR for ConvoAutopsy development and release builds.'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.swift_version  = '5.9'
end
